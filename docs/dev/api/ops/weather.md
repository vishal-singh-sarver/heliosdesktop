<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `weather` endpoints

*Generated 2026-09-10.*

15 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `POST /api/weather/project/{project_id}/scenario/{scenario_id}/addCol` {#op-post-api-weather-project-project-id-scenario-scenario-id-addcol}

Add one or more columns. Persists header rows + writes cells atomically.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "column": [
    {
      "name": "Ground.001",
      "datatype": 0,
      "data_unit": 0,
      "values": [],
      "default_value": 0.0
    }
  ]
}
```

Fields — [`AddColumnsRequest`](#addcolumnsrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `column` | [`AddColumn`](#addcolumn)[] | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "columns": [
    {
      "id": 6,
      "name": "RH",
      "helios_data_type_id": 3,
      "unit_id": 9,
      "display_order": 2
    }
  ]
}
```

*Built by `weather_service.add_columns`.*

---

### `POST /api/weather/project/{project_id}/scenario/{scenario_id}/addRow` {#op-post-api-weather-project-project-id-scenario-scenario-id-addrow}

Append rows to the timeseries table — PyHelios-only, no SQL writes.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "rows": [
    {}
  ]
}
```

Fields — [`AddRowsRequest`](#addrowsrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `rows` | object[] | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "row_count": 8761,
  "column_count": 3,
  "added_rows": [
    {
      "date": "2026-12-31",
      "time": "23:00:00"
    }
  ]
}
```

*Built by `weather_service.add_rows`.*

---

### `DELETE /api/weather/project/{project_id}/scenario/{scenario_id}/clear_data` {#op-delete-api-weather-project-project-id-scenario-scenario-id-clear-data}

Clear everything: SQL weather_data_headers + PyHelios timeseries data.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "headers_removed": 3,
  "row_count": 0,
  "column_count": 2
}
```

*Built by `weather_service.clear_data`.*

---

### `POST /api/weather/project/{project_id}/scenario/{scenario_id}/delete` {#op-post-api-weather-project-project-id-scenario-scenario-id-delete}

Delete a row, a column, or wipe everything.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "row": {
    "date": "2026-01-31",
    "time": "12:00:00"
  },
  "column": {
    "columnname": "Ground.001"
  }
}
```

Fields — [`DeleteRequest`](#deleterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `row` | [`RowRef`](#rowref) \| null | no |  |  |
| `column` | [`DeleteColumn`](#deletecolumn) \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "row_count": 8760,
  "column_count": 2
}
```

Deletes columns/variables.

*Built by `weather_service.delete`.*

---

### `POST /api/weather/project/{project_id}/scenario/{scenario_id}/deleteRow` {#op-post-api-weather-project-project-id-scenario-scenario-id-deleterow}

Delete one or more rows — each (date, time) removed from every column.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
[
  {
    "date": "2026-01-31",
    "time": "12:00:00"
  }
]
```

_No fields._

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "deleted_rows": 2,
  "row_count": 8758,
  "column_count": 3,
  "message": "2 rows has been deleted"
}
```

ALL-OR-NOTHING: one already-deleted row 404s the whole batch, which is why the caller passes skipScopeCheck.

*Built by `weather_service.delete_rows`.*

---

### `GET /api/weather/project/{project_id}/scenario/{scenario_id}/getAllTimeSeriesData` {#op-get-api-weather-project-project-id-scenario-scenario-id-getalltimeseriesdata}

Full table read with optional paging.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `limit` | query | integer \| null | no |  |
| `offset` | query | integer | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "labels": [
    "date",
    "time",
    "Tair"
  ],
  "row_count": 2,
  "total_rows": 8760,
  "column_count": 3,
  "offset": 0,
  "limit": 2,
  "rows": [
    [
      "2026-01-01",
      "00:00:00",
      8.4
    ],
    [
      "2026-01-01",
      "01:00:00",
      8.1
    ]
  ]
}
```

*Built by `weather_service.get_all_timeseries_data`.*

---

### `GET /api/weather/project/{project_id}/scenario/{scenario_id}/inspect` {#op-get-api-weather-project-project-id-scenario-scenario-id-inspect}

Lightweight debug probe — first 3 rows + availability metadata.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "pyhelios_available": true,
  "file": {
    "exists": false,
    "note": "no file \u2014 content lives in PyHelios memory only"
  },
  "pyhelios_state": {
    "variables": [
      "Tair",
      "RH"
    ],
    "length": 8760
  }
}
```

Weather values live in the PyHelios context, not in SQLite.

*Built by `weather_service.inspect`.*

---

### `PATCH /api/weather/project/{project_id}/scenario/{scenario_id}/update` {#op-patch-api-weather-project-project-id-scenario-scenario-id-update}

Update one or more existing cells in one call (fail-fast).

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "updates": [
    {
      "col": "string",
      "row": {},
      "value": "NAN"
    }
  ]
}
```

Fields — [`UpdateRequest`](#updaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `updates` | [`UpdateValue`](#updatevalue)[] | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "updated_count": 3
}
```

*Built by `weather_service.update_cells`.*

---

### `PATCH /api/weather/project/{project_id}/scenario/{scenario_id}/updateCol/{column_id}` {#op-patch-api-weather-project-project-id-scenario-scenario-id-updatecol-column-id}

Update one existing column. Target identified by `column_id` in the
URL path. Body upserts cells in `values[]` and optionally fills the
remaining scenario timestamps with `default_value`.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `column_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "datatype": 0,
  "data_unit": 0,
  "values": [
    {
      "date": "2026-01-31",
      "time": "12:00:00",
      "value": "NAN"
    }
  ],
  "default_value": 0.0
}
```

Fields — [`UpdateColumn`](#updatecolumn):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `datatype` | integer \| null | no |  |  |
| `data_unit` | integer \| null | no |  |  |
| `values` | [`ColumnValue`](#columnvalue)[] | no |  |  |
| `default_value` | number \| string \| null | no | `"NAN"` |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "columns": [
    {
      "id": 6,
      "name": "RH",
      "helios_data_type_id": 3,
      "unit_id": 9,
      "display_order": 2
    }
  ]
}
```

The column is identified by `column_id` in the PATH — do not repeat it in the body.

*Built by `weather_service.update_columns`.*

---

### `POST /api/weather/project/{project_id}/scenario/{scenario_id}/uploadfile` {#op-post-api-weather-project-project-id-scenario-scenario-id-uploadfile}

Bulk-load a CSV into PyHelios via loadTabularTimeseriesData.

The only `async def` in this router — it awaits the upload — so it is also
the only one that can block the event loop, which is what an `async def`
calling into PyHelios does. Every other route here is a plain `def` and
FastAPI already runs those in a threadpool. Parsing a real weather file is
slow enough to freeze every other request while it runs, so the blocking
half goes to a thread; only the file read stays on the loop.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `multipart/form-data`

Fields — [`Body_upload_file_api_weather_project__project_id__scenario__scenario_id__uploadfile_post`](#body_upload_file_api_weather_project__project_id__scenario__scenario_id__uploadfile_post):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "labels": [
    "date",
    "time",
    "Tair"
  ],
  "row_count": 8760,
  "column_count": 3
}
```

Multipart upload; normalized in Python, streamed through a temp file, bulk-loaded with loadTabularTimeseriesData.

*Built by `weather_service.upload_file` · confidence: **likely**.*

---

### `DELETE /api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` {#op-delete-api-weather-project-project-id-scenario-scenario-id-weather-data-header}

Remove all headers for the scenario. Returns the count removed.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "count": 3
}
```

*Built by `weather_header_service.clear_headers`.*

---

### `GET /api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` {#op-get-api-weather-project-project-id-scenario-scenario-id-weather-data-header}

Return this scenario's CSV-column-to-(data_type, unit) mapping.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "count": 1,
  "headers": [
    {
      "id": 5,
      "scenario_id": "s_41bd90",
      "name": "Tair",
      "helios_data_type_id": 2,
      "unit_id": 4,
      "status": true,
      "display_order": 1,
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:00:00"
    }
  ]
}
```

*Built by `weather_header_service.get_headers`.*

---

### `PUT /api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header` {#op-put-api-weather-project-project-id-scenario-scenario-id-weather-data-header}

Atomically replace the scenario's header set. Empty list clears it.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "headers": [
    {
      "name": "Ground.001",
      "helios_data_type_id": 1,
      "unit_id": 1,
      "status": true,
      "display_order": 0
    }
  ]
}
```

Fields — [`WeatherDataHeaderReplaceRequest`](#weatherdataheaderreplacerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `headers` | [`WeatherDataHeaderItem`](#weatherdataheaderitem)[] | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "count": 2,
  "headers": [
    {
      "id": 5,
      "scenario_id": "s_41bd90",
      "name": "Tair",
      "helios_data_type_id": 2,
      "unit_id": 4,
      "status": true,
      "display_order": 1,
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:00:00"
    }
  ]
}
```

Atomic replacement. The chosen unit must belong to the header's data type — enforced here, not by SQLite.

*Built by `weather_header_service.replace_headers`.*

---

### `DELETE /api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` {#op-delete-api-weather-project-project-id-scenario-scenario-id-weather-data-header-header-id}

Delete one header row + NaN-clear its PyHelios cells (best-effort).

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `header_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "header_id": 5
}
```

*Built by `weather_header_service.delete_header`.*

---

### `PATCH /api/weather/project/{project_id}/scenario/{scenario_id}/weather_data_header/{header_id}` {#op-patch-api-weather-project-project-id-scenario-scenario-id-weather-data-header-header-id}

Partial update of a single header — name, datatype, unit, or order.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `header_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "helios_data_type_id": 1,
  "unit_id": 1,
  "display_order": 0
}
```

Fields — [`WeatherDataHeaderUpdateRequest`](#weatherdataheaderupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `helios_data_type_id` | integer \| null | no |  |  |
| `unit_id` | integer \| null | no |  |  |
| `display_order` | integer \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "header": {
    "id": 5,
    "scenario_id": "s_41bd90",
    "name": "Tair",
    "helios_data_type_id": 2,
    "unit_id": 4,
    "status": true,
    "display_order": 1,
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00"
  }
}
```

*Built by `weather_header_service.update_header`.*

---

## Schemas

### `AddColumn`

One column spec inside the AddColumnsRequest.column list.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `datatype` | integer \| null | no |  |  |
| `data_unit` | integer \| null | no |  |  |
| `values` | [`ColumnValue`](#columnvalue)[] | no |  |  |
| `default_value` | number \| string \| null | no | `"NAN"` |  |

### `AddColumnsRequest`

Body for POST /addCol — add one or more columns in a single batch.

`column` is a list (frontend always sends an array, even for a single
column). Empty list is rejected at the service layer for a clearer
error than a silent no-op.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `column` | [`AddColumn`](#addcolumn)[] | **yes** |  |  |

### `AddRowsRequest`

Body for POST /addRow — append one or more rows.

Each row dict must include `date` + `time` plus exactly the set of
existing column labels (the str(header.id) values). Mismatch is a 400.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `rows` | object[] | **yes** |  |  |

### `Body_upload_file_api_weather_project__project_id__scenario__scenario_id__uploadfile_post`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

### `ColumnValue`

One {date, time, value} cell inside an AddColumn payload.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `date` | string | **yes** |  |  |
| `time` | string | **yes** |  |  |
| `value` | string | no | `"NAN"` |  |

### `DeleteColumn`

Identifies a column to delete.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `columnname` | string | **yes** |  |  |

### `DeleteRequest`

Body for POST /delete.

Neither row nor column → wipe all.
row only → clear that row across every column.
column only → clear that column across every row.
Both → clear the row first, then the column.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `row` | [`RowRef`](#rowref) \| null | no |  |  |
| `column` | [`DeleteColumn`](#deletecolumn) \| null | no |  |  |

### `RowRef`

Identifies a row by its (date, time) pair.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `date` | string | **yes** |  |  |
| `time` | string | **yes** |  |  |

### `UpdateColumn`

Body for PATCH /updateCol/{column_id} — update one existing column.

The target column is identified by `column_id` in the URL path. Per field:
  - `datatype` / `data_unit`: PATCH semantics — only updated when non-null.
  - `values[]`: each cell upserts (creates if missing, overwrites if exists).
  - `default_value`: when provided, writes the default at every scenario
    timestamp NOT listed in `values[]`, OVERWRITING any existing cell at
    that timestamp. When absent/null, only missing cells are filled (NaN)
    — existing data is preserved.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `datatype` | integer \| null | no |  |  |
| `data_unit` | integer \| null | no |  |  |
| `values` | [`ColumnValue`](#columnvalue)[] | no |  |  |
| `default_value` | number \| string \| null | no | `"NAN"` |  |

### `UpdateRequest`

Body for POST /update — batch update of one or more existing cells.

Each item identifies a cell by (col, row) and provides the new value.
Used by the frontend when re-converting a column's values after the
user changes its data_unit. Empty `updates` list is rejected at the
service layer so the frontend gets a clear signal instead of a no-op.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `updates` | [`UpdateValue`](#updatevalue)[] | **yes** |  |  |

### `UpdateValue`

One cell update inside the UpdateRequest.updates list.

`col` is the PyHelios label (str(header.id)). `row` is the cell's
(date, time). `value` empty-string is treated as NaN (clears the cell).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `col` | string | **yes** |  |  |
| `row` | [`RowRef`](#rowref) | **yes** |  |  |
| `value` | string | no | `"NAN"` |  |

### `WeatherDataHeaderItem`

One header row inside the PUT payload.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |
| `helios_data_type_id` | integer | **yes** |  |  |
| `unit_id` | integer | **yes** |  |  |
| `status` | boolean | no | `true` |  |
| `display_order` | integer | no | `0` |  |

### `WeatherDataHeaderReplaceRequest`

PUT /api/weather/project/{pid}/scenario/{sid}/weather_data_header

Replaces the entire header set for the scenario in one transaction.
Sending an empty `headers` array clears the set.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `headers` | [`WeatherDataHeaderItem`](#weatherdataheaderitem)[] | **yes** |  |  |

### `WeatherDataHeaderUpdateRequest`

PATCH /api/weather/project/{pid}/scenario/{sid}/weather_data_header/{header_id}

Partial update of a single header row. Only the provided fields change.

`helios_data_type_id` and `unit_id` are optional in the DB (migration 008),
so partial-mapping rows stay legal: a row may have both null, just one
set, or both set. When both end up non-null the service still verifies
`unit.data_type_id == helios_data_type_id`.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `helios_data_type_id` | integer \| null | no |  |  |
| `unit_id` | integer \| null | no |  |  |
| `display_order` | integer \| null | no |  |  |

