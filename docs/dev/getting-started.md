# Getting started

Clone to running app. Everything here runs from the repository root unless noted.

Steps 5 and 6 are the slow ones — budget **5–15 minutes** for the pair on a modern machine, longer
on a cold CMake cache or with `--gpu` plugins enabled.

## Prerequisites

- **Node.js ≥ 22** and npm
- **Git** — the backend is a submodule
- For the backend: **Python 3.11+**, **CMake 3.20+**, and a **C++17 compiler** for the PyHelios
  native build

## Frontend

```bash
# 1. Clone with the backend submodule
git clone --recurse-submodules <helios-desktop-url>
cd heliosdesktop

# 2. Install frontend dependencies
npm install

# 3. Create the frontend .env
cp .env.example .env
```

!!! danger "Step 3 is not optional"
    `.env` is gitignored, so a fresh clone has none. `electron.vite.config.ts` throws
    `VITE_BACKEND_URL is not set` at config-load time, which fails `dev`, `build` **and**
    `package` before anything starts. See [Environment variables](../reference/env.md).

At this point `npm run dev:no-backend` launches the UI. The backend below is required before
anything that loads or saves a project will work.

## Backend

=== "macOS / Linux"

    ```bash
    # 4. Create the Python venv and install dependencies
    bash helios-desktop-backend/scripts/create_venv.sh

    # 5. Build the PyHelios native library (~10-30 min the first time)
    cd helios-desktop-backend
    source venv/bin/activate
    bash scripts/build_pyhelios.sh          # add --gpu to enable GPU plugins

    # 6. Bundle the backend into a standalone binary
    bash scripts/build_binary.sh

    # 7. Copy it into resources/ so the app can find it
    cd ..
    npm run sync-backend
    ```

=== "Windows"

    `scripts/setup-windows-dev.ps1` automates the toolchain check, the native build, the
    PyInstaller bundle and the sync — steps 5 to 7.

    It does **not** create the Python venv, so run step 4's equivalent first:

    ```powershell
    # 4. Create the venv
    python -m venv helios-desktop-backend\venv
    helios-desktop-backend\venv\Scripts\activate
    pip install -r helios-desktop-backend\requirements-dev.txt

    # 5-7. Toolchain check, native build, bundle, sync
    scripts\setup-windows-dev.ps1           # -Force to rebuild existing artifacts
    ```

## Run it

```bash
npm run dev
```

The splash screen holds while the backend starts; the main window appears once `/health` answers.
If it does not, see [Troubleshooting](troubleshooting.md).

## Verify

```bash
npm test        # unit tests
npm run lint
```

## Next

- [Dev loop](dev-loop.md) — the day-to-day commands and the conventions that matter.
- [Process model & IPC](arch/processes.md) — how the four processes fit together.
- [Backend submodule](../git-submodule-setup.md) — working in `helios-desktop-backend/`.
