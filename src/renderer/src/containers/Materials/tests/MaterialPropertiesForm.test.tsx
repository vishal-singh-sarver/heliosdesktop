import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { initialState as projectScreenInitialState } from 'containers/ProjectScreen/reducer'
import { InjectableStore } from 'store/configureStore'
import MaterialPropertiesForm from '../MaterialPropertiesForm'
import { initialState as materialsInitialState } from '../reducer'
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
