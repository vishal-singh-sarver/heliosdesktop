# Contributing to Helios GUI

Electron desktop app shell for Helios, a FastAPI-backed workspace. Two halves live in this repo: an Electron + React renderer (this repo's `src/`) and a Python FastAPI backend (git submodule at [helios-desktop-backend/](helios-desktop-backend/), tracked separately).

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Shell | Electron | 33 |
| Build | electron-vite | 5 |
| UI | React + TypeScript | React 19, TS 5.9 |
| State | Redux + Redux-Saga | Redux 5, Saga 1.3 |
| Selectors | Reselect | 5 |
| Immutability | Immer | 10 |
| Styles | Tailwind CSS | 4 |
| Unit tests | Vitest + Testing Library | Vitest 4 |
| E2E tests | WebdriverIO (`wdio-electron-service`) | 9 |
| Generators | Plop | 3 |
| Backend | FastAPI (Python, submodule) | — |
| Node | >= 22 | — |

## Project Map

```
src/
  main/           Electron main process — windows, IPC handlers, backend child process
  preload/        contextBridge — exposes typed window.api to renderer
  renderer/src/
    App.tsx       Screen router (Redux-driven, no React Router)
    store/        configureStore, root reducer, navigationReducer
    containers/   Redux-connected feature screens (one folder per feature)
    components/   Pure presentational components
    utils/        api.ts (fetch wrapper), sse.ts (SSE EventChannel), injectReducer/Saga
helios-desktop-backend/      Python FastAPI backend (git submodule — do not edit from this repo)
scripts/
  sync-backend.js Copies backend build output into resources/ before packaging
internals/
  generators/     Plop templates (run `npm run generate`)
e2e/              WebdriverIO specs
linux-installer/  Linux installer payload + build scripts
resources/        Platform-specific backend binaries bundled into the installer
```

## Commands

| Task | Command |
|------|---------|
| Dev (full stack) | `npm run dev` |
| Dev (frontend only, skip backend) | `npm run dev:no-backend` |
| Unit tests (one-shot) | `npm test` |
| Unit tests (watch) | `npm run test:watch` |
| Coverage | `npm run test:coverage` |
| Lint | `npm run lint` |
| Lint fix | `npm run lint:fix` |
| Format | `npm run format` |
| Scaffold container/component | `npm run generate` |
| Build | `npm run build` |
| Package (current OS) | `npm run package` |
| E2E | `npm run e2e:build` |

Dev server launches with `--no-sandbox` on Linux. If testing sandbox behavior, see README for the one-time `chrome-sandbox` chown/chmod.

## Conventions

The key style rules are reproduced here — read them before non-trivial changes:

- **Process boundaries are hard.** Renderer never imports `electron` or Node APIs. Everything crosses through preload's `contextBridge`. `contextIsolation: true`, `nodeIntegration: false` — non-negotiable.
- **IPC:** channel names are constants shared by main + preload (`feature:verb`). Request/response uses `ipcMain.handle` + `ipcRenderer.invoke`. Renderer calls `window.api.*`, never `ipcRenderer` directly.
- **Redux:** action types are `FEATURE/VERB_NOUN` SCREAMING_SNAKE_CASE. Every async flow has `*_REQUESTED` / `*_SUCCEEDED` / `*_FAILED`. Components read state only through memoized selectors — no `state.foo.bar` in JSX.
- **Sagas own side effects.** Components dispatch actions; sagas call `window.api.*` and HTTP. `call` every side effect (testability). Long-running sagas use `eventChannel` and clean up in `finally`.
- **SSE** goes through [src/renderer/src/utils/sse.ts](src/renderer/src/utils/sse.ts) — see `containers/HomePage/saga.ts` for the pattern.
- **HTTP** goes through [src/renderer/src/utils/api.ts](src/renderer/src/utils/api.ts). `BASE_URL` defaults to `http://localhost:8000`.
- **Tests live next to code** (`foo.ts` → `foo.test.ts`), never in a parallel `__tests__` tree.
- **Strict TypeScript.** No `any` without a one-line justification. No non-null `!` — narrow the type.

## NEVER

- `helios-desktop-backend/` is a git submodule with its own repo and its own [helios-desktop-backend/CONTRIBUTING.md](helios-desktop-backend/CONTRIBUTING.md). Edits land in that repo's history, not this one — work in `helios-desktop-backend/` directly for backend-only changes.
- Never commit `package-lock.json` (it is gitignored intentionally — see [.gitignore](.gitignore)).
- Never `require('electron')` or touch Node APIs from the renderer.
- Never put non-serializable values in Redux (Dates, Maps, class instances, Errors, File objects).
- Never dispatch from reducers, and never call `store.dispatch` / `store.getState` outside sagas and store setup.
- Never use `useEffect` to trigger a saga on mount — dispatch the action; let the saga watch for it.
- Never `shell.openExternal` on untrusted input without validating the protocol.
- Never `console.log` in committed code — use the logger module.
- Never auto-commit, amend published commits, or force-push a shared branch without explicit instruction.

## Task Intake

For non-trivial changes, write up the task before starting work — a one-sentence goal, **testable** acceptance criteria, affected files, and constraints.
