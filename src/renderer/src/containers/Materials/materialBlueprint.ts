import type { CatalogPropertyDatatype, MaterialTypeDef } from 'containers/ProjectScreen/types'
// Reuse the Geometry form's property-name humanizer so labels read the same
// across both right-panel forms ("surface_albedo" → "Surface Albedo").
import { humanizeProperty } from 'containers/Geometry/propertyBlueprint'
import messages from './messages'

// ── Material Properties-form blueprint ───────────────────────────────────────
//
// The material-types catalog (state.projectScreen.catalog.materialTypes) gives
// each material type a FLAT list of properties, every one tagged with a `group`
// (e.g. "model" | "visualisation"). The right-panel Material Properties form
// renders those as "Parameter Groups": the Select dropdown lists the distinct
// groups contributed by the material types the user has added, and picking one
// shows that group's fields.
//
// This mirrors Geometry's propertyBlueprint (the catalog stays the source of
// truth; this layer only decides grouping + labels), but material grouping is
// data-driven from the catalog's own `group` tag rather than a hand-written map.

// One editable material field, joined from its catalog property definition.
export interface ResolvedMaterialField {
  property: string
  label: string
  datatype: CatalogPropertyDatatype
  description: string
  min: number | null
  max: number | null
  // Present only when datatype === 'enum' — drives the field's Select options.
  enumValues?: string[]
}

// A Parameter Group: one `group` tag and the fields tagged with it, in catalog
// display order, across every added material type.
export interface ResolvedParameterGroup {
  group: string
  // Display label for the group ("model" → "Model").
  label: string
  fields: ResolvedMaterialField[]
}

// Properties with no `group` tag fall under this catch-all so they still render.
const UNGROUPED = 'General'

const toResolvedField = (def: MaterialTypeDef['properties'][number]): ResolvedMaterialField => ({
  property: def.property,
  label: humanizeProperty(def.property),
  datatype: def.datatype,
  description: def.description,
  min: def.min,
  max: def.max,
  enumValues: def.enum_values
})

// Merge the added material types into ordered Parameter Groups. Groups appear in
// first-seen order; fields keep the catalog's display order. A property shared by
// two added types is de-duplicated (first wins), so overlapping types don't
// render the same field twice.
export function resolveParameterGroups(types: MaterialTypeDef[]): ResolvedParameterGroup[] {
  const fieldsByGroup = new Map<string, ResolvedMaterialField[]>()
  const groupOrder: string[] = []
  const seenProperties = new Set<string>()

  for (const type of types) {
    const props = [...type.properties].sort((a, b) => a.display_order - b.display_order)
    for (const def of props) {
      if (seenProperties.has(def.property)) continue
      seenProperties.add(def.property)
      const group = def.group ?? UNGROUPED
      if (!fieldsByGroup.has(group)) {
        fieldsByGroup.set(group, [])
        groupOrder.push(group)
      }
      fieldsByGroup.get(group)!.push(toResolvedField(def))
    }
  }

  return groupOrder.map((group) => ({
    group,
    label: humanizeProperty(group),
    fields: fieldsByGroup.get(group) ?? []
  }))
}

// Validate one material property's committed value against its catalog metadata,
// mirroring the Geometry form's validateFieldValue. Returns an error message, or
// null when valid. Only numeric properties (float / integer) are range-checked;
// enum / boolean / file / date / time are chosen from controls that can't
// produce an invalid value, so they always pass. Every material property is
// optional, so an empty value is never an error.
export function validateMaterialFieldValue(
  field: ResolvedMaterialField,
  raw: string
): string | null {
  if (field.datatype !== 'float' && field.datatype !== 'integer') return null
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const num = Number(trimmed)
  if (!Number.isFinite(num)) return messages.fieldInvalid
  // Range before datatype: an out-of-range value (whole or not) shows the range;
  // only an in-range non-integer falls through to the datatype error.
  if ((field.min != null && num < field.min) || (field.max != null && num > field.max)) {
    return messages.valuesBetween(field.min, field.max)
  }
  // A non-integer in an integer field (e.g. an RGB channel) is a datatype error —
  // only whole numbers are supported for those parameters.
  if (field.datatype === 'integer' && !Number.isInteger(num)) return messages.fieldInvalid
  return null
}

// True when every field of the given resolved parameter groups passes validation
// for the current values — the field half of a card's Save gate.
export function isMaterialFormValid(
  groups: ResolvedParameterGroup[],
  values: Record<string, string>
): boolean {
  return groups.every((group) =>
    group.fields.every(
      (field) => validateMaterialFieldValue(field, values[field.property] ?? '') === null
    )
  )
}

// The form keeps every value as a string; the backend requires each property in
// its NATIVE JSON type (a number for float/integer, a boolean for boolean, a
// string for enum/date/time/file) and rejects a mistyped one with
// DATATYPE_MISMATCH. Convert a card's values against its material type's catalog
// definition, dropping the ones the user left blank. Shared by the add (POST) and
// update (PATCH) calls.
export function toNativeProperties(
  type: MaterialTypeDef,
  values: Record<string, string>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const def of type.properties) {
    const value = values[def.property]
    if (value === undefined || value === '') continue
    if (def.datatype === 'float' || def.datatype === 'integer') {
      const num = Number(value)
      // Save is gated on field validity, so this is already a finite, in-range
      // number; the guard just keeps a stray value out of the payload.
      if (!Number.isFinite(num)) continue
      out[def.property] = num
    } else if (def.datatype === 'boolean') {
      out[def.property] = value === 'true' || value === '1'
    } else {
      out[def.property] = value
    }
  }
  return out
}
