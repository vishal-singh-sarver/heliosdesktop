import Header from '@renderer/components/Header'
import LabeledField from '@renderer/components/LabeledField'
import MenuBar from '@renderer/components/MenuBar'
import Tooltip from '@renderer/components/Tooltip'
import CenterWorkspace from '@renderer/containers/CenterWorkspace'
import LeftPanel from '@renderer/containers/LeftPanel'
import RightPanel from '@renderer/containers/RightPanel'
import { useFormik } from 'formik'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Reducer } from 'redux'
import { navigate } from 'store/navigationReducer'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { STORAGE_KEYS } from 'utils/storageKeys'
import { TOOLBAR_ITEMS } from '../../types/project'
import {
  listScenariosRequested,
  loadDataTypesRequested,
  loadMaterialTypesRequested,
  loadModelTypesRequested,
  loadObjectTypesRequested,
  setActiveProject,
  updateProjectRequested
} from './actions'
import reducer from './reducer'
import saga from './saga'
import { selectActiveProject, selectActiveProjectId } from './selectors'

// Help text — mirrors the strings used in HomePage's New Project dialog so
// the user sees the same guidance whether they're creating a project or
// editing its coordinates from the project screen header.
const LATITUDE_HELP =
  'Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90. Negative for South, positive for North.'
const LONGITUDE_HELP =
  'Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180. Negative for West, positive for East.'

// Validation rules mirror the New Project dialog. An empty value is treated
// as "not yet entered" — no error — so the field renders neutrally before
// the user starts typing.
// Accepts `7`, `7.`, `7.5`, `.5`, and their signed forms — `7.` is a valid
// intermediate state while the user is still typing the fractional part.
const DECIMAL_RE = /^[-+]?(\d+\.?\d*|\.\d+)$/

interface CoordinateForm {
  latitude: string
  longitude: string
}

function validateCoordinates(
  values: CoordinateForm
): Partial<Record<keyof CoordinateForm, string>> {
  const errors: Partial<Record<keyof CoordinateForm, string>> = {}

  const lat = values.latitude.trim()
  if (lat !== '') {
    if (!DECIMAL_RE.test(lat)) {
      errors.latitude = 'Invalid latitude'
    } else {
      const n = Number(lat)
      if (!Number.isFinite(n) || n < -90 || n > 90) {
        errors.latitude =
          'Invalid latitude. Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90.'
      } else if ((lat.split('.')[1]?.length ?? 0) > 7) {
        errors.latitude = 'Latitude can have at most 7 decimal places.'
      }
    }
  }

  const lon = values.longitude.trim()
  if (lon !== '') {
    if (!DECIMAL_RE.test(lon)) {
      errors.longitude = 'Invalid longitude'
    } else {
      const n = Number(lon)
      if (!Number.isFinite(n) || n < -180 || n > 180) {
        errors.longitude =
          'Invalid longitude. Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180.'
      } else if ((lon.split('.')[1]?.length ?? 0) > 7) {
        errors.longitude = 'Longitude can have at most 7 decimal places.'
      }
    }
  }

  return errors
}

export function ProjectScreen(): React.JSX.Element {
  useInjectReducer({ key: 'projectScreen', reducer: reducer as Reducer })
  useInjectSaga({ key: 'projectScreen', saga })

  const dispatch = useDispatch()
  const activeProjectId = useSelector(selectActiveProjectId)
  const activeProject = useSelector(selectActiveProject)

  // Load the full catalog once per mount: data-types-with-units plus the
  // object / material / model type catalogs, all in parallel. The reducer
  // dedupes by overwriting, so re-mounting the screen refreshes each slice.
  React.useEffect(() => {
    dispatch(loadDataTypesRequested())
    dispatch(loadObjectTypesRequested())
    dispatch(loadMaterialTypesRequested())
    dispatch(loadModelTypesRequested())
  }, [dispatch])

  // Mirrors the appReady signal in HomePage — whichever screen mounts first
  // dismisses the splash. ipcMain registers `app:ready` as a once-listener so
  // a second send (e.g. after navigation) is a harmless no-op.
  React.useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.api?.appReady?.()
      })
    })
  }, [])

  React.useEffect(() => {
    if (activeProjectId == null) {
      const stored = localStorage.getItem(STORAGE_KEYS.activeProjectId)
      if (stored) dispatch(setActiveProject(stored))
    }
  }, [activeProjectId, dispatch])

  // Fire on every project-id change. Stale Redux scenario state from a prior
  // visit is overwritten by the saga's setActiveScenario when the response
  // resolves — so no `activeScenarioId == null` guard is needed.
  React.useEffect(() => {
    if (activeProjectId != null) {
      dispatch(listScenariosRequested(activeProjectId))
    }
  }, [activeProjectId, dispatch])

  const formik = useFormik<CoordinateForm>({
    initialValues: { latitude: '', longitude: '' },
    validateOnChange: true,
    validateOnBlur: true,
    validate: validateCoordinates,
    onSubmit: () => {}
  })

  // utc_offset is derived by the backend from latitude/longitude and rendered
  // read-only, so it is computed straight off the project rather than mirrored
  // into state — no effect can leave it stale after a PATCH.
  const utcOffset = activeProject?.utc_offset ?? ''

  // Seed the header inputs from the project metadata once it lands. Re-seed
  // when the project id flips (so a switch to another project replaces the
  // displayed values), but not on every metadata refresh — otherwise the
  // user's in-progress edits would be clobbered.
  const seededProjectIdRef = React.useRef<string | null>(null)
  const resetFormRef = React.useRef(formik.resetForm)
  React.useEffect(() => {
    resetFormRef.current = formik.resetForm
  })
  React.useEffect(() => {
    if (!activeProject) return
    if (seededProjectIdRef.current === activeProject.id) return
    seededProjectIdRef.current = activeProject.id
    resetFormRef.current({
      values: {
        latitude: String(activeProject.latitude),
        longitude: String(activeProject.longitude)
      }
    })
  }, [activeProject])

  // Compute errors synchronously off the current values. Formik's own
  // `errors` map is updated asynchronously (microtask), which would lag
  // by one render and let invalid input briefly look valid.
  const errors = validateCoordinates(formik.values)
  const latitudeInvalid = formik.values.latitude !== '' && Boolean(errors.latitude)
  const longitudeInvalid = formik.values.longitude !== '' && Boolean(errors.longitude)

  const commitCoordinate = (field: 'latitude' | 'longitude'): void => {
    if (!activeProjectId || !activeProject) return

    const value = formik.values[field]
    if (errors[field] || value === '') return

    const next = Number.parseFloat(value)
    const current = activeProject[field]
    if (Object.is(next, current)) return

    dispatch(
      updateProjectRequested(activeProjectId, {
        name: activeProject.name,
        latitude: field === 'latitude' ? next : activeProject.latitude,
        longitude: field === 'longitude' ? next : activeProject.longitude
      })
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header onLogoClick={() => dispatch(navigate('home'))} title={activeProject?.name}>
        <MenuBar items={TOOLBAR_ITEMS} onItemSelect={() => {}} />
        <div className="flex items-center gap-2">
          <LabeledField
            label="Latitude"
            value={formik.values.latitude}
            onChange={(value) => formik.setFieldValue('latitude', value)}
            onBlur={() => commitCoordinate('latitude')}
            invalid={latitudeInvalid}
            labelAdornment={<Tooltip text={LATITUDE_HELP} ariaLabel="Show latitude help" />}
          />

          <LabeledField
            label="Longitude"
            value={formik.values.longitude}
            onChange={(value) => formik.setFieldValue('longitude', value)}
            onBlur={() => commitCoordinate('longitude')}
            invalid={longitudeInvalid}
            labelAdornment={<Tooltip text={LONGITUDE_HELP} ariaLabel="Show longitude help" />}
          />

          {/* UTC offset comes from the project record on the server. Kept
              read-only here until edit-and-save is wired — value is seeded
              from activeProject in the effect above. */}
          <LabeledField label="UTC Offset" value={utcOffset} disabled />
        </div>
      </Header>

      <main className="flex min-h-0 flex-1 gap-[10px] overflow-hidden p-[10px]">
        <LeftPanel />
        <CenterWorkspace />
        <RightPanel />
      </main>
    </div>
  )
}

export default ProjectScreen
