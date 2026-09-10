<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `objects` endpoints

*Generated 2026-09-10.*

5 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/objects/{object_id}/children/binary` {#op-get-api-objects-object-id-children-binary}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Object Children Binary

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `object_service.get_object_children_binary`.*

---

### `GET /api/objects/{object_id}/children/gpu` {#op-get-api-objects-object-id-children-gpu}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Object Children Gpu

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v2 (`packGPUBuffers`). See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `object_service.get_object_children_gpu`.*

---

### `GET /api/objects/{object_id}/geometry/binary` {#op-get-api-objects-object-id-geometry-binary}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Object Geometry Binary

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v1. See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `object_service.get_object_geometry_binary`.*

---

### `GET /api/objects/{object_id}/geometry/gpu` {#op-get-api-objects-object-id-geometry-gpu}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Object Geometry Gpu

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/octet-stream`

Binary buffer — geometry wire format v2 (`packGPUBuffers`). See [Geometry & primitives](../../../concepts/primitives.md).

*Built by `object_service.get_object_geometry_gpu`.*

---

### `GET /api/objects/{object_id}/info` {#op-get-api-objects-object-id-info}

!!! warning "Not reachable from the UI"
    Nothing in the renderer calls this router. See
    [Dormant surface](../../../reference/dormant.md).

Get Object Info

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `object_id` | path | integer | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "object_id": 1,
  "name": "Ground.001",
  "type": "ground",
  "uuids": [
    0,
    1
  ],
  "plant_ids": [],
  "children": []
}
```

*Built by `object_service.get_object_info`.*

---

