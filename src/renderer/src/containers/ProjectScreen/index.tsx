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
import {
  selectActiveProject,
  selectActiveProjectId,
  selectUpdateProjectError,
  selectUpdateProjectLoading
} from './selectors'

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

// The boot saga's loader covers only the scenario-context hydration (/init).
// By the time this mounts the backend is warm, and the screen loads its own
// data from here — which is why these effects live in the component rather
// than in the boot.
export function ProjectScreen(): React.JSX.Element {
  useInjectReducer({ key: 'projectScreen', reducer: reducer as Reducer })
  useInjectSaga({ key: 'projectScreen', saga })

  const dispatch = useDispatch()
  const activeProjectId = useSelector(selectActiveProjectId)
  const activeProject = useSelector(selectActiveProject)

  // Load the full catalog once per mount: data-types-with-units plus the
  // object / material / model type catalogs, all in parallel.
  //
  // Guarded by a ref, not by the dependency array. StrictMode deliberately runs
  // every effect twice in development on the SAME instance, which fired all
  // four of these twice on every project open. A ref survives that simulated
  // remount; a real navigation away destroys the component, so returning to the
  // screen still refreshes each slice as before.
  const catalogsRequestedRef = React.useRef(false)
  React.useEffect(() => {
    if (catalogsRequestedRef.current) return
    catalogsRequestedRef.current = true
    dispatch(loadDataTypesRequested())
    dispatch(loadObjectTypesRequested())
    dispatch(loadMaterialTypesRequested())
    dispatch(loadModelTypesRequested())
  }, [dispatch])

  React.useEffect(() => {
    if (activeProjectId == null) {
      const stored = localStorage.getItem(STORAGE_KEYS.activeProjectId)
      if (stored) dispatch(setActiveProject(stored))
    }
  }, [activeProjectId, dispatch])

  // Fire on every project-id change. Stale Redux scenario state from a prior
  // visit is overwritten by the saga's setActiveScenario when the response
  // resolves — so no `activeScenarioId == null` guard is needed.
  //
  // Keyed by project id so a switch still lists the new project's scenarios,
  // while StrictMode's second run is ignored. Note this call is also what sets
  // the active scenario, and that is what starts the scene load — so it cannot
  // simply be skipped when scenarios are already in the store.
  const scenariosRequestedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (activeProjectId == null) return
    if (scenariosRequestedRef.current === activeProjectId) return
    scenariosRequestedRef.current = activeProjectId
    dispatch(listScenariosRequested(activeProjectId))
  }, [activeProjectId, dispatch])

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

  // Put the box back to the coordinate the project actually holds.
  const revertCoordinate = (field: 'latitude' | 'longitude'): void => {
    if (!activeProject) return
    formik.setFieldValue(field, String(activeProject[field]))
  }

  // The coordinate save this header started, and the exact text it sent. Read
  // when the PATCH settles — see the effect below.
  const pendingSaveRef = React.useRef<{
    field: 'latitude' | 'longitude'
    value: string
  } | null>(null)

  // The current render's values and revert, for that effect. It has to act on the
  // form as it stands WHEN THE SAVE LANDS, not as it stood when the save started
  // — the user has had the whole round trip to keep typing.
  const latestRef = React.useRef({ values: formik.values, revert: revertCoordinate })
  React.useEffect(() => {
    latestRef.current = { values: formik.values, revert: revertCoordinate }
  })

  const commitCoordinate = (field: 'latitude' | 'longitude'): void => {
    if (!activeProjectId || !activeProject) return

    const value = formik.values[field]
    // Nothing committable — malformed, out of range, too many decimals, or
    // cleared. Leaving that text on screen was the problem: the header is the
    // only place the project's coordinates are shown, so a rejected edit sat
    // there reading like the project's location while the project still held the
    // old one, and the red border said "invalid" without saying what IS stored.
    // Blur restores the saved value, so what the header shows is always what
    // would be used.
    //
    // Trimmed, so a field left holding only spaces counts as cleared. It used to
    // pass both guards — validate() trims before deciding, so no error — and
    // reach Number.parseFloat('  '), sending latitude: NaN (JSON: null) to the
    // PATCH.
    if (errors[field] || value.trim() === '') {
      revertCoordinate(field)
      return
    }

    const next = Number.parseFloat(value)
    const current = activeProject[field]
    if (Object.is(next, current)) return

    pendingSaveRef.current = { field, value }
    dispatch(
      updateProjectRequested(activeProjectId, {
        name: activeProject.name,
        latitude: field === 'latitude' ? next : activeProject.latitude,
        longitude: field === 'longitude' ? next : activeProject.longitude
      })
    )
  }

  // "The header shows what is stored" has to hold for a save that FAILS too, not
  // only for input that never left the box.
  //
  // A valid edit is dispatched on blur and deliberately left on screen while the
  // PATCH travels. If that PATCH fails the project keeps its old coordinate and
  // the header is left showing a number the backend never accepted — with no red
  // border, because the value is perfectly valid, and no message. Reopening the
  // project would quietly show the old coordinate back again.
  //
  // Scoped two ways, so it can only ever undo the save's own leftovers:
  //   • ONLY the field that was being saved. This is the trap here — resetForm()
  //     rewrites both boxes, so a longitude being typed while a latitude save
  //     failed would be wiped mid-keystroke.
  //   • ONLY while that field still holds the exact text that was sent. If the
  //     user went back in and typed something else, that is newer than the save
  //     and stands; the next blur will deal with it.
  const updateLoading = useSelector(selectUpdateProjectLoading)
  const updateError = useSelector(selectUpdateProjectError)
  React.useEffect(() => {
    if (updateLoading) return
    const pending = pendingSaveRef.current
    if (!pending) return
    pendingSaveRef.current = null
    // Settled cleanly — activeProject now carries the new coordinate, which is
    // what the box is already showing.
    if (updateError == null) return
    if (latestRef.current.values[pending.field] !== pending.value) return
    latestRef.current.revert(pending.field)
  }, [updateLoading, updateError])

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
