// Globals are imported explicitly rather than added to tsconfig.node.json's
// `types`. That config covers production main-process code, and giving it
// vitest/globals would make describe/it/expect resolve inside the real main
// process too — where they do not exist at runtime.
import { describe, expect, it } from 'vitest'
import { backendIdentity, sameBackend } from '../backend-identity'

// Every string below is a LITERAL in the shape its real source produces, never
// something this module generated. That distinction is the whole point of the
// file: the backend team shipped a reap whose comparison never matched, and its
// unit test passed because it compared the function against its own output. A
// test built that way cannot see a mismatch between two sources — which is the
// only failure mode that matters here.

const NUL = '\0'

// /proc/<pid>/cmdline — NUL-separated, argv[0] exactly as exec received it.
const LINUX_LIVE = `/opt/Helios/resources/backend/heliosgui_backend${NUL}--port=8008${NUL}`

// ps -o command= — space-separated.
const DARWIN_LIVE =
  '/Users/n/Applications/Helios.app/Contents/Resources/backend/heliosgui_backend --port=8008'

// The backend's recorded sys.argv, NUL-joined.
const RECORDED = `heliosgui_backend${NUL}--port=8008`

// WMI Win32_Process.CommandLine — the RAW CreateProcess string. Quoted, because
// Node quotes arguments and the install path contains a space.
const WIN32_LIVE = '"C:\\Program Files\\Helios\\resources\\backend\\heliosgui_backend.exe" --port=8008'

describe('backendIdentity', () => {
  it('reads the same identity out of all three live formats', () => {
    expect(backendIdentity(LINUX_LIVE)).toEqual({ exe: 'heliosgui_backend', port: '8008' })
    expect(backendIdentity(DARWIN_LIVE)).toEqual({ exe: 'heliosgui_backend', port: '8008' })
    // .exe is NOT part of the identity, deliberately: the recorded sys.argv[0] on
    // Windows has no extension and WMI's CommandLine does. Including it made every
    // Windows comparison fail, which this test caught before it shipped.
    expect(backendIdentity(WIN32_LIVE)).toEqual({ exe: 'heliosgui_backend', port: '8008' })
  })

  it('matches a recorded sys.argv against every live format', () => {
    // The claim the reaper rests on. Note WIN32 in particular: a raw quoted
    // CreateProcess string against a NUL-joined argv is not remotely equal as a
    // string, which is exactly why identity is not compared verbatim.
    expect(sameBackend(RECORDED, LINUX_LIVE)).toBe(true)
    expect(sameBackend(RECORDED, DARWIN_LIVE)).toBe(true)
    expect(sameBackend(RECORDED, WIN32_LIVE)).toBe(true)
  })

  it('survives --port being spawned as two argv elements', () => {
    // The latent trap: nothing spawns it this way today, but the day an argv
    // array changes from ['--port=8008'] to ['--port', '8008'] the recorded form
    // becomes `--port<NUL>8008`. A separator class of [= ] misses the NUL,
    // identity returns null, and the reaper silently stops firing — with no error
    // anywhere and no test failing.
    const split = `heliosgui_backend${NUL}--port${NUL}8008`
    expect(backendIdentity(split)).toEqual({ exe: 'heliosgui_backend', port: '8008' })
    expect(sameBackend(split, LINUX_LIVE)).toBe(true)
  })

  it('refuses to identify a process on a different port', () => {
    // A second backend on 8009 must never be reaped by the record for 8008. This
    // is what stands in for pid-reuse protection now that verbatim comparison is
    // gone.
    const other = `/opt/Helios/resources/backend/heliosgui_backend${NUL}--port=8009${NUL}`
    expect(sameBackend(RECORDED, other)).toBe(false)
  })

  it('declines anything that is not a packaged backend', () => {
    // A recycled pid, and a dev backend run by hand. Both must come back null so
    // the caller leaves them alone — declining is the safe direction, and the
    // backend's own reap covers dev.
    expect(backendIdentity('/usr/bin/vim src/main/backend-manager.ts')).toBeNull()
    expect(backendIdentity(`python${NUL}backend_wrapper.py${NUL}--port=8008`)).toBeNull()
    expect(backendIdentity('')).toBeNull()
  })

  it('declines a backend path with no port at all', () => {
    // Half an identity is not an identity: without a port there is nothing to
    // distinguish this process from a second backend we must not touch.
    expect(backendIdentity(`heliosgui_backend${NUL}`)).toBeNull()
  })

  it('never matches when either side is unidentifiable', () => {
    expect(sameBackend(RECORDED, '')).toBe(false)
    expect(sameBackend('', LINUX_LIVE)).toBe(false)
    expect(sameBackend('', '')).toBe(false)
  })
})
