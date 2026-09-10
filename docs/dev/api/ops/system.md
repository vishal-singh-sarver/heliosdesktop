<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `system` endpoints

*Generated 2026-09-10.*

4 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /` {#op-get}

Root

**Response** — `200`, `application/json`

```json
{
  "message": "HeliosGUI API",
  "version": "1.0.0"
}
```

*Built by `system.root`.*

---

### `GET /api/pyhelios-info` {#op-get-api-pyhelios-info}

Pyhelios Info

**Response** — `200`, `application/json`

```json
{
  "source": true,
  "source_path": "/\u2026/helios-desktop-backend/pyhelios",
  "stale": false,
  "available": true,
  "plantarch_available": true,
  "version": "0.1.19",
  "location": "/\u2026/pyhelios"
}
```

*Built by `system.pyhelios_info`.*

---

### `GET /health` {#op-get-health}

Health

**Response** — `200`, `application/json`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "env": "development",
  "pyhelios_available": true,
  "session_id": "3f2a9c14e8b0"
}
```

Polled by the Electron manager during startup; `session_id` changes on every backend restart.

*Built by `system.health`.*

---

### `GET /version` {#op-get-version}

Version

**Response** — `200`, `application/json`

```json
{
  "version": "1.0.0",
  "session_id": "3f2a9c14e8b0"
}
```

*Built by `system.version`.*

---

