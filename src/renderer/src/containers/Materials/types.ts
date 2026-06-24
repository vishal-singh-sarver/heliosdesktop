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
