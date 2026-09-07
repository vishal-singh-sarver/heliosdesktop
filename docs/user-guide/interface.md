# Tour of the interface

!!! warning "Planned — deliberately deferred"
    A panel-by-panel tour needs screenshots, and screenshots of a UI that is still moving go stale
    faster than any other documentation. This page waits until the layout settles.

## What it will cover

The screens that exist today, from `src/renderer/src/containers/`:

| Screen / panel | Purpose |
|---|---|
| **Home** | Recent projects — open, create, rename, delete |
| **Project screen** | The working layout: left panel, centre workspace, right panel |
| **Left panel** | The scene tree — objects and groups |
| **Centre workspace** | The 3D viewport |
| **Right panel** | Properties of whatever is selected |
| **Geometry** | Creating and editing objects |
| **Materials** | The material library and its property editors |
| **Weather** | The weather data table |
| **Import wizard** | Bringing external data in |

## Available now

- [Keyboard shortcuts](../reference/shortcuts.md) — the viewport camera and selection keys are
  stable and documented.
- [Concepts](../concepts/index.md) — what the panels are showing you.

!!! note "For contributors"
    When this page is written, screenshots should be captured by a script at a fixed window size
    so they stay consistent from release to release, rather than taken by hand.
