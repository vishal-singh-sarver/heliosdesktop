# Geometry & primitives

Helios models a scene at two levels.

| Level | What it is | Who sees it |
|---|---|---|
| **Object** | A user-facing item — a ground, a tree, a canopy. Has a name, a type, properties, visibility, a group. | The user, the UI, SQLite |
| **Primitive** | The atomic geometry the engine stores — patches and triangles, each with a UUID, vertices, a colour and optionally UVs. | The engine, the viewport |

One object expands into many primitives. A 2000×2000 ground is a single row in the object tree
and millions of primitives in the Context.

Object types are not hardcoded — they come from the `object_types` catalog table with their
property definitions in `object_property_type`, served by `GET /api/catalog/object-types`. Adding
an object type is a migration, not a code change.

## Getting geometry to the viewport

This is the hottest path in the app, and there are **two** wire formats. Both are live so an A/B
comparison is possible on the same scene, on the same machine, with one flag.

=== "v2 (default)"

    A single binary buffer the C++ side emits via `packGPUBuffers`. The reader
    (`src/renderer/src/containers/3DWindow/api/geometryV2.ts`) **decodes nothing** — it returns
    TypedArray *views* over the response buffer.

    ```
    header      16 B   version(u8) flags(u8) groupCount(u16)
                       totalVerts(u32) totalTris(u32) primCount(u32)
    descriptors 19 B + pathLen, per group:
                       vertexStart(u32) vertexCount(u32)
                       triangleStart(u32) triangleCount(u32)
                       pathLen(u16) flags(u8) path(bytes)
                       …padded to a 4-byte boundary
    arrays      positions f32x3 | colors f32x3 | uvs f32x2
                indices u32x3   | faceToUuid u32
    ```

=== "v1 (legacy)"

    Per-primitive records. The reader walks the payload and builds a JS object per vertex, per uv
    and per primitive.

!!! danger "Why v2 exists: Electron's 4 GB cage"
    V8's pointer-compression cage is a hard **4 GB in Electron regardless of machine RAM**. v1's
    per-vertex JS objects live inside it, and a 2000×2000 ground needs ~4.4 GB of them — so v1
    simply cannot open large grounds. A TypedArray view costs a few dozen bytes of cage space no
    matter how large the geometry is, because the bytes themselves are external memory.

**Indices are global vertex indices, not per-group.** That is deliberate: it lets the renderer
build one `BufferGeometry` and mark groups with `addGroup()`. Slicing per group would mean
subtracting `vertexStart` from every index — 24 million subtractions on an 8-million-triangle
scene, for no benefit.

## Choosing the format

Resolved in three layers, most specific first (`3DWindow/store/featureFlags.ts`):

1. An in-memory override, for this session only.
2. `localStorage`, so a comparison needs a reload rather than a rebuild.
3. `VITE_GEOMETRY_FORMAT`, baked in by Vite at build time.

Layer 3 ships a packaged app on v2 without asking users to type into a console. Layer 2 still
beats it, deliberately: a v2 build that renders something wrong on a particular machine can be put
back on v1 from DevTools, with no new build.

```js
__heliosPerf.gpuOn()    // v2, then reload the scenario
__heliosPerf.gpuOff()   // v1
```

Anything other than an explicit `"v2"` means v1 — a typo in the env file must not silently ship
the newer path. See [Environment variables](../reference/env.md).

## Packing is cancellable

Packing a whole scene is the longest read in the app — 228 MB on a 1000×1000 ground. Because it is
a Python loop rather than a single engine call, it **can** stop part-way, and it does: if the
client closes the connection, `pack_primitives_binary` raises `PackCancelled`.

The cancellation flag is checked every 2048 primitives (`_CANCEL_CHECK_EVERY`). Checking per
primitive would put an `Event.is_set()` call in the innermost loop of the hottest path; every 2048
bounds the wasted work at well under a millisecond while costing nothing measurable.

## UVs: empty is a meaning, not a gap

In the engine, an empty UV on a textured primitive is a **valid state** meaning "stretch the whole
image across this shape". Texture and UVs live in two different places — `getTextureFile` reads
the *material*, `getTextureUV` reads the *primitive*. So a colour-mode ground built by
`addTileObject` (no texture file, hence no UVs) that later gets a textured material through its
label is textured with no UVs, and that is normal.

The v2 wire format cannot express it — the reader requires `vertexCount * 8` bytes of UV whenever
the texture path is non-empty. `_default_uvs()` in `app/services/geometry_pack.py` therefore emits
the full-image quad, saying the same thing the engine means. For vertex counts with no obvious
full-image mapping it returns `None`, and the caller declares no texture at all rather than emit a
buffer that cannot be read.

## Related

- [Materials & textures](materials.md) — what gets assigned to these objects.
- [The Helios context](context.md) — where the primitives actually live.
