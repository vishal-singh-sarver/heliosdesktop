import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { initialState as projectScreenInitialState } from 'containers/ProjectScreen/reducer'
import type { CatalogPropertyDef, MaterialTypeDef } from 'containers/ProjectScreen/types'
import { InjectableStore } from 'store/configureStore'
import MaterialPropertiesForm from '../MaterialPropertiesForm'
import {
  renameMaterialFailed,
  saveParameterGroupFailed,
  saveParameterGroupSucceeded,
  uploadTextureSucceeded,
  type MaterialsAction
} from '../actions'
import {
  RENAME_MATERIAL_REQUESTED,
  SAVE_PARAMETER_GROUP_REQUESTED,
  UPLOAD_TEXTURE_REQUESTED
} from '../constants'
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
  uploadStatus: 'idle',
  uploadError: null,
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
  ],
  groups: []
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
  ],
  groups: []
}

// A store frozen on one open material draft with a single Material Type card.
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
            createdAt: ''
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

describe('<MaterialPropertiesForm /> opening state', () => {
  // A row click that misses the cache sets openingId; the panel shows a spinner
  // instead of leaving the previous material (or nothing) on screen.
  const openingStore = (openingId: string, draft: unknown): InjectableStore => {
    const state = {
      materials: { ...materialsInitialState, openingId, editDraft: draft },
      projectScreen: projectScreenInitialState
    }
    const store = createStore(((s = state) => s) as Reducer<unknown, UnknownAction>) as InjectableStore
    store.injectedReducers = {}
    store.injectedSagas = {}
    store.runSaga = () => ({ toPromise: () => Promise.resolve() }) as any
    store.createReducer = () => ((s = state) => s) as Reducer<unknown, UnknownAction>
    return store
  }

  it('shows a spinner while a material is being opened from nothing', () => {
    render(
      <Provider store={openingStore('7', null)}>
        <MaterialPropertiesForm />
      </Provider>
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Opening material…')).toBeInTheDocument()
  })

  it('does NOT show a spinner when re-opening the material already shown', () => {
    const draft = { groupId: '7', name: 'A', nameError: null, groups: [card(1)], nextGroupId: 2 }
    render(
      <Provider store={openingStore('7', draft)}>
        <MaterialPropertiesForm />
      </Provider>
    )
    // openingId === the shown draft → keep its form up, no spinner.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('<MaterialPropertiesForm /> parameter-group card', () => {
  it('toggles the card open and closed on every arrow click', () => {
    render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
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

    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
    // The title sits on the header row — clicking it collapses the card.
    fireEvent.click(screen.getByText('Material Type.01'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByText('Material Type.01'))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('the material-type dropdown arrow both opens AND closes the list', () => {
    const { container } = render(
      <Provider store={storeWith([card(1)])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const combobox = screen.getByRole('combobox', { name: 'Material Type.01' })
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

    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Material Type.01' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('<MaterialPropertiesForm /> conditional parameter groups', () => {
  // A Stomatal-Conductance-shaped type: a top-level selector enum + one group
  // gated on it.
  const stomatal: MaterialTypeDef = {
    id: 6,
    materialtype: 'Stomatal Conductance',
    description: '',
    properties: [
      {
        property_type_id: 74,
        property: 'stomatal_model',
        label: 'Stomatal Conductance',
        description: '',
        datatype: 'enum',
        min: null,
        max: null,
        enum_values: ['BWB', 'BBL'],
        display_order: 10
      }
    ],
    groups: [
      {
        name: 'Ball-woodrow-berry',
        selector_property: 'stomatal_model',
        selector_value: 'BWB',
        display_order: 11,
        properties: [
          {
            property_type_id: 62,
            property: 'bwb_gs0',
            label: 'gs, o',
            description: '',
            datatype: 'float',
            min: 0,
            max: 1,
            display_order: 11
          }
        ]
      }
    ]
  }

  it('hides a selector group until its enum value is chosen', () => {
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 6 })], [stomatal])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    // The top-level selector always shows; the conditional group's field does not
    // yet. (The friendly option label lives in the dropdown regardless, so we test
    // on the group's own field instead.)
    expect(screen.queryByText('gs, o')).not.toBeInTheDocument()
  })

  it('reveals the selector group once its value is set', () => {
    render(
      <Provider
        store={liveStoreWith(
          [card(1, { typeId: 6, values: { stomatal_model: 'BWB' } })],
          [stomatal]
        )}
      >
        <MaterialPropertiesForm />
      </Provider>
    )
    expect(screen.getByText('gs, o')).toBeInTheDocument()
  })

  it('labels the selector dropdown with friendly model names, not raw codes', () => {
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 6 })], [stomatal])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    // The enum field is our own dropdown now, so its list only exists once
    // opened — and the raw code never surfaces as a label.
    fireEvent.click(screen.getByRole('combobox', { name: /Stomatal Conductance/ }))

    expect(screen.getByRole('option', { name: 'Ball-woodrow-berry' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'BWB' })).not.toBeInTheDocument()
  })
})

describe('<MaterialPropertiesForm /> Radiation editor', () => {
  const bandProp = (property: string, order: number): CatalogPropertyDef => ({
    property_type_id: order,
    property,
    description: '',
    datatype: 'float',
    min: 0,
    max: 1,
    display_order: order
  })
  const radiationType: MaterialTypeDef = {
    id: 1,
    materialtype: 'Radiation',
    description: '',
    properties: [
      { ...bandProp('specular_exponent', 5), min: 1, max: 1000, label: 'Specular exponent' },
      { ...bandProp('specular_scale', 6), min: 0, max: 100, label: 'Specular scale' },
      {
        property_type_id: 21,
        property: 'two_sided_heat_transfer',
        label: 'Heat Transfer Flag',
        description: '',
        datatype: 'enum',
        min: null,
        max: null,
        enum_values: ['One Sided', 'Two Sided'],
        display_order: 7
      },
      {
        property_type_id: 22,
        property: 'spectral_data',
        description: '',
        datatype: 'file',
        min: null,
        max: null,
        display_order: 8
      },
      {
        property_type_id: 84,
        property: 'use_radiation_bands',
        description: '',
        datatype: 'boolean',
        min: null,
        max: null,
        display_order: 9
      },
      bandProp('reflectivity_PAR', 10),
      bandProp('transmissivity_PAR', 11),
      bandProp('emissivity_PAR', 12),
      bandProp('reflectivity_NIR', 13),
      bandProp('transmissivity_NIR', 14),
      bandProp('emissivity_NIR', 15),
      bandProp('reflectivity_LW', 16),
      bandProp('transmissivity_LW', 17),
      bandProp('emissivity_LW', 18)
    ],
    groups: []
  }

  it('renders the spectral toggle and per-band inputs, editable in manual mode', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    const parInput = container.querySelector<HTMLInputElement>('[id="1-reflectivity_PAR"]')
    expect(parInput).not.toBeNull()
    expect(parInput?.disabled).toBe(false)
  })

  it('applying spectral data disables the per-band inputs', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    const parInput = container.querySelector<HTMLInputElement>('[id="1-reflectivity_PAR"]')
    expect(parInput?.disabled).toBe(true)
  })

  // Disabling alone is invisible: FormField gives a disabled INPUT no styling, so
  // the box looked editable while swallowing every keystroke. The band fields carry
  // their own muted fill/border/text so the state reads on screen.
  it('greys the per-band inputs so the disabled state is visible', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const parInput = container.querySelector<HTMLInputElement>('[id="1-reflectivity_PAR"]')
    for (const cls of [
      'disabled:bg-[#424242]',
      'disabled:border-[#424242]',
      'disabled:text-neutral-300',
      'disabled:cursor-not-allowed'
    ]) {
      expect(parInput?.className).toContain(cls)
    }
  })

  it('flags all three band fields and blocks Save when R+T+E exceed 1', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const setBand = (prop: string, val: string): void => {
      fireEvent.change(container.querySelector<HTMLInputElement>(`[id="1-${prop}"]`)!, {
        target: { value: val }
      })
    }
    const sumMsg = /The sum of reflectivity, transmissivity and emissivity can't exceed 1/

    setBand('reflectivity_PAR', '0.6')
    setBand('transmissivity_PAR', '0.6') // 0.6 + 0.6 = 1.2 > 1

    // The message shows on all three PAR fields (via the info-icon tooltip), and
    // Save is blocked.
    expect(screen.getAllByLabelText(sumMsg)).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    // Bringing the sum back to ≤ 1 clears the flag and re-enables Save.
    setBand('transmissivity_PAR', '0.2') // 0.6 + 0.2 = 0.8 ≤ 1
    expect(screen.queryByLabelText(sumMsg)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('ignores the band-sum rule while spectral mode is ON (bands are superseded)', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    const setBand = (prop: string, val: string): void => {
      fireEvent.change(container.querySelector<HTMLInputElement>(`[id="1-${prop}"]`)!, {
        target: { value: val }
      })
    }
    const sumMsg = /The sum of reflectivity, transmissivity and emissivity can't exceed 1/

    // Over-1 bands in manual mode → flagged + Save blocked.
    setBand('reflectivity_PAR', '0.6')
    setBand('transmissivity_PAR', '0.6') // 1.2 > 1
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    // Toggle spectral ON: the bands are now disabled and will be dropped on save,
    // so the sum rule no longer applies — no flag, and Save is not blocked by it.
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByLabelText(sumMsg)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('deletes the spectral file on a toggle-OFF (manual) save', () => {
    // A card saved in spectral mode (savedValues holds the file), now toggled to
    // manual — the draft still carries the path until the post-save reducer clears
    // it. Manual mode keeps no file, so the save must mark it for deletion.
    const store = liveStoreWith(
      [
        card(1, {
          typeId: 1,
          saved: true,
          values: { use_radiation_bands: 'true', spectral_data: 'uploads/groups/12/leaf.xml' },
          savedValues: { use_radiation_bands: 'false', spectral_data: 'uploads/groups/12/leaf.xml' }
        })
      ],
      [radiationType]
    )
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const saveAction = dispatch.mock.calls
      .map((c) => c[0] as { type: string; payload?: { obsoleteFilePath?: string } })
      .find((a) => a?.type === SAVE_PARAMETER_GROUP_REQUESTED)
    expect(saveAction?.payload?.obsoleteFilePath).toBe('uploads/groups/12/leaf.xml')
  })

  // XML only, at most 5 MB. The backend enforces the extension but not the size,
  // so the size guard is the client's — and rejecting here avoids pushing a large
  // file over the wire only to have it refused.
  it('rejects a non-XML file and one over 5 MB, without uploading either', () => {
    const { container } = render(
      <Provider store={liveStoreWith([card(1, { typeId: 1, saved: true })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    fireEvent.click(screen.getByRole('switch'))
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!

    const wrongType = new File(['x'], 'leaf.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [wrongType] } })
    expect(screen.getByText('Only XML files are allowed')).toBeInTheDocument()

    const tooBig = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'leaf.xml', {
      type: 'text/xml'
    })
    fireEvent.change(input, { target: { files: [tooBig] } })
    expect(screen.getByText('File must be 5 MB or smaller')).toBeInTheDocument()
  })

  it('enables the spectral upload on an unsaved card (upload no longer needs the member)', () => {
    render(
      <Provider store={liveStoreWith([card(1, { typeId: 1 })], [radiationType])}>
        <MaterialPropertiesForm />
      </Provider>
    )
    fireEvent.click(screen.getByRole('switch'))
    // The upload only stores a file + returns a path; the member is written on
    // Save. So Upload is available immediately, with no "save first" hint.
    expect(screen.getByRole('button', { name: 'Upload Here' })).not.toBeDisabled()
    expect(
      screen.queryByText('Save the material first to attach a spectral data file')
    ).not.toBeInTheDocument()
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

    const first = screen.getByRole('button', { name: 'Toggle Material Type.01' })
    expect(first).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Add Material Type' }))

    // The card that was already open STAYS open — adding a second one used to
    // collapse it.
    expect(first).toHaveAttribute('aria-expanded', 'true')
    const second = screen.getByRole('button', { name: 'Toggle Material Type.02' })
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
      properties: [],
      groups: []
    }
    render(
      <Provider store={liveStoreWith([card(1)], [radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Collapse the card. Its type Select stays visible even while collapsed.
    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Pick a type — the parameters render in the (hidden) body, so selecting must
    // re-open the card.
    fireEvent.click(screen.getByRole('combobox', { name: 'Material Type.01' }))
    fireEvent.click(screen.getByRole('option', { name: 'Radiation' }))
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

    const combo = screen.getByRole('combobox', { name: 'Material Type.01' })
    fireEvent.click(combo)
    fireEvent.change(combo, { target: { value: 'vis' } })
    // Enter commits the single filtered match, keeping focus in the input.
    fireEvent.keyDown(combo, { key: 'Enter' })
    expect(combo).toHaveValue('Visualiser')

    fireEvent.keyDown(combo, { key: 'ArrowDown' })
    // Not "vis" — the stale query is gone...
    expect(combo).not.toHaveValue('vis')
    // ...and the list is no longer filtered by it.
    expect(screen.getByRole('option', { name: 'Radiation' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Visualiser' })).toBeInTheDocument()
  })

  it('reopens with a blank filter after Escape dismissed the list', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <Provider store={liveStoreWith([card(1)], [visualizer, radiation])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const combo = screen.getByRole('combobox', { name: 'Material Type.01' })
    fireEvent.click(combo)
    fireEvent.change(combo, { target: { value: 'vis' } })
    fireEvent.keyDown(combo, { key: 'Escape' })
    fireEvent.keyDown(combo, { key: 'ArrowDown' })

    expect(combo).not.toHaveValue('vis')
    expect(screen.getByRole('option', { name: 'Radiation' })).toBeInTheDocument()
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

  it('keeps the card open once its save lands', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 1 })], [radiation])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Fill it in and save: the click puts the card into 'saving', the saga answers.
    fireEvent.change(screen.getByLabelText('Surface Albedo'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      store.dispatch(saveParameterGroupSucceeded('12', 1))
    })

    // A successful save leaves the card exactly as it was — folding it away hid
    // the values the user had just committed, at the point they'd want to check
    // them. Collapsing stays a manual act (the header toggle).
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Surface Albedo')).toHaveValue('0.5')
    expect(screen.getByRole('combobox', { name: 'Material Type.01' })).toHaveValue('Radiation')
  })

  it('leaves the card open when the save fails, so the error is visible', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 1 })], [radiation])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const toggle = screen.getByRole('button', { name: 'Toggle Material Type.01' })
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
    // The error surfaces as the info-icon tooltip (aria-label), not an inline line.
    expect(screen.getByLabelText(/This input is not supported/)).toBeInTheDocument()
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
    expect(screen.getByLabelText(/This input is not supported/)).toBeInTheDocument()
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
    expect(screen.getByLabelText(/Values should be between 0-255/)).toBeInTheDocument()
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
    expect(screen.getByLabelText(/Values should be between 0-255/)).toBeInTheDocument()
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
    expect(screen.getByLabelText(/Values should be between 0-100/)).toBeInTheDocument()
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

  // Reopening a saved texture member must say WHICH texture it holds. The
  // highlight used to come only from the session's transient pick, which is null
  // on a fresh open — so a saved card showed the grid with nothing marked and the
  // user had no way to tell which tile was applied.
  it('highlights the stored library texture on a saved card, with no pick made', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    const savedTextureCard = card(1, {
      typeId: 7,
      saved: true,
      values: { texture_toggle: 'true', texture_file: 'uploads/grass.png' },
      savedValues: { texture_toggle: 'true', texture_file: 'uploads/grass.png' }
    })
    render(
      <Provider store={liveStoreWith([savedTextureCard], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    const tile = await screen.findByRole('button', { name: 'Use texture grass' })
    expect(tile).toHaveAttribute('aria-pressed', 'true')

    // …and the Upload tab must NOT claim it as an upload: the two tabs are
    // independent, and this texture came from the library.
    fireEvent.click(screen.getByRole('button', { name: 'Upload File' }))
    expect(screen.queryByAltText('Selected texture')).not.toBeInTheDocument()
  })

  // The other half of that rule: a texture the user really did upload is not in
  // the library list, so reopening the member still previews it.
  it('previews a stored UPLOADED texture in the Upload tab', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    const uploadedCard = card(1, {
      typeId: 7,
      saved: true,
      values: { texture_toggle: 'true', texture_file: 'uploads/my-photo.png' },
      savedValues: { texture_toggle: 'true', texture_file: 'uploads/my-photo.png' }
    })
    render(
      <Provider store={liveStoreWith([uploadedCard], [visualizer])}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Wait for the library list to land — until it does, nothing can be classified.
    await screen.findByRole('button', { name: 'Use texture grass' })
    fireEvent.click(screen.getByRole('button', { name: 'Upload File' }))
    expect(screen.getByAltText('Selected texture')).toBeInTheDocument()
  })

  // The upload is a step BEFORE Save: picking a file POSTs it right away, so its
  // stored URL is in the draft by the time the user presses Save.
  it('uploads the picked texture immediately, on pick (not on Save)', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 7 })], [visualizer])
    const dispatch = vi.spyOn(store, 'dispatch')
    const { container } = render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Custom → Select Texture → Upload File sub-tab.
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload File' }))

    // Picking a file fires the upload right away — no Save click.
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'grass.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    const uploads = dispatch.mock.calls
      .map((c) => c[0] as { type?: string })
      .filter((a) => a.type === UPLOAD_TEXTURE_REQUESTED)
    expect(uploads).toHaveLength(1)
  })

  // The upload endpoint now only STORES the file and returns its path — it does
  // NOT persist the member. So a texture upload stages the path and leaves the
  // card unsaved + dirty, and Save IS offered (it POSTs the member with the path).
  it('a texture upload leaves the card unsaved, so Save is offered', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const store = liveStoreWith([card(1, { typeId: 7 })], [visualizer])
    render(
      <Provider store={store}>
        <MaterialPropertiesForm />
      </Provider>
    )

    // Switch to the Texture tab (where a real upload happens), then land the path.
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    act(() => {
      store.dispatch(uploadTextureSucceeded('12', 1, 'uploads/materials/12/grass.png'))
    })

    // The member isn't saved yet — Save is enabled and the card is still unsaved.
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    expect(
      (store.getState() as unknown as { materials: MaterialsState }).materials.editDraft?.groups[0]
        .saved
    ).toBe(false)
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
    const combo = screen.getByRole('combobox', { name: 'Material Type.01' })
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('option', { name: 'Visualiser' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Texture' }))
    const tile = await screen.findByRole('button', { name: 'Use texture grass' })
    fireEvent.click(tile)
    expect(tile).toHaveAttribute('aria-pressed', 'true')

    // Switch to another type, then back.
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('option', { name: 'Radiation' }))
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('option', { name: 'Visualiser' }))

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
