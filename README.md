# Electron Desktop Boilerplate

A production-ready boilerplate for Electron desktop applications with React, Redux, Redux-Saga, TypeScript, and Tailwind CSS.

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 29 + electron-vite |
| UI | React 18 + TypeScript |
| State | Redux 5 + Redux-Saga 1.3 |
| Selectors | Reselect 5 |
| Immutability | Immer 10 |
| Styles | Tailwind CSS 3 |
| Tests | Vitest + Testing Library |
| Generators | Plop |

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
# Install dependencies
npm install

# Linux only: fix Electron sandbox permissions (one-time, requires sudo)
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

> **Linux alternative:** If you cannot run sudo, the `dev` script already includes `--no-sandbox` as a fallback.

## Development

```bash
npm run dev
```

Starts the electron-vite dev server with HMR for the renderer and rebuilds main/preload on change. The app window opens automatically.

## Testing

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Tests live alongside their source in a `tests/` subfolder within each container or component.

## Code Generation

Scaffold a new container (Redux-connected screen) or component:

```bash
npm run generate
```

Follow the prompts. A container generates:

```
containers/YourName/
  index.tsx          # UI component
  types.ts           # Domain types (AppStatus, StreamEvent)
  constants.ts       # Action type strings
  actions.ts         # Typed action creators
  reducer.ts         # Immer reducer + state shape
  saga.ts            # REST worker + SSE worker
  selectors.ts       # Memoised selectors per field
  tests/
    actions.test.ts
    reducer.test.ts
    saga.test.ts
    selectors.test.ts
    index.test.tsx
```

## Building

```bash
# Production build (outputs to out/)
npm run build

# Build + package into distributable (outputs to dist/)
npm run package
```

## Project Structure

```
src/
  main/
    index.ts              # Electron main process, IPC handlers
  preload/
    index.ts              # Context bridge — exposes window.api to renderer
  renderer/src/
    App.tsx               # Screen router (Redux-based, no React Router)
    main.tsx              # React entry point
    store/
      configureStore.ts   # Redux store with dynamic injection support
      reducers.ts         # Root reducer + RootState type
      navigationReducer.ts# Screen navigation slice
    containers/           # Redux-connected screens
      HomePage/           # Example: REST fetch + SSE stream
    components/           # Pure UI components
    utils/
      api.ts              # HTTP client (fetch wrapper)
      sse.ts              # SSE EventChannel factory for redux-saga
      constants.ts        # Shared constants (BASE_URL)
      injectReducer.ts    # Dynamic reducer injection hook
      injectSaga.ts       # Dynamic saga injection hook
internals/
  generators/             # Plop templates
```

## Architecture Notes

### Navigation

Screens are managed through Redux (`navigationReducer`) rather than React Router. To navigate:

```ts
dispatch(navigate('project'))
```

Add new screens to `Screen` union type in `store/navigationReducer.ts` and render them in `App.tsx`.

### API Layer

All HTTP requests go through `utils/api.ts`:

```ts
const data = await api.get<MyType>('/api/endpoint')
await api.post('/api/endpoint', payload)
```

`BASE_URL` defaults to `http://localhost:8000` and can be overridden at build time via `window.__APP_BASE_URL__`.

### SSE Streaming

Server-Sent Events are consumed via redux-saga using `utils/sse.ts`:

```ts
const channel = yield call(createSseChannel, '/api/events')
const { msg, stop } = yield race({ msg: take(channel), stop: take(SSE_DISCONNECT) })
```

See `containers/HomePage/saga.ts` for the full pattern.

### IPC Bridge

The preload exposes `window.api` for Electron-specific operations:

| Method | Description |
|--------|-------------|
| `window.api.openFile(filters)` | Open file dialog |
| `window.api.saveFile(filters, path?)` | Save file dialog |
| `window.api.readFile(path)` | Read file from disk |
| `window.api.writeFile(path, content)` | Write file to disk |
| `window.api.getBackendStatus()` | Query backend process state |
| `window.api.startBackend()` | Start backend process |
| `window.api.stopBackend()` | Stop backend process |

Backend IPC handlers in `src/main/index.ts` are stubs — wire them to your actual process management logic.

## Linting and Formatting

```bash
npm run lint          # ESLint (TypeScript-aware)
npm run lint:fix      # Auto-fix
npm run format        # Prettier
```


