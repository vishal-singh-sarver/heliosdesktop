import type { CatalogPropertyDatatype, MaterialTypeDef } from 'containers/ProjectScreen/types'
// Reuse the Geometry form's property-name humanizer so labels read the same
// across both right-panel forms ("surface_albedo" → "Surface Albedo").
import { humanizeProperty } from 'containers/Geometry/propertyBlueprint'

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
