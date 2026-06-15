import type {
  CatalogPropertyDatatype,
  CatalogPropertyDef,
  ObjectTypeDef
} from 'containers/ProjectScreen/types'

// ── Properties-form blueprint ────────────────────────────────────────────────
//
// The object-types catalog (state.projectScreen.catalog.objectTypes) gives us a
// FLAT, ordered list of a Ground's properties — length, breadth, resolution_x,
// position_x/y/z, rotation_z, texture_x/y … — each with its datatype, min, max
// and `required` flag. That's enough to validate, but not to lay out: the
// right-panel Properties form groups those raw properties under headings
// ("Position"), gives each a short field label ("X"), and packs N fields per row.
//
// This blueprint is that PRESENTATION layer. The catalog stays the source of
// truth for validation; the blueprint only decides grouping + labels + columns.
// Keeping it separate means a backend property change reshapes validation
// automatically, while layout stays intentional. Add an object type here (keyed
// by its catalog `object` name) to give it a form.

// One editable field. `property` binds to a catalog property by name (e.g.
// 'position_x'); `label` is the short in-field label shown to the user (e.g.
// 'X'). Omit `label` to derive it from the property name.
export interface FormFieldBlueprint {
  property: string
  label?: string
  // Seed value the create form opens with (e.g. Position "0", Resolution "1",
  // Ground Size "10"). Omit for fields the user must fill themselves.
  defaultValue?: string
}

// A labeled group of fields rendered together under one heading. `columns` is
// how many fields sit on a single row before wrapping — 1 (Rotation), 2 (Ground
// Size), 3 (Position), and 4+ for future object types. `heading` is the group
// label; omit for an unlabeled group.
//
// `invalidMessage` is the single error string shown for ANY invalid (non-empty)
// value in the group's fields — non-numeric, out-of-range, or negative all map
// to this one message, matching the spec's per-field copy. `{min}` / `{max}`
// tokens are interpolated from each field's catalog range at resolve time (so
// "between {min}-{max}" becomes "between 1-25000"). Omit it to fall back to the
// generic per-reason messages (Must be a number / Min N / Max N).
export interface FormGroupBlueprint {
  heading?: string
  columns: number
  invalidMessage?: string
  fields: FormFieldBlueprint[]
}

// The whole form for one object type, as an ordered list of groups.
export type ObjectFormBlueprint = FormGroupBlueprint[]

// Mirrors the Properties mockup for a Ground:
//   Ground Size      Length | Breadth                 (2/row)
//   Ground Resolution Width  | Height                  (2/row, ← resolution_x/y)
//   Position         X | Y | Z                         (3/row)
//   Rotation         degree                            (1/row)
//   Number of Tiles  R | C                             (2/row, ← texture_x/y)
// "Select Material" and "Save" are form chrome, not catalog properties, so they
// live in the form component — not here.
export const GROUND_FORM_BLUEPRINT: ObjectFormBlueprint = [
  {
    heading: 'Ground Size',
    columns: 2,
    invalidMessage: 'Invalid Input',
    fields: [
      { property: 'length', label: 'Length', defaultValue: '10' },
      { property: 'breadth', label: 'Breadth', defaultValue: '10' }
    ]
  },
  {
    heading: 'Ground Resolution',
    columns: 2,
    invalidMessage: 'Values should be between {min}-{max}',
    fields: [
      { property: 'resolution_x', label: 'Width', defaultValue: '1' },
      { property: 'resolution_y', label: 'Height', defaultValue: '1' }
    ]
  },
  {
    heading: 'Position',
    columns: 3,
    invalidMessage: 'Invalid Input',
    fields: [
      { property: 'position_x', label: 'X', defaultValue: '0' },
      { property: 'position_y', label: 'Y', defaultValue: '0' },
      { property: 'position_z', label: 'Z', defaultValue: '0' }
    ]
  },
  {
    heading: 'Rotation',
    columns: 1,
    invalidMessage: 'Values should be between {min}-{max}',
    fields: [{ property: 'rotation_z', label: 'degree', defaultValue: '0' }]
  },
  {
    heading: 'Number of Tiles',
    columns: 2,
    invalidMessage: 'Invalid Input',
    fields: [
      { property: 'texture_x', label: 'R', defaultValue: '1' },
      { property: 'texture_y', label: 'C', defaultValue: '1' }
    ]
  }
]

// Registry keyed by the catalog's `object` name. The Crop object type has no
// properties yet, so it has no blueprint (an object type with no entry renders
// no fields — see resolveObjectForm).
export const OBJECT_FORM_BLUEPRINTS: Record<string, ObjectFormBlueprint> = {
  Ground: GROUND_FORM_BLUEPRINT
}

// ── Resolution: blueprint × catalog → render-ready form ──────────────────────

// A blueprint field joined with its catalog metadata — everything the form
// needs to render one input AND validate it (no second catalog lookup).
export interface ResolvedFormField {
  property: string
  label: string
  propertyTypeId: number
  datatype: CatalogPropertyDatatype
  description: string
  min: number | null
  max: number | null
  required: boolean
  // Group-level error copy with `{min}`/`{max}` already interpolated for this
  // field's range. Shown for any invalid non-empty value; undefined falls back
  // to the generic per-reason messages.
  invalidMessage?: string
  // Seed value the form opens with (from the blueprint); undefined = blank.
  defaultValue?: string
}

export interface ResolvedFormGroup {
  heading?: string
  columns: number
  fields: ResolvedFormField[]
}

export interface ResolvedObjectForm {
  groups: ResolvedFormGroup[]
  // Catalog properties the blueprint never referenced. A forward-compat signal:
  // if the backend adds a property and the blueprint isn't updated, it surfaces
  // here (and, when appendUnmapped is on, still renders) instead of vanishing.
  unmappedProperties: string[]
}

// "resolution_x" → "Resolution X". Fallback label when a blueprint field omits
// one (or for auto-appended unmapped properties).
export function humanizeProperty(property: string): string {
  return property
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Fill `{min}` / `{max}` tokens in a group message from this field's range.
function interpolateRange(template: string, min: number | null, max: number | null): string {
  return template
    .replace(/\{min\}/g, min == null ? '' : String(min))
    .replace(/\{max\}/g, max == null ? '' : String(max))
}

const toResolvedField = (
  label: string,
  def: CatalogPropertyDef,
  invalidMessage?: string,
  defaultValue?: string
): ResolvedFormField => ({
  property: def.property,
  label,
  propertyTypeId: def.property_type_id,
  datatype: def.datatype,
  description: def.description,
  min: def.min,
  max: def.max,
  required: def.required ?? false,
  invalidMessage: invalidMessage ? interpolateRange(invalidMessage, def.min, def.max) : undefined,
  defaultValue
})

// Join a blueprint with the catalog definition for one object type. Fields whose
// property is absent from the catalog are skipped (stale blueprint entry);
// catalog properties absent from the blueprint are reported in
// `unmappedProperties` and, when `appendUnmapped` is true (default), rendered in
// a trailing 2-column group so nothing is silently dropped.
export function resolveObjectForm(
  objectType: ObjectTypeDef | undefined,
  blueprint: ObjectFormBlueprint | undefined,
  options: { appendUnmapped?: boolean; appendColumns?: number } = {}
): ResolvedObjectForm {
  const { appendUnmapped = true, appendColumns = 2 } = options
  if (!objectType) return { groups: [], unmappedProperties: [] }

  const defByProperty = new Map<string, CatalogPropertyDef>()
  for (const def of objectType.properties) defByProperty.set(def.property, def)

  const used = new Set<string>()
  const groups: ResolvedFormGroup[] = []

  for (const group of blueprint ?? []) {
    const fields: ResolvedFormField[] = []
    for (const field of group.fields) {
      const def = defByProperty.get(field.property)
      if (!def) continue // blueprint references a property the catalog doesn't have
      used.add(field.property)
      fields.push(
        toResolvedField(
          field.label ?? humanizeProperty(field.property),
          def,
          group.invalidMessage,
          field.defaultValue
        )
      )
    }
    // Drop a group that ended up with no resolvable fields.
    if (fields.length > 0) groups.push({ heading: group.heading, columns: group.columns, fields })
  }

  // Leftover catalog properties, in the catalog's own display order.
  const unmapped = [...objectType.properties]
    .filter((def) => !used.has(def.property))
    .sort((a, b) => a.display_order - b.display_order)

  if (appendUnmapped && unmapped.length > 0) {
    groups.push({
      columns: appendColumns,
      fields: unmapped.map((def) => toResolvedField(humanizeProperty(def.property), def))
    })
  }

  return { groups, unmappedProperties: unmapped.map((def) => def.property) }
}

// Convenience: resolve straight from a catalog object type using its registered
// blueprint. Returns an empty form for object types without one (e.g. Crop).
export function resolveObjectFormByType(
  objectType: ObjectTypeDef | undefined
): ResolvedObjectForm {
  if (!objectType) return { groups: [], unmappedProperties: [] }
  return resolveObjectForm(objectType, OBJECT_FORM_BLUEPRINTS[objectType.object])
}

// The seed values a new object is created with for an object type — the
// blueprint defaults (Ground Size 10×10, Resolution 1×1, Position 0,0,0,
// Rotation 0, Tiles 1×1), keyed by catalog property name. Fields without a
// default are omitted. Empty object when the type has no blueprint or defaults.
export function defaultValuesForObject(
  objectType: ObjectTypeDef | undefined
): Record<string, string> {
  const { groups } = resolveObjectFormByType(objectType)
  const values: Record<string, string> = {}
  for (const group of groups) {
    for (const field of group.fields) {
      if (field.defaultValue != null) values[field.property] = field.defaultValue
    }
  }
  return values
}

// Uniform empty-required copy across the app's forms (matches the spec image).
export const REQUIRED_MESSAGE = 'Required Field'

// Validate one field's raw input against its catalog metadata. Returns an error
// message, or null when valid. Empty is an error only for required fields.
//
// When the field carries a group `invalidMessage`, every non-empty failure
// (non-numeric, wrong datatype, out-of-range) collapses to that single message
// — the spec shows one error string per field. Fields without custom copy fall
// back to the granular per-reason messages.
export function validateFieldValue(field: ResolvedFormField, raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return field.required ? REQUIRED_MESSAGE : null

  const invalid = field.invalidMessage
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return invalid ?? 'Must be a number'
  if (field.datatype === 'integer' && !Number.isInteger(num)) {
    return invalid ?? 'Must be a whole number'
  }
  if (field.min != null && num < field.min) return invalid ?? `Min ${field.min}`
  if (field.max != null && num > field.max) return invalid ?? `Max ${field.max}`
  return null
}

// True when every field in the resolved form passes validation for the given
// values — the Save gate.
export function isObjectFormValid(
  groups: ResolvedFormGroup[],
  values: Record<string, string>
): boolean {
  return groups.every((group) =>
    group.fields.every((field) => validateFieldValue(field, values[field.property] ?? '') === null)
  )
}
