<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `m2-geometry` endpoints

*Generated 2026-09-10.*

24 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/geometry/binary` {#op-get-api-geometry-project-project-id-scenario-scenario-id-geometry-binary}

Whole-scene binary for the scenario's persisted geometry. Fetching
hydrates (spec §12.3) — use this as the first viewport load.

Stops packing when the client goes away. This is the longest read in the
app — 228 MB on a 1000x1000 ground, and the viewport asks for it more than
once — so it kept building a buffer nobody would receive whenever the user
navigated away mid-load.

The disconnect is watched with a raw `request.receive()` rather than
`request.is_disconnected()`: under the app's own `@app.middleware("http")`
(main.py) the latter never reports True, because BaseHTTPMiddleware leaves
the message empty. Safe on a GET — with no body to read, the watcher cannot
swallow the `http.request` message a body-reading route would need.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

Fetching hydrates the scenario — use this as the first viewport load. Returns **499** if the client disconnects mid-pack.

*Built by `scene_object_service.get_scene_geometry_binary`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/groups` {#op-get-api-geometry-project-project-id-scenario-scenario-id-groups}

List Groups

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "groups": [
    {
      "id": 3,
      "name": "Group.001",
      "scenario_id": "s_41bd90",
      "member_ids": [
        12,
        13
      ],
      "created_at": "2026-01-31 09:20:00",
      "updated_at": "2026-01-31 09:20:00"
    }
  ]
}
```

`member_ids` is authoritative for membership and child order.

*Built by `scene_object_service.list_groups`.*

---

### `POST /api/geometry/project/{project_id}/scenario/{scenario_id}/groups` {#op-post-api-geometry-project-project-id-scenario-scenario-id-groups}

Create Group

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
  "name": "Ground.001",
  "member_ids": [
    0
  ]
}
```

Fields — [`GroupCreateRequest`](#groupcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `member_ids` | integer[] | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 3,
    "name": "Group.001",
    "scenario_id": "s_41bd90",
    "member_ids": [
      12,
      13
    ],
    "created_at": "2026-01-31 09:20:00",
    "updated_at": "2026-01-31 09:20:00"
  }
}
```

*Built by `scene_object_service.create_group`.*

---

### `DELETE /api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}` {#op-delete-api-geometry-project-project-id-scenario-scenario-id-groups-group-id}

Delete Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group_id": 3,
  "ungrouped": [
    12,
    13
  ]
}
```

Deletes the group only — its members are ungrouped, not deleted.

*Built by `scene_object_service.delete_group`.*

---

### `DELETE /api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/objects` {#op-delete-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-objects}

Delete Group Objects

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group_id": 3,
  "deleted_object_ids": [
    12,
    13
  ]
}
```

Deletes the group's member OBJECTS.

*Built by `scene_object_service.delete_group_objects`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/rename` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-rename}

Rename Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001"
}
```

Fields — [`GroupRenameRequest`](#grouprenamerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group": {
    "id": 3,
    "name": "Plots",
    "updated_at": "2026-01-31 10:05:00"
  }
}
```

*Built by `scene_object_service.rename_group`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/groups/{group_id}/visibility` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-groups-group-id-visibility}

Update Group Visibility

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "visibility": {}
}
```

Fields — [`GroupVisibilityRequest`](#groupvisibilityrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `visibility` | object | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "group_id": 3,
  "visibility": {
    "viewport": false
  },
  "member_ids": [
    12,
    13
  ]
}
```

Cascades to every member.

*Built by `scene_object_service.update_group_visibility`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` {#op-get-api-geometry-project-project-id-scenario-scenario-id-material-sync}

Drift report: is this scenario's applied material state in sync with
the library, and what would PUT change (dry-run).

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "scenario_id": "s_41bd90",
  "in_sync": false,
  "objects": [
    {
      "object_id": 12,
      "object_name": "Ground.001",
      "issues": [
        {
          "kind": "values_stale",
          "group_id": 7,
          "changed_properties": [
            "color_r"
          ]
        }
      ]
    }
  ]
}
```

Dry run — reports drift without changing anything.

*Built by `material_sync_service.compute_sync`.*

---

### `PUT /api/geometry/project/{project_id}/scenario/{scenario_id}/material-sync` {#op-put-api-geometry-project-project-id-scenario-scenario-id-material-sync}

Apply Material Sync

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
  "group_ids": [
    0
  ],
  "object_ids": [
    0
  ]
}
```

Fields — [`MaterialSyncRequest`](#materialsyncrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `group_ids` | integer[] \| null | no |  |  |
| `object_ids` | integer[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "scenario_id": "s_41bd90",
  "applied": {
    "removed_groups": 0,
    "removed_members": 1,
    "added_members": 1,
    "refreshed_values": 2
  },
  "conflicts": []
}
```

Conflicts are skipped and reported, never raised — partial success is normal.

*Built by `scene_object_service.apply_material_sync`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/models` {#op-get-api-geometry-project-project-id-scenario-scenario-id-models}

Which models run on the Run button for this scenario.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "models": [
    {
      "model_type_id": 1,
      "model": "Radiation",
      "enabled": true
    }
  ]
}
```

An absent row means enabled.

*Built by `scene_object_service.get_scenario_models`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/models` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-models}

Update Scenario Models

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
  "models": {}
}
```

Fields — [`ScenarioModelsUpdateRequest`](#scenariomodelsupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `models` | object | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "models": [
    {
      "model_type_id": 1,
      "model": "Radiation",
      "enabled": false
    }
  ]
}
```

*Built by `scene_object_service.update_scenario_models`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects}

List Objects

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `search` | query | string \| null | no |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "objects": [
    {
      "id": 12,
      "name": "Ground.001",
      "object_type": "Ground",
      "group_id": null,
      "visibility": {
        "viewport": true,
        "render": true,
        "models": {
          "1": true
        }
      },
      "viewport": {
        "object_id": 4711,
        "ctx_object_id": 3
      }
    }
  ]
}
```

*Built by `scene_object_service.list_objects`.*

---

### `POST /api/geometry/project/{project_id}/scenario/{scenario_id}/objects` {#op-post-api-geometry-project-project-id-scenario-scenario-id-objects}

Create Object

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
  "object_type_id": 1,
  "name": "Ground.001",
  "properties": {
    "length": 10,
    "breadth": 10
  },
  "visibility": {},
  "materials": [
    {
      "group_id": 1,
      "sync": true
    }
  ]
}
```

Fields — [`SceneObjectCreateRequest`](#sceneobjectcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_type_id` | integer | **yes** |  |  |
| `name` | string \| null | no |  |  |
| `properties` | object | no |  |  |
| `visibility` | object \| null | no |  |  |
| `materials` | [`GroupAssignmentIn`](#groupassignmentin)[] | no |  |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "object": {
    "id": 12,
    "name": "Ground.001",
    "object_type_id": 1,
    "object_type": "Ground",
    "scenario_id": "s_41bd90",
    "group_id": null,
    "created_at": "2026-01-31 09:12:04",
    "updated_at": "2026-01-31 09:14:22",
    "properties": {
      "length": 10,
      "breadth": 10,
      "resolution_x": 1,
      "resolution_y": 1,
      "position_x": 0,
      "position_y": 0,
      "position_z": 0,
      "rotation_z": 0,
      "texture_x": 1,
      "texture_y": 1
    },
    "visibility": {
      "viewport": true,
      "render": true,
      "models": {
        "1": true
      }
    },
    "helios_uuids": [
      0,
      1,
      2,
      3
    ],
    "viewport": {
      "object_id": 4711,
      "ctx_object_id": 3
    },
    "material_groups": [
      {
        "object_id": 12,
        "group_id": 7,
        "name": "Default Visualiser",
        "sync": true,
        "source": "library",
        "materials": [
          {
            "material_type_id": 7,
            "material_type": "Visualiser",
            "properties": {
              "color_r": 128,
              "color_g": 128,
              "color_b": 128,
              "opacity": 100
            }
          }
        ]
      }
    ]
  }
}
```

A create whose engine build fails deletes the row and raises, so you never get a DB-only object.

*Built by `scene_object_service.create_object`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/next-name` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-next-name}

Next Name

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `object_type` | query | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "name": "Ground.002"
}
```

*Built by `scene_object_service.next_name`.*

---

### `DELETE /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` {#op-delete-api-geometry-project-project-id-scenario-scenario-id-objects-object-id}

Delete Object

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "object_id": 12
}
```

*Built by `scene_object_service.delete_object`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id}

Get Object

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "object": {
    "id": 12,
    "name": "Ground.001",
    "object_type_id": 1,
    "object_type": "Ground",
    "scenario_id": "s_41bd90",
    "group_id": null,
    "created_at": "2026-01-31 09:12:04",
    "updated_at": "2026-01-31 09:14:22",
    "properties": {
      "length": 10,
      "breadth": 10,
      "resolution_x": 1,
      "resolution_y": 1,
      "position_x": 0,
      "position_y": 0,
      "position_z": 0,
      "rotation_z": 0,
      "texture_x": 1,
      "texture_y": 1
    },
    "visibility": {
      "viewport": true,
      "render": true,
      "models": {
        "1": true
      }
    },
    "helios_uuids": [
      0,
      1,
      2,
      3
    ],
    "viewport": {
      "object_id": 4711,
      "ctx_object_id": 3
    },
    "material_groups": [
      {
        "object_id": 12,
        "group_id": 7,
        "name": "Default Visualiser",
        "sync": true,
        "source": "library",
        "materials": [
          {
            "material_type_id": 7,
            "material_type": "Visualiser",
            "properties": {
              "color_r": 128,
              "color_g": 128,
              "color_b": 128,
              "opacity": 100
            }
          }
        ]
      }
    ]
  }
}
```

*Built by `scene_object_service.get_object`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id}

Update Object

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "properties": {
    "length": 10,
    "breadth": 10
  },
  "visibility": {},
  "group_id": 1,
  "materials": [
    {
      "group_id": 1,
      "sync": true
    }
  ]
}
```

Fields — [`SceneObjectUpdateRequest`](#sceneobjectupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `properties` | object \| null | no |  |  |
| `visibility` | object \| null | no |  |  |
| `group_id` | integer \| null | no |  |  |
| `materials` | [`GroupAssignmentIn`](#groupassignmentin)[] | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "object": {
    "id": 12,
    "name": "Ground.001",
    "object_type_id": 1,
    "object_type": "Ground",
    "scenario_id": "s_41bd90",
    "group_id": null,
    "created_at": "2026-01-31 09:12:04",
    "updated_at": "2026-01-31 09:14:22",
    "properties": {
      "length": 10,
      "breadth": 10,
      "resolution_x": 1,
      "resolution_y": 1,
      "position_x": 0,
      "position_y": 0,
      "position_z": 0,
      "rotation_z": 0,
      "texture_x": 1,
      "texture_y": 1
    },
    "visibility": {
      "viewport": true,
      "render": true,
      "models": {
        "1": true
      }
    },
    "helios_uuids": [
      0,
      1,
      2,
      3
    ],
    "viewport": {
      "object_id": 4711,
      "ctx_object_id": 3
    },
    "material_groups": [
      {
        "object_id": 12,
        "group_id": 7,
        "name": "Default Visualiser",
        "sync": true,
        "source": "library",
        "materials": [
          {
            "material_type_id": 7,
            "material_type": "Visualiser",
            "properties": {
              "color_r": 128,
              "color_g": 128,
              "color_b": 128,
              "opacity": 100
            }
          }
        ]
      }
    ]
  }
}
```

A superseded request (a newer PATCH for the same object arrived first) returns the object unchanged without writing.

*Built by `scene_object_service.update_object`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/binary` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-geometry-binary}

getObjectGeometry (spec §5.8) — binary buffer for the stored UUIDs.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `scene_object_service.get_object_geometry_binary`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/geometry/gpu` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-geometry-gpu}

Wire format v2 — GPU-ready typed arrays for one object (see the service
docstring). The scenario-scoped replacement for the never-working legacy
route in objects.py.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v2 (`packGPUBuffers`). See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `scene_object_service.get_object_geometry_gpu`.*

---

### `GET /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` {#op-get-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups}

List Assignments

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "material_groups": [
    {
      "object_id": 12,
      "group_id": 7,
      "name": "Default Visualiser",
      "sync": true,
      "source": "library",
      "materials": [
        {
          "material_type_id": 7,
          "material_type": "Visualiser",
          "properties": {
            "color_r": 128,
            "color_g": 128,
            "color_b": 128
          }
        }
      ]
    }
  ]
}
```

`source` is `library` when sync=1, `frozen` when sync=0. A `stale: true` flag appears when the library group was deleted.

*Built by `scene_object_service.list_assignments`.*

---

### `POST /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups` {#op-post-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups}

Assign a material group, REPLACING whatever holds the same material types.

One request, one transaction: the client does not delete the old material
first. A refusal (422 for a texture the geometry cannot be rebuilt with)
leaves the old material in place, so the geometry is never left bare.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "group_id": 1,
  "sync": true
}
```

Fields — [`AssignMaterialGroupRequest`](#assignmaterialgrouprequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `group_id` | integer | **yes** |  |  |
| `sync` | boolean | no | `true` |  |

**Response** — `201`, `application/json`

```json
{
  "success": true,
  "assignment": {
    "object_id": 12,
    "group_id": 7,
    "name": "Default Visualiser",
    "sync": true,
    "source": "library",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128
        }
      }
    ]
  }
}
```

*Built by `scene_object_service.assign_material_group`.*

---

### `DELETE /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` {#op-delete-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups-group-id}

Unassign Material Group

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "object_id": 12,
  "group_id": 7
}
```

Idempotent — an already-absent assignment also returns `already_absent: true`.

*Built by `scene_object_service.unassign_material_group`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/material-groups/{group_id}` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-material-groups-group-id}

Update Group Assignment

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `group_id` | path | integer | **yes** |  |
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "sync": true,
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

Fields — [`GroupAssignmentUpdateRequest`](#groupassignmentupdaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `sync` | boolean \| null | no |  |  |
| `materials` | [`FrozenMaterialPatch`](#frozenmaterialpatch)[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "assignment": {
    "object_id": 12,
    "group_id": 7,
    "name": "Default Visualiser",
    "sync": true,
    "source": "library",
    "materials": [
      {
        "material_type_id": 7,
        "material_type": "Visualiser",
        "properties": {
          "color_r": 128,
          "color_g": 128,
          "color_b": 128
        }
      }
    ]
  }
}
```

*Built by `scene_object_service.update_group_assignment`.*

---

### `PATCH /api/geometry/project/{project_id}/scenario/{scenario_id}/objects/{object_id}/rename` {#op-patch-api-geometry-project-project-id-scenario-scenario-id-objects-object-id-rename}

Rename Object

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |
| `project_id` | path | string | **yes** |  |
| `scenario_id` | path | string | **yes** |  |
| `session-id` | header | string \| null | no |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "name": "Ground.001"
}
```

Fields — [`SceneObjectRenameRequest`](#sceneobjectrenamerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true,
  "object": {
    "id": 12,
    "name": "Field",
    "updated_at": "2026-01-31 10:02:00"
  }
}
```

*Built by `scene_object_service.rename_object`.*

---

## Schemas

### `AssignMaterialGroupRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `group_id` | integer | **yes** |  |  |
| `sync` | boolean | no | `true` |  |

### `FrozenMaterialPatch`

Per-member frozen-value edit, addressed by material type (members are
nameless — identity is (group, material type)).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `material_type_id` | integer | **yes** |  |  |
| `properties` | object | no |  |  |

### `GroupAssignmentIn`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `group_id` | integer | **yes** |  |  |
| `sync` | boolean | no | `true` |  |

### `GroupAssignmentUpdateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `sync` | boolean \| null | no |  |  |
| `materials` | [`FrozenMaterialPatch`](#frozenmaterialpatch)[] \| null | no |  |  |

### `GroupCreateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string \| null | no |  |  |
| `member_ids` | integer[] | no |  |  |

### `GroupRenameRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

### `GroupVisibilityRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `visibility` | object | no |  |  |

### `MaterialSyncRequest`

PUT material-sync scoping — omitted/None = reconcile everything.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `group_ids` | integer[] \| null | no |  |  |
| `object_ids` | integer[] \| null | no |  |  |

### `ScenarioModelsUpdateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `models` | object | no |  |  |

### `SceneObjectCreateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `object_type_id` | integer | **yes** |  |  |
| `name` | string \| null | no |  |  |
| `properties` | object | no |  |  |
| `visibility` | object \| null | no |  |  |
| `materials` | [`GroupAssignmentIn`](#groupassignmentin)[] | no |  |  |

### `SceneObjectRenameRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** |  |  |

### `SceneObjectUpdateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `properties` | object \| null | no |  |  |
| `visibility` | object \| null | no |  |  |
| `group_id` | integer \| null | no |  |  |
| `materials` | [`GroupAssignmentIn`](#groupassignmentin)[] | no |  |  |

