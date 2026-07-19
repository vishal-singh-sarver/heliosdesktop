import { fireEvent, render, screen, within } from '@testing-library/react'
import materialsReducer, {
  initialState as materialsInitialState
} from 'containers/Materials/reducer'
import type { Material, MaterialGroupDetail } from 'containers/Materials/types'
import projectScreenReducer, {
  initialState as projectScreenInitialState
} from 'containers/ProjectScreen/reducer'
import type { CatalogPropertyDef, MaterialTypeDef, ObjectTypeDef } from 'containers/ProjectScreen/types'
import { Provider } from 'react-redux'
import { combineReducers, createStore, type Reducer } from 'redux'
import type { InjectableStore } from 'store/configureStore'
import { ObjectPropertiesForm } from '../ObjectPropertiesForm'
import geometryReducer, {
  emptyScenarioGeometry,
  initialState as geometryInitialState,
  scopeKey
} from '../reducer'
import type { DraftMaterialGroup, GeoNode } from '../types'

const PROJECT = 'p'
const SCENARIO = 's'
const OBJECT_ID = '27'

// Minimal catalog property factory — mirrors the helper in propertyBlueprint.test.
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

// The real Ground object type, so resolveObjectFormByType renders the same fields.
const groundType: ObjectTypeDef = {
  id: 1,
  object: 'Ground',
  properties: [
    prop('length', 1, { min: 0, required: true }),
    prop('breadth', 2, { min: 0, required: true }),
    prop('resolution_x', 3, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('resolution_y', 4, { datatype: 'integer', min: 1, max: 25000, required: true }),
    prop('position_x', 5, { required: false }),
    prop('position_y', 6, { required: false }),
    prop('position_z', 7, { required: false }),
    prop('rotation_z', 8, { min: 0, max: 360, required: false }),
    prop('texture_x', 9, { datatype: 'integer', min: 1, required: true }),
    prop('texture_y', 10, { datatype: 'integer', min: 1, required: true })
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

// A saved library material, as the left panel's <Materials/> would have loaded
// it — the Select popup lists these.
const material = (id: string, name: string): Material => ({
  id,
  name,
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: '2026-01-01T00:00:00Z',
  visible: true
})

// A real store wired like the app's: combined geometry + projectScreen reducers,
// preloaded with the active scope, the Ground catalog, the node, and an OPEN
// draft whose values are empty (so every required field is invalid). detailsById
// is left empty so `original` is undefined → the form reads as dirty → Save is
// enabled without a prior edit.
//
// `materials` seeds the library the Select popup lists; the slice is included so
// selectAllMaterials reads real rows instead of falling back to initialState.
function makeStore(
  materials: Material[] = [],
  opts: {
    draftMaterials?: DraftMaterialGroup[]
    materialTypes?: MaterialTypeDef[]
    materialDetails?: MaterialGroupDetail[]
  } = {}
): InjectableStore {
  // Cast mirrors store/reducers.ts — combineReducers' inferred type doesn't
  // satisfy the bare Reducer the injectable store expects under Redux 5.
  const rootReducer = (injected: Record<string, Reducer> = {}): Reducer =>
    combineReducers({
      geometry: geometryReducer,
      projectScreen: projectScreenReducer,
      materials: materialsReducer,
      ...injected
    }) as unknown as Reducer

  const preloaded = {
    materials: {
      ...materialsInitialState,
      byId: Object.fromEntries(materials.map((m) => [m.id, m])),
      order: materials.map((m) => m.id),
      detailsById: Object.fromEntries((opts.materialDetails ?? []).map((d) => [d.id, d]))
    },
    geometry: {
      ...geometryInitialState,
      byScope: {
        [scopeKey(PROJECT, SCENARIO)]: {
          ...emptyScenarioGeometry(),
          nodesById: { [OBJECT_ID]: node },
          rootOrder: [OBJECT_ID]
        }
      },
      createDraft: {
        objectId: OBJECT_ID,
        objectTypeId: 1,
        objectName: 'Ground',
        name: 'Ground.001',
        values: {},
        materials: opts.draftMaterials ?? [],
        materialBaseline: (opts.draftMaterials ?? []).map((m) => m.groupId),
        isNew: true,
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
        objectTypes: { byId: { 1: groundType }, allIds: [1], loadStatus: 'loaded', loadError: null },
        materialTypes: {
          byId: Object.fromEntries((opts.materialTypes ?? []).map((t) => [t.id, t])),
          allIds: (opts.materialTypes ?? []).map((t) => t.id),
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

const fieldInput = (container: HTMLElement, name: string): HTMLInputElement => {
  const el = container.querySelector(`input[name="${name}"]`)
  if (!el) throw new Error(`input[name="${name}"] not rendered`)
  return el as HTMLInputElement
}

describe('<ObjectPropertiesForm /> — material properties popup', () => {
  // Pick Cotton from the Select popup, leaving it listed under the Materials row.
  // The Select popup stays open afterwards (picking doesn't dismiss it), so the
  // picked row is reached via `within(container)` — the popup is portaled to
  // document.body and would otherwise make a bare 'Cotton' query ambiguous.
  const pickCotton = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cotton' }))
  }

  it('opens the read-only properties popup when a picked material is clicked', () => {
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    pickCotton()

    expect(screen.queryByRole('dialog', { name: 'Cotton properties' })).not.toBeInTheDocument()
    fireEvent.click(within(container).getByRole('button', { name: 'Cotton' }))

    expect(screen.getByRole('dialog', { name: 'Cotton properties' })).toBeInTheDocument()
  })

  it("shows an assigned material's properties (from the GET) in the read-only popup", () => {
    const radiationType: MaterialTypeDef = {
      id: 5,
      materialtype: 'Radiation',
      description: '',
      properties: [prop('reflectivity', 1, { group: 'model' })]
    }
    // A material already assigned to the ground (as the object GET returns it):
    // it renders under the Materials row without needing the Select popup.
    const assigned: DraftMaterialGroup = {
      groupId: '41',
      name: 'Grass',
      materials: [
        { materialTypeId: 5, materialTypeName: 'Radiation', properties: { reflectivity: 0.3 } }
      ]
    }
    const { container } = render(
      <Provider store={makeStore([], { draftMaterials: [assigned], materialTypes: [radiationType] })}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    // The resolved property + value render (not the empty state).
    expect(within(dialog).getByText('Reflectivity')).toBeInTheDocument()
    expect(within(dialog).getByText('0.3')).toBeInTheDocument()
  })

  it("shows a freshly-picked material's properties from the Materials library cache", () => {
    const radiationType: MaterialTypeDef = {
      id: 5,
      materialtype: 'Radiation',
      description: '',
      properties: [prop('reflectivity', 1, { group: 'model' })]
    }
    // The library detail is already cached (as if a prior GET filled it), so the
    // popup resolves properties for a picked-but-unsaved material — no baseline.
    const detail: MaterialGroupDetail = {
      id: '41',
      name: 'Grass',
      members: [{ materialTypeId: 5, properties: { reflectivity: '0.3' } }]
    }
    const { container } = render(
      <Provider
        store={makeStore([material('41', 'Grass')], {
          materialTypes: [radiationType],
          materialDetails: [detail]
        })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    // Pick it from the Select popup (no baseline → freshly picked)…
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grass' }))
    // …then open its properties from the row: the cached detail fills the popup.
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    expect(within(dialog).getByText('Reflectivity')).toBeInTheDocument()
    expect(within(dialog).getByText('0.3')).toBeInTheDocument()
  })

  it('closes the Select Materials popup when the properties popup opens', () => {
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    pickCotton()
    expect(screen.getByText('Select Materials')).toBeInTheDocument()

    fireEvent.click(within(container).getByRole('button', { name: 'Cotton' }))

    // Both popups anchor to the same strip beside the panel and each lays down
    // its own full-screen overlay — two open at once would stack overlays over
    // each other's contents.
    expect(screen.queryByText('Select Materials')).not.toBeInTheDocument()
  })

  it('dismisses the properties popup from its close button', () => {
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    pickCotton()
    fireEvent.click(within(container).getByRole('button', { name: 'Cotton' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close material properties' }))

    expect(screen.queryByRole('dialog', { name: 'Cotton properties' })).not.toBeInTheDocument()
  })
})

describe('<ObjectPropertiesForm /> — Save gating', () => {
  const saveButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement

  it('disables Save while any field is invalid and enables it once the form is valid', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )

    // Empty required fields → invalid → Save disabled (there is no error summary).
    expect(saveButton()).toBeDisabled()

    // Filling every required field with a valid value makes the form valid.
    for (const [name, value] of [
      ['length', '5'],
      ['breadth', '5'],
      ['resolution_x', '10'],
      ['resolution_y', '10'],
      ['texture_x', '2'],
      ['texture_y', '2']
    ] as const) {
      fireEvent.change(fieldInput(container, name), { target: { value } })
    }
    expect(saveButton()).toBeEnabled()

    // Re-introducing a single invalid value (below the min) disables Save again.
    fireEvent.change(fieldInput(container, 'length'), { target: { value: '-5' } })
    expect(saveButton()).toBeDisabled()
  })

  it('flags a texture repeat that exceeds its ground resolution and blocks Save', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )

    // Fill every required field with valid, in-range values → Save enabled.
    for (const [name, value] of [
      ['length', '5'],
      ['breadth', '5'],
      ['resolution_x', '10'],
      ['resolution_y', '10'],
      ['texture_x', '2'],
      ['texture_y', '2']
    ] as const) {
      fireEvent.change(fieldInput(container, name), { target: { value } })
    }
    expect(saveButton()).toBeEnabled()

    // texture_x (20) now exceeds resolution_x (10): a cross-field violation.
    // The value itself is valid (integer ≥ 1), so this is purely the dependency
    // rule — Save is blocked and the offending field is marked invalid.
    fireEvent.change(fieldInput(container, 'texture_x'), { target: { value: '20' } })
    expect(saveButton()).toBeDisabled()
    expect(fieldInput(container, 'texture_x')).toHaveAttribute('aria-invalid', 'true')
    // The message describes the rule + the ceiling (not a bare "Invalid Input").
    expect(
      screen.getByText("Texture repeat can't exceed the ground resolution (10)")
    ).toBeInTheDocument()

    // Bringing it back within the resolution clears the violation → Save enabled.
    fireEvent.change(fieldInput(container, 'texture_x'), { target: { value: '10' } })
    expect(saveButton()).toBeEnabled()
    expect(fieldInput(container, 'texture_x')).toHaveAttribute('aria-invalid', 'false')
  })

  it('caps texture_y independently against resolution_y', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )

    for (const [name, value] of [
      ['length', '5'],
      ['breadth', '5'],
      ['resolution_x', '10'],
      ['resolution_y', '10'],
      ['texture_x', '2'],
      ['texture_y', '2']
    ] as const) {
      fireEvent.change(fieldInput(container, name), { target: { value } })
    }
    expect(saveButton()).toBeEnabled()

    // texture_y (15) > resolution_y (10) → blocked, and only texture_y is flagged.
    fireEvent.change(fieldInput(container, 'texture_y'), { target: { value: '15' } })
    expect(saveButton()).toBeDisabled()
    expect(fieldInput(container, 'texture_y')).toHaveAttribute('aria-invalid', 'true')
    expect(fieldInput(container, 'texture_x')).toHaveAttribute('aria-invalid', 'false')
  })
})
