import homeIcon from '@renderer/assets/home.svg'
import newProjectIcon from '@renderer/assets/new_project.svg'
import openProjectIcon from '@renderer/assets/open_project.svg'
import searchIcon from '@renderer/assets/search.svg'
import Dialog from '@renderer/components/Dialog'
import FormField from '@renderer/components/FormField'
import Header from '@renderer/components/Header'
import { Spinner } from '@renderer/components/LoadingScreen/Spinner'
import MenuBar from '@renderer/components/MenuBar'
import ProjectsTable from '@renderer/components/ProjectsTable'
import SearchBar from '@renderer/components/SearchBar'
import Sidebar from '@renderer/components/Sidebar'
import { setActiveProject } from 'containers/ProjectScreen/actions'
import { useFormik } from 'formik'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { navigate } from 'store/navigationReducer'
import { useInjectReducer } from 'utils/injectReducer'
import { useInjectSaga } from 'utils/injectSaga'
import { STORAGE_KEYS } from 'utils/storageKeys'
import { FormValues, INITIAL_VALUES, SidebarItem, TOOLBAR_ITEMS } from '../../types/project'
import {
  createProject,
  deleteProject,
  fetchRecentProjects,
  renameProject,
  resetCreateProject,
  resetRenameProject
} from './actions'
import messages from './messages'
import homePageReducer from './reducer'
import homePageSaga from './saga'
import {
  selectCreateProject,
  selectDeleteProject,
  selectRecentProjects,
  selectRenameProject
} from './selectors'
import type { RecentProjectItem } from './types'

function validateProjectName(projectName: string): string | undefined {
  const trimmedName = projectName.trim()
  if (!trimmedName) {
    return 'Project name is required.'
  }
  if (trimmedName.length > 30) {
    return 'Project name must be 30 characters or fewer.'
  }
  return undefined
}

export function HomePage(): React.JSX.Element {
  useInjectReducer({ key: 'homePage', reducer: homePageReducer })
  useInjectSaga({ key: 'homePage', saga: homePageSaga })

  const dispatch = useDispatch()
  const {
    loading: createLoading,
    error: createError,
    success: createSuccess,
    data: createProjectData
  } = useSelector(selectCreateProject)
  const { data: recentProjects } = useSelector(selectRecentProjects)
  const { inFlightIds: deletingIds } = useSelector(selectDeleteProject)
  const {
    loading: renameLoading,
    error: renameError,
    success: renameSuccess
  } = useSelector(selectRenameProject)

  React.useEffect(() => {
    dispatch(fetchRecentProjects())
  }, [dispatch])

  // Signal main process to reveal the window and dismiss the splash. Nested
  // rAF defers past the browser's first paint — a single rAF fires before the
  // paint commits, so the splash would lift on a blank frame.
  React.useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.api?.appReady?.()
      })
    })
  }, [])

  const [searchText, setSearchText] = React.useState('')
  const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false)
  const [pendingDelete, setPendingDelete] = React.useState<RecentProjectItem | null>(null)
  const [pendingRename, setPendingRename] = React.useState<RecentProjectItem | null>(null)
  const [activeSidebar, setActiveSidebar] = React.useState('Home')

  const pendingDeleteInFlight = pendingDelete ? deletingIds.includes(pendingDelete.id) : false

  const prevInFlightRef = React.useRef(false)
  React.useEffect(() => {
    if (prevInFlightRef.current && !pendingDeleteInFlight) {
      setPendingDelete(null)
    }
    prevInFlightRef.current = pendingDeleteInFlight
  }, [pendingDeleteInFlight])

  const handleRequestDelete = (project: RecentProjectItem): void => {
    setPendingDelete(project)
  }

  const handleRequestRename = (project: RecentProjectItem): void => {
    dispatch(resetRenameProject())
    setPendingRename(project)
  }

  const handleConfirmDelete = (): void => {
    if (!pendingDelete || pendingDeleteInFlight) return
    dispatch(deleteProject({ projectId: pendingDelete.id }))
  }

  const handleCancelDelete = (): void => {
    if (pendingDeleteInFlight) return
    setPendingDelete(null)
  }

  const renameFormik = useFormik<{ projectName: string }>({
    initialValues: { projectName: pendingRename?.name ?? '' },
    enableReinitialize: true,
    validateOnChange: true,
    validateOnBlur: true,
    validate: (values) => {
      const errors: Partial<Record<'projectName', string>> = {}
      const projectNameError = validateProjectName(values.projectName)
      if (projectNameError) errors.projectName = projectNameError
      return errors
    },
    onSubmit: (values) => {
      if (!pendingRename || renameLoading) return
      const name = values.projectName.trim()
      if (name === pendingRename.name) {
        setPendingRename(null)
        dispatch(resetRenameProject())
        return
      }
      dispatch(renameProject({ projectId: pendingRename.id, name }))
    }
  })

  const handleCancelRename = (): void => {
    if (renameLoading) return
    setPendingRename(null)
    dispatch(resetRenameProject())
  }

  // The "already exists" error is server-side state that only reflects the
  // last submitted name. Once the user edits the field it's stale, so clear it
  // on change — otherwise it lingers and stacks on top of the live client-side
  // validation error (e.g. the >30-char message).
  const handleRenameFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    if (renameError) dispatch(resetRenameProject())
    renameFormik.handleChange(e)
  }

  const prevRenameLoadingRef = React.useRef(false)
  React.useEffect(() => {
    if (prevRenameLoadingRef.current && !renameLoading && renameSuccess) {
      setPendingRename(null)
      dispatch(resetRenameProject())
    }
    prevRenameLoadingRef.current = renameLoading
  }, [renameLoading, renameSuccess, dispatch])

  const formik = useFormik<FormValues>({
    initialValues: INITIAL_VALUES,
    validateOnChange: true,
    validateOnBlur: true,
    validate: (values) => {
      const errors: Partial<Record<keyof FormValues, string>> = {}

      const projectNameError = validateProjectName(values.projectName)
      if (projectNameError) errors.projectName = projectNameError

      const latitudeValue = values.latitude.trim()

      if (latitudeValue === '') {
        errors.latitude = 'Latitude is required.'
      } else if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(latitudeValue)) {
        errors.latitude = 'Invalid latitude'
      } else {
        const lat = Number(latitudeValue)

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          errors.latitude =
            'Invalid latitude. Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90.'
        } else if ((latitudeValue.split('.')[1]?.length ?? 0) > 7) {
          errors.latitude = 'Latitude can have at most 7 decimal places.'
        }
      }

      const longitudeValue = values.longitude.trim()

      if (longitudeValue === '') {
        errors.longitude = 'Longitude is required.'
      } else if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(longitudeValue)) {
        errors.longitude = 'Invalid longitude'
      } else {
        const lon = Number(longitudeValue)

        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          errors.longitude =
            'Invalid longitude. Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180.'
        } else if ((longitudeValue.split('.')[1]?.length ?? 0) > 7) {
          errors.longitude = 'Longitude can have at most 7 decimal places.'
        }
      }

      return errors
    },
    onSubmit: (values) => {
      if (createLoading) return
      dispatch(
        createProject({
          name: values.projectName,
          latitude: Number.parseFloat(values.latitude),
          longitude: Number.parseFloat(values.longitude)
        })
      )
    }
  })

  const resetFormRef = React.useRef(formik.resetForm)
  React.useEffect(() => {
    resetFormRef.current = formik.resetForm
  })

  // Close the dialog and clear the slice once the backend confirms success.
  React.useEffect(() => {
    if (!createSuccess || !createProjectData?.project_id) return

    resetFormRef.current()
    setShowNewProjectDialog(false)
    dispatch(resetCreateProject())
  }, [createSuccess, createProjectData, dispatch])

  const openNewProjectDialog = (): void => {
    formik.resetForm()
    dispatch(resetCreateProject())
    setShowNewProjectDialog(true)
  }

  const closeNewProjectDialog = (): void => {
    formik.resetForm()
    dispatch(resetCreateProject())
    setShowNewProjectDialog(false)
  }
  const sidebarItems: SidebarItem[] = [
    { label: 'Home', icon: homeIcon, onAction: () => {} },
    { label: 'New Project', icon: newProjectIcon, onAction: openNewProjectDialog },
    {
      label: 'Open project',
      icon: openProjectIcon,
      onAction: () => {}
    }
  ]
  // useDeferredValue keeps the input responsive while the filter re-runs.
  // useMemo ensures we only re-filter when the list or the deferred query
  // actually change, not on every unrelated render.
  const deferredSearch = React.useDeferredValue(searchText)
  const filteredProjects = React.useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return recentProjects
    return recentProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.last_updated.toLowerCase().includes(needle)
    )
  }, [recentProjects, deferredSearch])

  return (
    <div className="flex h-full flex-col font-sans">
      <Header>
        <MenuBar
          items={TOOLBAR_ITEMS}
          onItemSelect={(menuItem) => {
            if (menuItem === 'New Project') {
              openNewProjectDialog()
            }
          }}
        />
        <SearchBar
          ariaLabel="Search projects"
          icon={searchIcon}
          value={searchText}
          placeholder="Search..."
          onChange={setSearchText}
        />
      </Header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          items={sidebarItems}
          activeLabel={activeSidebar}
          onSelect={(item) => {
            setActiveSidebar(item.label)
            item.onAction()
          }}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <ProjectsTable
            projects={filteredProjects}
            emptyIcon={searchIcon}
            onCreateNew={openNewProjectDialog}
            onRowClick={(projectId) => {
              try {
                localStorage.setItem(STORAGE_KEYS.activeProjectId, projectId)
              } catch {
                /* storage disabled — navigation still proceeds */
              }
              dispatch(setActiveProject(projectId))
              dispatch(navigate('project'))
            }}
            onRequestDelete={handleRequestDelete}
            onRequestRename={handleRequestRename}
            deletingIds={deletingIds}
          />
        </main>
      </div>

      <Dialog
        isOpen={showNewProjectDialog}
        title={messages.createProject.dialogTitle}
        onClose={closeNewProjectDialog}
      >
        <FormField
          key="projectName"
          labelProps={{
            label: 'Project Name',
            helpText: 'Enter a project name to identify your work.',
            helpAriaLabel: 'Show project name help',
            helpPlace: 'right'
          }}
          inputProps={{
            ...formik.getFieldProps('projectName'),
            placeholder: 'My Simulation',
            error:
              formik.touched.projectName || formik.values.projectName !== ''
                ? (formik.errors.projectName as string | undefined)
                : undefined
          }}
        />
        <FormField
          key="latitude"
          labelProps={{
            label: 'Latitude',
            helpText:
              'Enter latitude in decimal degrees. Valid range: -90 <= latitude <= 90. Negative for South, positive for North.',
            helpAriaLabel: 'Show latitude help'
          }}
          inputProps={{
            ...formik.getFieldProps('latitude'),
            placeholder: '38.5449',
            error:
              formik.touched.latitude || formik.values.latitude !== ''
                ? (formik.errors.latitude as string | undefined)
                : undefined,
            type: 'text'
          }}
        />
        <FormField
          key="longitude"
          labelProps={{
            label: 'Longitude',
            helpText:
              'Enter longitude in decimal degrees. Valid range: -180 <= longitude <= 180. Negative for West, positive for East.',
            helpAriaLabel: 'Show longitude help'
          }}
          inputProps={{
            ...formik.getFieldProps('longitude'),
            placeholder: '-121.7405',
            error:
              formik.touched.longitude || formik.values.longitude !== ''
                ? (formik.errors.longitude as string | undefined)
                : undefined,
            type: 'text'
          }}
        />

        {createError && (
          <p role="alert" className="pt-2 text-sm text-red-600">
            {createError.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={closeNewProjectDialog}
            disabled={createLoading}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100 disabled:opacity-50"
          >
            {messages.createProject.cancelButton}
          </button>
          <button
            onClick={() => formik.submitForm()}
            disabled={createLoading}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {createLoading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {messages.createProject.submitButtonBusy}
              </span>
            ) : (
              messages.createProject.submitButton
            )}
          </button>
        </div>
      </Dialog>

      <Dialog
        isOpen={pendingDelete !== null}
        title={messages.deleteProject.dialogTitle}
        onClose={handleCancelDelete}
      >
        <h3 className="text-base font-medium text-white">
          {pendingDelete ? messages.deleteProject.heading(pendingDelete.name) : ''}
        </h3>
        <p className="text-sm text-neutral-400">{messages.deleteProject.body}</p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleCancelDelete}
            disabled={pendingDeleteInFlight}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100 disabled:opacity-50"
          >
            {messages.deleteProject.cancelButton}
          </button>
          <button
            onClick={handleConfirmDelete}
            disabled={pendingDeleteInFlight}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500 disabled:opacity-50"
          >
            {pendingDeleteInFlight ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {messages.deleteProject.confirmButton}
              </span>
            ) : (
              messages.deleteProject.confirmButton
            )}
          </button>
        </div>
      </Dialog>

      <Dialog
        isOpen={pendingRename !== null}
        title={messages.renameProject.dialogTitle}
        onClose={handleCancelRename}
        className="min-h-[224px] w-[352px] rounded-[3px] border-[#424242] bg-[#202020] shadow-[0px_4px_6px_-2px_rgba(0,0,0,0.18),0px_12px_16px_-4px_rgba(0,0,0,0.32)]"
        headerClassName="h-[56px] bg-neutral-100 px-4"
        bodyClassName="space-y-5 p-4"
      >
        {/* FormField + server error share one wrapper so the server error sits
            directly under the input (mt-1), identical to the client-side
            validation error FormField renders internally — rather than picking
            up the body's larger space-y-5 gap. */}
        <div>
          <FormField
            key="renameProjectName"
            labelProps={{ label: messages.renameProject.fields.name }}
            inputProps={{
              ...renameFormik.getFieldProps('projectName'),
              onChange: handleRenameFieldChange,
              error:
                renameFormik.touched.projectName || renameFormik.values.projectName !== ''
                  ? (renameFormik.errors.projectName as string | undefined)
                  : undefined
            }}
          />

          {renameError && (
            <p role="alert" className="form-error-text mt-1">
              {renameError.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleCancelRename}
            disabled={renameLoading}
            className="rounded bg-neutral-200 px-3 py-1 text-sm text-black hover:bg-neutral-100 disabled:opacity-50"
          >
            {messages.renameProject.cancelButton}
          </button>
          <button
            onClick={() => renameFormik.submitForm()}
            disabled={renameLoading}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {renameLoading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {messages.renameProject.submitButtonBusy}
              </span>
            ) : (
              messages.renameProject.submitButton
            )}
          </button>
        </div>
      </Dialog>
    </div>
  )
}

export default HomePage
