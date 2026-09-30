/**
 * Orphan reaping for BOTH wdio configs (main + persist).
 *
 * Lives in its own module because wdio.config.ts has side effects at import time
 * (`require('electron')`, deleting ELECTRON_RUN_AS_NODE) that the persist config
 * must not inherit.
 *
 * Why Windows needs its own implementation — measured 15 Sep 2026 on a live run:
 *
 *   chromedriver.exe
 *    -> cmd.exe /c "...\node_modules\.bin\electron.CMD" --app=...\out\main\index.js --test-type=webdriver
 *     -> node.exe ...\node_modules\electron\cli.js --app=... --test-type=webdriver
 *      -> electron.exe --app=...\out\main\index.js --test-type=webdriver
 *         -> gpu/utility helpers (carry --user-data-dir but NOT --test-type)
 *         -> heliosgui_backend.exe --port=8008 -> conhost.exe
 *
 * Chromedriver's handle is the cmd.exe shim, and TerminateProcess never
 * propagates, so a hard teardown leaves node -> electron -> backend alive. The
 * backend cannot exit by itself either: its watchdog waits on Electron MAIN,
 * which is still running. The POSIX body below cannot be un-gated for Windows:
 * `ps -eo` does not exist under cmd.exe, its launcher regex needs forward
 * slashes, `includes()` is case-sensitive while NTFS is not, and
 * process.kill(pid, 'SIGKILL') never takes a tree.
 *
 * Once its WORKER has exited, a graceful session leaves nothing behind (also
 * measured). Before that — i.e. in afterSession — a healthy Electron is still
 * alive by design, waiting for the worker's inspector connection to drop, which
 * is why afterSession must not reap Electron. The sweep exists for abnormal
 * endings: a worker SIGKILL, Ctrl+C, CI cancellation, a session that failed to
 * start.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'

/**
 * Reap orphaned test child-processes. When wdio-electron-service hard-kills
 * Electron (session teardown / reloadSession) or the run is force-killed,
 * Electron's before-quit/will-quit backend cleanup never runs, so the spawned
 * heliosgui_backend — and sometimes the out/main Electron itself — is reparented
 * to init and keeps holding its port. These pile up across specs and break later
 * runs, so we sweep them here.
 *
 * We match ONLY this checkout's paths and kill BY PID (never `pkill -f`, which
 * could hit unrelated processes). Electron matches also require the WebDriver
 * automation flag so a separately-running `npm run dev` app is never touched.
 *
 * Moved verbatim from wdio.config.ts. The only change is the boolean result:
 * false means it declined because another wdio run is active.
 */
function reapOrphansPosix(label: string, includeElectron: boolean): boolean {
  const backendScope = join(process.cwd(), 'resources', 'backend')
  const electronScope = join(process.cwd(), 'out', 'main')
  try {
    const ps = execSync('ps -eo pid=,args=', { encoding: 'utf8' })
    const lines = ps.split('\n')
    // Concurrency guard: if a SECOND wdio run is active, do NOT reap. Our
    // path-based match can't tell that run's LIVE Electron/backend from orphans,
    // and killing them fails its tests ("disconnected: not connected to
    // DevTools"). Each `wdio run` has exactly one node_modules/.bin/wdio process;
    // >1 means another run overlaps. Whichever run is last standing cleans up.
    const activeRuns = lines.filter((l) => /node_modules\/\.bin\/wdio\b/.test(l)).length
    if (activeRuns > 1) {
      console.log(`[reap:${label}] another wdio run is active — skipping to avoid cross-kill`)
      return false
    }
    const killed: number[] = []
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\s+(.*)$/)
      if (!m) continue
      const pid = Number(m[1])
      const args = m[2]
      if (pid === process.pid) continue
      const isBackend = args.includes(backendScope)
      const isElectron =
        includeElectron && args.includes(electronScope) && args.includes('--test-type=webdriver')
      if (!isBackend && !isElectron) continue
      try {
        process.kill(pid, 'SIGKILL')
        killed.push(pid)
      } catch {
        /* already exited */
      }
    }
    if (killed.length) {
      console.log(`[reap:${label}] killed ${killed.length} orphaned process(es): ${killed.join(', ')}`)
    }
  } catch (err) {
    console.warn(`[reap:${label}] sweep failed:`, (err as Error).message)
  }
  return true
}

interface WinProc {
  pid: number
  ppid: number
  /** lower-case image name */
  name: string
  /** normalised lower-case ExecutablePath ('' when unreadable) */
  exe: string
  /** lower-case raw CommandLine */
  cmd: string
  /** lower-case argv tokens, path values normalised */
  argv: string[]
  /** CreationDate in ms (FILETIME epoch), 0 when unknown */
  created: number
}

const lc = (s: string): string => s.toLowerCase()
// NTFS is case-insensitive and the npm .cmd shims emit `.bin\\..\` segments, so
// only ever compare normalised, lower-cased paths.
const normWin = (p: string): string => lc(win32.normalize(p))
const dirPrefix = (p: string): string => (p.endsWith(win32.sep) ? p : p + win32.sep)
const looksLikePath = (s: string): boolean =>
  /^[a-z]:$/i.test(s.slice(0, 2)) && (s[2] === '/' || s[2] === '\\')

/** Roughly CommandLineToArgvW. Used ONLY for matching, never to execute. */
function splitArgs(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  let pending = false
  for (const ch of cmd) {
    if (ch === '"') {
      quoted = !quoted
      pending = true
    } else if (!quoted && (ch === ' ' || ch === '\t')) {
      if (pending) out.push(cur)
      cur = ''
      pending = false
    } else {
      cur += ch
      pending = true
    }
  }
  if (pending) out.push(cur)
  return out
}

function normToken(t: string): string {
  const eq = t.startsWith('--') ? t.indexOf('=') : -1
  if (eq > 0) {
    const v = t.slice(eq + 1)
    return lc(t.slice(0, eq + 1)) + (looksLikePath(v) ? normWin(v) : lc(v))
  }
  return looksLikePath(t) ? normWin(t) : lc(t)
}

function listProcessesWin32(): WinProc[] {
  // EVERY process is listed: the orphan and ancestry checks need parents of any
  // image name. -EncodedCommand sidesteps every quoting rule between Node,
  // CreateProcess and PowerShell. The UTF8Encoding($false) is BOM-less on
  // purpose — Windows PowerShell 5.1 can prefix redirected output with a BOM,
  // which JSON.parse rejects (stripped below as well, belt and braces).
  const script = [
    // Without this, powershell.exe writes a CLIXML "Preparing modules for first
    // use" progress record to stderr, which lands in the wdio output.
    `$ProgressPreference = 'SilentlyContinue'`,
    `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false`,
    `$rows = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, @{ n = 'Created'; e = { if ($_.CreationDate) { [math]::Floor($_.CreationDate.ToFileTimeUtc() / 10000) } else { 0 } } }`,
    `ConvertTo-Json -InputObject @($rows) -Compress -Depth 2`
  ].join('\n')
  const raw = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024
    }
  )
  type Row = {
    ProcessId: number
    ParentProcessId: number
    Name: string | null
    ExecutablePath: string | null
    CommandLine: string | null
    Created: number | null
  }
  const rows = JSON.parse(raw.replace(/^﻿/, '').trim() || '[]') as Row[]
  return rows.map((r) => {
    const cmd = r.CommandLine ?? ''
    return {
      pid: r.ProcessId,
      ppid: r.ParentProcessId,
      name: lc(r.Name ?? ''),
      exe: r.ExecutablePath ? normWin(r.ExecutablePath) : '',
      cmd: lc(cmd),
      argv: splitArgs(cmd).map(normToken),
      created: Number(r.Created) || 0
    }
  })
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 on Windows = OpenProcess + exit-code check
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function waitForExit(pids: number[], ms: number): number[] {
  const tick = new Int32Array(new SharedArrayBuffer(4))
  const deadline = Date.now() + ms
  let alive = pids.filter(isAlive)
  while (alive.length && Date.now() < deadline) {
    Atomics.wait(tick, 0, 0, 100)
    alive = alive.filter(isAlive)
  }
  return alive
}

function reapOrphansWin32(label: string, includeElectron: boolean, graceMs: number): boolean {
  const root = normWin(process.cwd())
  const at = (...parts: string[]): string => normWin(win32.join(root, ...parts))
  const wdioCli = at('node_modules', '@wdio', 'cli', 'bin', 'wdio.js')
  const wdioBin = at('node_modules', '.bin', 'wdio')
  const workerJs = at('node_modules', '@wdio', 'local-runner', 'build', 'run.js')
  const electronExe = at('node_modules', 'electron', 'dist', 'electron.exe')
  const electronCli = at('node_modules', 'electron', 'cli.js')
  const electronCmd = at('node_modules', '.bin', 'electron.cmd')
  const entry = at('out', 'main', 'index.js')
  const backendDir = dirPrefix(at('resources', 'backend'))
  const persistProfile = at('.wdio-persist-profile')
  const tempProfiles = dirPrefix(normWin(tmpdir())) + 'wdio-chrome-'
  const cacheRoot = normWin(process.env['WEBDRIVER_CACHE_DIR'] || tmpdir())
  const driverDir = dirPrefix(win32.join(cacheRoot, 'chromedriver'))
  const cacheIsOurs = cacheRoot.startsWith(dirPrefix(root))

  let procs: WinProc[]
  try {
    procs = listProcessesWin32()
  } catch (err) {
    console.warn(`[reap:${label}] process enumeration failed:`, (err as Error).message)
    return true
  }
  // An empty list is never real (this process is in it), so it means the parse
  // went wrong — say so rather than pass as "nothing to reap".
  if (!procs.length) {
    console.warn(`[reap:${label}] process enumeration returned nothing — sweep skipped`)
    return true
  }
  const byPid = new Map(procs.map((p) => [p.pid, p] as const))
  // Windows never re-parents and does recycle pids: a "parent" younger than its
  // child is a stranger that inherited the number.
  const parentOf = (p: WinProc): WinProc | undefined => {
    const q = byPid.get(p.ppid)
    return q && q.pid !== p.pid && q.created <= p.created ? q : undefined
  }

  // Never us, never an ancestor (launcher, cmd.exe, npx, the terminal).
  const shielded = new Set<number>([process.pid])
  let cur: WinProc | undefined = byPid.get(process.pid)
  for (let i = 0; cur && i < 64; i++, cur = parentOf(cur)) shielded.add(cur.pid)

  // Concurrency guard. Matched on node.exe's SCRIPT argument (the first non-flag
  // token, so `node --inspect wdio.js` still counts), never on a CommandLine
  // substring — a shell or editor that merely MENTIONS the path must not switch
  // the reaper off.
  const scriptOf = (p: WinProc): string => p.argv.slice(1).find((a) => !a.startsWith('-')) ?? ''
  const launchers = procs.filter(
    (p) => p.name === 'node.exe' && [wdioCli, wdioBin].includes(scriptOf(p))
  )
  // A launcher started with a RELATIVE script path cannot be recognised (WMI has
  // no cwd to resolve it against), but its workers are always forked with the
  // absolute run.js — so a live worker that is not ours also proves another run.
  // Only a worker whose launcher is still ALIVE proves a run: one whose launcher
  // was killed on its own (taskkill without /T, End task) keeps running and must
  // be reaped below, not read as "another run is active".
  const foreignWorkers = procs.filter(
    (p) => p.name === 'node.exe' && !shielded.has(p.pid) && scriptOf(p) === workerJs && parentOf(p) !== undefined
  )
  if (launchers.length > 1 || foreignWorkers.length > 0) {
    console.log(
      `[reap:${label}] another wdio run of this checkout is active ` +
        `(${launchers.length} launcher(s), ${foreignWorkers.length} foreign worker(s)) — skipping to avoid cross-kill`
    )
    return false
  }

  const has = (p: WinProc, tok: string): boolean => p.argv.includes(tok)
  // --test-type=webdriver is injected by chromedriver only; `npm run dev` never carries it.
  const webdriverLaunch = (p: WinProc): boolean =>
    has(p, '--test-type=webdriver') && has(p, `--app=${entry}`)
  const isHelper = (p: WinProc): boolean => p.argv.some((a) => a.startsWith('--type='))
  const testProfile = (p: WinProc): boolean => {
    const d = p.argv.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length) ?? ''
    return d.startsWith(tempProfiles) || d === persistProfile
  }

  const why = new Map<number, string>()
  if (includeElectron) {
    for (const p of procs) {
      if (shielded.has(p.pid)) continue
      if (
        p.name === 'cmd.exe' &&
        p.cmd.includes(electronCmd) &&
        p.cmd.includes('--test-type=webdriver') &&
        p.cmd.includes(entry)
      ) {
        why.set(p.pid, 'electron.CMD shim')
      } else if (p.name === 'node.exe' && p.argv[1] === electronCli && webdriverLaunch(p)) {
        why.set(p.pid, 'electron cli.js wrapper')
      } else if (p.name === 'electron.exe' && p.exe === electronExe) {
        if (!isHelper(p) && webdriverLaunch(p)) why.set(p.pid, 'electron main')
        else if (isHelper(p) && testProfile(p) && !parentOf(p)) why.set(p.pid, 'orphaned electron helper')
      } else if (p.name === 'node.exe' && scriptOf(p) === workerJs && !parentOf(p)) {
        // Its launcher is gone; /T takes its chromedriver -> electron -> backend too.
        why.set(p.pid, 'orphaned wdio worker')
      }
    }
  }

  for (const p of procs) {
    if (shielded.has(p.pid) || why.has(p.pid)) continue
    const parent = parentOf(p)
    if (p.name === 'heliosgui_backend.exe' && p.exe.startsWith(backendDir)) {
      // Only a backend whose Electron is gone, or is a test Electron being reaped.
      // One under a LIVE non-test parent (npm run dev, a backend started by hand)
      // is left alone.
      if (!parent) why.set(p.pid, 'orphaned backend')
      else if (why.get(parent.pid) === 'electron main') why.set(p.pid, 'backend of test electron')
    } else if (p.name === 'chromedriver.exe' && p.exe.startsWith(driverDir) && p.ppid !== process.pid) {
      // A live worker owns its driver; webdriver kills it itself.
      if (parent && parent.name === 'node.exe' && parent.argv[1] === workerJs) continue
      const drivesOurs = procs.some((c) => c.ppid === p.pid && why.has(c.pid))
      if (cacheIsOurs || drivesOurs) why.set(p.pid, 'stray chromedriver')
    }
  }

  let targets = procs.filter((p) => why.has(p.pid))
  if (!targets.length) return true
  // The app of the LAST session may still be quitting when onComplete runs, so
  // give matched processes the grace period first and kill only what outlives it.
  // (No grace makes afterSession safe for Electron: there a healthy app stays
  // alive until the worker exits — measured 15 Sep 2026 — so afterSession reaps
  // backends only.)
  if (graceMs > 0) {
    const matched = targets.length
    const started = Date.now()
    const survivors = new Set(
      waitForExit(
        targets.map((p) => p.pid),
        graceMs
      )
    )
    targets = targets.filter((p) => survivors.has(p.pid))
    if (!targets.length) {
      console.log(
        `[reap:${label}] ${matched} matched process(es) exited on their own within ${Date.now() - started}ms`
      )
      return true
    }
  }
  // A root is any target whose parent is not itself a surviving target — a
  // parent that exited during the grace period must not hide its children.
  const targetPids = new Set(targets.map((p) => p.pid))
  const roots = targets.filter((p) => {
    const parent = parentOf(p)
    return !parent || !targetPids.has(parent.pid)
  })
  // One call. /T takes the whole tree: cmd -> node -> electron -> helpers + backend -> conhost.
  // taskkill exits non-zero when ANY listed pid had already gone; the rest are still killed.
  const res = spawnSync('taskkill.exe', ['/T', '/F', ...roots.flatMap((p) => ['/PID', String(p.pid)])], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000
  })
  // Port, SQLite file and profile dir are released only once the process objects
  // are gone. Wait, or the next session (or an rmSync) races them.
  const stillAlive = waitForExit(
    targets.map((p) => p.pid),
    10_000
  )
  console.log(
    `[reap:${label}] killed ${targets.length} process(es) via ${roots.length} tree root(s): ` +
      roots.map((p) => `${p.pid} (${why.get(p.pid)})`).join(', ') +
      (res.status === 0 ? '' : ` [taskkill exit ${res.status}: ${(res.stderr || res.stdout || '').trim().slice(0, 300)}]`) +
      (stillAlive.length ? ` — STILL ALIVE: ${stillAlive.join(', ')}` : '')
  )
  return true
}

/**
 * Sweep orphaned Electron/backend processes left by THIS checkout's e2e runs.
 * Returns false ONLY when it declined because another wdio run of this checkout
 * is active (so callers about to wipe shared state can refuse).
 *
 * `graceMs` (Windows only): how long matched processes get to exit on their own
 * before being killed. Pass it from onComplete, where the last session's app may
 * still be quitting; leave it 0 in onPrepare, where anything matched is a
 * previous run's. NEVER reap Electron from afterSession (includeElectron=true),
 * grace or not: the worker still holds the app's inspector connection there, so
 * a healthy app is alive by design and would be killed after every spec.
 */
export function reapOrphans(label: string, includeElectron: boolean, graceMs = 0): boolean {
  return process.platform === 'win32'
    ? reapOrphansWin32(label, includeElectron, graceMs)
    : reapOrphansPosix(label, includeElectron)
}
