import addIcon from '@renderer/assets/add.svg'
import chevronDown from '@renderer/assets/ChevronDownIcon.svg'
import deleteIcon from '@renderer/assets/delete.svg'
import pencilIcon from '@renderer/assets/pencil.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import { selectActiveProjectId, selectAllMaterialTypes } from 'containers/ProjectScreen/selectors'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import {
  addParameterGroup,
  closeMaterialDraft,
  removeMaterial,
  removeParameterGroup,
  renameMaterialRequested,
  setMaterialDraftName,
  setMaterialDraftValue,
  setParameterGroupType
} from './actions'
import { resolveParameterGroups } from './materialBlueprint'
import messages from './messages'
import reducer from './reducer'
import saga from './saga'
import { selectMaterialDraft, selectMaterialDraftNonce } from './selectors'
import type { MaterialDraft, MaterialParameterGroup } from './types'

// The right-panel Properties form for a material: +Add Materials opens this
// populated with one empty "Parameter Group.01" box, a "+ Add Material Type"
// button and a (disabled) "Save Material" button — the mockup's initial state.
// Each parameter group has its own Select listing every material type from the
// catalog (/api/catalog/material-types); picking one renders that type's
// parameters (grouped by their `group` tag) inside the box. "+ Add Material
// Type" appends another numbered group. Everything is client-side for now (Save
// is disabled until the create-form persist flow lands). Injects the materials
// slice so it works mounted in the RightPanel independently of the LeftPanel's
// <Materials />. Renders nothing when there is no active material draft. Keyed by
// the open-nonce so local state resets when a different material opens. Mirrors
// Geometry's ObjectPropertiesForm.
export function MaterialPropertiesForm(): React.JSX.Element | null {
  useInjectReducer({ key: 'materials', reducer: reducer as Reducer })
  useInjectSaga({ key: 'materials', saga })

  const draft = useSelector(selectMaterialDraft)
  const draftNonce = useSelector(selectMaterialDraftNonce)
  if (!draft) return null
  return <MaterialDraftForm key={draftNonce} draft={draft} />
}

function MaterialDraftForm({ draft }: { draft: MaterialDraft }): React.JSX.Element {
  const dispatch = useDispatch()
  const projectId = useSelector(selectActiveProjectId)
  const materialTypes = useSelector(selectAllMaterialTypes)

  // The name is read-only until the pencil is tapped (matches the Geometry
  // object form); the delete confirmation lives here too.
  const [nameEditing, setNameEditing] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  // Which parameter-group boxes are expanded (by group id). Adding a new group
  // collapses the others so only the new box is open; manual toggles still allow
  // several open at once.
  const [openGroupIds, setOpenGroupIds] = React.useState<Set<number>>(
    () => new Set(draft.groups.map((g) => g.id))
  )
  const nameInputRef = React.useRef<HTMLInputElement>(null)

  const toggleGroup = (id: number): void => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onAddGroup = (): void => {
    // The appended group takes the draft's current nextGroupId; open only it so
    // the groups above collapse.
    const newId = draft.nextGroupId
    dispatch(addParameterGroup())
    setOpenGroupIds(new Set([newId]))
  }

  // Focus the name field the moment the pencil unlocks it.
  React.useEffect(() => {
    if (nameEditing) nameInputRef.current?.focus()
  }, [nameEditing])

  // Every catalog material type, by name — each parameter group's Select options.
  const typeOptions = materialTypes.map((t) => ({ value: String(t.id), label: t.materialtype }))

  const handleNameChange = (next: string): void => {
    dispatch(setMaterialDraftName(next))
  }

  const handleNameBlur = (): void => {
    setNameEditing(false)
    const next = draft.name.trim()
    // Local rows rename client-side (the saga short-circuits `local-*` ids). Only
    // commit a non-empty, actually-changed name.
    if (projectId && next !== '' && next !== draft.materialId.replace(/^local-/, '')) {
      dispatch(renameMaterialRequested(projectId, draft.materialId, draft.name))
    }
  }

  const performDelete = (): void => {
    dispatch(removeMaterial(draft.materialId))
    setConfirmDeleteOpen(false)
    dispatch(closeMaterialDraft())
  }

  return (
    // Full-height column: a static name header, the Parameter Groups box that
    // fills the space and scrolls its own fields, and a static footer holding
    // the +Add Material Type and Save Material buttons.
    <div className="flex h-full flex-col gap-2.5">
      {/* Header: material name with a pencil (unlock to rename) and a trash
          (delete). The name is read-only until the pencil is tapped. */}
      <div className="flex shrink-0 items-center gap-1">
        <input
          ref={nameInputRef}
          aria-label="Material name"
          value={draft.name}
          readOnly={!nameEditing}
          onChange={(e) => handleNameChange(e.target.value)}
          onDoubleClick={() => setNameEditing(true)}
          onBlur={handleNameBlur}
          className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 outline-none ${
            !nameEditing ? 'cursor-default ' : ''
          }${nameEditing ? 'border-neutral-500' : 'border-transparent hover:border-app-border'}`}
        />
        <button
          type="button"
          aria-label="Edit name"
          onClick={() => setNameEditing(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={pencilIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Delete material"
          onClick={() => setConfirmDeleteOpen(true)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-neutral-700/50"
        >
          <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {/* The numbered "Parameter Group.0N" boxes, scrolling as a group so they
          all stay above the footer; each box hugs its own content. */}
      <div className="scrollbar-custom-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {draft.groups.map((group) => (
          <ParameterGroupCard
            key={group.id}
            group={group}
            typeOptions={typeOptions}
            materialTypes={materialTypes}
            values={draft.values}
            open={openGroupIds.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            onSelectType={(typeId) => dispatch(setParameterGroupType(group.id, typeId))}
            onRemove={() => dispatch(removeParameterGroup(group.id))}
            onChangeValue={(property, value) => dispatch(setMaterialDraftValue(property, value))}
          />
        ))}
      </div>

      {/* Footer — pinned to the bottom of the panel: +Add Material Type appends a
          new parameter group; Save Material is disabled until the persist flow
          lands (#2A2A2A fill, #424242 border, #6B6B6B text). */}
      <div className="flex shrink-0 flex-col gap-2.5">
        <button
          type="button"
          onClick={onAddGroup}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded border border-app-border bg-white text-sm font-medium text-black hover:opacity-90"
        >
          <img src={addIcon} alt="" aria-hidden="true" className="h-4 w-4 [filter:brightness(0)]" />
          {messages.addMaterialType}
        </button>
        <button
          type="button"
          disabled
          className="flex h-[38px] w-full items-center justify-center gap-1 rounded border border-app-border bg-blue-600 px-2.5 py-[5px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-[#424242] disabled:bg-[#2A2A2A] disabled:text-[#6B6B6B]"
        >
          {messages.saveMaterial}
        </button>
      </div>

      {/* Delete confirmation. */}
      <Dialog
        isOpen={confirmDeleteOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <h3 className="text-base font-medium text-white">{messages.deleteHeading(draft.name)}</h3>
        <p className="text-sm text-neutral-400">{messages.deleteBody}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.deleteCancel}
          </button>
          <button
            type="button"
            onClick={performDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteConfirm}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

// One "Parameter Group.0N" box: a collapsible card with its own material-type
// Select and, once a type is chosen, that type's parameters (grouped by their
// catalog `group` tag). Its own open/closed state is local. `index` drives the
// numbered title; the box hugs its content so several stack in the scroll region.
function ParameterGroupCard({
  group,
  typeOptions,
  materialTypes,
  values,
  open,
  onToggle,
  onSelectType,
  onRemove,
  onChangeValue
}: {
  group: MaterialParameterGroup
  typeOptions: { value: string; label: string }[]
  materialTypes: MaterialTypeDef[]
  values: Record<string, string>
  open: boolean
  onToggle: () => void
  onSelectType: (typeId: number | null) => void
  onRemove: () => void
  onChangeValue: (property: string, value: string) => void
}): React.JSX.Element {
  const type = materialTypes.find((t) => t.id === group.typeId) ?? null
  const parameterGroups = type ? resolveParameterGroups([type]) : []
  // Gap-filled number stored on the group at creation (like Ground.NNN).
  const title = messages.parameterGroupTitle(group.number)

  return (
    <div className="flex shrink-0 flex-col rounded-[5px] border border-app-border">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="flex items-center gap-2 text-[13px] font-normal leading-[15px] text-neutral-200">
          {title}
          <button
            type="button"
            aria-label={`Remove ${title}`}
            onClick={onRemove}
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100"
          >
            <img src={deleteIcon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Toggle ${title}`}
          onClick={onToggle}
          className="mr-1 flex h-5 w-5 items-center justify-center"
        >
          <img
            src={chevronDown}
            alt=""
            aria-hidden="true"
            className="h-1.5 w-auto transition-transform duration-150"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-2.5 px-3 pb-2.5">
          <MaterialTypeSelect
            options={typeOptions}
            value={group.typeId == null ? '' : String(group.typeId)}
            placeholder={messages.selectPlaceholder}
            ariaLabel={title}
            onChange={(v) => onSelectType(v === '' ? null : Number(v))}
          />

          {/* The chosen type's parameters, grouped by their catalog `group` tag. */}
          {parameterGroups.map((pg) => (
            <div key={pg.group} className="flex flex-col gap-2">
              <p className="text-[13px] font-medium leading-[20px] text-[#D3D3D3]">{pg.label}</p>
              {pg.fields.map((field) => (
                <FormField
                  key={field.property}
                  labelProps={{ label: field.label, optional: true, helpText: field.description }}
                  inputProps={{
                    name: `${group.id}-${field.property}`,
                    value: values[field.property] ?? '',
                    placeholder: field.label,
                    inputClassName: 'bg-[#121212]',
                    options:
                      field.datatype === 'enum' && field.enumValues
                        ? field.enumValues.map((v) => ({ value: v, label: v }))
                        : undefined,
                    onChange: (e) => onChangeValue(field.property, e.target.value),
                    onBlur: () => {}
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A searchable material-type picker: type to filter the catalog options, click
// (or Enter) to select. Replaces the native <select> so the long material-type
// list is filterable, matching the mockup. Controlled by the group's typeId (via
// value/onChange); local state only tracks the typed query, the open state, and
// the keyboard highlight.
function MaterialTypeSelect({
  options,
  value,
  placeholder,
  ariaLabel,
  onChange
}: {
  options: { value: string; label: string }[]
  value: string
  placeholder: string
  ariaLabel: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const selected = options.find((o) => o.value === value) ?? null
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()

  // Close the dropdown on an outside click.
  React.useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Open from a closed state with a fresh (empty) query, so the full list shows;
  // no-op if already open, so clicking to reposition the caret keeps the text.
  const openList = (): void => {
    if (!open) {
      setOpen(true)
      setQuery('')
      setHighlight(0)
    }
  }

  const q = query.trim().toLowerCase()
  // Empty query (just opened) shows the full list; once the user types, filter
  // the options by case-insensitive substring.
  const filtered = q === '' ? options : options.filter((o) => o.label.toLowerCase().includes(q))

  const commit = (opt: { value: string; label: string }): void => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      const opt = filtered[highlight]
      if (open && opt) {
        e.preventDefault()
        commit(opt)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative mt-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={open ? query : (selected?.label ?? '')}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded border border-app-border bg-[#121212] px-3 pr-9 text-sm text-white outline-none focus:border-neutral-500"
      />
      <img
        src={chevronDown}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-1.5 w-auto transition-transform duration-150"
        style={{ transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
      />
      {open && filtered.length > 0 && (
        <div
          id={listId}
          className="scrollbar-custom-thin absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-app-border bg-[#121212] py-1 shadow-lg"
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              aria-current={opt.value === value}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(opt)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700/50 ${
                i === highlight ? 'bg-neutral-700/50' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default MaterialPropertiesForm
