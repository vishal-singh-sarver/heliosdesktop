# Helios Desktop

Helios is an Electron desktop application for **3D plant and scene simulation**, backed by
[PyHelios](https://github.com/PlantSimulationLab/PyHelios). It ships as a single installer that
bundles two halves:

- **Renderer / shell** — Electron + React + Redux (`src/`).
- **Backend** — a FastAPI service that owns the PyHelios 3D context and persists projects to
  SQLite. It lives in the `helios-desktop-backend/` submodule and runs as a child process
  launched by the Electron main process.

## Where to start

<div class="grid cards" markdown>

- :material-download: **[Install Helios](user-guide/install.md)** — requirements, installers, where your data lives.
- :material-lightbulb: **[Concepts](concepts/index.md)** — project, scenario, context, primitive, material.
- :material-sitemap: **[Architecture](dev/arch/processes.md)** — the four processes and how they talk.
- :material-code-braces: **[Build from source](dev/getting-started.md)** — clone to running app.

</div>

## The one idea that explains the rest

!!! important "The backend owns the truth. The renderer owns the view."
    Geometry, materials, weather and the scene itself live in the backend — in the PyHelios
    context and in SQLite. React/Redux holds a cached copy for display.

    This is why almost every user action becomes an HTTP request, why the app will not open a
    window until the backend answers its health check, and why reloading loses nothing.

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33 |
| Build | electron-vite 5 |
| Packaging | electron-builder 24 |
| UI | React 19 + TypeScript 5.9 |
| State | Redux 5 + Redux-Saga 1.3 |
| 3D | Three.js + React Three Fiber |
| Styles | Tailwind CSS 4 |
| Unit tests | Vitest 4 + Testing Library |
| E2E tests | WebdriverIO 9 (`wdio-electron-service`) |
| Backend | FastAPI + PyHelios (Python, submodule) |

## Documentation status

Helios is in active development, so these pages are written in order of **stability** — the parts
that will still be true in six months first, the parts that change with every UI iteration last.

| Section | State |
|---|---|
| **Concepts** | Written |
| **Architecture** — processes, backend sidecar, state, database | Written |
| **Development** — dev loop, testing, building, troubleshooting | Written |
| **Reference** — environment variables, keyboard shortcuts | Written |
| **Backend API** | Router-level overview; per-endpoint reference to be generated from OpenAPI |
| **User guide** — install, reporting bugs | Draft |
| **User guide** — first project, interface tour | **Not written** — deferred until the UI settles |

Any page opening with a yellow **Draft** or **Planned** box is a placeholder or a partial. Nothing
else on this site is a guess.
