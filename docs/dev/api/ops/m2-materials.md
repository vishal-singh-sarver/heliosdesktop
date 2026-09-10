<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `m2-materials` endpoints

*Generated 2026-09-10.*

15 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/materials/library/groups` {#op-get-api-materials-library-groups}

List Groups

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `material_type_id` | query | integer \| null | no |  |
| `search` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "groups": [
    {
      "id": 7,
      "project_id": null,
      "scenario_id": null,
      "name": "Default Visualiser",
      "created_at": "2026-01-31 09:00:00",
      "updated_at": "2026-01-31 09:00:00",
      "materials": [
        {
          "material_type_id": 7,
          "material_type": "Visualiser",
          "properties": {
            "color_r": 128,
            "color_g": 128,
            "color_b": 128,
            "opacity": 100,
            "texture_toggle": false
          }
        }
      ]
    }
  ]
}
```

*Built by `material_library_service.list_groups`.*

---

### `POST /api/materials/library/groups` {#op-post-api-materials-library-groups}

Create Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "project_id": "p_8f3a2c",
  "scenario_id": "s_41bd90",
  "materials": [
    {
      "material_type_id": 1,
      "properties": {
        "length": 10,
        "breadth": 10
      }
    }
  ]
}
```

Fields — [`MaterialGroupCreateRequest`](#materialgroupcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `project_id` | string \| null | no |  |  |
| `scenario_id` | string \| null | no |  |  |
| `materials` | [`GroupMaterialIn`](#groupmaterialin)[] | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

A material is created EMPTY; add one member per material type afterwards.

*Built by `material_library_service.create_group`.*

---

### `GET /api/materials/library/groups/next-name` {#op-get-api-materials-library-groups-next-name}

Next Name

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "name": "Material.001"
}
```

*Built by `material_library_service.next_name`.*

---

### `DELETE /api/materials/library/groups/{group_id}` {#op-delete-api-materials-library-groups-group-id}

Delete Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group_id": 7
}
```

*Built by `material_library_service.delete_group`.*

---

### `GET /api/materials/library/groups/{group_id}` {#op-get-api-materials-library-groups-group-id}

Get Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

*Built by `material_library_service.get_group`.*

---

### `PUT /api/materials/library/groups/{group_id}` {#op-put-api-materials-library-groups-group-id}

Update Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001",
  "materials": [
    {
      "material_type_id": 1,
      "properties": {
        "length": 10,
        "breadth": 10
      }
    }
  ]
}
```

Fields — [`MaterialGroupPutRequest`](#materialgroupputrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `materials` | [`GroupMaterialIn`](#groupmaterialin)[] | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

With `?scenario_id=` the active scenario is reconciled and repainted in the same call.

*Built by `material_library_service.update_group`.*

---

### `DELETE /api/materials/library/groups/{group_id}/files` {#op-delete-api-materials-library-groups-group-id-files}

Delete an uploaded file. 409 while any material or frozen per-geometry
snapshot still references it. For a spectral file, pass ?labels= to also clear
its global data from the active scenario.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `labels` | query | string[] \| null | no |  |
| `path` | query | string | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "path": "materials/7/soil.jpg"
}
```

409 FILE_IN_USE while any material or frozen snapshot still references it.

*Built by `material_library_service.delete_file`.*

---

### `POST /api/materials/library/groups/{group_id}/files/{property_name}` {#op-post-api-materials-library-groups-group-id-files-property-name}

Store a material file and return its path. No material member needed —
the save API writes the returned path into the member's property.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `property_name` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `multipart/form-data`

Fields — [`Body_upload_file_property_api_materials_library_groups__group_id__files__property_name__post`](#body_upload_file_property_api_materials_library_groups__group_id__files__property_name__post):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "property": "texture_file",
  "path": "materials/7/soil.jpg"
}
```

Creates the member in texture mode if it does not exist yet.

*Built by `material_library_service.upload_file_property`.*

---

### `POST /api/materials/library/groups/{group_id}/materials` {#op-post-api-materials-library-groups-group-id-materials}

Add Group Material

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "material_type_id": 1,
  "properties": {
    "length": 10,
    "breadth": 10
  }
}
```

Fields — [`GroupMaterialIn`](#groupmaterialin):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `material_type_id` | integer | **yes** |  |  |
| `properties` | object | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

One member per material type per group — a duplicate is refused with DUPLICATE_MATERIAL_TYPE_IN_GROUP.

*Built by `material_library_service.add_group_material`.*

---

### `DELETE /api/materials/library/groups/{group_id}/materials/{material_type_id}` {#op-delete-api-materials-library-groups-group-id-materials-material-type-id}

Remove Group Material

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `material_type_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

*Built by `material_library_service.remove_group_material`.*

---

### `PUT /api/materials/library/groups/{group_id}/materials/{material_type_id}` {#op-put-api-materials-library-groups-group-id-materials-material-type-id}

Update Group Material

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `material_type_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "properties": {
    "length": 10,
    "breadth": 10
  }
}
```

Fields — [`GroupMaterialPutRequest`](#groupmaterialputrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `properties` | object | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

Full replacement of that member's properties.

*Built by `material_library_service.update_group_material`.*

---

### `PATCH /api/materials/library/groups/{group_id}/rename` {#op-patch-api-materials-library-groups-group-id-rename}

Rename the group only — members untouched (PUT would replace them).
No ?scenario_id=: a name change cannot drift applied state.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001"
}
```

Fields — [`MaterialGroupRenameRequest`](#materialgrouprenamerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 7,
    "project_id": null,
    "scenario_id": null,
    "name": "Default Visualiser",
    "created_at": "2026-01-31 09:00:00",
    "updated_at": "2026-01-31 09:00:00",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128,
          "opacity": 100,
          "texture_toggle": false
        }
      }
    ]
  }
}
```

*Built by `material_library_service.rename_group`.*

---

### `POST /api/materials/library/groups/{group_id}/spectral` {#op-post-api-materials-library-groups-group-id-spectral}

Dedicated spectral upload — same member-less flow, returns the path.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `multipart/form-data`

Fields — [`Body_upload_spectral_api_materials_library_groups__group_id__spectral_post`](#body_upload_spectral_api_materials_library_groups__group_id__spectral_post):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "path": "materials/7/leaf.xml"
}
```

Does NOT create the member — the card must already be saved. The caller stages this path and the member's own Save persists it.

*Built by `material_library_service.upload_spectral_data`.*

---

### `DELETE /api/materials/library/groups/{group_id}/spectral/labels` {#op-delete-api-materials-library-groups-group-id-spectral-labels}

Remove spectral global-data labels from the active scenario's context.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `scenario_id` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "labels": [
    "Ground.001"
  ]
}
```

Fields — [`SpectralLabelsRequest`](#spectrallabelsrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `labels` | string[] | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "removed": 1
}
```

*Built by `material_library_service.delete_spectral_labels`.*

---

### `GET /api/materials/library/groups/{group_id}/spectral/labels` {#op-get-api-materials-library-groups-group-id-spectral-labels}

The spectrum labels inside a stored spectral file, so the client can offer
reflectivity_spectrum / transmissivity_spectrum as pickers rather than
free-text. `path` is the value the upload returned.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `path` | query | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "labels": [
    "leaf_reflectivity",
    "leaf_transmissivity"
  ]
}
```

Reads the `<globaldata_vec2 label=…>` entries out of a STORED file.

*Built by `material_library_service.spectral_labels`.*

---

## Schemas

### `Body_upload_file_property_api_materials_library_groups__group_id__files__property_name__post`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

### `Body_upload_spectral_api_materials_library_groups__group_id__spectral_post`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `file` | string | **yes** |  |  |

### `GroupMaterialIn`

One member of a group: a material type + its property values. Doubles
as the add-one-member request body.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `material_type_id` | integer | **yes** |  |  |
| `properties` | object | no |  |  |

### `GroupMaterialPutRequest`

Standalone FULL-REPLACEMENT of one member's properties (the stored set
becomes exactly `properties`; omitted keys are cleared). Visualiser members
are required-by-mode. The member is addressed by material_type_id in the URL.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `properties` | object | no |  |  |

### `MaterialGroupCreateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `project_id` | string \| null | no |  |  |
| `scenario_id` | string \| null | no |  |  |
| `materials` | [`GroupMaterialIn`](#groupmaterialin)[] | no |  |  |

### `MaterialGroupPutRequest`

Full-replacement member set. Types absent from `materials` are removed
(an empty list removes every member — the group survives, empty); kept
types are updated in place (per-member properties merge-upsert: provided
keys written, explicit null clears, absent keys untouched).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `materials` | [`GroupMaterialIn`](#groupmaterialin)[] | no |  |  |

### `MaterialGroupRenameRequest`

Rename only — members untouched. (PUT can rename too, but it is a
full-replacement member set, so renaming through it means resending every
member or losing them.)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

### `SpectralLabelsRequest`

Spectral global-data labels to remove from the active scenario's context.
The UI parses these from the spectral .xml at upload.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `labels` | string[] | no |  |  |

