# Geometry & scene objects

The scene tree, the object properties form, and everything that turns a row into visible geometry.

The largest feature in the app: **7,361 lines** of renderer, **1,950** of backend service, **24
endpoints**.

## The three levels

| | What | Where |
|---|---|---|
| **Group** | A named folder of objects | `object_group` |
| **Object** | A user-facing scene item — a Ground | `scenario_object` + its EAV property rows |
| **Primitive** | The patches and triangles the engine stores | Only in the PyHelios context |

One object expands into many primitives. A 2000×2000 ground is one tree row and millions of
primitives. See [Geometry & primitives](../../concepts/primitives.md).

## Where the code lives

| Layer | File | Responsibility |
|---|---|---|
| Tree UI | `containers/Geometry/GeometryTree.tsx`, `TreeRow.tsx` | Rows, selection, drag and drop |
| Form | `containers/Geometry/ObjectPropertiesForm.tsx` | The right-panel properties form |
| Layout | `containers/Geometry/propertyBlueprint.ts` | Groups, labels, columns, seed values |
| Validation | `containers/Geometry/validation.ts` | Per-field rules from the catalog |
| Wire ↔ UI | `containers/Geometry/service.ts` | HTTP, tree merge, shape conversion |
| Effects | `containers/Geometry/saga.ts` | Every side effect |
| State | `containers/Geometry/reducer.ts`, `types.ts` | Scoped by `(projectId, scenarioId)` |
| Routes | `app/routers/scene_objects.py` | 24 endpoints under `/api/geometry/project/{p}/scenario/{s}` |
| Logic | `app/services/scene_object_service.py` | Validation, persistence, engine build |
| Catalog | `app/services/eav_validation.py` | Property definitions and validation |

## The tree is merged from two endpoints

`GET …/objects` and `GET …/groups` are fetched separately and merged by `mergeTree()`.

- **`member_ids` on the group is authoritative** for membership and child order — not the object's
  own `group_id`.
- A leaf whose `group_id` points at a group not in the list **falls back to the root**, so it can
  never disappear.
- Root rows are ordered by `created_at` ascending, matching the objects endpoint's own ordering.

### Group visibility is derived, never stored

A group carries no visibility of its own. Its state is the **union** of its members: a
viewport/render/model flag is on for the group if it is on for *any* member.

So the render icon stays on while any member is still rendered, and only goes off once every
member is off — which matches the cascade the reducer applies optimistically.

## Visibility: viewport is independent, render and models are coupled

This is the most surprising part of the model.

| Control | Column | Behaviour |
|---|---|---|
| Eye (viewport) | `scenario_object.visible` | **Independent.** Purely whether the viewport draws it |
| Render icon | `scenario_object.render_enabled` | **Master switch** over the top-level models |
| Per-model (right-click) | `scenario_object_model` | Granular overrides |

`_apply_visibility` applies them in a fixed order:

1. `render=true` enables **all** top-level models; `render=false` disables all.
2. An explicit `models` map then applies granular overrides.
3. `render_enabled` is **recomputed** as `OR(model states)` — so it always means "any model
   enabled".

!!! note "Absent row means enabled"
    `scenario_object_model` and `scenario_model` store only *explicit* settings. Effective
    participation of geometry G in model M is:

    ```
    scenario_model[M].enabled AND G.render_enabled AND G.models[M]
    ```

Toggles apply **optimistically** in the reducer, then a saga persists each via
`PATCH /objects/{id} { visibility }`. A failed PATCH dispatches `VISIBILITY_SYNC_FAILED`, which
reverts the optimistic flip — by field, and by `modelId` for a per-model revert.

## Creating

`+Ground` sends the blueprint defaults as the property payload and proposes the next name in the
`Ground.NNN` sequence.

Server-side, `create_object`:

1. Resolves scope, gets the context, hydrates.
2. Loads the type's property catalog — **400 `UNKNOWN_PROPERTY`** if the type has no catalog yet
   (this is what `Crop` hits).
3. Validates properties and cross-field rules.
4. Picks or validates the name — **409 `GEOMETRY_NAME_EXISTS`** on a clash.
5. Validates every requested material group **before writing anything**.
6. Writes the row, the intrinsic values, visibility, and the material assignments.
7. Builds the geometry.

!!! warning "A failed build compensates by deleting the row"
    If `_build` raises, the row is deleted and the error re-raised — a create whose build failed
    must not leave a DB-only object behind.

## Saving properties

The right-panel Save is a **PATCH** and it carries only what changed.

- `sameProperties()` compares against the values cached when the form opened, so a re-save of an
  unchanged ground sends **nothing**.
- `numericProperties()` drops blank fields and coerces the rest with `Number()`.
- **The name is not part of Save.** It has its own endpoint and commits on the name field's blur.

### Two concurrency guards

**Client:** `takeLeading` on create and update — a second dispatch while one is in flight is
ignored. The button is also disabled, and the handler returns early. All three are deliberate.

**Server:** `update_object` keeps a per-object sequence number. If a newer update for the same
object arrived while this one was getting to the write, this one returns the object as it stands
without writing:

```python
if _UPDATE_SEQ.get(object_id) != seq:
    return {"success": True, "object": serialize_object(...)}
```

Checked **before** the write, not before the rebuild — a superseded request that had already
written would put its older values over the newer ones.

### The engine can refuse, and the row must roll back

If `_apply_intrinsic_change` raises, the previous canonical values are written back.

!!! danger "Why leaving them would be worse than the error"
    Values the engine refused describe a geometry that can never be built — resolution 600 with a
    repeat of 1 exceeds the ground texture's pixel cap. Left in place, **every later hydration
    skips that object**: it stays listed by the API with no primitives behind it, which reads as a
    scenario that loaded "ready" into an empty viewport.

Whether an edit rebuilds or patches in place is covered in
[Scene build & hydration](../arch/scene-build.md#rebuild-or-patch-in-place).

## Assigning materials from the tree

Dropping a material onto a row is `POST …/objects/{id}/material-groups` with `{ group_id, sync }`.
Dropping onto a *group* fans out over its members, one call each.

The Save path distinguishes three cases, and the distinction matters:

| Case | Handling |
|---|---|
| **Add only** | The PATCH carries `materials` |
| **Replace** — a baseline group left *and* a new one arrived | The PATCH carries only the addition; the backend displaces the incumbent **in the same transaction**. Deleting client-side first would be a pre-commit: a PATCH refused for `RESOLUTION_TOO_HIGH` would leave the ground with **no material at all** |
| **Pure unassign** — a material left, nothing arriving | An explicit `DELETE`. The add-only PATCH body would be empty, so with no other edit no PATCH is sent at all and this DELETE is the only write that can remove it |

`isReplace` is keyed on `newMaterials` alone, never on `propsChanged` — a Save that resizes the
ground *and* swaps its material is still a replace.

See [Materials, assignment & sync](materials.md).

## Names

- 20 characters maximum, non-empty after stripping, no control characters.
- Case-insensitively unique **per project** (`idx_scenario_object_project_name_ci`).
- Auto-numbered `Ground.001`, `Group.001` by `next_default_name`.

The control-character check is load-bearing: `str.strip()` leaves a NUL in place and Python counts
it, but SQLite's `length()` stops at the first NUL — so `"\x00abc"` would pass a naive length check
and then die on the `CHECK` constraint, surfacing as a bogus "name already exists".

## Getting geometry to the viewport

| Endpoint | Returns |
|---|---|
| `GET …/objects/{id}/geometry/binary` | One object, wire format v1 |
| `GET …/objects/{id}/geometry/gpu` | One object, wire format v2 |
| `GET …/geometry/binary` | **The whole scene** — hydrates, and is the first viewport load |

The whole-scene route is the longest read in the app and stops packing when the client goes away.
See [Geometry & primitives](../../concepts/primitives.md) for the formats.

## Saga effects

| Action | Effect | Why |
|---|---|---|
| `LIST_NODES` | `takeLatest` | A stale tree must not overwrite a newer one |
| `LOAD_OBJECT` | `takeLatest` | Same |
| `CREATE_OBJECT`, `UPDATE_OBJECT` | `takeLeading` | Double-tap guard |
| Renames, deletes, moves, toggles, assignments | `takeEvery` | Independent per row |

## Changing this feature

- **New object type?** [Add an object type](../recipes/add-object-type.md) — five touch points.
- **New property?** [Add a property](../recipes/add-property.md).
- **Changing the form layout?** `propertyBlueprint.ts` only; validation follows the catalog.
- **Touching visibility?** Keep the three-step order in `_apply_visibility`, and keep the
  optimistic revert.

## Tests

`containers/Geometry/tests/` — `mergeTree` and `wireObjectToNode` are pure and directly testable;
the saga tests cover the replace-versus-unassign branching. Backend coverage is in
`helios-desktop-backend/tests/`.

## Related

- [Scene build & hydration](../arch/scene-build.md) — what happens after the row is written.
- [The property system](../arch/properties.md) — where the form comes from.
- [Materials, assignment & sync](materials.md).
