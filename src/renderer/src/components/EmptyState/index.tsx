import React from 'react'

interface EmptyStateProps {
  icon: string
  onCreateNew: () => void
}

function EmptyState({ icon, onCreateNew }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <img src={icon} className="h-6 w-6 opacity-80" />

      <p className="text-md font-medium text-white">No Projects Found</p>

      <p className="text-sm text-neutral-400">No Projects Found. Please add a new Project.</p>

      <button
        data-testid="table-create-new"
        onClick={onCreateNew}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        + Add New Project
      </button>
    </div>
  )
}

export default EmptyState
