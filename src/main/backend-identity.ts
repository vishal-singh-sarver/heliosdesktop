// ── Identifying a backend process ────────────────────────────────────────────
//
// Split out from backend-manager purely so it can be TESTED. That module imports
// electron, which cannot be loaded under vitest, and this is the one piece of the
// reaper whose correctness is worth pinning: everything else is I/O, and this is
// the comparison that decides whether a process lives or dies.
//
// The backend records itself in <dataDir>/backend.pid on boot:
//
//   {"pid": 7539, "cmdline": "heliosgui_backend<NUL>--port=8008", "platform": "win32"}
//
// `cmdline` is NOT portable, and that is the whole difficulty. Three sources,
// three shapes:
//
//   linux    /proc/<pid>/cmdline      NUL-separated, argv[0] as exec received it
//   darwin   ps -o command=           space-separated
//   win32    sys.argv (recorded)      NUL-joined
//            WMI CommandLine (live)   the RAW CreateProcess string — not argv at
//                                     all: original quoting kept, and the install
//                                     path contains a space
//
// So on Windows the recorded and live forms can never be string-equal, which is
// why identity is reduced to (executable, port) rather than compared verbatim.

export interface BackendPidRecord {
  pid: number
  cmdline: string
  platform: string
}

export interface BackendIdentity {
  exe: string
  port: string
}

/**
 * What identifies a backend, reduced to the two things every platform agrees on.
 *
 * Returns null when the string carries neither marker — a pid recycled onto
 * something unrelated, or a DEV backend started by hand as
 * `python backend_wrapper.py --port=8008`, which contains no heliosgui_backend at
 * all. Declining there is correct rather than a gap: the backend's own reap
 * covers dev, and refusing to kill an unrecognised python process is the safe
 * direction. Callers log either way, so it is never a silent decline.
 */
export function backendIdentity(cmdline: string): BackendIdentity | null {
  // NUL to space FIRST, and for BOTH sides. The live Linux read normalises
  // already; the recorded string comes straight out of the backend's JSON and did
  // not — an asymmetry with a live trap in it. `--port=8008` is spawned as ONE
  // argv element today, so the recorded form reads `--port=8008` and matches.
  // Spawn it as two (`['--port', '8008']`) and the recorded form becomes
  // `--port<NUL>8008`, the separator class misses, identity comes back null, and
  // the reaper silently never fires — the exact failure this function exists to
  // prevent, reintroduced by an unrelated edit to an argv array. Normalising here
  // puts both sources in the same shape before anything is matched.
  const flat = cmdline.replace(/\0/g, ' ')

  // The STEM only — any .exe suffix is deliberately not part of the identity,
  // because the two Windows sources disagree about it. The backend records
  // sys.argv[0] as a bare `heliosgui_backend`; WMI's CommandLine reports the file
  // it actually launched, `heliosgui_backend.exe`. Carrying the extension into the
  // comparison made every Windows match fail — caught by the test in
  // tests/backend-identity.ts, which is the only reason it is not shipping.
  const exe = /heliosgui_backend/i.exec(flat)
  // \0 kept in the class as belt and braces, so this still holds if the
  // normalisation above is ever removed.
  const port = /--port[=\s\0](\d+)/.exec(flat)
  if (!exe || !port) return null

  return { exe: exe[0].toLowerCase(), port: port[1] }
}

/** True when two cmdline strings describe the same backend on the same port. */
export function sameBackend(recorded: string, live: string): boolean {
  const a = backendIdentity(recorded)
  const b = backendIdentity(live)
  return a !== null && b !== null && a.exe === b.exe && a.port === b.port
}
