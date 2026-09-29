# Environment variables

The frontend reads these from `.env` at the repository root. `.env` is **gitignored**, so a fresh
clone has none — copy the template before running anything:

```bash
cp .env.example .env
```

!!! danger "Required"
    `electron.vite.config.ts` throws `VITE_BACKEND_URL is not set` at config-load time, which
    fails `npm run dev`, `build` **and** `package` before anything starts.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BACKEND_URL` | `http://127.0.0.1:8008` | Base URL of the FastAPI sidecar. Baked in at build time; the main process can override it at runtime via `window.__APP_BASE_URL__`. |
| `VITE_GEOMETRY_FORMAT` | `v2` | Geometry wire format. `v2` uses GPU-ready typed arrays (`packGPUBuffers`) and is required for large grounds — `v1` cannot fit a 2000×2000 scene inside Electron's 4 GB heap cage. Unset means `v1`. |

`VITE_GEOMETRY_FORMAT` can be toggled at runtime from DevTools with `__heliosPerf.gpuOn()` and
`__heliosPerf.gpuOff()`.
