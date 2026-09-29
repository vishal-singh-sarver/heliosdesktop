# Troubleshooting

## Where the logs are

| File | Contains |
|---|---|
| `<userData>/logs/backend.log` | Backend path resolution, spawn arguments, health polling, and the backend's own stdout/stderr |
| `<userData>/logs/app-startup.log` | Everything before the backend manager exists — userData path, single-instance lock, renderer/child crashes, uncaught exceptions |

`<userData>` is `~/Library/Application Support/Helios` (macOS), `%APPDATA%\Helios` (Windows), or
`~/.config/Helios` (Linux).

Two log lines are worth grepping for first:

```
[startup-fatal]     a classified backend startup failure, with a remedy
[slow]              any request that took over 2 seconds
```

---

## `VITE_BACKEND_URL is not set`

Every npm script fails, before anything starts.

`.env` is missing. It is gitignored, so a fresh clone never has one, and
`electron.vite.config.ts` throws at config-load time.

```bash
cp .env.example .env
```

See [Environment variables](../reference/env.md).

---

## The app quits with a "Backend Error" dialog

The backend did not answer `/health` within 30 seconds, so the main process showed the error and
quit **without** opening a window — deliberately, so the failure is visible rather than a UI that
looks ready.

Open `backend.log` and look for `[startup-fatal]`. The exit code classifies it:

| Code | Meaning | Fix |
|---|---|---|
| 10 | Migration failed | Restart; if it persists, attach `backend.log` to a bug report |
| 11 | Cannot create/write the data directory | Check permissions on `<userData>/backend-data` |
| 12 | Database is locked | Another copy of Helios is running — close all windows and relaunch |
| 13 | Database is malformed | Restart; if it persists, reset Helios data |
| 14 | Bundle incomplete | The build is missing the migrations folder — reinstall, or rebuild with `--add-data app/db/migrations:…` |

If there is no `[startup-fatal]` line at all, the process died before the lifespan ran. Check the
`[validation]` lines for a missing or non-executable binary — in dev that usually means
`npm run sync-backend` has not been run.

---

## Projects list is empty after a crash

Almost always an **orphaned backend** from the previous run still holding port 8008, the SQLite
file and its whole scenario context. The new backend walks past the busy port, takes 8009, and the
two contend for the database.

Look for this in `backend.log`:

```
WARNING: port 8008 still busy after reaping — using 8009 instead
```

Find and kill it:

=== "macOS / Linux"

    ```bash
    pgrep -af heliosgui_backend
    kill <pid>
    ```

=== "Windows"

    ```powershell
    tasklist | findstr heliosgui_backend
    taskkill /PID <pid> /T /F
    ```

The `[reap]` line immediately above the warning says *why* the automatic reaper declined —
either the holder carried no recognisable backend identity, or the recorded and live command lines
stopped being comparable. See [Backend sidecar](arch/backend.md).

---

## Backend memory keeps growing across projects

Expected if scenarios are not being discarded. Freeing a context does not return its pages to the
OS on glibc — measured, a 1000×1000 ground stayed at 1804 MB resident after `del` + `gc.collect()`
and dropped to 65.9 MB only after `malloc_trim(0)`.

`release_memory()` is called on the discard path. If memory grows anyway, the likely cause is a
lingering reference to the `ScenarioContext` — the trim reclaims nothing while one is held. Note
it is a **no-op on macOS and Windows**; glibc only.

See [The Helios context](../concepts/context.md#memory-freeing-is-not-returning).

---

## Large scenes fail to open, or the renderer crashes

Check which geometry wire format is active. v1 builds a JS object per vertex, and those live in
V8's pointer-compression cage — a hard **4 GB in Electron regardless of machine RAM**. A 2000×2000
ground needs ~4.4 GB of them.

From DevTools:

```js
__heliosPerf.gpuOn()     // switch to v2, then reload the scenario
```

If the app crashed rather than erroring, `app-startup.log` will carry a
`RENDERER GONE: reason=oom` line. See [Geometry & primitives](../concepts/primitives.md).

---

## `X-PyHelios-Stale: true` on every response

The native library is older than the C++ sources and the automatic rebuild failed. Geometry may be
wrong or unavailable.

```bash
cd helios-desktop-backend
source venv/bin/activate
bash scripts/build_pyhelios.sh      # add --gpu for GPU plugins
```

If PyHelios is missing entirely rather than stale, geometry endpoints return **503** and
`/api/pyhelios-info` reports `available: false`.

---

## Second launch focuses the existing window instead of opening a new one

Intended. A plain launch focuses what is already open — otherwise every click on a pinned taskbar
or dock icon would stack another window. Only an explicit `--new-window` (from the Windows jump
list, the macOS dock menu, the Linux `.desktop` action, or ++cmd+n++ / ++ctrl+n++) opens another.

---

## E2E specs fail as renderer timeouts on CI

Check the `[disk:…]` lines in the run output before assuming a product bug. The Ubuntu runner has
reached 0 MB free partway through a 7-spec run, and the symptom is **not** an out-of-space error —
the window opens and the renderer never mounts, which reads exactly like a timeout.

See [Testing](testing.md#disk-space-is-instrumented-on-purpose).

---

## `mkdocs: command not found`

The docs virtualenv is not active:

```bash
source .venv-docs/bin/activate
```

It resets in every new terminal.
