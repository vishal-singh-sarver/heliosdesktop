# Installing Helios

Helios ships as a single installer per platform. The 3D engine and its Python backend are bundled
inside — there is nothing else to install, no Python to set up, and no separate server to run.

!!! warning "Draft"
    Written from the packaging configuration. Download locations and the exact first-run
    experience still need confirming against a released build.

## Requirements

| | Minimum |
|---|---|
| **macOS** | 12.0 (Monterey) or later |
| **Windows** | Windows 10 or 11, 64-bit |
| **Linux** | A modern 64-bit distribution (AppImage or Debian-based) |
| **Memory** | 8 GB works for small scenes. Large grounds are memory-hungry — a 1000×1000 ground needs roughly 2 GB on its own, so 16 GB+ is recommended for serious work |
| **Disk** | ~1 GB for the app, plus room for your projects |

## Install

=== "macOS"

    1. Download `helios-<version>-setup.pkg`.
    2. Open it and follow the installer. Helios installs to **Applications**.
    3. Launch it from Applications or Spotlight.

    The app and its installer are both signed and notarized by Apple, so Gatekeeper should let it
    open without a warning. If you do see one, right-click the app and choose **Open** once.

=== "Windows"

    1. Download `helios-<version>-setup.exe`.
    2. Run it. You will be asked to elevate — Helios installs **for all users**.
    3. You can change the install directory during setup.
    4. Desktop and Start-menu shortcuts are created, and the app launches when setup finishes.

    Right-clicking the taskbar icon gives you a **New Window** task.

=== "Linux"

    **AppImage** — no installation:

    ```bash
    chmod +x helios-<version>-setup.AppImage
    ./helios-<version>-setup.AppImage
    ```

    **Debian / Ubuntu**:

    ```bash
    sudo dpkg -i helios-<version>-setup.deb
    sudo apt-get install -f      # if dependencies are missing
    ```

    Launches as `helios`. The desktop entry includes a **New Window** action.

## First launch

Helios shows a splash screen while it starts its backend. On the **very first run** this takes
noticeably longer — around 5–10 seconds while the bundled backend unpacks and the database is
created. Later launches are typically 1–2 seconds.

The main window does not appear until the backend has answered its health check. That is
deliberate: an interface that looks ready while the engine is still starting would fail on the
first click.

If the backend cannot start, Helios shows an error dialog naming the problem and exits rather than
opening a broken window. See [Troubleshooting](../dev/troubleshooting.md).

## Where your data lives

Projects, the database and logs are stored outside the application folder, so they survive
upgrades and uninstalls:

=== "macOS"
    ```
    ~/Library/Application Support/Helios/
    ├── backend-data/     projects and the database
    └── logs/
    ```

=== "Windows"
    ```
    %APPDATA%\Helios\
    ├── backend-data\     projects and the database
    └── logs\
    ```

=== "Linux"
    ```
    ~/.config/Helios/
    ├── backend-data/     projects and the database
    └── logs/
    ```

Back up `backend-data/` to back up your work. See
[Projects & storage](../concepts/projects.md).

## Running two windows

Helios runs as a **single application instance**. Launching it again focuses the window you
already have, rather than starting a second copy — otherwise every click on a pinned icon would
stack up another window, each with its own backend.

To genuinely open a second window use ++cmd+n++ / ++ctrl+n++, the **File → New Window** menu item,
or your platform's shortcut (dock menu, jump list, or `.desktop` action). Both windows share one
backend and one set of projects.

## Uninstall

=== "macOS"
    Drag **Helios** from Applications to the Trash. Your projects in
    `~/Library/Application Support/Helios/` are left alone — delete that folder too for a
    complete removal.

=== "Windows"
    **Settings → Apps → Helios → Uninstall**, or use the entry in the Start menu.

    !!! note "Close Helios first"
        If a backend process is left running, it holds files open and the uninstaller can fail.
        Make sure every Helios window is closed before uninstalling.

=== "Linux"
    AppImage: delete the file. Deb: `sudo apt-get remove helios`.

## Related

- [Your first project](first-project.md)
- [Reporting bugs](support.md)
