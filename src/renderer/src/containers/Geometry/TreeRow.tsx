import chevronIcon from '@renderer/assets/chevron.svg'
import Dialog from '@renderer/components/Dialog'
import React from 'react'
import { useDispatch } from 'react-redux'
import {
  deleteNodeRequested,
  groupNodesRequested,
  loadObjectRequested,
  moveNodesRequested,
  select,
  toggleExpand
} from './actions'
import messages from './messages'
import NameEditor from './NameEditor'
import RowActions, { KebabMenu } from './RowActions'
import type { GeoNode } from './types'

// Custom DnD mime so we only react to our own row drags, not arbitrary drops.
const DND_MIME = 'application/x-geo'

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

interface TreeRowProps {
  node: GeoNode
  nodesById: Record<string, GeoNode>
  depth: number
  projectId: string | null
  scenarioId: string | null
  selectedIds: string[]
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
  groupNamesLower,
  leafNamesLower,
  nameErrors
}: TreeRowProps): React.JSX.Element {
  const dispatch = useDispatch()
  const isGroup = node.kind === 'group'
  const selected = selectedIds.includes(node.id)
  const [editing, setEditing] = React.useState(false)
  // Current rename validation error, lifted from NameEditor so the row box can
  // turn red (vs blue) while editing an invalid name.
  const [editError, setEditError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const childCount = isGroup ? node.childIds.length : 0
  const confirmMessage = isGroup
    ? `Delete "${node.name}" and its ${childCount} ${childCount === 1 ? 'geometry' : 'geometries'}?`
    : `Delete "${node.name}"?`

  const confirmDelete = (): void => {
    if (projectId && scenarioId) dispatch(deleteNodeRequested(projectId, scenarioId, node.id))
    setConfirmOpen(false)
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
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation() // don't also trigger the root (ungroup) drop zone
    setDragOver(false)
    const ids = readDraggedIds(e)
    if (!ids.length || !projectId || !scenarioId) return
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

  return (
    <>
      <div className="mb-1">
        <div
          role="button"
          tabIndex={0}
          onClick={handleSelect}
          draggable={!isGroup && !editing}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`group flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[14px] font-normal text-neutral-200 ${
            editing
              ? 'border-[#245AC5] bg-[#2a2a2a]'
              : selected
                ? 'border-app-border bg-[#2a2a2a]'
                : 'border-transparent hover:bg-neutral-700/40'
          } ${dragOver ? 'ring-1 ring-inset ring-blue-500' : ''}`}
          style={{ paddingLeft: 10 + depth * 16 }}
        >
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

      {children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          nodesById={nodesById}
          depth={depth + 1}
          projectId={projectId}
          scenarioId={scenarioId}
          selectedIds={selectedIds}
          groupNamesLower={groupNamesLower}
          leafNamesLower={leafNamesLower}
          nameErrors={nameErrors}
        />
      ))}
    </>
  )
}

export default TreeRow
