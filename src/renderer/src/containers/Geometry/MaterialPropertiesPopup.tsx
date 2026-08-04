import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import closeIcon from '@renderer/assets/close_button_white.svg'
import React from 'react'
import messages from './messages'

// One property of a material type: the catalog's label and the material's stored
// value. `value` is '' when the material never set it — the row is still listed,
// so the reader sees the type's full shape and which fields are still blank.
export interface MaterialDetailRow {
  property: string
  label: string
  value: string
  // When set, the row renders this image instead of its text value — used by the
  // visualisation-texture section to show the material's texture.
  image?: { src: string; alt: string }
}

// One catalog parameter group (the backend's `group` tag) within a material type.
export interface MaterialDetailGroup {
  group: string
  label: string
  rows: MaterialDetailRow[]
  // Lay the rows out full-width (one per line) instead of the default two-column
  // grid — used by the visualisation-texture section so the image + its label stack.
  singleColumn?: boolean
}

// One material type held by the material, with its parameter groups. Mirrors the
// editable form's structure so the two read the same — the type name here is the
// read-only stand-in for that form's material-type Select.
export interface MaterialDetailSection {
  typeId: number
  typeName: string
  groups: MaterialDetailGroup[]
}

interface MaterialPropertiesPopupProps {
  // The material's name — the popup's heading.
  name: string
  // One section per material type on the material; [] renders the empty state.
  sections: MaterialDetailSection[]
  // Fixed pixel height, set by the caller to size the popup against the 3D window.
  // The body scrolls inside, so a material with many parameter groups scrolls
  // rather than overflowing; a short material leaves empty space below (matching
  // the Figma's tall fixed panel). Omitted → content-hugging with a viewport cap.
  height?: number
  onClose: () => void
}

// Standalone fallback CAP (used only when no explicit `height` is given) — keeps
// the popup from running past the viewport when it's not caller-sized.
const DESIGN_MAX_HEIGHT = 866

// The "General" (ungrouped) bucket resolveParameterGroups puts catalog properties
// with no `group` tag under. It has no real heading in the design — its rows show
// directly under the material type — so we suppress the label for it.
const isUngrouped = (group: MaterialDetailGroup): boolean => group.group.toLowerCase() === 'general'

// The read-only material properties popup, opened by clicking an assigned material
// under the geometry form's Materials row. Presentational only: it takes its data
// and knows nothing about where it sits, so the caller owns the coords and the
// portal (the same split as SelectMaterialsPopup).
//
// Each material type is a collapsible section headed by the type's OWN name (e.g.
// "Stomatal Conductance") — the name IS the heading, so there is no separate
// "Material Type" row repeating it underneath. Expanded by default, collapsing to
// the header alone; open, it shows that type's property values (grouped by the
// catalog's `group` tag) in a two-column read-only grid.
//
// Read-only by construction: every value is a <dd>, never an input. Reusing the
// editable form's bordered input would say "type in me", and disabling it would
// say "you may not type in me yet" — both false. This is information, not a
// locked field, so the box goes away entirely.
export default function MaterialPropertiesPopup({
  name,
  sections,
  height,
  onClose
}: MaterialPropertiesPopupProps): React.JSX.Element {
  // Which type sections are COLLAPSED, by typeId. Empty = all expanded, so the
  // read-only material info opens fully expanded; the header toggles each closed.
  // Tracking the collapsed set (not the open set) keeps sections open by default
  // even when they load asynchronously after the popup mounts.
  const [collapsedTypeIds, setCollapsedTypeIds] = React.useState<Set<number>>(() => new Set())
  const toggle = (typeId: number): void =>
    setCollapsedTypeIds((prev) => {
      const next = new Set(prev)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      return next
    })

  return (
    <div
      role="dialog"
      aria-label={messages.materialDetailTitle(name)}
      // Inline, not a `max-h-[...]` / `h-[...]` class: the arbitrary value would
      // need underscore escaping (`min(866px,100vh_-_16px)`) to survive Tailwind's
      // parser, and it fails silently when it doesn't — leaving no sizing at all.
      // A caller-supplied fixed height wins (the popup is sized to the 3D window);
      // absent, it hugs content up to a viewport-bounded cap.
      style={
        height != null
          ? { height: `${height}px` }
          : { maxHeight: `min(${DESIGN_MAX_HEIGHT}px, 100vh - 16px)` }
      }
      // app-no-drag: this popup is portaled to <body> and can sit over the app's
      // `-webkit-app-region: drag` title bar, which otherwise swallows pointer
      // events — without this the close button (and every control) would go dead.
      className="app-no-drag flex w-[370px] flex-col overflow-hidden rounded-[8px] bg-[#313131] shadow-lg"
    >
      {/* Header — the material's name, pinned while the body scrolls. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-app-border px-4 py-3">
        <p className="min-w-0 truncate text-[13px] font-normal leading-[15px] text-neutral-300">
          {name}
        </p>
        <button
          type="button"
          aria-label={messages.materialDetailClose}
          onClick={onClose}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100"
        >
          <img src={closeIcon} alt="" aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>

      {/* Body — the only scrolling region, so a long material can't push the
          name out of view. */}
      <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sections.length === 0 ? (
          <p className="py-6 text-center text-[13px] leading-[18px] text-neutral-400">
            {messages.materialDetailEmpty}
          </p>
        ) : (
          sections.map((section) => {
            // The section's heading is the material type's own name — the popup
            // says WHICH type you're reading, not which slot it occupies.
            const title = section.typeName
            const open = !collapsedTypeIds.has(section.typeId)
            return (
              <div
                key={section.typeId}
                className="mb-2 rounded-[5px] border border-app-border last:mb-0"
              >
                {/* The whole header is the expand/collapse target. */}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(section.typeId)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-[13px] font-normal leading-[15px] text-neutral-200">
                    {title}
                  </span>
                  <img
                    src={chevronDown}
                    alt=""
                    aria-hidden="true"
                    className="h-1.5 w-auto transition-transform duration-150"
                    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                  />
                </button>

                {open && (
                  <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
                    {/* The type's parameters, grouped by their catalog `group`
                        tag; two columns, label over value, each value read-only. */}
                    {section.groups.map((group) => (
                      <div key={group.group} className="flex flex-col gap-2">
                        {!isUngrouped(group) && (
                          <p className="text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
                            {group.label}
                          </p>
                        )}
                        <dl
                          className={`grid gap-x-4 gap-y-3 ${
                            group.singleColumn ? 'grid-cols-1' : 'grid-cols-2'
                          }`}
                        >
                          {group.rows.map((row) => (
                            <div key={row.property} className="min-w-0">
                              <dt className="truncate text-[13px] leading-[18px] text-neutral-400">
                                {row.label}
                              </dt>
                              {row.image ? (
                                // The texture itself, served from /api/textures/serve
                                // (the same source the visualiser editor uses). Fixed
                                // 54×54 per the design; rotate/opacity are explicit
                                // no-op seams should a stored value ever exist.
                                //
                                // `contain`, not `cover`. The box is square but
                                // textures rarely are, and `cover` fills it by
                                // centre-cropping: a 2.6:1 logo showed only its
                                // middle third, both ends clipped away with nothing
                                // to suggest the picture continued. `contain` fits
                                // the whole image and letterboxes the leftover space,
                                // so the preview is always the complete texture —
                                // matching TextureSelector's own preview, so the
                                // read-only view and the editor agree.
                                <dd className="mt-0.5">
                                  <img
                                    src={row.image.src}
                                    alt={row.image.alt}
                                    className="rounded-sm"
                                    style={{
                                      width: 54,
                                      height: 54,
                                      transform: 'rotate(0deg)',
                                      opacity: 1,
                                      objectFit: 'contain'
                                    }}
                                  />
                                </dd>
                              ) : (
                                <dd className="mt-0.5 break-words text-[13px] leading-[18px] text-white">
                                  {row.value}
                                </dd>
                              )}
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
