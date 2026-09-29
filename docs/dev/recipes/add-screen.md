# Add a screen

Add a new Redux-connected feature to the renderer — either a **panel** inside an existing screen
(the common case) or a whole new **screen**.

Start with the generator. It produces the conventional shape, and the conventions are what
[State management](../arch/state.md) relies on.

---

## Step 1 — Generate it

```bash
npm run generate
```

Choose **container** (Redux-connected) or **component** (pure presentational), then answer six
prompts:

| Prompt | Answer for a feature panel |
|---|---|
| What should it be called? | `SoilPanel` — refuses a name that already exists |
| Wrap in `React.memo`? | Usually no |
| actions / constants / selectors / reducer? | **Yes** |
| sagas for async flows? | **Yes** if it calls the backend |
| a messages file? | Yes — user-facing strings live there |
| a `Loadable.tsx`? | **Yes** |

You get the full conventional folder, with tests:

```
containers/SoilPanel/
├── index.tsx        the connected component
├── Loadable.tsx     lazy-load wrapper
├── actions.ts       constants.ts   reducer.ts
├── saga.ts          selectors.ts   types.ts
├── messages.ts
└── tests/           index, actions, reducer, selectors, saga
```

!!! tip "Use the generator even if you will delete half of it"
    Hand-rolling a folder is how a container ends up subtly off-convention — a missing
    `Loadable`, selectors that aren't memoized, a saga that isn't wired. Generate, then trim.

Larger features add files beyond the template — `service.ts` for HTTP calls, and any bespoke
sub-components. `containers/Geometry/` is the fullest worked example.

---

## Step 2 — Inject the reducer and saga

Redux slices are **not** registered up front. A container injects its own at mount:

```tsx
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'

function SoilPanel(): React.JSX.Element {
  useInjectReducer({ key: 'soilPanel', reducer })
  useInjectSaga({ key: 'soilPanel', saga })
  ...
}
```

Injection is **keyed and idempotent**, so calling it from several places is harmless.

Then add the slice to `RootState` in `store/reducers.ts`:

```ts
export interface RootState {
  navigation: NavigationState
  snackbar: SnackbarState
  soilPanel?: SoilPanelState      // optional: injected, not always present
}
```

!!! warning "Inject in `App.tsx` instead when something dispatches into you before you mount"
    `projectScreen` and `threeDWindow` are injected by `App`, not by their own components, because
    the boot saga dispatches into them **before any screen mounts**. On a project-row click the
    project screen does not exist yet, so a slice waiting for its own component would never see
    the actions aimed at it.

    Only do this when a saga genuinely dispatches into your slice pre-mount. Otherwise inject
    locally.

Selectors must fall back to the slice's initial state, since the slice can legitimately be absent:

```ts
const selectSlice = (state: RootState): SoilPanelState => state.soilPanel ?? initialState
```

---

## Step 3a — Mount it as a panel

Import the **Loadable**, never `index.tsx` directly — that is what keeps the code split:

```tsx
import SoilPanel from 'containers/SoilPanel/Loadable'
```

Then render it inside the relevant parent — `LeftPanel`, `RightPanel` or `CenterWorkspace`.

For most features this is the last step.

---

## Step 3b — Or add a whole screen

There is **no React Router**. The active screen is Redux state.

**1. Extend the union** in `store/navigationReducer.ts`:

```ts
export type Screen = 'home' | 'project' | 'settings'
```

**2. Render it** in `App.tsx`:

```tsx
{screen === 'settings' && <SettingsScreen />}
```

**3. Navigate** by dispatching:

```ts
dispatch(navigate('settings'))
```

### Two things to know before adding a screen

**The splash waits for you.** The main window stays hidden until a screen sends `app:ready` from
its own mount effect. A new initial screen that never sends it leaves the user on an always-on-top
splash with no progress and no way out. See [Process model & IPC](../arch/processes.md).

**`restored` is not the same as navigated-to.** `pickInitialScreen()` can open straight to
`project` from `localStorage`, before the boot has hydrated anything. The `restored` flag
distinguishes that from a `navigate('project')` dispatched by the boot's `reveal()` after `/init`
finished — and `ProjectScreen` uses it to hold its data load back.

!!! danger "The bug that flag exists to prevent"
    A restored screen mounted in the first frame and fired its entire data load — four type
    catalogs, `listScenarios` and the scene it chains, the geometry tree — **ahead of the `/init`
    they were meant to run after**. React runs child effects before parent ones, so the restore
    effect had not even dispatched yet.

    Nothing was corrupted (the backend's hydration lock serialises them); they simply queued
    behind the very hydration they were meant to follow, defeating the point of running `/init`
    first and alone.

    If your screen restores from storage and fetches on mount, it needs the same gate.

---

## Step 4 — Follow the conventions

They are not stylistic. From `CONTRIBUTING.md` and [State management](../arch/state.md):

- Action types are `app/<Container>/<VERB_NOUN>`, with `_REQUESTED` / `_SUCCEEDED` / `_FAILED` for
  every async flow.
- Components read state **only through memoized selectors**. No `state.foo.bar` in JSX.
- Sagas own side effects. Components dispatch; sagas `call`.
- **Never** `useEffect` to trigger a saga on mount — dispatch the action and let the saga watch
  for it.
- Never put non-serializable values in Redux — no Dates, Maps, class instances, Errors, File
  objects.
- Reducers use Immer's `produce`.
- HTTP goes through `utils/api.ts`; paths come from `API_ROUTES`. See
  [Add an API endpoint](add-endpoint.md).

---

## Verify

1. The panel or screen renders.
2. Redux DevTools shows your slice appear **when the component mounts**, not before.
3. Actions dispatch and the reducer updates.
4. `npm test` — the generator's tests should pass unmodified.
5. `npm run lint`.
6. Unmount and remount: no duplicate saga watchers, no double fetches.

---

## Common mistakes

| Symptom | Cause |
|---|---|
| `state.soilPanel is undefined` in a selector | No `?? initialState` fallback — the slice is injected, so it can be absent |
| Slice never appears in DevTools | `useInjectReducer` not called, or called below an early `return` |
| Saga never fires | `useInjectSaga` missing, or the worker isn't in the saga's default export |
| Actions dispatched before mount are lost | Inject in `App.tsx` instead — see step 2 |
| Bundle grew; the panel loads eagerly | Imported `index.tsx` instead of `Loadable` |
| Double fetch in dev only | StrictMode's deliberate double-mount — guard with a ref, as `App` does |
| New initial screen: window never appears | Never sent `app:ready` |
| New screen fetches before the scenario is hydrated | Needs the `restored` gate |
| Component re-renders constantly | Selector isn't memoized, or returns a new object each call |

## Related

- [State management](../arch/state.md) — store shape, injection, container anatomy.
- [Add an API endpoint](add-endpoint.md) — when the screen needs new backend data.
- [Dev loop](../dev-loop.md) — the generator and the rest of the daily commands.
