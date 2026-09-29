# Reporting bugs

A good Helios bug report is short, but it needs three things: what you did, what happened, and
**the log files**. The logs are the part people forget, and they are usually the part that
identifies the cause.

## Attach these

| File | Where |
|---|---|
| `backend.log` | `<data folder>/logs/backend.log` |
| `app-startup.log` | `<data folder>/logs/app-startup.log` |

The data folder is:

=== "macOS"
    `~/Library/Application Support/Helios/logs/`

    In Finder: **Go → Go to Folder…**, then paste the path.

=== "Windows"
    `%APPDATA%\Helios\logs\`

    In Explorer: paste that into the address bar.

=== "Linux"
    `~/.config/Helios/logs/`

!!! note "The logs contain file paths and project names"
    They do not contain the contents of your scenes or any credentials. Skim them before attaching
    if your project names are sensitive.

## Include

- **Helios version** — shown on the splash screen at startup.
- **Operating system** and version.
- **What you did**, in the order you did it.
- **What you expected**, and what happened instead.
- **Scene size** if it is a performance or memory report — the ground dimensions matter enormously.
  A 2000×2000 ground behaves nothing like a 4×4 one.

## Especially useful

**If the app closed by itself**, say whether it vanished silently or showed a dialog. They point at
different causes.

**If it is slow**, search `backend.log` for lines beginning `[slow]`. Each names one request that
took over two seconds:

```
[slow]    4.3s  POST /api/geometry/.../objects -> 200
```

Pasting those lines turns "it feels slow" into something actionable.

**If startup failed**, search `backend.log` for `[startup-fatal]`. That line names the cause and a
suggested remedy directly.

## Before reporting

Two quick checks that resolve a surprising share of issues:

1. **Close every Helios window and relaunch.** A backend process left over from a crash holds the
   database open and causes symptoms — an empty project list being the common one — that look like
   data loss but are not.
2. **Check free disk space.** The app writes scene snapshots that can reach hundreds of megabytes.

## Where to report

!!! warning "Planned"
    The issue tracker and support address for external users are not yet decided. Internally,
    raise it in the team's tracker with the logs attached.

## Related

- [Troubleshooting](../dev/troubleshooting.md) — known symptoms with fixes.
