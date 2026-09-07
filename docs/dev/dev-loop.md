# Dev loop

Day-to-day development, once [Getting started](getting-started.md) has been done once.

## Two ways to run

=== "Full stack"

    ```bash
    npm run dev
    ```

    Electron main process spawns the real backend from `resources/backend/<platform>/`. This is
    what you want for anything that loads, saves, or renders a project.

=== "Frontend only"

    ```bash
    npm run dev:no-backend
    ```

    Sets `HELIOS_SKIP_BACKEND=1`, so the main process skips backend startup entirely. The UI
    launches in seconds and **anything that talks to the backend fails**. Useful for pure
    component and styling work.

In dev, the renderer's `BASE_URL` is empty and requests go to same-origin `/api/*`, which Vite
proxies to the backend (`electron.vite.config.ts` → `server.proxy`). In a packaged build Electron
loads from `file://` and must hit the backend directly. That difference is the reason
`utils/constants.ts` branches on `import.meta.env.DEV`.

!!! note "Linux sandbox"
    `npm run dev` passes `--no-sandbox`. To test real sandbox behaviour, see the one-time
    `chrome-sandbox` chown/chmod in the repository `README.md`.

## Commands

| Task | Command |
|---|---|
| Dev (full stack) | `npm run dev` |
| Dev (frontend only) | `npm run dev:no-backend` |
| Unit tests, one-shot | `npm test` |
| Unit tests, watch | `npm run test:watch` |
| Coverage | `npm run test:coverage` |
| Lint | `npm run lint` |
| Lint + fix | `npm run lint:fix` |
| Format | `npm run format` |
| Scaffold a container/component | `npm run generate` |
| Build | `npm run build` |
| Package for this OS | `npm run package` |
| E2E | `npm run e2e:build` |

## Scaffolding

```bash
npm run generate
```

Runs Plop against `internals/generators/`. It creates a container or component with the full
conventional shape — `actions.ts`, `constants.ts`, `reducer.ts`, `saga.ts`, `selectors.ts`,
`Loadable.tsx`, `tests/`. Use it rather than copying a folder by hand; the layout is what
[State management](arch/state.md) relies on.

## Working on the backend

`helios-desktop-backend/` is a **git submodule with its own repository and its own
`CONTRIBUTING.md`**. Commits made inside it land in that repo's history, not this one.

For backend-only work, `cd` into it and work there directly. See
[Backend submodule](../git-submodule-setup.md).

After changing backend Python code you need to re-bundle and re-sync before `npm run dev` picks it
up:

```bash
cd helios-desktop-backend
source venv/bin/activate
bash scripts/build_binary.sh        # PyInstaller → dist/heliosgui_backend
cd ..
npm run sync-backend                # copies it into resources/backend/<platform>/
```

For faster iteration you can run the backend by hand (`python backend_wrapper.py --port=8008`)
and use `npm run dev:no-backend` — but note the app then has no supervised child process, so none
of the reaper behaviour in [Backend sidecar](arch/backend.md) applies.

## Conventions

The rules below are load-bearing, not stylistic. The full list lives in the repository
`CONTRIBUTING.md`.

**Process boundaries are hard.**

- The renderer never imports `electron` or Node APIs. Everything crosses through preload's
  `contextBridge`.
- `contextIsolation: true`, `nodeIntegration: false` — non-negotiable.
- Renderer calls `window.api.*`, never `ipcRenderer` directly.
- IPC channel names are `feature:verb` constants shared by main and preload; request/response uses
  `ipcMain.handle` + `ipcRenderer.invoke`.

**Redux and sagas** — see [State management](arch/state.md) for the full set.

**TypeScript is strict.** No `any` without a one-line justification. No non-null `!` — narrow the
type instead.

**Tests live next to code** (`foo.ts` → `foo.test.ts`), never in a parallel `__tests__` tree.

### Never

- Never commit `package-lock.json` — it is gitignored intentionally.
- Never `require('electron')` or touch Node APIs from the renderer.
- Never put non-serializable values in Redux (Dates, Maps, class instances, Errors, File objects).
- Never dispatch from reducers, or call `store.dispatch` / `store.getState` outside sagas and store
  setup.
- Never use `useEffect` to trigger a saga on mount — dispatch the action and let the saga watch.
- Never `shell.openExternal` on untrusted input without validating the protocol.
- Never `console.log` in committed code — use the logger module.
- Never auto-commit, amend published commits, or force-push a shared branch without explicit
  instruction.

## Before opening a merge request

```bash
npm run lint
npm test
```

For non-trivial changes, write the task up first: a one-sentence goal, **testable** acceptance
criteria, affected files, and constraints.

## Related

- [Testing](testing.md)
- [Building installers](build.md)
- [CI/CD workflow](../ci-cd-workflow.md)
