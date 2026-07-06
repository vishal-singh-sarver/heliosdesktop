// Domain types — imported by both actions.ts and reducer.ts to avoid circular deps.

// Visualisation preview (the colour swatch the list shows). Mirrors the §7.2
// list response's `preview` block.
export interface MaterialPreview {
  colorR: number
  colorG: number
  colorB: number
  textureFile: string | null
}

// One material in the project library (§7). Persisted materials come from
// GET .../library and carry a backend integer `id` (kept as a string here).
// `visible` is a client-only viewport-visibility flag driving the eye icon (the
// backend has no material-visibility concept). `local` marks an unsaved row
// added via +Add before the create-form flow exists — it vanishes on the next
// list refresh (it was never persisted).
export interface Material {
  id: string
  name: string
  materialTypeId: number
  materialType: string
  preview: MaterialPreview | null
  createdAt: string
  visible: boolean
  local: boolean
}

// Right-panel material Properties draft — the ONE material open in the
// properties form (mirrors Geometry's CreateDraft). +Add Materials opens this;
// it's local-only for now (Save Material is disabled until the create-form flow
// §7.1 lands), so the draft just holds the material types the user has added and
// the per-property values they've entered.
export interface MaterialDraft {
  // The (client-only) material row this draft edits — `local-<name>`.
  materialId: string
  name: string
  // The material type staged in the "Parameter Groups" Select but not yet added
  // (the id of a catalog material type, e.g. Radiation=1); null when nothing is
  // picked. "+ Add Material Type" commits this into `addedTypeIds`.
  pendingTypeId: number | null
  // Material types added via "+ Add Material Type", in add order. Each renders as
  // a parameter-group block of that catalog type's properties.
  addedTypeIds: number[]
  // Per-property values the user has entered, keyed by catalog property name.
  values: Record<string, string>
}
