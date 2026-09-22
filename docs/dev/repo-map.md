# Repo map

What every folder is for. Read once; it saves an afternoon of guessing which of `build/`,
`resources/`, `out/` and `dist/` you are supposed to touch.

!!! important "The four look-alike folders"
    | Folder | Committed? | What it is |
    |---|---|---|
    | `build/` | **Yes** | Installer **inputs** — icons, entitlements, licence text, NSIS script |
    | `resources/` | Partly | Files bundled **into** the app — the backend binary, the splash image |
    | `out/` | No | electron-vite's compiled output — the app you run |
    | `dist/` | No | The finished **installers** |

    Only `build/` and `resources/` are yours to edit. The other two are generated.

## Top level

```
heliosdesktop/
├── src/                     the Electron app (three processes)
├── helios-desktop-backend/  the Python backend — a git SUBMODULE
├── build/                   installer inputs (icons, entitlements, NSIS, licence)
├── resources/               files bundled into the packaged app
├── linux-installer/         Linux .desktop entries and install scripts
├── internals/generators/    Plop templates — `npm run generate`
├── e2e/                     WebdriverIO specs, page objects, fixtures
├── scripts/                 build/setup/sign/notarize scripts
├── docs/                    this documentation site
└── .github/workflows/       CI
```

## `src/` — the app

```
src/
├── main/          Electron main process
│   ├── index.ts             windows, menus, IPC handlers, crash reporting
│   ├── backend-manager.ts   spawns and supervises the Python child process
│   └── backend-identity.ts  split out so it can be unit-tested without electron
├── preload/index.ts         the contextBridge — the ONLY renderer↔main channel
└── renderer/src/
    ├── App.tsx              screen switch (Redux-driven; there is no router)
    ├── store/               configureStore, root reducer, navigation, snackbar
    ├── containers/          Redux-connected features, one folder each
    ├── components/          pure presentational components
    ├── utils/               api.ts, sse.ts, injectReducer/Saga, constants
    └── types/
```

See [Process model & IPC](arch/processes.md) and [State management](arch/state.md).

### The containers, by size

Where the work actually is:

| Container | Lines | |
|---|---|---|
| `Geometry` | 7,361 | The scene tree and object properties |
| `Materials` | 6,388 | The material library and its editors |
| `Weather` | 5,974 | The weather data table |
| `3DWindow` | 5,268 | The viewport — Three.js, geometry readers, perf probes |
| `ProjectScreen` | 4,165 | The working layout and its data load |
| `HomePage` | 1,280 | Recent projects |
| `ProjectBoot` | 1,029 | The scenario loader |
| `LeftPanel` / `RightPanel` / `CenterWorkspace` | ~350 each | Layout shells |

## `helios-desktop-backend/` — the backend

!!! danger "This is a git submodule with its own repository and history"
    Commits made inside it land in **that** repo, not this one. Backend-only work happens there
    directly. See [Backend submodule](../git-submodule-setup.md).

```
helios-desktop-backend/
├── backend_wrapper.py       PyInstaller entry point; parent watchdog; orphan reaper
├── app/
│   ├── main.py              FastAPI app, middleware, router mounting
│   ├── core/                config, lifespan, session registry, locks
│   ├── routers/             20 mounted routers (~130 endpoints)
│   ├── services/            the logic — 8,471 lines
│   ├── schemas/             Pydantic request models
│   ├── db/                  SQLAlchemy models + 32 SQL migrations
│   └── helios/              PyHelios loading, persistence, object registry
├── pyhelios/                the PyHelios submodule (native C++ engine)
├── scripts/                 venv, native build, PyInstaller bundle
├── tests/
└── venv/, dist/, build/     generated — not committed
```

### The services, by size

| Service | Lines | |
|---|---|---|
| `scene_object_service` | 1,950 | Build, teardown, rebuild, hydrate — see [Scene build & hydration](arch/scene-build.md) |
| `weather_service` | 1,606 | |
| `material_library_service` | 956 | |
| `scenario_service` | 505 | |
| `material_sync_service` | 478 | The reconcile engine |
| `eav_validation` | 443 | See [The property system](arch/properties.md) |
| `material_apply` | 442 | Values → primitives |

## `build/` — installer inputs

Committed, hand-maintained, consumed by electron-builder.

| File | For |
|---|---|
| `icon.icns` / `icon.ico` / `icons/` | macOS, Windows, Linux app icons |
| `entitlements.mac.plist`, `backend.entitlements` | macOS code-signing entitlements |
| `distribution.xml` | macOS `.pkg` layout |
| `installer.nsh` | Windows NSIS customisation |
| `welcome.txt`, `conclusion.txt`, `license.txt`, `readme.txt` | Installer copy |
| `afterPack.js` | electron-builder `afterPack` hook |

## `resources/` — bundled into the app

```
resources/
├── backend/<mac|win|linux>/heliosgui_backend    ← put here by `npm run sync-backend`
└── Helios_splash.png
```

`electron-builder.yml` copies `resources/backend/${os}` to `<resourcesPath>/backend` in the
installed app — exactly where `backend-manager.ts` looks in packaged mode. The binaries are
gitignored; you build them locally.

## `scripts/`

| Script | Does |
|---|---|
| `sync-backend.js` | Builds the backend binary if needed, copies it into `resources/` |
| `dev-no-backend.js` | `npm run dev:no-backend` |
| `setup-submodules.sh` | Initialises the submodules |
| `setup-windows-dev.ps1`, `setup-windows-toolchain.ps1` | Windows toolchain + build automation |
| `sign-backend-mac.js` | Signs the bundled backend binary |
| `notarize.cjs`, `notarize-pkg.cjs` | The two Apple notarization hooks |

## Root configuration

| File | Configures |
|---|---|
| `package.json` | Scripts and dependencies |
| `.env.example` → `.env` | `VITE_BACKEND_URL`, `VITE_GEOMETRY_FORMAT` — see [Environment variables](../reference/env.md) |
| `electron.vite.config.ts` | The three build targets and the dev proxy |
| `electron-builder.yml` | Packaging for all three platforms |
| `vitest.config.ts` | Unit tests, path aliases, `TZ=UTC` |
| `wdio.config.ts`, `wdio.persist.config.ts` | E2E |
| `tsconfig.*.json` | Separate configs for node, web and the probe |
| `eslint.config.mjs`, `.prettierrc`, `.nvmrc` | Lint, format, Node version |
| `mkdocs.yml` | This documentation site |

!!! note "`package-lock.json` is deliberately gitignored"
    Do not commit it.

## Generated — never commit, safe to delete

| | Recreated by |
|---|---|
| `out/` | `npm run build` |
| `dist/` | `npm run package` |
| `node_modules/` | `npm install` |
| `site/` | `mkdocs build` |
| `.venv-docs/` | `pip install -r docs/requirements.txt` |
| `helios-desktop-backend/venv/`, `dist/`, `build/` | the backend build scripts |
| `allure-results/`, `allure-report/` | E2E runs |

`npm run dist:clean` removes `dist/` and `out/`; `dist:clean-all` also drops `node_modules/`.

## Related

- [Getting started](getting-started.md) — setting all this up.
- [Building installers](build.md) — how `build/` and `resources/` become `dist/`.
