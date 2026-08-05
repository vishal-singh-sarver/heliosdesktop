import { act, fireEvent, render, screen } from '@testing-library/react'
import { loadObjectSucceeded, setDraftValue } from 'containers/Geometry/actions'
import { createMaterialSucceeded } from 'containers/Materials/actions'
import geometryReducer, {
  emptyScenarioGeometry,
  initialState as geometryInitialState,
  scopeKey
} from 'containers/Geometry/reducer'
import type { GeoNode } from 'containers/Geometry/types'
import materialsReducer, {
  initialState as materialsInitialState
} from 'containers/Materials/reducer'
import projectScreenReducer, {
  initialState as projectScreenInitialState
} from 'containers/ProjectScreen/reducer'
import type { CatalogPropertyDef, ObjectTypeDef } from 'containers/ProjectScreen/types'
import { Provider } from 'react-redux'
import { combineReducers, createStore, type Reducer } from 'redux'
import type { InjectableStore } from 'store/configureStore'
import { RightPanel } from '../index'

const PROJECT = 'p'
const SCENARIO = 's'
const OBJECT_ID = '27'

const prop = (
  property: string,
  display_order: number,
  overrides: Partial<CatalogPropertyDef> = {}
): CatalogPropertyDef => ({
  property_type_id: display_order,
  property,
  description: `${property} desc`,
  datatype: 'float',
  min: null,
  max: null,
  display_order,
  ...overrides
})

const groundType: ObjectTypeDef = {
  id: 1,
  object: 'Ground',
  properties: [
    prop('length', 1, { min: 0, required: true }),
    prop('breadth', 2, { min: 0, required: true }),
    prop('resolution_x', 3, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('resolution_y', 4, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('texture_x', 5, { datatype: 'integer', min: 1, required: true }),
    prop('texture_y', 6, { datatype: 'integer', min: 1, required: true })
  ]
}

const node: GeoNode = {
  id: OBJECT_ID,
  name: 'Ground.001',
  kind: 'ground',
  parentId: null,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  renderEnabled: true,
  modelVisibility: {}
}

// A store with a Ground draft already open, populated exactly as +Ground leaves
// it (blueprint defaults). detailsById carries the same values as the baseline,
// so the form starts clean — Save enables only once something actually changes.
function makeStore(): InjectableStore {
  const values = {
    length: '10',
    breadth: '10',
    resolution_x: '1',
    resolution_y: '1',
    texture_x: '1',
    texture_y: '1'
  }

  const rootReducer = (injected: Record<string, Reducer> = {}): Reducer =>
    combineReducers({
      geometry: geometryReducer,
      projectScreen: projectScreenReducer,
      materials: materialsReducer,
      ...injected
    }) as unknown as Reducer

  const preloaded = {
    materials: materialsInitialState,
    geometry: {
      ...geometryInitialState,
      byScope: {
        [scopeKey(PROJECT, SCENARIO)]: {
          ...emptyScenarioGeometry(),
          nodesById: { [OBJECT_ID]: node },
          rootOrder: [OBJECT_ID],
          detailsById: {
            [OBJECT_ID]: {
              values: { ...values },
              objectTypeId: 1,
              objectName: 'Ground',
              materialGroups: []
            }
          }
        }
      },
      createDraft: {
        objectId: OBJECT_ID,
        objectTypeId: 1,
        objectName: 'Ground',
        name: 'Ground.001',
        values,
        materials: [],
        materialBaseline: [],
        isNew: false,
        saving: false,
        saveError: null,
        nameError: null
      },
      createDraftNonce: 1
    },
    projectScreen: {
      ...projectScreenInitialState,
      activeProjectId: PROJECT,
      activeScenarioId: SCENARIO,
      catalog: {
        ...projectScreenInitialState.catalog,
        objectTypes: {
          byId: { 1: groundType },
          allIds: [1],
          loadStatus: 'loaded',
          loadError: null
        }
      }
    }
  }

  const store = createStore(rootReducer(), preloaded) as InjectableStore
  store.injectedReducers = {}
  store.injectedSagas = {}
  store.runSaga = (() => ({
    cancel: () => {},
    toPromise: () => Promise.resolve()
  })) as unknown as InjectableStore['runSaga']
  store.createReducer = (injected?: Record<string, Reducer>) => rootReducer(injected)
  return store
}

const lengthInput = (container: HTMLElement): HTMLInputElement => {
  const el = container.querySelector('input[name="length"]')
  if (!el) throw new Error('input[name="length"] not rendered')
  return el as HTMLInputElement
}

const saveButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement

const requiredError = (): HTMLElement | null =>
  screen.queryByLabelText('Validation error: Required Field')

describe('<RightPanel /> — collapse/expand', () => {
  // The panel opens collapsed; the chevron is the only way in from a bare render
  // (no nonce bump happens because the draft is already in the preloaded state).
  const expand = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }))
  }
  const collapse = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }))
  }

  it('keeps a required-field error visible across a collapse and reopen', () => {
    // Collapsing used to UNMOUNT the form, discarding the `touched` state that
    // gates the error — so reopening showed an empty required field with no
    // error and a disabled Save that nothing explained. Collapsing is a purely
    // visual operation now (CSS), so the form survives it intact.
    const { container } = render(
      <Provider store={makeStore()}>
        <RightPanel />
      </Provider>
    )
    expand()

    // Clear Length and blur it → "Required Field" shows, Save is blocked.
    fireEvent.change(lengthInput(container), { target: { value: '' } })
    fireEvent.blur(lengthInput(container))
    expect(requiredError()).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    collapse()
    expand()

    // The field is still empty, so the error explaining the disabled Save must
    // still be there.
    expect(lengthInput(container)).toHaveValue('')
    expect(requiredError()).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('closes an open popup when the panel collapses, and leaves no click-catcher', () => {
    // The popups portal to document.body, so hiding the panel does NOT hide
    // them — the panel's unmount used to be what closed them. The invisible
    // full-screen overlay is the dangerous half: left behind, it swallows every
    // click in the app.
    render(
      <Provider store={makeStore()}>
        <RightPanel />
      </Provider>
    )
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByText('Select Materials')).toBeInTheDocument()
    expect(screen.getByTestId('anchored-popup-overlay')).toBeInTheDocument()

    collapse()

    expect(screen.queryByText('Select Materials')).not.toBeInTheDocument()
    expect(screen.queryByTestId('anchored-popup-overlay')).not.toBeInTheDocument()

    // Closed, not merely hidden — reopening the panel must not resurrect it.
    expand()
    expect(screen.queryByText('Select Materials')).not.toBeInTheDocument()
  })

  it('force-expands when a geometry draft opens while collapsed', () => {
    // Clicking a ground (or +Ground) must bring the panel back even if the user
    // had collapsed it. Driven by the open-nonce, not draft presence, so it fires
    // again for a second object while a draft is already active.
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <RightPanel />
      </Provider>
    )
    // Starts collapsed: the form is mounted but hidden, and the header title is
    // not rendered.
    expect(screen.queryByText('Properties')).not.toBeInTheDocument()

    act(() => {
      store.dispatch(
        loadObjectSucceeded(PROJECT, SCENARIO, {
          node,
          values: { length: '10', breadth: '10' },
          objectTypeId: 1,
          objectName: 'Ground',
          materialGroups: []
        })
      )
    })

    expect(screen.getByText('Properties')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeInTheDocument()
    expect(lengthInput(container)).toBeInTheDocument()
  })

  it('switches to the material form and expands when a material draft opens', () => {
    // The panel serves two forms; whichever nonce moved last wins AND re-expands.
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <RightPanel />
      </Provider>
    )
    expand()
    expect(container.querySelector('input[name="length"]')).toBeInTheDocument()

    act(() => {
      store.dispatch(createMaterialSucceeded('g1', 'Cotton'))
    })

    // The geometry form is swapped out for the material one — so the Ground's
    // fields are gone even though its draft is still open in the store.
    expect(container.querySelector('input[name="length"]')).not.toBeInTheDocument()
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })

  it('a manual collapse is not undone by an unrelated re-render', () => {
    // The nonce watchers adjust state during render; they must fire only on an
    // actual nonce change, or the panel would fight the user's collapse.
    const store = makeStore()
    render(
      <Provider store={store}>
        <RightPanel />
      </Provider>
    )
    expand()
    collapse()
    expect(screen.queryByText('Properties')).not.toBeInTheDocument()

    // A geometry action that does NOT open a draft (so no nonce bump).
    act(() => {
      store.dispatch(setDraftValue('length', '12'))
    })

    expect(screen.queryByText('Properties')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument()
  })

  it('keeps the form mounted while collapsed, hidden with display:none', () => {
    // The two halves of the change, asserted together: the form is NOT unmounted
    // (that's what preserved the error above), and it IS hidden — `hidden` is
    // display:none, which also keeps it out of the layout, the tab order and the
    // accessibility tree.
    //
    // Asserted via the class rather than toBeVisible() because jsdom applies no
    // stylesheet: Tailwind's `hidden` is inert here, so computed visibility would
    // report the form as shown either way. The class IS the mechanism.
    const { container } = render(
      <Provider store={makeStore()}>
        <RightPanel />
      </Provider>
    )
    const wrapper = (): HTMLElement => {
      const el = container.querySelector('aside > div.contents, aside > div.hidden')
      if (!el) throw new Error('form wrapper not rendered')
      return el as HTMLElement
    }

    expand()
    expect(wrapper()).toHaveClass('contents')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    collapse()

    expect(wrapper()).toHaveClass('hidden')
    // Still mounted behind the display:none — the whole point of the change.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
