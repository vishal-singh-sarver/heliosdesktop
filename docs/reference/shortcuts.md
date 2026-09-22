# Keyboard shortcuts

!!! warning "Partial"
    These are the shortcuts that exist in code today (`3DWindow/ui/KeyboardShortcuts.tsx` and
    `src/main/index.ts`). Panel- and dialog-level keys are not yet catalogued.

## 3D viewport

Viewport shortcuts fire only when the **viewport has focus** and no text input is focused — so
typing a number into a property field never moves the camera.

### Camera

| Keys | Action |
|---|---|
| ++arrow-up++ ++arrow-down++ ++arrow-left++ ++arrow-right++ | Pan the camera |
| ++ctrl+arrow-up++ / ++ctrl+arrow-down++ / ++ctrl+arrow-left++ / ++ctrl+arrow-right++ | Orbit around the target |
| ++ctrl+plus++ | Zoom in |
| ++ctrl+minus++ | Zoom out |
| ++ctrl+0++ | Reset to the default view |

Pan and zoom steps scale with the camera's current distance, so they feel the same whether you are
inspecting a leaf or looking at a whole canopy.

### Selection & framing

| Key | Action |
|---|---|
| ++a++ | Clear the selection and fit everything in view |
| ++f++ | Focus on the selected object (falls back to fit-all with nothing selected) |
| ++home++ | Frame everything |
| ++esc++ | Clear the selection |

++cmd++ works in place of ++ctrl++ on macOS.

## Window

| Keys | Action |
|---|---|
| ++f11++ | Toggle fullscreen |
| ++cmd+n++ / ++ctrl+n++ | New window |
| ++esc++ | Close the open popup or dialog |

"New Window" is also reachable from the macOS dock menu, the Windows taskbar jump list, and the
Linux `.desktop` action — all of which relaunch with `--new-window`. See
[Process model & IPC](../dev/arch/processes.md).

On macOS, double-clicking the custom title bar honours your **System Settings → Desktop & Dock →
double-click a window's title bar to** preference (zoom, minimize, or do nothing).

## Lists and dropdowns

Standard behaviour in the shared `Select` component:

| Key | Action |
|---|---|
| ++arrow-up++ / ++arrow-down++ | Move the highlight |
| ++home++ / ++end++ | Jump to first / last option |
| ++enter++ | Choose the highlighted option |
| ++space++ | Open the list (non-searchable selects) |
| ++esc++ | Close without choosing |

## Developer

| Keys | Action |
|---|---|
| ++f12++ or ++cmd+alt+i++ / ++ctrl+shift+i++ | DevTools (from the View menu) |

From the DevTools console:

```js
__heliosPerf.gpuOn()     // switch the viewport to geometry wire format v2
__heliosPerf.gpuOff()    // back to v1
```

See [Geometry & primitives](../concepts/primitives.md).
