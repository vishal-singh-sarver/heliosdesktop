<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `m2-catalog` endpoints

*Generated 2026-09-11.*

4 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/catalog/datatypes` {#op-get-api-catalog-datatypes}

List Datatypes

**Response** — `200`, `application/json`

```json
{
  "datatypes": [
    {
      "id": 1,
      "name": "float"
    },
    {
      "id": 2,
      "name": "integer"
    }
  ]
}
```

*Built by `catalog_service.list_datatypes`.*

---

### `GET /api/catalog/material-types` {#op-get-api-catalog-material-types}

List Material Types

**Response** — `200`, `application/json`

```json
{
  "material_types": [
    {
      "id": 1,
      "materialtype": "Radiation",
      "description": "Optical and thermal-radiative surface properties",
      "properties": [
        {
          "property_type_id": 15,
          "property": "emissivity",
          "datatype": "float",
          "min": 0,
          "max": 1,
          "display_order": 4
        }
      ],
      "groups": [
        {
          "name": "Spectrum",
          "selector_property": "use_radiation_bands",
          "selector_value": "1",
          "properties": []
        }
      ]
    }
  ]
}
```

Only `visibility='editable'` properties are returned.

*Built by `catalog_service.list_material_types`.*

---

### `GET /api/catalog/model-types` {#op-get-api-catalog-model-types}

List Model Types

**Response** — `200`, `application/json`

```json
{
  "model_types": [
    {
      "id": 1,
      "model": "Photosynthesis",
      "description": "Photosynthesis model",
      "submodels": [
        {
          "id": 7,
          "model": "Farquhar",
          "description": "Farquhar photosynthesis submodel"
        }
      ]
    }
  ]
}
```

*Built by `catalog_service.list_model_types`.*

---

### `GET /api/catalog/object-types` {#op-get-api-catalog-object-types}

List Object Types

**Response** — `200`, `application/json`

```json
{
  "object_types": [
    {
      "id": 1,
      "object": "Ground",
      "properties": [
        {
          "property_type_id": 1,
          "property": "length",
          "description": "Ground size L in meters",
          "datatype": "float",
          "min": 0.01,
          "max": null,
          "required": true,
          "display_order": 1
        }
      ]
    }
  ]
}
```

Drives the dynamic properties form. See [The property system](../../arch/properties.md).

*Built by `catalog_service.list_object_types`.*

---

