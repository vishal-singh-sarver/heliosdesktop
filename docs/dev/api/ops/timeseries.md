<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `timeseries` endpoints

*Generated 2026-09-10.*

3 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `DELETE /api/timeseries` {#op-delete-api-timeseries}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Delete Timeseries

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `timeseries_service.delete_timeseries`.*

---

### `GET /api/timeseries` {#op-get-api-timeseries}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Timeseries

**Response** — `200`, `application/json`

```json
{
  "variables": [
    {
      "label": "Tair",
      "length": 8760
    }
  ]
}
```

*Built by `timeseries_service.get_timeseries` · confidence: **likely**.*

---

### `POST /api/timeseries/apply` {#op-post-api-timeseries-apply}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Apply Timeseries

**Request body** — `application/json`

A free-form JSON object.

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "variables": 2,
  "datapoints": 17520,
  "warnings": []
}
```

*Built by `timeseries_service.apply_timeseries`.*

---

