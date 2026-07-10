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

// One "Parameter Group.0N" block in the material Properties form: a material
// type chosen from that group's Select, rendered as its catalog properties. The
// `id` is a stable, per-draft key (for React keys and targeted updates), not a
// catalog id.
export interface MaterialParameterGroup {
  id: number
  // The display number in the "Parameter Group.0N" title, assigned at creation
  // via the lowest-free-N (gap-filling) rule — the same scheme as Geometry's
  // Ground.NNN / Material.NNN, so removing a group frees its number for reuse.
  number: number
  // The catalog material type picked in this group's Select (e.g. Radiation=1);
  // null until the user chooses one.
  typeId: number | null
}

// One member of a Create-Group request: a material type plus the property
// values the user entered for it. Mirrors the backend `GroupMaterialIn`
// (POST /api/materials/library/groups → `materials[]`).
export interface MaterialMemberInput {
  materialTypeId: number
  properties: Record<string, string>
}

// Payload for persisting the right-panel draft as a global material GROUP
// (POST /api/materials/library/groups). `projectId`/`scenarioId` are creation
// provenance only — groups are global, not scoped to a project.
export interface SaveMaterialInput {
  projectId: string
  scenarioId: string | null
  name: string
  materials: MaterialMemberInput[]
}

// Right-panel material Properties draft — the ONE material open in the
// properties form (mirrors Geometry's CreateDraft). +Add Materials opens this;
// it's local-only for now (Save Material is disabled until the create-form flow
// §7.1 lands), so the draft just holds the parameter groups the user has added
// and the per-property values they've entered.
export interface MaterialDraft {
  // The (client-only) material row this draft edits — `local-<name>`.
  materialId: string
  name: string
  // The "Parameter Group.0N" blocks, in add order. "+ Add Material Type" appends
  // a new empty one; each renders its chosen type's properties.
  groups: MaterialParameterGroup[]
  // Monotonic id source for new groups (so ids stay stable as groups are added
  // and removed).
  nextGroupId: number
  // Per-property values the user has entered, keyed by catalog property name.
  values: Record<string, string>
}
