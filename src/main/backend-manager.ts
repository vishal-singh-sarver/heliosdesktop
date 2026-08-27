import { ChildProcess, spawn, spawnSync } from 'child_process'
import { app } from 'electron'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { setTimeout as delay } from 'timers/promises'
import { backendIdentity, type BackendPidRecord } from './backend-identity'

/**
 * True when ChromeDriver launched this app for e2e (it injects a temp
 * --user-data-dir and a remote-debugging flag).
 *
 * Deliberately duplicated from the identical helper in index.ts rather than
 * imported: index.ts already imports this module, so importing back would make
 * the cycle main -> backend-manager -> main. It reads process.argv and nothing
 * else, so there is no state to keep in sync - but if the detection ever needs
 * to change, change BOTH.
 */
function isUnderTestAutomation(): boolean {
  return process.argv.some(
    (arg) =>
      arg.startsWith('--user-data-dir') ||
      arg.startsWith('--remote-debugging-port') ||
      arg.startsWith('--remote-debugging-pipe') ||
      arg === '--enable-automation'
  )
}

// Probe ports starting at `start` and return the first one that bind succeeds on.
// We try-bind on 127.0.0.1 instead of just checking /etc/services because another
// process can be holding the port without it being a "well-known" binding.
function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function findFreePort(start: number, max = 50): Promise<number> {
  for (let port = start; port < start + max; port++) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`No free port found in range ${start}..${start + max - 1}`)
}

export interface BackendStatus {
  running: boolean
  pid: number | null
  port?: number
  error?: string
  logFile?: string
}

const PID_FILE = 'backend.pid'

export class BackendManager {
  private process: ChildProcess | null = null
  private port = 8008
  private stdio: string[] = []
  private logStream: fs.WriteStream | null = null
  private logFile: string | null = null
  // Increased timeout for packaged apps and slower machines:
  //   - --onedir PyInstaller on first run: ~5-10s startup
  //   - Subsequent runs: ~0.5-2s startup
  //   - Slow systems: 30s provides adequate headroom without being too long
  //
  // Under e2e automation the budget is raised to 120s. SHIPPED BEHAVIOUR IS
  // UNCHANGED - a user whose backend is genuinely broken still sees the error
  // after 30s rather than waiting two minutes.
  //
  // Why: on CI run 30765040961 one of seven sessions took 32.4s to answer
  // /health while the other six took 2.0-3.6s. Missing a 30s cap by 2.4s made
  // the app quit before opening its window, so the spec died in `before all`
  // with "Main window with #root never became available ... 0 window handles" -
  // a failure that reads like Electron never launching, when in fact the
  // PyInstaller sidecar was just slow to come up on a loaded runner. The poll
  // returns as soon as /health answers, so a longer cap costs nothing on a
  // healthy start; it only bounds how long a genuinely dead backend hangs.
  private readonly startupTimeoutMs = isUnderTestAutomation() ? 120000 : 30000

  private getRuntimePaths() {
    const userDataDir = app.getPath('userData')
    const dataDir = path.join(userDataDir, 'backend-data')
    const logDir = path.join(userDataDir, 'logs')
    const logFile = path.join(logDir, 'backend.log')

    return { userDataDir, dataDir, logDir, logFile }
  }

  private getBackendPath(): string {
    const platform = process.platform
    const binaryName = platform === 'win32' ? 'heliosgui_backend.exe' : 'heliosgui_backend'

    let basePath: string
    if (app.isPackaged) {
      // In packaged mode, resources are in process.resourcesPath
      basePath = path.join(process.resourcesPath, 'backend', binaryName)
      this.writeLogLine(`[path-resolution] packaged mode: ${basePath}`)
    } else {
      // In dev mode, use local resources folder relative to repo root
      const resourceFolder = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'
      basePath = path.join(process.cwd(), 'resources', 'backend', resourceFolder, binaryName)
      this.writeLogLine(`[path-resolution] dev mode: ${basePath}`)
    }

    // Handle both --onefile (single executable) and --onedir (directory structure)
    // With --onedir: basePath points to a directory, executable is basePath/binaryName
    // With --onefile: basePath is the executable directly
    if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
      // PyInstaller --onedir: The basePath is a directory containing the executable
      const onedirExecutable = path.join(basePath, binaryName)
      this.writeLogLine(`[path-resolution] detected onedir structure: ${onedirExecutable}`)
      return onedirExecutable
    }

    return basePath
  }

  private validateBackendPath(backendPath: string): void {
    this.writeLogLine(`[validation] checking path exists: ${backendPath}`)

    if (!fs.existsSync(backendPath)) {
      throw new Error(
        `Backend executable not found: ${backendPath}\n` +
          `Make sure the backend was synced into resources/backend before packaging.`
      )
    }

    this.writeLogLine(`[validation] path exists ✓`)

    try {
      this.writeLogLine(`[validation] checking read access...`)
      fs.accessSync(backendPath, fs.constants.R_OK)
      this.writeLogLine(`[validation] read access ✓`)

      if (process.platform !== 'win32') {
        this.writeLogLine(`[validation] checking execute access...`)
        fs.accessSync(backendPath, fs.constants.X_OK)
        this.writeLogLine(`[validation] execute access ✓`)
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error)
      throw new Error(`Backend executable is not accessible: ${backendPath}\n${err}`)
    }
  }

  /**
   * The live command line of `pid`, or '' when it is not running.
   *
   * '' means DEAD, and that distinction is load-bearing. On Linux a zombie
   * awaiting wait() still has a /proc entry, so treating "the entry exists" as
   * "the process is alive" would have us SIGKILL a pid that had already exited —
   * and, worse, a pid the OS is free to hand to something else.
   */
  private readLiveCmdline(pid: number): string {
    try {
      if (process.platform === 'linux') {
        // NUL-separated. Normalised to spaces only for matching; nothing here
        // depends on the separator surviving.
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
      }

      if (process.platform === 'win32') {
        // No Node API reaches another process's command line, and tasklist does
        // not carry arguments. CIM is the only source that does.
        const res = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
          ],
          { encoding: 'utf8', timeout: 5000, windowsHide: true }
        )
        return res.status === 0 ? (res.stdout || '').trim() : ''
      }

      // darwin. Non-zero exit AND empty output both mean the pid is gone; `ps`
      // reports the first for an unknown pid, so the two are treated alike.
      const res = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 5000
      })
      return res.status === 0 ? (res.stdout || '').trim() : ''
    } catch {
      // Unreadable is not evidence of life. Falling through to '' means we
      // decline to kill, which is the safe direction.
      return ''
    }
  }

  /**
   * Kill a backend left over from a previous run, before a port is chosen.
   *
   * EVERY path out of here logs. That is not decoration: this whole class of fix
   * fails by doing nothing quietly, and both teams have now been caught by a
   * version of it — a gate that never armed, a reap whose comparison never
   * matched, a thread that died before its exit call. A reaper that silently
   * declines is indistinguishable from one that works until the day it matters.
   *
   * The pid file is only ever READ. The backend owns it and rewrites it on every
   * boot, so deleting a stale one here would only race its write for no gain.
   */
  private reapPreviousBackend(dataDir: string): void {
    const pidPath = path.join(dataDir, PID_FILE)

    let raw: string
    try {
      raw = fs.readFileSync(pidPath, 'utf8')
    } catch {
      return // No file: a first run, or the backend has never recorded itself.
    }

    let record: BackendPidRecord
    try {
      record = JSON.parse(raw) as BackendPidRecord
    } catch {
      this.recordMessage('manager', `[reap] ${PID_FILE} is not valid JSON — skipping`)
      return
    }

    if (!Number.isInteger(record?.pid) || record.pid <= 0 || typeof record.cmdline !== 'string') {
      this.recordMessage('manager', `[reap] ${PID_FILE} is missing pid/cmdline — skipping`)
      return
    }

    // A record written on another OS cannot describe a process on this one. Real
    // when a home directory is shared or restored across machines.
    if (record.platform && record.platform !== process.platform) {
      this.recordMessage(
        'manager',
        `[reap] ${PID_FILE} was written on ${record.platform}, running on ` +
          `${process.platform} — skipping`
      )
      return
    }

    const live = this.readLiveCmdline(record.pid)
    if (!live) {
      this.recordMessage('manager', `[reap] pid ${record.pid} is not running — nothing to reap`)
      return
    }

    const recorded = backendIdentity(record.cmdline)
    const running = backendIdentity(live)

    // Two different outcomes, deliberately logged apart. "No identity" means the
    // string carried no heliosgui_backend or no --port at all — a dev backend run
    // by hand as `python backend_wrapper.py`, or a pid recycled onto something
    // unrelated. "Differs" means both parsed and disagreed. The first is expected
    // and fine; the second means the record and the live process have stopped
    // being comparable, which is the thing that would quietly disable all of this.
    if (!recorded || !running) {
      this.recordMessage(
        'manager',
        `[reap] pid ${record.pid} carries no backend identity — leaving it alone. ` +
          `recorded=${JSON.stringify(record.cmdline.slice(0, 120))} ` +
          `live=${JSON.stringify(live.slice(0, 120))}`
      )
      return
    }

    if (recorded.exe !== running.exe || recorded.port !== running.port) {
      // Logged with BOTH strings on purpose. If the two sides ever stop being
      // comparable — a packaging change that alters argv[0], a new argument — this
      // is the only thing that will say so. Truncated because a Windows command
      // line carries the full install path.
      this.recordMessage(
        'manager',
        `[reap] pid ${record.pid} is not the recorded backend — leaving it alone. ` +
          `recorded=${recorded.exe}:${recorded.port} live=${running.exe}:${running.port}`
      )
      return
    }

    this.recordMessage(
      'manager',
      `[reap] killing orphaned backend pid ${record.pid} on port ${running.port}`
    )
    try {
      this.forceKillTree(record.pid, null)
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error)
      this.recordMessage('manager', `[reap] kill of pid ${record.pid} failed: ${err}`)
    }
  }

  private ensureRuntimeDirectories(dataDir: string, logDir: string): void {
    try {
      // Create log directory only (data directory is created by backend as needed)
      this.writeLogLine(`[setup] creating log directory: ${logDir}`)
      fs.mkdirSync(logDir, { recursive: true })
      this.writeLogLine(`[setup] log directory ready ✓`)
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create log directory: ${err}`)
    }
  }

  private openLogStream(logFile: string): void {
    if (this.logFile !== logFile || !this.logStream) {
      this.logStream?.end()

      try {
        this.logStream = fs.createWriteStream(logFile, { flags: 'a' })
        this.logFile = logFile
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to open log stream at ${logFile}: ${err}`)
      }
    }

    this.writeLogLine(`[manager] ════════════════════════════════════════════════════════`)
    this.writeLogLine(`[manager] Backend launch at ${new Date().toISOString()}`)
    this.writeLogLine(`[manager] Packaged: ${app.isPackaged}, Platform: ${process.platform}`)
  }

  private writeLogLine(message: string): void {
    const line = `${new Date().toISOString()} ${message}\n`
    this.logStream?.write(line)
  }

  private recordMessage(kind: string, message: string): void {
    const entry = `[${kind}] ${message}`
    this.stdio.push(entry)
    if (this.stdio.length > 500) {
      this.stdio.shift()
    }
    this.writeLogLine(entry)
  }

  private getRecentLogs(limit = 20): string {
    return this.stdio.slice(-limit).join('\n')
  }

  private async waitForBackendReady(child: ChildProcess): Promise<void> {
    const healthUrl = `http://127.0.0.1:${this.port}/health`
    const deadline = Date.now() + this.startupTimeoutMs

    this.recordMessage(
      'manager',
      `Polling health check at ${healthUrl}, timeout ${this.startupTimeoutMs}ms`
    )

    while (Date.now() < deadline) {
      if (this.process !== child || child.killed || child.exitCode !== null) {
        throw new Error(
          `Backend exited before becoming ready (exit code: ${child.exitCode}).\n` +
            `Recent output:\n${this.getRecentLogs()}`
        )
      }

      try {
        // Use AbortController for timeout on health check
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(healthUrl, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.ok) {
          this.recordMessage('manager', `Health check PASSED ✓`)
          return
        }
      } catch {
        // Backend not ready yet; keep polling until timeout or exit.
      }

      await delay(250)
    }

    throw new Error(
      `Backend did not become ready within ${this.startupTimeoutMs}ms.\n` +
        `Recent output:\n${this.getRecentLogs()}`
    )
  }

  async startBackend(): Promise<BackendStatus> {
    if (this.process && !this.process.killed) {
      return this.getBackendStatus()
    }

    const backendPath = this.getBackendPath()
    const runtimePaths = this.getRuntimePaths()

    try {
      this.recordMessage('manager', `Starting backend process...`)

      this.validateBackendPath(backendPath)
      this.ensureRuntimeDirectories(runtimePaths.dataDir, runtimePaths.logDir)
      this.openLogStream(runtimePaths.logFile)

      // BEFORE the port is chosen, not after. The backend reaps from the same
      // record on its own boot, but that happens once it is already running — by
      // which time we have committed to 8009 and the drift is permanent.
      this.reapPreviousBackend(runtimePaths.dataDir)

      // Pick a free port starting at 8008. If 8008 is held by another process
      // (or a leftover backend from a crashed previous run), increment until
      // we find one that bind() succeeds on. Without this the spawn appears to
      // succeed but the backend exits with "address already in use".
      const desiredPort = this.port

      // A reaped process does not release its port on the same tick, and a
      // single probe a millisecond too early would send us to 8009 anyway —
      // reaping the orphan and still taking none of the benefit. A listening
      // socket does not enter TIME_WAIT, so this settles almost immediately;
      // the retries are for scheduling, not for the protocol.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (await isPortFree(desiredPort)) break
        await delay(100)
      }

      this.port = await findFreePort(this.port)
      if (this.port !== desiredPort) {
        // Almost always an ORPHAN, not a genuine port clash: a backend from a
        // previous run that outlived a crash and is still holding the port, the
        // SQLite file and its whole scenario context. Moving to the next port
        // starts a second backend that then contends with it for the database,
        // which is what makes the project list come back empty after a crash.
        //
        // Reaching here now means the reap above did NOT clear it, which is worth
        // saying plainly: either the holder is not a backend we recorded, or the
        // record and the live process stopped being comparable. The [reap] line
        // just above in this log says which.
        this.recordMessage(
          'manager',
          `WARNING: port ${desiredPort} still busy after reaping — using ${this.port} ` +
            `instead. Something is holding it that we did not recognise; ` +
            `check with: pgrep -af heliosgui_backend (or tasklist on Windows)`
        )
      }

      const env = {
        ...process.env,
        HELIOS_DATA_DIR: runtimePaths.dataDir,
        HELIOS_LOG_DIR: runtimePaths.logDir,
        // The backend's only defence against being orphaned.
        //
        // killSync() below covers a normal quit, but it runs from 'will-quit' /
        // 'exit' and a CRASH reaches neither — the process is simply gone. The
        // backend was then left running with its whole scenario context resident
        // (measured: 1.26 GB still held long after the app was killed), holding
        // the port and the SQLite file until the machine was rebooted. Every
        // crash left another one behind, so the next crash arrived sooner.
        //
        // A dead process cannot clean up after itself, so the backend has to
        // notice instead: it watches this pid and exits on its own once it goes.
        //
        // Deliberately an ENV VAR and not a CLI flag. backend_wrapper.py parses
        // argv with argparse, which EXITS on an argument it does not recognise —
        // so shipping `--parent-pid` before the backend understands it would
        // stop the app from starting at all. An unread env var is ignored, so
        // this side can land first and is a no-op until the watchdog exists.
        HELIOS_PARENT_PID: String(process.pid)
      }

      this.recordMessage('manager', `Spawning: ${backendPath}`)
      this.recordMessage('manager', `Args: --port=${this.port}`)
      this.recordMessage('manager', `Cwd: ${app.getPath('home')}`)
      this.recordMessage('manager', `Env: HELIOS_DATA_DIR=${runtimePaths.dataDir}`)
      this.recordMessage('manager', `Env: HELIOS_PARENT_PID=${process.pid}`)
      this.recordMessage('manager', `Platform: ${process.platform}, Packaged: ${app.isPackaged}`)

      this.process = spawn(backendPath, [`--port=${this.port}`], {
        cwd: app.getPath('home'), // Use home directory instead of data directory
        // stdin is a PIPE and nothing is ever written to it. It is not a channel,
        // it is a LIVENESS SIGNAL: this process holds the write end open for as
        // long as it lives, and the OS closes it the moment this process dies —
        // for ANY reason, including an abort that runs no cleanup at all. The
        // backend blocks on a read at the other end, the read returns empty, and
        // it exits on its own.
        //
        // That is the whole orphan fix, and it has to be the OS enforcing it.
        // killSync() (on 'will-quit' / 'exit') covers a normal quit and nothing
        // else; a crash reaches neither handler. That is how a backend was left
        // holding 1.26 GB, port 8008 and the SQLite file until the next reboot —
        // and every crash left another one, so the next crash came sooner.
        //
        // Chosen over the alternatives because it is ONE mechanism for all three
        // platforms and needs no native code:
        //   - getppid() is POSIX-only, and breaks under PyInstaller --onefile
        //     where the bootloader sits between us and never matches our pid.
        //   - Polling a recorded pid races pid reuse.
        //   - A Windows Job Object works, but needs an FFI native module: this
        //     app ships no runtime native code today and npmRebuild is off.
        // A pipe has none of those problems — nothing polled, no pid stored, and
        // process topology is irrelevant.
        //
        // NOTE the difference from 'ignore': that gave the backend /dev/null,
        // where a read returns EOF immediately. A read on this BLOCKS. Safe only
        // because nothing in app/ or backend_wrapper.py reads stdin — anything
        // that did would now hang at startup and trip the 30s readiness timeout.
        //
        // AND: on POSIX this is a unix domain SOCKET, not a FIFO — libuv builds
        // stdio pipes with socketpair(). Measured, not assumed: a python child
        // spawned this way reports S_ISSOCK true and S_ISFIFO FALSE. It matters
        // because the backend gates its reader on the kind of handle it gets (so
        // that branches still spawning with 'ignore' — /dev/null, a character
        // device — never arm it and exit instantly on the immediate EOF). That
        // gate must accept a socket as well as a FIFO, or it silently never arms
        // on macOS and Linux and the orphan fix quietly does nothing.
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        shell: false,
        env
      })

      this.recordMessage('manager', `Process spawned, PID: ${this.process.pid}`)

      // Attach listeners IMMEDIATELY after spawn to catch any early output or errors
      let hasOutput = false

      if (this.process.stdout) {
        this.process.stdout.on('data', (data: Buffer) => {
          const message = data.toString().trim()
          if (message) {
            hasOutput = true
            this.recordMessage('stdout', message)
            console.log(`[Backend stdout] ${message}`)
          }
        })
      } else {
        this.recordMessage('manager', `WARNING: stdout is null after spawn`)
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => {
          const message = data.toString().trim()
          if (message) {
            hasOutput = true
            this.recordMessage('stderr', message)
            console.error(`[Backend stderr] ${message}`)
          }
        })
      } else {
        this.recordMessage('manager', `WARNING: stderr is null after spawn`)
      }

      // Listen for any errors during process execution
      this.process.on('error', (error: Error) => {
        this.recordMessage('manager', `Process error event: ${error.message}`)
        console.error('[Backend error event]', error)
      })

      this.process.on('exit', (code, signal) => {
        this.recordMessage(
          'manager',
          `Process exited (code: ${code}, signal: ${signal}, hasOutput: ${hasOutput})`
        )
        console.log(`Backend process exited with code ${code} and signal ${signal}`)
        this.process = null
      })

      this.process.on('error', (error) => {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.recordMessage('error', `spawn() error: ${errorMsg}`)
        console.error('Backend process error:', error)
        this.process = null
      })

      await this.waitForBackendReady(this.process)

      this.recordMessage('manager', `Backend is ready and running`)

      return {
        running: true,
        pid: this.process.pid || null,
        port: this.port,
        logFile: this.logFile || undefined
      }
    } catch (error) {
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM')
      }
      this.process = null
      const message = error instanceof Error ? error.message : String(error)
      this.recordMessage('manager', `ERROR: Failed to start backend: ${message}`)
      return {
        running: false,
        pid: null,
        error: message,
        logFile: this.logFile || undefined
      }
    }
  }

  async stopBackend(): Promise<BackendStatus> {
    if (!this.process) {
      return {
        running: false,
        pid: null,
        logFile: this.logFile || undefined
      }
    }

    const currentProcess = this.process
    const pid = currentProcess.pid

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (currentProcess && !currentProcess.killed) {
          this.forceKillTree(pid, currentProcess)
        }
      }, 5000)

      currentProcess.once('exit', () => {
        clearTimeout(timeout)
        if (this.process === currentProcess) {
          this.process = null
        }
        resolve({
          running: false,
          pid: null,
          logFile: this.logFile || undefined
        })
      })

      // On Windows, child.kill() only targets the direct PID. A PyInstaller
      // --onedir backend spawns a bootloader child (uvicorn), so killing just
      // the parent orphans the real backend — it keeps file/port locks alive
      // and blocks reinstall. taskkill /T reaps the whole tree.
      if (process.platform === 'win32') {
        this.forceKillTree(pid, currentProcess)
      } else {
        currentProcess.kill('SIGTERM')
      }
    })
  }

  // Forcefully terminate the backend process tree. On Windows there is no
  // graceful signal for console children, so taskkill /F /T is the only
  // reliable reaper; elsewhere fall back to SIGKILL.
  // `proc` is null when reaping a backend from a PREVIOUS run: it is not our
  // child, so there is no ChildProcess to call kill() on and the signal has to go
  // through process.kill by pid. taskkill never needed the handle anyway.
  private forceKillTree(pid: number | undefined, proc: ChildProcess | null): void {
    if (process.platform === 'win32' && pid) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
    } else if (proc) {
      proc.kill('SIGKILL')
    } else if (pid) {
      process.kill(pid, 'SIGKILL')
    }
  }

  // Synchronous best-effort kill for app 'will-quit'/'exit' handlers, where
  // Electron does NOT await async cleanup. Without this the backend is orphaned
  // on quit and holds its files open, which blocks reinstall on Windows.
  killSync(): void {
    const proc = this.process
    if (!proc || proc.killed) return
    try {
      this.forceKillTree(proc.pid, proc)
    } catch {
      // best-effort during shutdown — nothing useful to do on failure
    }
    this.process = null
  }

  getBackendStatus(): BackendStatus {
    if (!this.process || this.process.killed) {
      return {
        running: false,
        pid: null,
        logFile: this.logFile || undefined
      }
    }

    return {
      running: true,
      pid: this.process.pid || null,
      port: this.port,
      logFile: this.logFile || undefined
    }
  }

  async cleanup(): Promise<void> {
    if (this.process) {
      await this.stopBackend()
    }
  }

  getStdioLogs(): string[] {
    return this.stdio
  }
}

export const backendManager = new BackendManager()
