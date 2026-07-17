// Domain types — imported by both actions.ts and reducer.ts to avoid circular deps.

// Visualisation preview (the colour swatch the list shows). Mirrors the group
// list response's `preview` block.
export interface MaterialPreview {
  colorR: number
  colorG: number
  colorB: number
  textureFile: string | null
}

// One material (backend GROUP) in the library. Every row is persisted — a
// material is created on the backend the moment +Add Materials is clicked, so
// there are no client-only placeholder rows. `visible` is a client-only viewport
// flag driving the eye icon (the backend has no material-visibility concept).
export interface Material {
  id: string
  name: string
  materialTypeId: number
  materialType: string
  preview: MaterialPreview | null
  createdAt: string
  visible: boolean
}

// Property values in the native JSON types the backend expects — numbers for
// float/integer, booleans for boolean, strings for enum/date/time/file. A
// mistyped value (e.g. the string "55" for a numeric property) is rejected with
// DATATYPE_MISMATCH, so conversion happens before every add/update call.
export type MaterialPropertyValues = Record<string, string | number | boolean>

// One "Parameter Group.0N" card in the material Properties form: ONE material
// type plus the property values entered for it. Each card saves itself —
// `saved` decides whether Save adds the type to the group (POST) or updates it
// (PATCH), and whether Delete removes it on the backend or just drops the card.
export interface MaterialParameterGroup {
  // Stable client key (React keys + targeted updates), not a catalog id.
  id: number
  // The display number in the "Parameter Group.0N" title, assigned at creation
  // via the lowest-free-N (gap-filling) rule — the same scheme as Geometry's
  // Ground.NNN, so removing a card frees its number for reuse.
  number: number
  // The catalog material type picked in this card's Select (e.g. Radiation=1);
  // null until the user chooses one. Locked once the card is saved (the backend
  // keys the member by material_type_id).
  typeId: number | null
  // This card's own property values, keyed by catalog property name. Per-card
  // (not shared across the draft) so two types exposing the same property don't
  // overwrite each other, and so each card has its own save payload.
  values: Record<string, string>
  // The values as they stand on the backend — set when the card is loaded from a
  // saved member and re-snapshotted on every successful save. Save compares
  // against it so a card can't be re-saved unchanged, exactly like the Geometry
  // form's baseline. null until the card has ever been saved, which makes any
  // complete state count as a change.
  savedValues: Record<string, string> | null
  // Has this material type been persisted onto the group? POST on first save,
  // PATCH afterwards.
  saved: boolean
  saveStatus: 'idle' | 'saving' | 'error'
  saveError: string | null
}

// One member of a fetched group (GET /library/groups/{id}): a material type and
// the property values stored for it, as strings ready for the form inputs.
export interface MaterialGroupMemberDetail {
  materialTypeId: number
  properties: Record<string, string>
}

// A fetched group's full detail — populates the right-panel Properties form when
// a saved material row is opened.
export interface MaterialGroupDetail {
  id: string
  name: string
  members: MaterialGroupMemberDetail[]
}

// Right-panel material Properties draft — the ONE material open in the form. The
// material always exists on the backend (created empty by +Add Materials), so the
// draft carries its real `groupId`; the cards are then added/updated/removed
// against it one at a time.
export interface MaterialDraft {
  groupId: string
  name: string
  // The "Parameter Group.0N" cards, in add order.
  groups: MaterialParameterGroup[]
  // Monotonic id source for new cards (so ids stay stable as cards come and go).
  nextGroupId: number
}
