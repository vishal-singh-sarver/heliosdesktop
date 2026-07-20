import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { initialState as projectScreenInitialState } from 'containers/ProjectScreen/reducer'
import type { MaterialTypeDef } from 'containers/ProjectScreen/types'
import { InjectableStore } from 'store/configureStore'
import MaterialPropertiesForm from '../MaterialPropertiesForm'
import {
  renameMaterialFailed,
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

// TextureSelector fetches the default-texture library itself on mount. Stub just
// that call so the grid has a tile to press; everything else in the service is
// left alone.
vi.mock('../service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service')>()),
  listDefaultTextures: async () => [
    { name: 'grass.png', url: '/api/materials/library/textures/serve?path=uploads/grass.png' }
  ]
}))

const card = (id: number, over: Partial<MaterialParameterGroup> = {}): MaterialParameterGroup => ({
  id,
  number: id,
  typeId: null,
  values: {},
  savedValues: null,
  saved: false,
  saveStatus: 'idle',
  saveError: null,
  deleteStatus: 'idle',
  ...over
})

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

// A store frozen on one open material draft with a single Parameter Group card.
const storeWith = (groups: MaterialParameterGroup[]): InjectableStore => {
  const state = {
    materials: {
      ...materialsInitialState,
      editDraft: {
        groupId: '12',
        name: 'Material.001',
        nameError: null,
        groups,
        nextGroupId: groups.length + 1
      },
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
  materialTypes: MaterialTypeDef[] = [],
  // Other rows in the library, for the header rename's uniqueness check.
  otherRows: Array<[string, string]> = []
): InjectableStore => {
  type TestState = {
    materials: MaterialsState
    projectScreen: typeof projectScreenInitialState
  }
  const preloaded: TestState = {
    materials: {
      ...materialsInitialState,
      byId: Object.fromEntries(
        [['12', 'Material.001'] as [string, string], ...otherRows].map(([id, name]) => [
          id,
          {
            id,
            name,
            materialTypeId: 1,
            materialType: '',
            preview: null,
            createdAt: '',
            visible: true
          }
        ])
      ),
      order: ['12', ...otherRows.map(([id]) => id)],
      editDraft: {
        groupId: '12',
        name: 'Material.001',
        nameError: null,
        groups,
        nextGroupId: groups.length + 1
      },
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

// Committing with Enter and dismissing with Escape both close the list WITHOUT
// clearing the typed query, and ArrowDown used to reopen with setOpen directly —
// so the input showed that stale search text instead of the selected type, and
// the list came back pre-filtered to it.
describe('<MaterialPropertiesForm /> material-type dropdown', () => {
  // Reopening with ArrowDown now behaves exactly like clicking into the input: a
  // blank filter box over the FULL list. It used to skip that reset, so the box
  // showed the previous search text and the list stayed filtered to it.
  it('reopens with a blank filter after Enter committed a pick, not the old query', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1)], [visualizer, radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const combo = screen.getByRole('combobox', { name: 'Parameter Group.01' })
    fireEvent.click(combo)
    fireEvent.change(combo, { target: { value: 'vis' } })
    // Enter commits the single filtered match, keeping focus in the input.
    fireEvent.keyDown(combo, { key: 'Enter' })
    expect(combo).toHaveValue('Visualiser')

    fireEvent.keyDown(combo, { key: 'ArrowDown' })
    // Not "vis" — the stale query is gone...
    expect(combo).not.toHaveValue('vis')
    // ...and the list is no longer filtered by it.
    expect(screen.getByRole('button', { name: 'Radiation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visualiser' })).toBeInTheDocument()
  })

  it('reopens with a blank filter after Escape dismissed the list', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1)], [visualizer, radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const combo = screen.getByRole('combobox', { name: 'Parameter Group.01' })
    fireEvent.click(combo)
    fireEvent.change(combo, { target: { value: 'vis' } })
    fireEvent.keyDown(combo, { key: 'Escape' })
    fireEvent.keyDown(combo, { key: 'ArrowDown' })

    expect(combo).not.toHaveValue('vis')
    expect(screen.getByRole('button', { name: 'Radiation' })).toBeInTheDocument()
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

  // The baseline used to be captured off the DRAFT each time the pencil was
  // clicked. After a rejected name the draft still holds that invalid text, so it
  // became the baseline — and typing the real name back then read as a change.
  it('does not rename when the original name is restored after a rejected one', () => {
    const store = liveStoreWith([card(1)])
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Clear the name and blur: rejected, no rename, the blank text stays.
    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
    fireEvent.change(screen.getByLabelText('Material name'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Material name'))
    expect(renameTypes(dispatch)).toEqual([])

    // Now put the real name back. That is not a change — it is what the backend
    // already holds — so nothing should be sent.
    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
    fireEvent.change(screen.getByLabelText('Material name'), {
      target: { value: 'Material.001' }
    })
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

  // The header field used to accept anything: a blank name was silently reverted
  // with no message, and an over-long or duplicate one went to the backend. It now
  // runs the same three rules as the left panel's inline row editor.
  describe('validation (matching the left panel and the Geometry form)', () => {
    const openEditor = (store: InjectableStore): HTMLElement => {
      render(
        <Provider store={store}>
          <MaterialPropertiesForm />
        </Provider>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
      return screen.getByLabelText('Material name')
    }

    it('rejects a blank name with "Name is required" and does not rename', () => {
      const store = liveStoreWith([card(1)])
      const dispatch = vi.spyOn(store, 'dispatch')
      const input = openEditor(store)

      fireEvent.change(input, { target: { value: '   ' } })
      expect(screen.getByText('Name is required')).toBeInTheDocument()
      expect(input).toHaveAttribute('aria-invalid', 'true')

      fireEvent.blur(input)
      expect(renameTypes(dispatch)).toEqual([])
      // The text is KEPT, not silently reverted — the error explains what's wrong.
      expect(screen.getByLabelText('Material name')).toHaveValue('   ')
    })

    it('rejects a name over 20 characters', () => {
      const store = liveStoreWith([card(1)])
      const dispatch = vi.spyOn(store, 'dispatch')
      const input = openEditor(store)

      fireEvent.change(input, { target: { value: 'x'.repeat(21) } })
      expect(screen.getByText('Character limit exceeded')).toBeInTheDocument()
      fireEvent.blur(input)
      expect(renameTypes(dispatch)).toEqual([])
    })

    // Uniqueness is the BACKEND's call here, not this form's — a duplicate is sent
    // and shows only once the rename is refused. Same split as Geometry's
    // right-panel form; the left panel's inline row editor still checks locally.
    it('sends a duplicate name rather than flagging it while typing', () => {
      const store = liveStoreWith([card(1)], [], [['37', 'Concrete']])
      const dispatch = vi.spyOn(store, 'dispatch')
      const input = openEditor(store)

      fireEvent.change(input, { target: { value: 'Concrete' } })
      expect(screen.queryByText('Material name already exists')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-invalid', 'false')

      fireEvent.blur(input)
      expect(renameTypes(dispatch)).toEqual([RENAME_MATERIAL_REQUESTED])

      // ...and the backend's refusal is what surfaces it, under this field.
      act(() => {
        store.dispatch(renameMaterialFailed('12', 'Material name already exists'))
      })
      expect(screen.getByText('Material name already exists')).toBeInTheDocument()
    })

    it('accepts a valid change and renames on blur', () => {
      const store = liveStoreWith([card(1)], [], [['37', 'Concrete']])
      const dispatch = vi.spyOn(store, 'dispatch')
      const input = openEditor(store)

      fireEvent.change(input, { target: { value: 'Granite' } })
      expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-invalid', 'false')
      fireEvent.blur(input)
      expect(renameTypes(dispatch)).toEqual([RENAME_MATERIAL_REQUESTED])
    })

    it('shows a backend rejection under the field, and clears it on the next edit', () => {
      const store = liveStoreWith([card(1)])
      render(
        <Provider store={store}>
          <MaterialPropertiesForm />
        </Provider>
      )
      act(() => {
        store.dispatch(renameMaterialFailed('12', 'Material name already exists'))
      })
      expect(screen.getByText('Material name already exists')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Edit name' }))
      fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'Granite' } })
      expect(screen.queryByText('Material name already exists')).not.toBeInTheDocument()
    })
  })
})

describe('<MaterialPropertiesForm /> visualisation type', () => {

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
      store.dispatch(saveParameterGroupSucceeded('12', 1))
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
      store.dispatch(saveParameterGroupSucceeded('12', 1))
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
      store.dispatch(saveParameterGroupFailed('12', 1, 'Nope'))
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

  it('opens with opacity at 100% and the channels showing their letters', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Opacity is a REAL value, not a display-only seed — the slider used to sit at
    // 100 while the box read empty, saying opaque and unset at the same time.
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('100')

    // The channels stay empty (nothing is assumed about the colour), but each box
    // names itself via a greyed placeholder rather than sitting blank.
    for (const channel of ['R', 'G', 'B']) {
      const box = screen.getByLabelText(channel)
      expect(box).toHaveValue('')
      expect(box).toHaveAttribute('placeholder', channel)
    }
  })

  it('keeps Save disabled until a full colour is entered', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const save = screen.getByRole('button', { name: 'Save' })
    // Empty colour → required, so Save is disabled (opacity alone isn't a colour).
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    expect(save).toBeDisabled() // still a channel short

    fireEvent.change(screen.getByLabelText('B'), { target: { value: '30' } })
    // Colour complete, and opacity was already 100 → Save opens.
    expect(save).toBeEnabled()
  })

  // The seed must fire ONCE per card, never in response to the field going empty:
  // '' is a legal in-progress keystroke, so a value-watching effect typed 100
  // straight back and the box could not be cleared.
  it('lets the opacity box be emptied — backspacing through it does not re-seed', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const opacity = screen.getByRole('textbox', { name: 'Opacity' })
    expect(opacity).toHaveValue('100')

    // Backspace to empty, the way a user clears a field before retyping.
    fireEvent.change(opacity, { target: { value: '10' } })
    fireEvent.change(opacity, { target: { value: '1' } })
    fireEvent.change(opacity, { target: { value: '' } })
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('')

    // ...and the retype lands as typed, not appended to a re-seeded 100.
    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), { target: { value: '50' } })
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('50')
  })

  // A persisted card is the backend's business — including a stored opacity of
  // "none". Opening the Custom tab to LOOK at one must not write to it.
  it('does not seed opacity on a saved card, so viewing Custom does not dirty it', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const savedTextureCard = card(1, {
      typeId: 7,
      saved: true,
      // Stored in texture mode: colour + opacity are empty on the backend.
      values: { texture_toggle: 'true', texture_file: 'uploads/grass.png' },
      savedValues: { texture_toggle: 'true', texture_file: 'uploads/grass.png' }
    })
    render(
      <Provider store={liveStoreWith([savedTextureCard], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // The card opens on the Texture tab; switch to Custom just to look.
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('')
    // Nothing was written, so the card is still clean and Save stays shut.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // Saving a colour must clear the texture half of the value bag, the mirror of
  // what the texture save does to the colour half. The payload was always right;
  // the DRAFT wasn't — and the draft is what gets snapshotted into savedValues and
  // the detail cache, so the card reopened on the Texture tab showing the old
  // image with the colour just saved nowhere in sight.
  it('clears the texture fields when a colour is saved over a texture', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const textureCard = card(1, {
      typeId: 7,
      saved: true,
      values: { texture_toggle: 'true', texture_file: 'uploads/grass.png' },
      savedValues: { texture_toggle: 'true', texture_file: 'uploads/grass.png' }
    })
    const store = liveStoreWith([textureCard], [visualizer])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '30' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const cardValues = (store.getState() as unknown as { materials: MaterialsState }).materials
      .editDraft?.groups[0].values
    // The card now reads as a COLOUR: reopening it lands on Custom, not Texture.
    expect(cardValues?.texture_toggle).toBe('false')
    expect(cardValues?.texture_file).toBe('')
    expect(cardValues?.color_r).toBe('10')
  })

  // A library pick is the ONLY thing that enables Save in texture mode, and Save
  // sits outside the texture grid — so clearing the pick on blur meant tabbing
  // from a tile to Save dropped it and disabled the button on the way, leaving
  // library textures unreachable without a pointer.
  // The pick is transient: clicking away from the card drops it. But it is also
  // the only thing that enables Save, and Save sits outside the texture grid — so
  // clearing it on the tile's BLUR meant tabbing towards Save cleared it and
  // disabled the button on the way. It is now a pointer press outside the card.
  const pickTexture = async (): Promise<HTMLElement> => {
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    const tile = await screen.findByRole('button', { name: 'Use texture grass' })
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    return tile
  }

  it('keeps a library texture selected when focus tabs off the tile', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const tile = await pickTexture()

    // Tab moves focus without any pointer press — the pick and Save both survive.
    fireEvent.blur(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('keeps it when the press lands elsewhere INSIDE the card, e.g. on Save', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const tile = await pickTexture()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Save' }))
    expect(tile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('drops it when the click lands OUTSIDE the card', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const tile = await pickTexture()

    fireEvent.mouseDown(document.body)
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('still deselects when the same tile is pressed again', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const tile = await pickTexture()

    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // The card is keyed by group.id, which does NOT change with its type — so the
  // appearance mode, the library pick and the picked file all used to survive a
  // type change, holding an object URL for a file the card no longer had a use
  // for and offering to upload it if the type came back.
  it('drops the picked texture and the mode when the card changes type', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    render(
      <Provider store={liveStoreWith([card(1)], [visualizer, radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Pick Visualiser, go to the texture tab, highlight a library texture.
    const combo = screen.getByRole('combobox', { name: 'Parameter Group.01' })
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('button', { name: 'Visualiser' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    const tile = await screen.findByRole('button', { name: 'Use texture grass' })
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')

    // Switch to another type, then back.
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('button', { name: 'Radiation' }))
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('button', { name: 'Visualiser' }))

    // Back on the Custom tab (the stored mode of a fresh card), and the old
    // library pick is gone — so Save can't apply a texture chosen for the type
    // the card used to hold.
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    expect(await screen.findByRole('button', { name: 'Use texture grass' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    revoke.mockRestore()
  })

  it('does not re-seed an opacity the user cleared to 0', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 7 })], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // 0 is a value the user chose (fully transparent), not an unset field.
    fireEvent.change(screen.getByRole('textbox', { name: 'Opacity' }), { target: { value: '0' } })
    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('0')
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
