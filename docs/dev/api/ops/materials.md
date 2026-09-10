<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `materials` endpoints

*Generated 2026-09-10.*

12 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/materials` {#op-get-api-materials}

List Materials

**Response** — `200`, `application/json`

```json
{
  "materials": [
    {
      "label": "so_12",
      "color": {
        "r": 0.5,
        "g": 0.5,
        "b": 0.5,
        "a": 1.0
      },
      "texture_file": "",
      "twosided": false
    }
  ]
}
```

*Built by `material_service.list_materials` · confidence: **likely**.*

---

### `POST /api/materials` {#op-post-api-materials}

Create Material

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "label": "Ground.001"
}
```

Fields — [`MaterialCreateRequest`](#materialcreaterequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `label` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "label": "mat_1",
  "color": {
    "r": 1.0,
    "g": 1.0,
    "b": 1.0,
    "a": 1.0
  },
  "texture_file": "",
  "twosided": false
}
```

*Built by `material_service.create_material` · confidence: **likely**.*

---

### `POST /api/materials/assign` {#op-post-api-materials-assign}

Assign Material

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "material_label": "Ground.001",
  "object_id": 1,
  "primitive_uuids": [
    0
  ]
}
```

Fields — [`MaterialAssignRequest`](#materialassignrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `material_label` | string | **yes** |  |  |
| `object_id` | integer \| null | no |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.assign_material`.*

---

### `GET /api/materials/textures/library` {#op-get-api-materials-textures-library}

Get Texture Library

**Response** — `200`, `application/json`

```json
{
  "categories": [
    {
      "name": "soil",
      "textures": [
        {
          "name": "dirt.jpg",
          "path": "/\u2026/assets/dirt.jpg"
        }
      ]
    }
  ]
}
```

*Built by `material_service.get_texture_library` · confidence: **likely**.*

---

### `GET /api/materials/textures/preview` {#op-get-api-materials-textures-preview}

Get Texture Preview

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `path` | query | string | **yes** |  |

**Response** — `200`, `image/*`

The image file itself (`FileResponse`).

*Built by `materials.get_texture_preview`.*

---

### `DELETE /api/materials/{label}` {#op-delete-api-materials-label}

Delete Material

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.delete_material`.*

---

### `PUT /api/materials/{label}/color` {#op-put-api-materials-label-color}

Set Material Color

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "r": 0.0,
  "g": 0.0,
  "b": 0.0,
  "a": 1.0
}
```

Fields — [`MaterialColorRequest`](#materialcolorrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `r` | number | **yes** |  |  |
| `g` | number | **yes** |  |  |
| `b` | number | **yes** |  |  |
| `a` | number | no | `1.0` |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.set_material_color`.*

---

### `GET /api/materials/{label}/primitives` {#op-get-api-materials-label-primitives}

Get Material Primitives

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Response** — `200`, `application/json`

```json
{
  "uuids": [
    0,
    1,
    2
  ]
}
```

*Built by `material_service.get_material_primitives`.*

---

### `PUT /api/materials/{label}/rename` {#op-put-api-materials-label-rename}

Rename Material

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "new_label": "Ground.001"
}
```

Fields — [`MaterialRenameRequest`](#materialrenamerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `new_label` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "label": "mat_2",
  "color": {
    "r": 1.0,
    "g": 1.0,
    "b": 1.0,
    "a": 1.0
  },
  "texture_file": "",
  "twosided": false
}
```

*Built by `material_service.rename_material` · confidence: **likely**.*

---

### `PUT /api/materials/{label}/texture` {#op-put-api-materials-label-texture}

Set Material Texture

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "texture_file": "textures/soil.jpg"
}
```

Fields — [`MaterialTextureRequest`](#materialtexturerequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `texture_file` | string | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.set_material_texture`.*

---

### `PUT /api/materials/{label}/texture-override` {#op-put-api-materials-label-texture-override}

Set Material Texture Override

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "override": true
}
```

Fields — [`MaterialTextureOverrideRequest`](#materialtextureoverriderequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `override` | boolean | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.set_material_texture_override`.*

---

### `PUT /api/materials/{label}/twosided` {#op-put-api-materials-label-twosided}

Set Material Twosided

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `label` | path | string | **yes** |  |

**Request body** — `application/json`

Paste this into Swagger and edit the values:

```json
{
  "twosided": true
}
```

Fields — [`MaterialTwosidedRequest`](#materialtwosidedrequest):

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `twosided` | boolean | **yes** |  |  |

**Response** — `200`, `application/json`

```json
{
  "success": true
}
```

*Built by `material_service.set_material_twosided`.*

---

## Schemas

### `MaterialAssignRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `material_label` | string | **yes** |  |  |
| `object_id` | integer \| null | no |  |  |
| `primitive_uuids` | integer[] \| null | no |  |  |

### `MaterialColorRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `r` | number | **yes** |  |  |
| `g` | number | **yes** |  |  |
| `b` | number | **yes** |  |  |
| `a` | number | no | `1.0` |  |

### `MaterialCreateRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `label` | string | **yes** |  |  |

### `MaterialRenameRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `new_label` | string | **yes** |  |  |

### `MaterialTextureOverrideRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `override` | boolean | **yes** |  |  |

### `MaterialTextureRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `texture_file` | string | **yes** |  |  |

### `MaterialTwosidedRequest`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `twosided` | boolean | **yes** |  |  |

