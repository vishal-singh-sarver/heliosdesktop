import closeIcon from '@renderer/assets/close.svg'
import React from 'react'
import messages from './messages'

// One property of a material type: the catalog's label and the material's stored
// value. `value` is '' when the material never set it — the row is still listed,
// so the reader sees the type's full shape and which fields are still blank.
export interface MaterialDetailRow {
  property: string
  label: string
  value: string
}

// One catalog parameter group (the backend's `group` tag) within a material type.
export interface MaterialDetailGroup {
  group: string
  label: string
  rows: MaterialDetailRow[]
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
  onClose: () => void
}

// The read-only material properties popup, opened by clicking a picked material
// under the geometry form's Materials row. Presentational only: it takes its
// data and knows nothing about where it sits, so the caller owns the coords and
// the portal (the same split as SelectMaterialsPopup).
//
// 370 wide; 866 tall is a CAP, not a fixed height — on a short window it shrinks
// to the viewport and the body scrolls, so it can never run off-screen.
//
// Read-only by construction: every value is a <dd>, never an input. Reusing the
// editable form's bordered input would say "type in me", and disabling it would
// say "you may not type in me yet" — both false. This is information, not a
// locked field, so the box goes away entirely.
export default function MaterialPropertiesPopup({
  name,
  sections,
  onClose
}: MaterialPropertiesPopupProps): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-label={messages.materialDetailTitle(name)}
      // Inline, not a `max-h-[...]` class: the arbitrary value would need
      // underscore escaping (`min(866px,100vh_-_16px)`) to survive Tailwind's
      // parser, and it fails silently when it doesn't — leaving no cap at all.
      style={{ maxHeight: 'min(866px, 100vh - 16px)' }}
      className="flex w-[370px] flex-col overflow-hidden rounded-[8px] bg-[#313131] shadow-lg"
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
      <div className="scrollbar-custom-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {sections.length === 0 ? (
          <p className="py-6 text-center text-[13px] leading-[18px] text-neutral-400">
            {messages.materialDetailEmpty}
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.typeId} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[13px] font-medium leading-[20px] text-white">
                {section.typeName}
              </h3>

              {section.groups.map((group) => (
                <div key={group.group} className="mb-3 last:mb-0">
                  <p className="mb-1 text-[13px] font-medium leading-[20px] text-[#D3D3D3]">
                    {group.label}
                  </p>
                  {/* <dl> pairs each property with its value, which is what lets
                      an unset one render as a genuinely empty <dd> that is still
                      locatable from its <dt>. */}
                  <dl className="flex flex-col">
                    {group.rows.map((row) => (
                      <div
                        key={row.property}
                        className="flex items-start justify-between gap-3 py-1.5"
                      >
                        <dt className="min-w-0 text-[13px] leading-[18px] text-neutral-400">
                          {row.label}
                        </dt>
                        <dd className="min-w-0 break-words text-right text-[13px] leading-[18px] text-white">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
