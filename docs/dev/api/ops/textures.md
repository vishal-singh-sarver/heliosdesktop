<!-- GENERATED FILE — do not edit by hand.
     Regenerate: helios-desktop-backend/venv/bin/python3 docs/gen/generate_reference.py -->

# `textures` endpoints

*Generated 2026-09-10.*

2 operations. See [Conventions](../http.md) for the headers, scoping and error shape they all share.

### `GET /api/textures/defaults` {#op-get-api-textures-defaults}

List the built-in default textures the user can pick from — the images
committed in `backend-api/assets/`.

**Response** — `200`, `application/json`

```json
{
  "textures": [
    {
      "name": "soil.jpg",
      "url": "/api/textures/serve?path=%2F\u2026%2Fassets%2Fsoil.jpg"
    }
  ]
}
```

*Built by `textures.list_defaults`.*

---

### `GET /api/textures/serve` {#op-get-api-textures-serve}

Serve a texture image referenced by a primitive's texture path.

Accepts both forms the app produces: the ABSOLUTE path baked into the
geometry binary (viewport), and the RELATIVE `uploads/...` value stored on a
material by the file-upload endpoint (material form / popup). A relative path
is resolved against data_dir — resolving it against the process CWD instead
would land outside the allowlist and 403 every uploaded texture.

400 for a bad / non-image path, 403 when the path is outside the allowlist,
404 when the file is missing.

**Parameters**

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `path` | query | string | **yes** |  |

**Response** — `200`, `image/*`

The image file itself (`FileResponse`).

*Built by `textures.serve_texture`.*

---

