# Helios GUI

Electron desktop application for **Helios** — a 3D plant/scene simulation workspace backed by
[PyHelios](https://github.com/PlantSimulationLab/PyHelios). The app ships as a single desktop
installer that bundles two halves:

- **Renderer/shell** — Electron + React + Redux (this repository's `src/`).
- **Backend** — a FastAPI service that owns the PyHelios 3D context and persists projects to
  SQLite. It lives in the [`helios-desktop-backend/`](helios-desktop-backend/) git submodule and runs as a child
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
  the PyHelios native build. See [helios-desktop-backend/README.md](helios-desktop-backend/README.md).

## Getting started

Start to finish on a clean machine. Everything here runs from the repository root unless noted.
Steps 5 and 6 are the slow ones — budget **5–15 minutes** for the pair on a modern machine
(longer on a cold CMake cache or with `--gpu` plugins enabled).

### Frontend

```bash
# 1. Clone with the backend submodule
git clone --recurse-submodules <helios_gui-url>
cd helios_gui

# 2. Install frontend dependencies
npm install

# 3. Create the frontend .env (required — every npm script fails without it)
cp .env.example .env
```

> **Step 3 is not optional.** `.env` is gitignored, so a fresh clone has none.
> `electron.vite.config.ts` throws `VITE_BACKEND_URL is not set` at config-load time, which fails
> `dev`, `build`, **and** `package` before anything starts.

At this point `npm run dev:no-backend` will launch the UI. The backend below is required before
anything that loads or saves a project will work.

### Backend

On **Windows**, `scripts/setup-windows-dev.ps1` automates the toolchain check, the native build,
the PyInstaller bundle and the sync (steps 5–6 below); it does not create the Python venv, so run
step 4's equivalent (`helios-desktop-backend\scripts\create_venv.sh`, or `python -m venv venv` plus
`pip install -r requirements-dev.txt`) first. Pass `-Force` to rebuild artifacts that already exist.
On macOS/Linux:

```bash
# 4. Create the Python venv and install dependencies
bash helios-desktop-backend/scripts/create_venv.sh

# 5. Build the PyHelios native library (~10-30 min the first time)
cd helios-desktop-backend
source venv/bin/activate
bash scripts/build_pyhelios.sh          # add --gpu to enable GPU plugins

# 6. Bundle the backend into a standalone binary, then copy it into resources/
bash scripts/build_binary.sh
cd ..
npm run sync-backend
```

Requires **Python 3.10+**, **CMake 3.15+**, and a **C++17 compiler** — see
[Prerequisites](#prerequisites). Step 5 must run with the venv activated, since it finishes by
`pip install -e`-ing PyHelios into it. It builds `pyhelios/pyhelios_build/build/lib/libhelios.{dylib,so}`
and prints `SUCCESS:` plus the path when it works.

> **Step 6 is required even for development.** `npm run dev` does not run the Python source — the
> Electron main process spawns a compiled PyInstaller binary from
> `resources/backend/<mac|linux|win>/` in dev exactly as it does when packaged (see
> `src/main/backend-manager.ts`). That directory is gitignored and empty on a fresh clone, so
> without step 6 the app launches and then fails with
> `Backend executable not found: …/resources/backend/mac/heliosgui_backend`.
> Re-run step 6 whenever you change backend Python code.

> **You do not need `helios-desktop-backend/.env`** for the Electron app. The main process passes
> `--port` to the backend binary explicitly (starting at 8008, incrementing if busy) and the
> renderer discovers the chosen port via `window.api.getBackendUrl()`, so `PORT` in a backend `.env`
> is ignored on this path.

> **Do not run the backend binary from the repository root.** The backend's `Settings` uses a
> *relative* `env_file=".env"` and forbids unknown keys, so from the repo root it picks up the
> **frontend's** `.env` and dies at import time with
> `ValidationError: … vite_backend_url  Extra inputs are not permitted`. `npm run dev` is unaffected
> because the main process spawns it with `cwd` set to your home directory. To run it by hand, `cd`
> somewhere without a `.env` first:
>
> ```bash
> cd ~ && /path/to/repo/resources/backend/mac/heliosgui_backend --port=8008
> ```
>
> `curl http://127.0.0.1:8008/health` should return `"status":"ok"` with `"pyhelios_available":true`.

The PyHelios submodule (`helios-desktop-backend/pyhelios/`) comes down with the recursive clone in
step 1. If step 5 reports `submodule not initialized`, run
`git -C helios-desktop-backend submodule update --init --recursive`.

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
| Docs: preview / build / offline zip | `npm run docs:serve` / `docs:build` / `docs:offline` (see [Documentation site](#documentation-site)) |
| Docs: regenerate API and catalog reference | `npm run docs:generate` |

> `npm run build` runs `scripts/sync-backend.js` first, which copies the packaged backend into
> `resources/`. Build the backend bundle before packaging — see
> [helios-desktop-backend/README.md](helios-desktop-backend/README.md) (or `scripts/setup-windows-dev.ps1` on Windows).

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
helios-desktop-backend/       Python FastAPI backend (git submodule — its own repo & lifecycle)
scripts/           Dev/setup scripts (submodule setup, backend sync, Windows toolchain)
internals/         Plop generator templates (npm run generate)
e2e/               WebdriverIO specs
resources/         Platform backend binaries bundled into the installer
linux-installer/   Linux installer payload + build scripts
```

## Documentation

| Doc | What it covers |
|-----|----------------|
| Technical documentation site ([`docs/`](docs/) + [`mkdocs.yml`](mkdocs.yml)) | User guide, concepts, reference, architecture, recipes and the backend API — build it with the steps below |
| [docs/git-submodule-setup.md](docs/git-submodule-setup.md) | Fork-friendly submodule setup and the `setup:submodules` helper |
| [docs/ci-cd-workflow.md](docs/ci-cd-workflow.md) | GitHub Actions pipeline, build policy, release flow |
| [docs/installer-guide.html](docs/installer-guide.html) | Building & packaging installers per platform |
| [docs/dev-strategy.html](docs/dev-strategy.html) | Architecture deep-dive (processes, IPC, TypeScript, state) |
| [helios-desktop-backend/README.md](helios-desktop-backend/README.md) | Backend setup, API surface, persistence model |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor guide and the authoritative conventions |

### Documentation site

The technical documentation is an [MkDocs Material](https://squidfunk.github.io/mkdocs-material/)
site. Its sources are the Markdown files in `docs/`, its configuration is `mkdocs.yml`, and its
Python dependencies are pinned in [`docs/requirements.txt`](docs/requirements.txt).

It builds on its own. You need **Python 3.9+** and Git, plus Node/npm to use the `npm run docs:*`
shortcuts. You do **not** need `npm install`, the backend submodule or a backend build, so a plain
`git clone` (no `--recurse-submodules`) is enough.

| Task | macOS / Linux |
|------|---------------|
| Preview with live reload | `npm run docs:serve` |
| Build and check (fails on warnings) | `npm run docs:build` |
| Offline copy → `helios-docs.zip` | `npm run docs:offline` |
| Regenerate the API and catalog reference | `npm run docs:generate` |

The shortcuts call `.venv-docs/bin/mkdocs` directly, so there is no environment to activate. They
are **macOS/Linux only**: they use `.venv-docs/bin/`, `zip` and `rm`, none of which exist on
Windows. Windows users run the equivalent commands shown under each step.

#### 1. Install (once per clone)

Run from the repository root. The virtual environment `.venv-docs/` is gitignored.

```bash
# macOS / Linux
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r docs/requirements.txt
```

```powershell
# Windows (PowerShell) — activate again in every new terminal before running mkdocs
py -3 -m venv .venv-docs
.venv-docs\Scripts\Activate.ps1
pip install -r docs\requirements.txt
```

#### 2. Preview while you write

```bash
npm run docs:serve          # Windows: mkdocs serve
```

Open <http://127.0.0.1:8000>. Pages reload as you save them. Add every new page to the `nav:` list
in `mkdocs.yml`, or it will not appear in the navigation.

#### 3. Check the build

```bash
npm run docs:build          # Windows: mkdocs build --strict
```

`--strict` fails the build on any warning, such as a link to a page that does not exist. Fix the
warning rather than dropping the flag. A page left out of `nav:` is only logged as `INFO` and does
**not** fail the build, so check the navigation yourself after adding a page. The output goes to
`site/` (gitignored).

#### 4. Build an offline copy to download or share

```bash
npm run docs:offline
```

```powershell
# Windows (PowerShell)
$env:HELIOS_DOCS_OFFLINE = "true"; mkdocs build --strict; Remove-Item Env:HELIOS_DOCS_OFFLINE
Compress-Archive -Path site\* -DestinationPath helios-docs.zip -Force
```

This writes `helios-docs.zip` (gitignored) to the repository root. Whoever receives it unzips it
and opens `index.html` straight from disk, with no server or internet connection. Diagrams, fonts
and search all work. `docs:offline` does not pass `--strict`, so run `npm run docs:build` first to
catch broken links.

> **The offline build needs internet the first time.** `docs:offline` sets
> `HELIOS_DOCS_OFFLINE=true`, which turns on the Material `privacy` and `offline` plugins in
> `mkdocs.yml`. They download Mermaid (used for diagrams), the Inter/JetBrains Mono fonts and the
> search polyfill into the build. Downloads are cached in `.cache/plugin/privacy/` (gitignored), so
> later builds work without a connection. Without that variable the site is meant for a web
> server: opened from disk, its diagrams do not render and search never loads. Zipping the output
> of `docs:build` does **not** give a working offline copy.
>
> The same variable makes `docs/gen/hooks.py` drop the `navigation.instant` feature. Instant
> navigation fetches `sitemap.xml`, which browsers block on `file://`, and the failure stops all of
> the theme's page scripts: Mermaid shows "Syntax error in text", the sidebars grow scrollbars and
> run over the footer. Keep that hook if you change the offline setup.

#### Regenerating the reference pages

`docs/dev/api/endpoints.md`, the per-router pages under `docs/dev/api/ops/`, the API section of
`nav:` in `mkdocs.yml`, and `docs/reference/catalog.md` are generated by
`docs/gen/generate_reference.py` and committed, so readers never need to run it. Rerun it after a
backend API or catalog change:

```bash
npm run docs:generate
```

It uses the **backend** virtual environment, not `.venv-docs`, and imports the backend app, which
loads the PyHelios native library, so complete [Backend](#backend) steps 4 and 5 first.

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
