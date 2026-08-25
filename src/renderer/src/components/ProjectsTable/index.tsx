import deleteIcon from '@renderer/assets/deleteIconRed.svg'
import editIcon from '@renderer/assets/edit.svg'
import kebabMenuIcon from '@renderer/assets/Kebab Menu.svg'
import sortIcon from '@renderer/assets/Sort 3.svg'
import React, { useState } from 'react'
import { formatBytes, formatRelativeDate } from 'utils/format'
import { useVirtualRows } from 'utils/useVirtualRows'
import type { ApiErrorPayload, RecentProjectItem } from '../../containers/HomePage/types'
import EmptyState from '../EmptyState'
import ProjectsLoadError from '../ProjectsLoadError'

interface ProjectsTableProps {
  projects: RecentProjectItem[]
  emptyIcon: string
  onCreateNew: () => void
  onRowClick?: (projectId: string) => void
  onRequestDelete: (project: RecentProjectItem) => void
  onRequestRename: (project: RecentProjectItem) => void
  deletingIds: string[]
  /** Failure of the LIST fetch. Only meaningful while there is nothing to show. */
  loadError?: ApiErrorPayload | null
  /** True while the list is in flight — distinguishes "none yet" from "none". */
  loading?: boolean
  onRetryLoad?: () => void
}

type SortKey = 'name' | 'last_updated' | 'size'
type SortOrder = 'asc' | 'desc'

const ROW_HEIGHT = 64
const OVERSCAN = 5

const COLUMN_LABELS: Record<SortKey, string> = {
  name: 'Name',
  last_updated: 'Last Updated',
  size: 'Size'
}

// ── Component ─────────────────────────────────────────────────────────────────
function ProjectsTable({
  projects,
  emptyIcon,
  onCreateNew,
  onRequestDelete,
  onRequestRename,
  deletingIds,
  onRowClick,
  loadError = null,
  loading = false,
  onRetryLoad
}: ProjectsTableProps): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('last_updated')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const menuRootRef = React.useRef<HTMLTableSectionElement>(null)

  React.useEffect(() => {
    if (openMenuProjectId == null) return undefined

    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRootRef.current?.contains(event.target as Node)) return
      setOpenMenuProjectId(null)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenuProjectId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuProjectId])

  const handleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  const handleOpenProject = (project: RecentProjectItem): void => {
    onRowClick?.(project.id)
  }

  const sortedProjects = React.useMemo(() => {
    const decorated = projects.map((p) => ({
      project: p,
      timestamp: sortKey === 'last_updated' ? new Date(p.last_updated).getTime() : 0
    }))

    decorated.sort((a, b) => {
      if (sortKey === 'size') {
        return sortOrder === 'asc'
          ? a.project.size - b.project.size
          : b.project.size - a.project.size
      }
      if (sortKey === 'last_updated') {
        return sortOrder === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
      }
      const cmp = a.project.name.localeCompare(b.project.name)
      return sortOrder === 'asc' ? cmp : -cmp
    })

    return decorated.map((d) => d.project)
  }, [projects, sortKey, sortOrder])

  const { startIndex, endIndex } = useVirtualRows({
    rowCount: sortedProjects.length,
    rowHeight: ROW_HEIGHT,
    containerRef,
    overscan: OVERSCAN
  })

  const visibleRows = sortedProjects.slice(startIndex, endIndex)
  const paddingTop = startIndex * ROW_HEIGHT
  const paddingBottom = (sortedProjects.length - endIndex) * ROW_HEIGHT

  const getAriaSort = (key: SortKey): 'ascending' | 'descending' | 'none' => {
    if (key !== sortKey) return 'none'
    return sortOrder === 'asc' ? 'ascending' : 'descending'
  }

  const renderSortIndicator = (key: SortKey): React.JSX.Element => {
    const isActive = key === sortKey
    return (
      <img
        src={sortIcon}
        alt=""
        aria-hidden="true"
        className={`ml-1 h-3 w-auto ${isActive ? 'opacity-100' : 'opacity-60'} ${
          isActive && sortOrder === 'desc' ? 'rotate-180' : ''
        }`}
      />
    )
  }

  // Three different situations hide behind "the table has no rows", and they all
  // used to render the same "No Projects Found" — including a backend that was
  // simply unreachable. See ProjectsLoadError for what that cost.
  //
  // `loadError` is passed only when there are genuinely no projects to show; a
  // refresh that fails with rows already on screen keeps the rows, and a search
  // that matches nothing is not a failure at all.
  const renderPlaceholder = (): React.JSX.Element => {
    if (loadError) return <ProjectsLoadError error={loadError} onRetry={onRetryLoad} />
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-neutral-400">Loading projects…</p>
        </div>
      )
    }
    return <EmptyState icon={emptyIcon} onCreateNew={onCreateNew} />
  }

  return (
    <>
      <h2 className="mb-6 text-lg font-medium text-white">Recent Projects</h2>

      <div
        ref={containerRef}
        data-testid="projects-table"
        className="scrollbar-custom flex-1 min-h-0 overflow-y-auto rounded border border-app-border bg-app-panel/20"
      >
        {sortedProjects.length === 0 ? (
          renderPlaceholder()
        ) : (
          <table className="w-full border-separate table-fixed" style={{ borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: '40%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>

            <thead>
              <tr>
                {(['name', 'last_updated', 'size'] as SortKey[]).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={getAriaSort(key)}
                    className="sticky top-0 z-10 bg-app-bg border-b border-app-border px-4 py-3 text-left text-sm font-normal text-neutral-400"
                  >
                    <button
                      type="button"
                      data-testid={`sort-${key}`}
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-1 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                    >
                      {COLUMN_LABELS[key]}
                      {renderSortIndicator(key)}
                    </button>
                  </th>
                ))}
                <th
                  scope="col"
                  aria-label="Actions"
                  className="sticky top-0 z-10 bg-app-bg border-b border-app-border"
                />
              </tr>
            </thead>

            <tbody ref={menuRootRef}>
              {paddingTop > 0 && (
                <tr aria-hidden="true" style={{ height: paddingTop }}>
                  <td colSpan={4} />
                </tr>
              )}

              {visibleRows.map((project) => {
                const isDeleting = deletingIds.includes(project.id)
                return (
                  <tr
                    key={project.id}
                    data-testid={`row-${project.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open project ${project.name}`}
                    onDoubleClick={() => handleOpenProject(project)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleOpenProject(project)
                      }
                    }}
                    className="projects-row hover:bg-[#424242] transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <td className="border-b border-app-border/80 px-4 overflow-hidden">
                      <span
                        title={project.name}
                        className="block w-full truncate text-left text-sm text-white"
                      >
                        {project.name}
                      </span>
                    </td>
                    <td className="border-b border-app-border/80 px-4 text-sm text-neutral-400">
                      {formatRelativeDate(project.last_updated)}
                    </td>
                    <td className="border-b border-app-border/80 px-4 text-sm text-neutral-300">
                      {formatBytes(project.size)}
                    </td>
                    <td className="relative border-b border-app-border/80 px-4">
                      <button
                        type="button"
                        aria-label={`Open actions for ${project.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuProjectId === project.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenMenuProjectId((id) => (id === project.id ? null : project.id))
                        }}
                        disabled={isDeleting}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-neutral-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <img src={kebabMenuIcon} alt="" aria-hidden="true" className="h-5 w-5" />
                      </button>
                      {openMenuProjectId === project.id && (
                        <div
                          role="menu"
                          aria-label={`Actions for ${project.name}`}
                          className="absolute right-4 top-10 z-30 flex h-[92px] w-[132px] flex-col justify-center rounded-lg border border-[#424242] bg-[#202020] py-2 shadow-[0px_4px_6px_-2px_rgba(0,0,0,0.18),0px_12px_16px_-4px_rgba(0,0,0,0.32)]"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            data-testid={`rename-${project.id}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenMenuProjectId(null)
                              onRequestRename(project)
                            }}
                            className="flex h-10 items-center gap-3 px-4 text-left text-sm font-medium text-[#D3D3D3] hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
                          >
                            <img src={editIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                            Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            data-testid={`delete-${project.id}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenMenuProjectId(null)
                              onRequestDelete(project)
                            }}
                            disabled={isDeleting}
                            className="flex h-10 items-center gap-3 px-4 text-left text-sm font-medium text-[#D92D20] hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <img src={deleteIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}

              {paddingBottom > 0 && (
                <tr aria-hidden="true" style={{ height: paddingBottom }}>
                  <td colSpan={4} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ProjectsTable
