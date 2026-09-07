# State management

The renderer uses **Redux + Redux-Saga** in the react-boilerplate style: reducers and sagas are
*injected* by the screen that needs them rather than all registered up front.

Remember the governing rule from [Concepts](../../concepts/index.md): the backend owns the truth,
Redux holds a cached copy for display.

## Store shape

Only three slices are always present (`src/renderer/src/store/reducers.ts`):

```ts
interface RootState {
  navigation: NavigationState      // which screen is showing — there is no React Router
  snackbar: SnackbarState          // toasts
  projectBoot?: ProjectBootState   // the scenario loader
  homePage?: HomePageState         // ─┐
  projectScreen?: ProjectScreenState //  injected when the screen mounts
  threeDWindow?: ThreeDWindowState   // ─┘
}
```

`projectBoot` is always present at runtime despite being optional in the type — the loader has to
open before any screen mounts, since on restart it is the first thing the user sees. It is
optional only so a test can hand a selector a bare state object.

!!! note "No React Router"
    Navigation is Redux state. `App.tsx` renders a screen based on the `navigation` slice.

## Injection

```ts
useInjectReducer({ key: 'geometry', reducer })
useInjectSaga({ key: 'geometry', saga })
```

Called at the top of a container. `useInjectReducer` writes into `store.injectedReducers` and
calls `store.replaceReducer(store.createReducer(...))`. The store returned by `configureStore` is
an `InjectableStore` — a plain Redux store plus `injectedReducers`, `injectedSagas`, `runSaga` and
`createReducer`.

Paired with `Loadable.tsx` in each container (React lazy loading), this means a screen's reducer,
saga and code all arrive together, on mount.

## Anatomy of a container

Every feature folder under `containers/` follows the same shape — enforced by the Plop generator
(`npm run generate`):

```
containers/Geometry/
├── index.tsx          the connected component
├── Loadable.tsx       lazy-load wrapper
├── actions.ts         action creators
├── constants.ts       action type strings
├── reducer.ts         immer-based reducer
├── saga.ts            side effects
├── selectors.ts       memoized reselect selectors
├── service.ts         HTTP calls for this feature
├── types.ts
└── tests/
```

## The rules

From `CONTRIBUTING.md`, and they are not stylistic preferences:

- **Action types** are `FEATURE/VERB_NOUN` in SCREAMING_SNAKE_CASE. Every async flow has
  `*_REQUESTED` / `*_SUCCEEDED` / `*_FAILED`.
- **Components read state only through memoized selectors.** No `state.foo.bar` in JSX.
- **Sagas own side effects.** Components dispatch; sagas call `window.api.*` and HTTP. `call`
  every side effect so it is testable. Long-running sagas use `eventChannel` and clean up in
  `finally`.
- **Never** put non-serializable values in Redux — no Dates, Maps, class instances, Errors or File
  objects.
- **Never** dispatch from a reducer, or call `store.dispatch` / `store.getState` outside sagas and
  store setup.
- **Never** use `useEffect` to trigger a saga on mount. Dispatch the action and let the saga watch
  for it.

Reducers use **Immer** (`produce`), so they read as mutations but produce new state.

## HTTP

All HTTP goes through `src/renderer/src/utils/api.ts` — a single axios instance with the
`session-id` header attached, and `api.get/post/put/patch/delete/uploadFile` on top. Every route
path lives in `utils/constants.ts` under `API_ROUTES`, as builder functions where the route is
scoped so callers cannot forget an id.

Errors are normalised into an `ApiError` carrying `status`, `message`, `fieldErrors` and a machine
`code`. The code matters: the backend's house error shape is `detail: { error, code }`, and the
code is what lets callers tell "this project is gone" from "this one object is gone" without
matching on English text that is free to be reworded.

!!! warning "There are no request timeouts, deliberately"
    The work behind a request legitimately can take minutes — saving a high-resolution geometry
    carrying a texture ran past the old 30 s cap and failed a save that would have succeeded.

    The cost: a request that never comes back never settles, so the caller's saga stays pending
    and the UI holds its loading state until restart. Do not reinstate a cap without a per-call
    budget for the slow endpoints.

### Scope loss

`reportScopeFailure` watches for a 404 carrying no machine code and reads it as "the project or
scenario is gone" — typically because it was deleted in another window. It latches on the first
such failure and raises one blocking dialog, while still throwing so each caller can unwind its
own state.

Endpoints that can 404 about something *inside* a healthy scenario opt out with
`{ skipScopeCheck: true }`. `POST /deleteRow` is the example: it is all-or-nothing, so one
already-deleted row 404s the whole batch, and the user would be thrown out of a perfectly good
project instead of being told which rows were missing. **Callers that pass it must handle the
error themselves — nothing else will surface it.**

## Server-Sent Events

`utils/sse.ts` wraps an `EventSource` in a redux-saga `eventChannel`. The pattern:

```ts
const channel = yield call(createSseChannel, '/api/…')
try {
  while (true) {
    const { msg, stop } = yield race({ msg: take(channel), stop: take(SSE_DISCONNECT) })
    if (stop) break
    yield put(actions.sseEvent(msg))
  }
} finally {
  channel.close()
}
```

## Boot: the one flow worth knowing

`ProjectBoot` runs scenario `init`, which is the slow call that rebuilds the saved scene into
memory (see [The Helios context](../../concepts/context.md)). Its state carries two ideas that are
easy to miss:

**`runId`** — every lifecycle action carries the run it belongs to and is dropped unless it
matches. A cancelled load that is still unwinding can never write over the load that replaced it.

**`liveScenario`** — the scenario whose backend context is hydrated and still held in memory. This
is *not* the same as what is on screen: it survives the loader closing, and it is the record of
what still needs releasing via `discard`.

`active` stays true on failure, so the dialog can offer Retry in place rather than dumping the
user somewhere.

## Backend URL resolution happens before React

`main.tsx` awaits `window.api.getBackendUrl()` and sets `window.__APP_BASE_URL__` **before**
dynamically importing `App` and `configureStore`. That ordering is load-bearing: `constants.ts`
captures `BASE_URL` at module evaluation, so a static import would bake in the stale build-time
`VITE_BACKEND_URL` instead of the port the backend actually bound to.

## Related

- [Process model & IPC](processes.md) — the two channels out of the renderer.
- [Testing](../testing.md) — how sagas and reducers are tested.
