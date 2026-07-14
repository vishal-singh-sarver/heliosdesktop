import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { initialState as projectScreenInitialState } from 'containers/ProjectScreen/reducer'
import { InjectableStore } from 'store/configureStore'
import MaterialPropertiesForm from '../MaterialPropertiesForm'
import type { MaterialsAction } from '../actions'
import { RENAME_MATERIAL_REQUESTED } from '../constants'
import materialsReducer, {
  initialState as materialsInitialState,
  type MaterialsState
} from '../reducer'
import type { MaterialParameterGroup } from '../types'

const card = (id: number, over: Partial<MaterialParameterGroup> = {}): MaterialParameterGroup => ({
  id,
  number: id,
  typeId: null,
  values: {},
  saved: false,
  saveStatus: 'idle',
  saveError: null,
  ...over
})

// A store frozen on one open material draft with a single Parameter Group card.
const storeWith = (groups: MaterialParameterGroup[]): InjectableStore => {
  const state = {
    materials: {
      ...materialsInitialState,
      editDraft: { groupId: '12', name: 'Material.001', groups, nextGroupId: groups.length + 1 },
      editDraftNonce: 1
    },
    projectScreen: projectScreenInitialState
  }
  const store = createStore(
    ((s = state) => s) as Reducer<unknown, UnknownAction>
  ) as InjectableStore
  store.injectedReducers = {}
  store.injectedSagas = {}
  store.runSaga = () =>
    ({
      cancel: () => {},
      error: () => {},
      result: () => {},
      toPromise: () => Promise.resolve()
    }) as any
  store.createReducer = () => ((s = state) => s) as Reducer<unknown, UnknownAction>
  return store
}

// The same open draft, but running the REAL materials reducer — so dispatches from
// the form (e.g. + Add Material Type) actually change the state the form renders
// from. `storeWith` above freezes the state, which can't show a card being added.
const liveStoreWith = (groups: MaterialParameterGroup[]): InjectableStore => {
  type TestState = {
    materials: MaterialsState
    projectScreen: typeof projectScreenInitialState
  }
  const preloaded: TestState = {
    materials: {
      ...materialsInitialState,
      editDraft: { groupId: '12', name: 'Material.001', groups, nextGroupId: groups.length + 1 },
      editDraftNonce: 1
    },
    projectScreen: projectScreenInitialState
  }
  const root = ((s: TestState = preloaded, action: UnknownAction): TestState => ({
    ...s,
    materials: materialsReducer(s.materials, action as MaterialsAction)
  })) as Reducer<unknown, UnknownAction>

  const store = createStore(root) as InjectableStore
  store.injectedReducers = {}
  store.injectedSagas = {}
  store.runSaga = () =>
    ({
      cancel: () => {},
      error: () => {},
      result: () => {},
      toPromise: () => Promise.resolve()
    }) as any
  store.createReducer = () => root
  return store
}

describe('<MaterialPropertiesForm /> parameter-group card', () => {
  it('toggles the card open and closed on every arrow click', () => {
    render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    // Opens expanded.
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Clicking again must re-open it — the arrow is a toggle, not a one-way open.
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles from anywhere on the header row, not just the chevron', () => {
    render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    // The title sits on the header row — clicking it collapses the card.
    fireEvent.click(screen.getByText('Parameter Group.01'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByText('Parameter Group.01'))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('the material-type dropdown arrow both opens AND closes the list', () => {
    const { container } = render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const combobox = screen.getByRole('combobox', { name: 'Parameter Group.01' })
    // The chevron is the button rendered inside the select's wrapper.
    const arrow = container.querySelector<HTMLButtonElement>('button[tabindex="-1"]')!
    expect(combobox).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(arrow)
    expect(combobox).toHaveAttribute('aria-expanded', 'true')

    // Clicking the arrow again must CLOSE it (it used to only ever open).
    fireEvent.click(arrow)
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
  })

  it('the header trash does not also collapse the card', () => {
    render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Parameter Group.01' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('<MaterialPropertiesForm /> + Add Material Type', () => {
  it('opens the new card and scrolls to it, leaving the open ones alone', () => {
    const scrollIntoView = vi.fn()
    // jsdom has no layout, so scrollIntoView isn't implemented there.
    Element.prototype.scrollIntoView = scrollIntoView

    render(
      <Provider store={liveStoreWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const first = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    expect(first).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Add Material Type' }))

    // The card that was already open STAYS open — adding a second one used to
    // collapse it.
    expect(first).toHaveAttribute('aria-expanded', 'true')
    const second = screen.getByRole('button', { name: 'Toggle Parameter Group.02' })
    expect(second).toHaveAttribute('aria-expanded', 'true')
    // …and the new card is brought into view, since it can land below the fold.
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

describe('<MaterialPropertiesForm /> material name', () => {
  const renameTypes = (dispatch: { mock: { calls: unknown[][] } }): string[] =>
    dispatch.mock.calls
      .map((c) => (c[0] as { type?: string }).type)
      .filter((t): t is string => t === RENAME_MATERIAL_REQUESTED)

  it('does not rename when the read-only field is only tabbed through', () => {
    const store = storeWith([card(1)])
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Tabbing across the panel focuses the read-only name and blurs it again. That
    // used to fire the rename PATCH on every pass.
    fireEvent.focus(screen.getByLabelText('Material name'))
    fireEvent.blur(screen.getByLabelText('Material name'))
    expect(renameTypes(dispatch)).toEqual([])
  })

  it('does not rename when an unlocked name is left unchanged', () => {
    const store = storeWith([card(1)])
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // The pencil unlocks the field, but clicking away without editing is not a
    // rename — the name is identical.
    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
    fireEvent.blur(screen.getByLabelText('Material name'))
    expect(renameTypes(dispatch)).toEqual([])
  })
})
