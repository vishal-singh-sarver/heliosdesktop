import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import messages from '../messages'
import { selectSceneObject } from '../store/actions'
import { selectSceneObjects, selectSelectedObjectId } from '../store/selectors'

/** Dropdown overlay to switch between "All" and individual scene objects. */
export function SceneSelector(): React.JSX.Element {
  const dispatch = useDispatch()
  const objects = useSelector(selectSceneObjects)
  const selectedObjectId = useSelector(selectSelectedObjectId)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside)
      selectedItemRef.current?.scrollIntoView({ block: 'nearest' })
    }
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Keep the previous count in sync so the dropdown doesn't open unexpectedly
  // after the component remounts with a different object count.
  const prevCountRef = useRef(objects.length)
  useEffect(() => {
    prevCountRef.current = objects.length
  }, [objects.length])

  function handleSelect(id: number | null): void {
    if (id === selectedObjectId) {
      setOpen(false)
      return
    }
    dispatch(selectSceneObject(id))
    setOpen(false)
  }

  const currentLabel =
    selectedObjectId === null
      ? messages.sceneSelector.allOption
      : (objects.find((o) => o.id === selectedObjectId)?.name ?? messages.sceneSelector.allOption)

  return (
    <div ref={containerRef}>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-[140px] items-center justify-between rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
        >
          <span className="truncate">{currentLabel}</span>
          <span className="ml-2 shrink-0 text-neutral-400">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full min-w-[140px] overflow-y-auto rounded border border-neutral-600 bg-neutral-800 shadow-lg [scrollbar-width:thin] [scrollbar-color:theme(colors.neutral.600)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-600">
            <button
              ref={selectedObjectId === null ? selectedItemRef : null}
              onClick={() => handleSelect(null)}
              className={`w-full px-2 py-1.5 text-left text-xs ${
                selectedObjectId === null
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-200 hover:bg-neutral-700'
              }`}
            >
              {messages.sceneSelector.allOption}
            </button>
            {objects.map((obj) => (
              <button
                key={obj.id}
                ref={selectedObjectId === obj.id ? selectedItemRef : null}
                onClick={() => handleSelect(obj.id)}
                className={`w-full px-2 py-1.5 text-left text-xs ${
                  selectedObjectId === obj.id
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-200 hover:bg-neutral-700'
                }`}
              >
                {obj.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SceneSelector
