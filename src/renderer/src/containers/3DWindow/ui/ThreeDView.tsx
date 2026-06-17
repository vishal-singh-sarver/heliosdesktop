import React, { useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { loadScene } from '../store/actions'
import Viewport3D from './Viewport3D'

/**
 * 3D window — renders scene geometry fetched via binary API.
 * Object creation is handled by the right-side panel; this module only
 * receives object IDs, fetches their geometry, and renders them.
 */
export function ThreeDView(): React.JSX.Element {
  const dispatch = useDispatch()

  // Load scene geometry when the component mounts (covers the case where
  // the 3D tab opens after the active scenario was already set).
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      dispatch(loadScene())
    }
  }, [dispatch])

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <Viewport3D />
      </div>
    </div>
  )
}

export default ThreeDView
