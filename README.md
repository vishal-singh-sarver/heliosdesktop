# Helios GUI

Electron desktop application for **Helios** — a 3D plant/scene simulation workspace backed by
[PyHelios](https://github.com/PlantSimulationLab/PyHelios). The app ships as a single desktop
installer that bundles two halves:

- **Renderer/shell** — Electron + React + Redux (this repository's `src/`).
- **Backend** — a FastAPI service that owns the PyHelios 3D context and persists projects to
  SQLite. It lives in the [`backend-api/`](backend-api/) git submodule and runs as a child
  process launched by the Electron main process.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Shell | Electron | 33 |
| Build | electron-vite | 5 |
| Packaging | electron-builder | 24 |
| UI | React + TypeScript | React 19, TS 5.9 |
| State | Redux + Redux-Saga | Redux 5, Saga 1.3 |
| Selectors | Reselect | 5 |
| Immutability | Immer | 10 |
| Styles | Tailwind CSS | 4 |
| Unit tests | Vitest + Testing Library | Vitest 4 |
| E2E tests | WebdriverIO (`wdio-electron-service`) | 9 |
| Generators | Plop | 3 |
| Backend | FastAPI (Python, submodule) | — |

## Prerequisites

- **Node.js ≥ 22** and npm
- **Git** (the backend is a submodule)
- To build/run the **backend** locally: Python 3.11+, plus CMake 3.20+ and a C++17 compiler for
  the PyHelios native build. See [backend-api/README.md](backend-api/README.md).

## Getting started

```bash
# 1. Clone with the backend submodule
git clone --recurse-submodules <helios_gui-url>
cd helios_gui

# 2. Install frontend dependencies
npm install

# 3. Set up the backend (Python venv + PyHelios) — see backend-api/README.md
#    Windows users can run the one-shot setup instead: scripts/setup-windows-dev.ps1
```

If you already cloned **without** `--recurse-submodules`, or the submodule points at the wrong
account, initialise it with:

```bash
npm run setup:submodules
```

See [docs/git-submodule-setup.md](docs/git-submodule-setup.md) for how the submodule URL follows
the account automatically on a fork.

### Linux: Electron sandbox (one-time)

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

> If you cannot run `sudo`, the `dev` script already passes `--no-sandbox` as a fallback.

## Development

```bash
npm run dev              # full stack — launches the backend + renderer with HMR
npm run dev:no-backend   # frontend only (skip spawning the backend)
```

## Scripts

| Task | Command |
|------|---------|
| Dev (full stack) | `npm run dev` |
| Dev (frontend only) | `npm run dev:no-backend` |
| Initialise/repair submodule | `npm run setup:submodules` |
| Sync backend build into `resources/` | `npm run sync-backend` |
| Unit tests (one-shot) | `npm test` |
| Unit tests (watch) | `npm run test:watch` |
| Coverage | `npm run test:coverage` |
| Lint / auto-fix | `npm run lint` / `npm run lint:fix` |
| Format | `npm run format` |
| Scaffold container/component | `npm run generate` |
| Production build (→ `out/`) | `npm run build` |
| Package current OS (→ `dist/`) | `npm run package` |
| Package Win / macOS / Linux | `npm run package:win` / `:mac` / `:linux` |
| End-to-end tests | `npm run e2e` (`npm run e2e:build` to build first) |

> `npm run build` runs `scripts/sync-backend.js` first, which copies the packaged backend into
> `resources/`. Build the backend bundle before packaging — see
> [backend-api/README.md](backend-api/README.md) (or `scripts/setup-windows-dev.ps1` on Windows).

## Testing

```bash
npm test              # Vitest, one-shot
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

Unit tests live within each feature — either co-located as `*.test.ts(x)` or in the feature's
`tests/` subfolder — never in a parallel `__tests__` tree. End-to-end specs use WebdriverIO and
live in `e2e/`.

## Project structure

```
src/
  main/            Electron main process — windows, IPC handlers, backend child process
  preload/         contextBridge — exposes typed window.api to the renderer
  renderer/src/
    App.tsx        Screen router (Redux-driven, no React Router)
    store/         configureStore, root reducer, navigationReducer
    containers/    Redux-connected feature screens (one folder per feature)
    components/    Pure presentational components
    utils/         api.ts (HTTP), sse.ts (SSE EventChannel), injectReducer/Saga
backend-api/       Python FastAPI backend (git submodule — its own repo & lifecycle)
scripts/           Dev/setup scripts (submodule setup, backend sync, Windows toolchain)
internals/         Plop generator templates (npm run generate)
e2e/               WebdriverIO specs
resources/         Platform backend binaries bundled into the installer
linux-installer/   Linux installer payload + build scripts
```

## Documentation

| Doc | What it covers |
|-----|----------------|
| [docs/git-submodule-setup.md](docs/git-submodule-setup.md) | Fork-friendly submodule setup and the `setup:submodules` helper |
| [docs/ci-cd-workflow.md](docs/ci-cd-workflow.md) | GitHub Actions pipeline, build policy, release flow |
| [docs/installer-guide.html](docs/installer-guide.html) | Building & packaging installers per platform |
| [docs/dev-strategy.html](docs/dev-strategy.html) | Architecture deep-dive (processes, IPC, TypeScript, state) |
| [backend-api/README.md](backend-api/README.md) | Backend setup, API surface, persistence model |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor guide and the authoritative conventions |

## Architecture notes

**Process boundaries are hard.** The renderer never imports `electron` or Node APIs — everything
crosses through the preload `contextBridge` with `contextIsolation: true` and
`nodeIntegration: false`.

**Navigation** is Redux-driven (`store/navigationReducer.ts`), not React Router — dispatch a
navigation action and render the screen in `App.tsx`.

**HTTP** goes through [`src/renderer/src/utils/api.ts`](src/renderer/src/utils/api.ts) against
`BASE_URL` (see `utils/constants.ts`): in dev, requests are same-origin; in a packaged build the
main process launches the backend on a dynamic port that the renderer discovers via
`window.api.getBackendUrl()`. **SSE** streams go through
[`src/renderer/src/utils/sse.ts`](src/renderer/src/utils/sse.ts) as redux-saga event channels —
see `containers/HomePage/saga.ts` for the pattern.

**IPC bridge** — the preload exposes `window.api`:

| Group | Methods |
|-------|---------|
| File dialogs | `openFile(filters)`, `saveFile(filters, defaultPath?)` |
| File system | `readFile(path)`, `writeFile(path, content)` |
| Backend | `getBackendStatus()`, `getBackendUrl()`, `startBackend()`, `stopBackend()` |
| Window controls | `windowMinimize()`, `windowToggleMaximize()`, `windowClose()`, `windowIsMaximized()`, `windowIsFullScreen()`, `onFullScreenChange(cb)` |
| Misc | `getPlatform()`, `appReady()` |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full conventions (IPC channel naming, Redux action shapes,
saga/side-effect rules, and the hard process-boundary rules).

## Linting & formatting

```bash
npm run lint      # ESLint (TypeScript-aware, flat config)
npm run lint:fix  # auto-fix
npm run format    # Prettier
```

## License

