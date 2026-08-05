import chevronIcon from '@renderer/assets/chevron.svg'
import Dialog from '@renderer/components/Dialog'
import { showSnackbar } from '@renderer/store/snackbarReducer'
import { MATERIAL_DND_MIME } from 'containers/Materials/constants'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { HIGHLIGHT_CLASSES, useScrollIntoViewWhen } from 'utils/useTransientHighlight'
import {
  assignMaterialRequested,
  deleteNodeRequested,
  groupNodesRequested,
  loadObjectRequested,
  moveNodesRequested,
  reorderNodes,
  select,
  toggleExpand
} from './actions'
import messages from './messages'
import NameEditor from './NameEditor'
import RowActions, { KebabMenu } from './RowActions'
import { selectDeletingIds } from './selectors'
import type { GeoNode } from './types'

// Custom DnD mime so we only react to our own row drags, not arbitrary drops.
const DND_MIME = 'application/x-geo'

// How long a material must hover a COLLAPSED group before it springs open. Long
// enough that merely dragging ACROSS a group on the way somewhere else doesn't
// expand it, short enough not to feel stuck — the Finder/Explorer idiom.
export const SPRING_OPEN_MS = 400

function readDraggedIds(e: React.DragEvent): string[] {
  const raw = e.dataTransfer.getData(DND_MIME)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

// A material row being dragged (from the Saved Materials list) exposes its mime
// in the drag's type list — readable during dragover, where the payload itself
// is not. Lets a row light up for an incoming material without reading it yet.
function isMaterialDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(MATERIAL_DND_MIME)
}

// The dropped material's { groupId, name }, or null when the drag isn't a
// material / the payload is malformed.
function readMaterialDrop(e: React.DragEvent): { groupId: string; name: string } | null {
  const raw = e.dataTransfer.getData(MATERIAL_DND_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { groupId?: unknown; name?: unknown }
    if (typeof parsed.groupId === 'string' && typeof parsed.name === 'string') {
      return { groupId: parsed.groupId, name: parsed.name }
    }
    return null
  } catch {
    return null
  }
}

interface TreeRowProps {
  node: GeoNode
  nodesById: Record<string, GeoNode>
  depth: number
  projectId: string | null
  scenarioId: string | null
  selectedIds: string[]
  // The node just created by +Ground (or null) — that row flashes and scrolls
  // into view. Passed down the recursion so a new row nested in a group gets the
  // cue too.
  highlightedId: string | null
  // Lowercased names of all groups / all leaves (for the rename unique check;
  // geometry and group names are separate namespaces).
  groupNamesLower: Set<string>
  leafNamesLower: Set<string>
  // Backend rename-failure messages, keyed by node id.
  nameErrors: Record<string, string>
}

// One row of the Saved Geometries tree. A leaf renders its name; a group
// renders an expand chevron and, when expanded, its (single-level) children.
// Clicking a row selects it; double-clicking a group name edits it. The
// render/eye/trash cluster reveals only for a selected leaf.
function TreeRow({
  node,
  nodesById,
  depth,
  projectId,
  scenarioId,
  selectedIds,
  highlightedId,
  groupNamesLower,
  leafNamesLower,
  nameErrors
}: TreeRowProps): React.JSX.Element {
  const dispatch = useDispatch()
  const isGroup = node.kind === 'group'
  const selected = selectedIds.includes(node.id)
  const highlighted = node.id === highlightedId
  const rowRef = useScrollIntoViewWhen<HTMLDivElement>(highlighted)
  const [editing, setEditing] = React.useState(false)
  // Current rename validation error, lifted from NameEditor so the row box can
  // turn red (vs blue) while editing an invalid name.
  const [editError, setEditError] = React.useState<string | null>(null)
  // Where a drag is hovering within this row: 'into' (center → group) or
  // 'before' / 'after' (edges → reorder, shown as a thin blue line). null = no
  // drag over this row.
  const [dropZone, setDropZone] = React.useState<'before' | 'into' | 'after' | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  // A dropped material whose target(s) already carry a DIFFERENT material: held
  // here while the replace confirmation is open, so Replace can commit the same
  // drop the user made. null = nothing pending.
  const [replaceDrop, setReplaceDrop] = React.useState<{
    groupId: string
    name: string
    targetIds: string[]
  } | null>(null)

  // Pending spring-open for THIS row (a material is dwelling on this collapsed
  // group). A ref, not state: it only coordinates the timer, and re-rendering on
  // every dragover would be pointless churn mid-drag.
  const springTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelSpringOpen = (): void => {
    if (springTimer.current === null) return
    clearTimeout(springTimer.current)
    springTimer.current = null
  }
  // A drag can end anywhere — including on a row that unmounts (a group being
  // dropped into dissolves, a filtered tree re-renders). Drop the pending timer
  // so it can't expand a node that is no longer on screen.
  React.useEffect(() => cancelSpringOpen, [])

  // How deep the drag currently is inside this row. dragenter/dragleave bubble,
  // so crossing onto one of the row's OWN children (the name, the chevron, the
  // kebab) fires a leave that does NOT mean the pointer left the row. The usual
  // `relatedTarget` check can't tell them apart — browsers leave it null on drag
  // events — so count enters against leaves instead: back to zero = really gone.
  const dragDepth = React.useRef(0)
  // This node's DELETE is in flight — the delete is pessimistic, so the row is
  // still here; locking the trash stops a second confirm firing a duplicate DELETE
  // that would 404 and report a failure for a delete that actually worked.
  const deleting = useSelector(selectDeletingIds).includes(node.id)

  const childCount = isGroup ? node.childIds.length : 0
  const confirmMessage = isGroup
    ? `Delete "${node.name}" and its ${childCount} ${childCount === 1 ? 'geometry' : 'geometries'}?`
    : `Delete "${node.name}"?`

  const confirmDelete = (): void => {
    if (deleting) return
    if (projectId && scenarioId) dispatch(deleteNodeRequested(projectId, scenarioId, node.id))
    setConfirmOpen(false)
  }

  // Commit a material assignment onto the given objects. The toast names this
  // row (the geometry for a leaf drop, the group for a group drop), not the
  // individual member objects.
  const assignMaterial = (groupId: string, name: string, targetIds: string[]): void => {
    if (!projectId || !scenarioId) return
    dispatch(assignMaterialRequested(projectId, scenarioId, targetIds, groupId, name, node.name))
  }

  const confirmReplace = (): void => {
    if (replaceDrop) assignMaterial(replaceDrop.groupId, replaceDrop.name, replaceDrop.targetIds)
    setReplaceDrop(null)
  }

  // Drag the multi-selection (leaves only) when this row is part of it,
  // otherwise just this node.
  const handleDragStart = (e: React.DragEvent): void => {
    const multi =
      selected && selectedIds.length > 1
        ? selectedIds.filter((id) => nodesById[id] && nodesById[id].kind !== 'group')
        : []
    const ids = multi.length ? multi : [node.id]
    e.dataTransfer.setData(DND_MIME, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    // A dragged material assigns to the whole row (leaf OR group) — no edge
    // bands. Light the whole row ('into' ring) and mark it a copy, not a move.
    if (isMaterialDrag(e)) {
      e.dataTransfer.dropEffect = 'copy'
      setDropZone('into')
      // Hold the material over a collapsed group and it springs open, so its
      // members become drop targets without aborting the drag to click the
      // chevron. Started once per hover — dragover repeats several times a
      // second (even with the pointer still), so restarting it here would mean
      // the dwell never elapses. dragleave is what cancels it.
      if (isGroup && !node.expanded && springTimer.current === null && projectId && scenarioId) {
        springTimer.current = setTimeout(() => {
          springTimer.current = null
          dispatch(toggleExpand(projectId, scenarioId, node.id))
        }, SPRING_OPEN_MS)
      }
      return
    }
    e.dataTransfer.dropEffect = 'move'
    // Split the row into edge/center bands: hovering the top 30% places the item
    // before this row, the bottom 30% after it (thin blue line), and the
    // generous middle 40% drops onto it (group / move-into).
    const rect = e.currentTarget.getBoundingClientRect()
    const offset = e.clientY - rect.top
    const zone =
      offset < rect.height * 0.3 ? 'before' : offset > rect.height * 0.7 ? 'after' : 'into'
    setDropZone(zone)
  }

  const handleDragEnter = (): void => {
    dragDepth.current += 1
  }

  // Genuinely leaving the row (not just crossing between its own children)
  // clears the drop cue and the pending spring-open.
  const handleDragLeave = (): void => {
    dragDepth.current -= 1
    if (dragDepth.current > 0) return
    dragDepth.current = 0
    setDropZone(null)
    cancelSpringOpen()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation() // don't also trigger the root (ungroup) drop zone
    const zone = dropZone
    setDropZone(null)
    cancelSpringOpen()
    dragDepth.current = 0

    // A dropped material assigns to this row. A leaf takes just itself; a group
    // fans out over its member objects (groups don't nest, so childIds are all
    // leaves). Handled before the row-drag logic so a material never reorders.
    const material = readMaterialDrop(e)
    if (material) {
      if (!projectId || !scenarioId) return
      const targetIds = isGroup
        ? node.childIds.filter((id) => nodesById[id]?.kind !== 'group')
        : [node.id]
      if (!targetIds.length) return

      const groupsOn = (id: string): string[] => nodesById[id]?.materialGroupIds ?? []
      // Members that already carry this exact material are dropped from the
      // assignment entirely — for them the drop asks for what they already have.
      // Re-sending them would POST a duplicate the backend rejects and would
      // restyle geometry in the viewport that never changed.
      const needsAssign = targetIds.filter((id) => !groupsOn(id).includes(material.groupId))
      // Nothing left → every target already had it. Say so, rather than firing a
      // success toast for an assignment that never happened.
      if (!needsAssign.length) {
        dispatch(showSnackbar(messages.materialAlreadyAssigned(node.name), 'info'))
        return
      }
      // An object carries ONE material, so a remaining target that already holds
      // one holds a DIFFERENT one, and assigning destroys it (along with any
      // progress made using it) — confirm first. For a group drop it's enough
      // that ONE member would be displaced.
      if (needsAssign.some((id) => groupsOn(id).length > 0)) {
        setReplaceDrop({ groupId: material.groupId, name: material.name, targetIds: needsAssign })
        return
      }
      // Otherwise every remaining target is bare — nothing is displaced.
      assignMaterial(material.groupId, material.name, needsAssign)
      return
    }

    const ids = readDraggedIds(e)
    if (!ids.length || !projectId || !scenarioId) return

    // Edge drop → reorder at root, before/after this row (client-only order).
    if (zone === 'before' || zone === 'after') {
      const movable = ids.filter(
        (id) => id !== node.id && nodesById[id] && nodesById[id].kind !== 'group'
      )
      if (movable.length) dispatch(reorderNodes(projectId, scenarioId, movable, node.id, zone))
      return
    }

    // Center drop ('into') → group / move into group.
    // Only leaves can be moved into a group (groups don't nest), and a move into
    // the leaf's current parent is a no-op — filter both out so we never fire a
    // pointless PATCH (+ its dissolved-group cleanup) for a drop that changes
    // nothing.
    const movableInto = (groupId: string): string[] =>
      ids.filter((id) => {
        const dragged = nodesById[id]
        return dragged && dragged.kind !== 'group' && dragged.parentId !== groupId
      })
    if (isGroup) {
      // Drop into this group.
      const movable = movableInto(node.id)
      if (movable.length) dispatch(moveNodesRequested(projectId, scenarioId, movable, node.id))
    } else if (!ids.includes(node.id)) {
      if (node.parentId) {
        // Target leaf already lives in a group → drop becomes a sibling child of
        // that group, rather than nesting a new group inside it.
        const movable = movableInto(node.parentId)
        if (movable.length)
          dispatch(moveNodesRequested(projectId, scenarioId, movable, node.parentId))
      } else {
        // Two root-level leaves → POST a new group containing both (target +
        // dragged). The saga creates it server-side; the reducer inserts the
        // returned group with its real id + name. Only leaves can be grouped
        // (groups don't nest), so drop any dragged group — if nothing groupable
        // remains (e.g. a group was dragged onto a ground), it's a no-op, so we
        // never fire a pointless POST /groups.
        const groupable = ids.filter((id) => nodesById[id] && nodesById[id].kind !== 'group')
        if (groupable.length)
          dispatch(groupNodesRequested(projectId, scenarioId, [node.id, ...groupable]))
      }
    }
  }

  const handleSelect = (e: React.MouseEvent): void => {
    if (!projectId || !scenarioId) return
    const multi = e.metaKey || e.ctrlKey
    dispatch(select(projectId, scenarioId, node.id, multi))
    // Single-clicking a leaf loads its properties into the right-panel form.
    if (!multi && !isGroup) dispatch(loadObjectRequested(projectId, scenarioId, node.id))
  }

  const handleToggle = (e: React.MouseEvent): void => {
    e.stopPropagation() // expanding must not also select the row
    if (isGroup && projectId && scenarioId) {
      dispatch(toggleExpand(projectId, scenarioId, node.id))
    }
  }

  // Names to check a rename against: same-kind names (groups vs leaves are
  // separate namespaces), minus this node's own so an unchanged name is allowed.
  const otherNames = React.useMemo(() => {
    const names = new Set(isGroup ? groupNamesLower : leafNamesLower)
    names.delete(node.name.toLowerCase())
    return names
  }, [isGroup, groupNamesLower, leafNamesLower, node.name])

  const children =
    isGroup && node.expanded ? node.childIds.map((id) => nodesById[id]).filter(Boolean) : []

  const nameError = nameErrors[node.id]

  // Any error on the row (live rename validation while editing, or a backend
  // rename failure) turns the box border red — the same #D92D20 the right-panel
  // form uses for invalid fields.
  const hasError = editing ? Boolean(editError) : Boolean(nameError)

  return (
    <>
      <div className="mb-1">
        <div
          ref={rowRef}
          role="button"
          tabIndex={0}
          onClick={handleSelect}
          draggable={!isGroup && !editing}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          // The "just created" cue sits under the error/editing states (both of
          // which are about the name being wrong right now, and must win) but
          // over selection — a new row is selected too, and the flash is what's
          // new.
          className={`group relative flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[13px] font-normal text-neutral-200 transition-colors duration-500 ${
            hasError
              ? 'border-[#D92D20] bg-[#2a2a2a]'
              : editing
                ? 'border-[#245AC5] bg-[#2a2a2a]'
                : highlighted
                  ? HIGHLIGHT_CLASSES
                  : selected
                    ? 'border-app-border bg-[#2a2a2a]'
                    : 'border-transparent hover:bg-neutral-700/40'
          } ${dropZone === 'into' ? 'ring-1 ring-inset ring-blue-500' : ''}`}
          style={{ paddingLeft: 10 + depth * 16 }}
        >
          {/* Reorder insertion lines (absolutely positioned so they never shift
              layout — that lets the center "drop to group" still work). */}
          {dropZone === 'before' && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 rounded-full bg-[#245AC5]"
            />
          )}
          {dropZone === 'after' && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-[#245AC5]"
            />
          )}
          {isGroup && (
            <button
              type="button"
              onClick={handleToggle}
              aria-label={node.expanded ? 'Collapse group' : 'Expand group'}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-200"
            >
              {/* Down-pointing chevron asset; rotates to point right when collapsed. */}
              <img
                src={chevronIcon}
                alt=""
                aria-hidden="true"
                width="10"
                height="10"
                className="transition-transform"
                style={{ transform: node.expanded ? 'none' : 'rotate(-90deg)' }}
              />
            </button>
          )}

          {editing ? (
            <NameEditor
              id={node.id}
              initialName={node.name}
              projectId={projectId}
              scenarioId={scenarioId}
              existingNames={otherNames}
              ariaLabel={isGroup ? 'Group name' : 'Geometry name'}
              onErrorChange={setEditError}
              onClose={() => {
                setEditing(false)
                setEditError(null)
              }}
            />
          ) : (
            <>
              <span className="min-w-0 truncate" onDoubleClick={() => setEditing(true)}>
                {node.name}
              </span>
              <KebabMenu node={node} projectId={projectId} scenarioId={scenarioId} />
              <RowActions
                node={node}
                projectId={projectId}
                scenarioId={scenarioId}
                selected={selected}
                onDelete={() => setConfirmOpen(true)}
                deleting={deleting}
              />
            </>
          )}
        </div>
        {/* Error text lives OUTSIDE the row box (below it): the live rename
            validation error while editing, or the backend rename-failure message. */}
        {(editing ? editError : nameError) && (
          <span className="form-error-text mt-0.5 block px-2" style={{ color: '#D92D20' }}>
            {editing ? editError : nameError}
          </span>
        )}
      </div>

      <Dialog
        isOpen={confirmOpen}
        title={messages.deleteTitle}
        onClose={() => setConfirmOpen(false)}
      >
        <p className="text-sm text-neutral-200">{confirmMessage}</p>
        <p className="text-sm text-neutral-400">{messages.deleteBody}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.deleteCancel}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            {messages.deleteConfirm}
          </button>
        </div>
      </Dialog>

      {/* Replace-material confirmation — shown when a dropped material would
          displace a different one already on this row's target(s). Cancel leaves
          the existing assignment untouched; Replace runs the normal assign flow
          (which unassigns the displaced material first). */}
      <Dialog
        isOpen={replaceDrop !== null}
        title={messages.replaceMaterialTitle}
        onClose={() => setReplaceDrop(null)}
      >
        <p className="text-sm text-neutral-200">{messages.replaceMaterialHeading(node.name)}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setReplaceDrop(null)}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100"
          >
            {messages.replaceMaterialCancel}
          </button>
          <button
            type="button"
            onClick={confirmReplace}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
          >
            {messages.replaceMaterialConfirm}
          </button>
        </div>
      </Dialog>

      {children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          nodesById={nodesById}
          depth={depth + 1}
          projectId={projectId}
          scenarioId={scenarioId}
          selectedIds={selectedIds}
          highlightedId={highlightedId}
          groupNamesLower={groupNamesLower}
          leafNamesLower={leafNamesLower}
          nameErrors={nameErrors}
        />
      ))}
    </>
  )
}

export default TreeRow
