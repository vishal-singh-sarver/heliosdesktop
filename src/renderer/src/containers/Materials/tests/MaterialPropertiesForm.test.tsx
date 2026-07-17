import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { initialState as projectScreenInitialState } from 'containers/ProjectScreen/reducer'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import { InjectableStore } from 'store/configureStore'
import MaterialPropertiesForm from '../MaterialPropertiesForm'
import {
  saveParameterGroupFailed,
  saveParameterGroupSucceeded,
  type MaterialsAction
} from '../actions'
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
  savedValues: null,
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
const liveStoreWith = (
  groups: MaterialParameterGroup[],
  materialTypes: MaterialTypeDef[] = []
): InjectableStore => {
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
    projectScreen: {
      ...projectScreenInitialState,
      catalog: {
        ...projectScreenInitialState.catalog,
        materialTypes: {
          ...projectScreenInitialState.catalog.materialTypes,
          byId: Object.fromEntries(materialTypes.map((t) => [t.id, t])),
          allIds: materialTypes.map((t) => t.id)
        }
      }
    }
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

  it('re-expands a collapsed card when a material type is picked on it', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const radiation: MaterialTypeDef = {
      id: 1,
      materialtype: 'Radiation',
      description: '',
      properties: []
    }
    render(
      <Provider store={liveStoreWith([card(1)], [radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Collapse the card. Its type Select stays visible even while collapsed.
    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Pick a type — the parameters render in the (hidden) body, so selecting must
    // re-open the card.
    fireEvent.click(screen.getByRole('combobox', { name: 'Parameter Group.01' }))
    fireEvent.click(screen.getByRole('button', { name: 'Radiation' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
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

describe('<MaterialPropertiesForm /> visualisation type', () => {
  // The live "Visualiser" material type (id 7). Its properties carry NO `group`
  // tag — the card recognises it by its colour channels — so its body is the
  // colour picker rather than plain fields.
  const visualizer: MaterialTypeDef = {
    id: 7,
    materialtype: 'Visualiser',
    description: '',
    properties: [
      {
        property_type_id: 11,
        property: 'color_r',
        description: '',
        datatype: 'integer',
        min: 0,
        max: 255,
        display_order: 90
      },
      {
        property_type_id: 12,
        property: 'color_g',
        description: '',
        datatype: 'integer',
        min: 0,
        max: 255,
        display_order: 91
      },
      {
        property_type_id: 13,
        property: 'color_b',
        description: '',
        datatype: 'integer',
        min: 0,
        max: 255,
        display_order: 92
      },
      {
        property_type_id: 85,
        property: 'opacity',
        description: '',
        datatype: 'integer',
        min: 0,
        max: 100,
        display_order: 93
      },
      {
        property_type_id: 14,
        property: 'texture_file',
        description: '',
        datatype: 'file',
        min: null,
        max: null,
        display_order: 94
      }
    ]
  }
  const radiation: MaterialTypeDef = {
    id: 1,
    materialtype: 'Radiation',
    description: '',
    properties: [
      {
        property_type_id: 1,
        property: 'surface_albedo',
        description: '',
        datatype: 'float',
        min: 0,
        max: 1,
        display_order: 1
      }
    ]
  }

  it('renders the colour picker for a visualisation-type card, not plain fields', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer, radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // The picker's controls are present…
    expect(screen.getByRole('slider', { name: 'Saturation and brightness' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
    expect(screen.getByLabelText('R')).toBeInTheDocument()
    // …and there is no plain FormField for a raw colour channel.
    expect(screen.queryByLabelText('Color R')).not.toBeInTheDocument()
  })

  it('disables Save on a card opened from the backend, until something changes', () => {
    // The Geometry form's rule: a card loaded from its saved values starts clean,
    // so there is nothing to save. Editing a field opens Save; putting the value
    // back closes it again.
    Element.prototype.scrollIntoView = vi.fn()
    const saved = card(1, {
      typeId: 1,
      values: { surface_albedo: '0.5' },
      savedValues: { surface_albedo: '0.5' },
      saved: true
    })
    render(
      <Provider store={liveStoreWith([saved], [radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.7' } })
    expect(save).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.5' } })
    expect(save).toBeDisabled()
  })

  it('disables Save again once the card is saved, until the next edit', () => {
    // What the whole change is for: Save used to stay lit after saving, inviting a
    // second identical PATCH.
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 1 })], [radiation])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.5' } })
    expect(save).toBeEnabled()

    // The saga answers a real save; the card is now clean against the backend.
    act(() => {
      store.dispatch(saveParameterGroupSucceeded(1))
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.9' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('collapses the card once its save lands', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 1 })], [radiation])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Fill it in and save: the click puts the card into 'saving', the saga answers.
    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      store.dispatch(saveParameterGroupSucceeded(1))
    })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The type still reads from the collapsed header — that's what says WHICH
    // material type this card holds.
    expect(screen.getByRole('combobox', { name: 'Parameter Group.01' })).toHaveValue('Radiation')
  })

  it('leaves the card open when the save fails, so the error is visible', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 1 })], [radiation])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Parameter Group.01' })
    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      store.dispatch(saveParameterGroupFailed(1, 'Nope'))
    })

    // Only a COMPLETED save folds the card away (saving → idle); a failure goes
    // saving → error, and hiding the error under a collapsed card would strand it.
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Nope')).toBeInTheDocument()
  })

  it('commits the edited channel independently (like the other fields)', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Editing one channel sets ONLY that channel — the others stay empty until
    // touched, exactly like the plain numeric fields.
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '200' } })
    expect(screen.getByLabelText('R')).toHaveValue('200')
    expect(screen.getByLabelText('G')).toHaveValue('')
    expect(screen.getByLabelText('B')).toHaveValue('')
  })

  it('blocks a decimal keystroke with "This input is not supported"', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Integer channel: the decimal point is rejected at the keystroke and never
    // reaches the box.
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '3.5' } })
    expect(screen.getByLabelText('R')).toHaveValue('')
    expect(screen.getByRole('alert')).toHaveTextContent('This input is not supported')
  })

  it('blocks a non-numeric keystroke with "This input is not supported"', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    fireEvent.change(screen.getByLabelText('G'), { target: { value: 'x' } })
    expect(screen.getByLabelText('G')).toHaveValue('')
    expect(screen.getByRole('alert')).toHaveTextContent('This input is not supported')
  })

  it('shows the range message for a channel above 255', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    fireEvent.change(screen.getByLabelText('B'), { target: { value: '300' } })
    expect(screen.getByLabelText('B')).toHaveValue('300')
    expect(screen.getByRole('alert')).toHaveTextContent('Values should be between 0-255')
    expect(screen.getByLabelText('B')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the range message for a negative channel (out of range)', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // A minus can be typed (partial numeric), but -5 is below 0 → range message,
    // matching the other numeric fields.
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '-5' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Values should be between 0-255')
  })

  it('shows the range message for opacity above 100', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // The opacity slider and its number field share the name; target the field.
    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), {
      target: { value: '150' }
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Values should be between 0-100')
  })

  it('keeps Save disabled until a full colour + opacity is entered', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const save = screen.getByRole('button', { name: 'Save' })
    // Empty colour → required, so Save is disabled.
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '30' } })
    // RGB complete but opacity still empty → still disabled.
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), { target: { value: '80' } })
    // Now colour + opacity are defined → Save enabled.
    expect(save).toBeEnabled()
  })

  it('keeps Save disabled when a channel is out of range', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '300' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), { target: { value: '80' } })
    // B is out of range → not valid → Save stays disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('renders plain fields (no picker) for a model-type card', () => {
    render(
      <Provider store={storeWith([card(1, { typeId: 1 })])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    expect(
      screen.queryByRole('slider', { name: 'Saturation and brightness' })
    ).not.toBeInTheDocument()
  })
})
