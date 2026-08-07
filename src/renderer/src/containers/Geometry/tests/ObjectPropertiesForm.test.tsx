import { act, fireEvent, render, screen, within } from '@testing-library/react'
import materialsReducer, {
  initialState as materialsInitialState
} from 'containers/Materials/reducer'
import type { Material, MaterialGroupDetail } from 'containers/Materials/types'
import projectScreenReducer, {
  initialState as projectScreenInitialState
} from 'containers/ProjectScreen/reducer'
import type {
  CatalogPropertyDef,
  MaterialTypeDef,
  ObjectTypeDef
} from 'containers/ProjectScreen/types'
import { Provider } from 'react-redux'
import { combineReducers, createStore, type Reducer } from 'redux'
import type { InjectableStore } from 'store/configureStore'
import snackbarReducer, { initialState as snackbarInitialState } from 'store/snackbarReducer'
import * as actions from '../actions'
import { ObjectPropertiesForm } from '../ObjectPropertiesForm'
import geometryReducer, {
  emptyScenarioGeometry,
  initialState as geometryInitialState,
  scopeKey
} from '../reducer'
import type { DraftMaterialGroup, GeoNode, GeometryState } from '../types'

// jsdom doesn't implement <dialog>.showModal()/close(); polyfill them (reflecting
// the `open` attribute) so the confirm dialogs can actually open in tests.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    this.removeAttribute('open')
  }
})

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
  createdAt: '2026-01-01T00:00:00Z'
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
    // Which of `draftMaterials` are already saved on the object. Defaults to all
    // of them; pass [] for a material only PICKED this session (never saved), so
    // replacing it needs no confirmation.
    materialBaseline?: string[]
    materialTypes?: MaterialTypeDef[]
    materialDetails?: MaterialGroupDetail[]
    // Property values the draft OPENS with — the equivalent of a saved ground
    // loaded by GET. Defaults to {} (every field blank), which is what the
    // create-form tests below rely on.
    draftValues?: Record<string, string>
  } = {}
): InjectableStore {
  // Cast mirrors store/reducers.ts — combineReducers' inferred type doesn't
  // satisfy the bare Reducer the injectable store expects under Redux 5.
  const rootReducer = (injected: Record<string, Reducer> = {}): Reducer =>
    combineReducers({
      geometry: geometryReducer,
      projectScreen: projectScreenReducer,
      materials: materialsReducer,
      // Always-combined in the real app; included so the form's info toast
      // ("already assigned") lands somewhere the tests can read.
      snackbar: snackbarReducer,
      ...injected
    }) as unknown as Reducer

  const preloaded = {
    snackbar: snackbarInitialState,
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
        values: opts.draftValues ?? {},
        materials: opts.draftMaterials ?? [],
        materialBaseline:
          opts.materialBaseline ?? (opts.draftMaterials ?? []).map((m) => m.groupId),
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
        objectTypes: {
          byId: { 1: groundType },
          allIds: [1],
          loadStatus: 'loaded',
          loadError: null
        },
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

// True once the save PATCH has been dispatched (the reducer flips this the
// moment UPDATE_OBJECT_REQUESTED lands), which is how these tests tell "Save
// actually ran" from "Save was blocked by the confirmation".
//
// Cast because the geometry slice is INJECTED at runtime, so the app's RootState
// type — which only knows the always-combined slices — has no `geometry` on it.
const isSaving = (store: InjectableStore): boolean =>
  (store.getState() as unknown as { geometry: { createDraft: { saving: boolean } } }).geometry
    .createDraft.saving

const fieldInput = (container: HTMLElement, name: string): HTMLInputElement => {
  const el = container.querySelector(`input[name="${name}"]`)
  if (!el) throw new Error(`input[name="${name}"] not rendered`)
  return el as HTMLInputElement
}

// ── Anchored-popup test rig ───────────────────────────────────────────────────
// AnchoredPopup places a popup by measuring it against its anchor, and jsdom has
// no layout — every element reports a zero rect. These helpers supply the two
// measurements it needs: a right-panel <aside> whose rect the test controls, and
// a popup that reports the size it actually rendered at.

const PANEL_WIDTH = 340

const domRect = (top: number, left: number, width: number, height: number): DOMRect =>
  ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  }) as DOMRect

/** A panel rect the test can move mid-run, to stand in for a window resize. */
function panelRect(init: { top: number; left: number; height: number }): {
  set: (next: { top: number; left: number; height: number }) => void
  read: () => DOMRect
} {
  let r = { ...init }
  return {
    set: (next) => {
      r = { ...next }
    },
    read: () => domRect(r.top, r.left, PANEL_WIDTH, r.height)
  }
}

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realGetBoundingClientRect
})

/**
 * Render the form inside a right panel whose rect the test drives, with popups
 * reporting a real size so AnchoredPopup can place them. Width comes from the
 * popup component's Tailwind class (which jsdom won't compute), height from the
 * inline style it renders — so a popup that resizes itself is measured as such.
 */
function renderInPanel(rect: ReturnType<typeof panelRect>): ReturnType<typeof render> {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    // AnchoredPopup's positioned wrapper — the element it measures.
    if (this.classList.contains('z-50')) {
      const popup = this.firstElementChild as HTMLElement | null
      if (!popup) return domRect(0, 0, 0, 0)
      const width = popup.className.includes('w-[240px]') ? 240 : 370
      return domRect(0, 0, width, parseFloat(popup.style.height || '0'))
    }
    return realGetBoundingClientRect.call(this)
  }

  const result = render(
    <aside>
      <Provider store={makeStore([material('m1', 'Cotton')])}>
        <ObjectPropertiesForm />
      </Provider>
    </aside>
  )
  const aside = result.container.querySelector('aside') as HTMLElement
  aside.getBoundingClientRect = rect.read
  return result
}

/** Fire the window resize AnchoredPopup listens for, and let it re-measure. */
const resizeWindow = (): void => {
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

describe('<ObjectPropertiesForm /> — material properties popup', () => {
  // Pick Cotton from the Select popup, leaving it listed under the Materials row.
  // Picking dismisses the popup, so afterwards the only 'Cotton' button on the
  // page is the picked row in the form body.
  const pickCotton = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cotton' }))
  }

  /** The Select popup, portaled to document.body. */
  const openPopup = (): HTMLElement => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    return screen.getByText('Select Materials').parentElement!.parentElement as HTMLElement
  }

  it('lists the material already assigned to the ground, ticked', () => {
    render(
      <Provider
        store={makeStore([material('m1', 'Cotton'), material('m2', 'Steel')], {
          // Cotton (library id m1) is already assigned to this ground.
          draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
        })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    // The assigned material is NOT filtered out any more — it's the row carrying
    // the tick, so hiding it would leave the current selection invisible.
    const popup = openPopup()

    expect(within(popup).getByRole('radio', { name: 'Cotton' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(within(popup).getByRole('radio', { name: 'Steel' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('picking a material lists it in the Materials section and ticks it', () => {
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton'), material('m2', 'Steel')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const popup = openPopup()
    expect(within(popup).getByRole('radio', { name: 'Cotton' })).toHaveAttribute(
      'aria-checked',
      'false'
    )

    fireEvent.click(within(popup).getByRole('radio', { name: 'Cotton' }))

    // Picking dismisses the popup — the pick is done and the new row is visible
    // behind it.
    expect(screen.queryByText('Select Materials')).not.toBeInTheDocument()
    // …and it's now listed in the form's Materials section.
    expect(within(container).getByRole('button', { name: 'Cotton' })).toBeInTheDocument()

    // Reopening shows the pick remembered as the ticked row, so the popup
    // reflects the draft rather than resetting.
    expect(within(openPopup()).getByRole('radio', { name: 'Cotton' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('picking a different material REPLACES the previous one', () => {
    // A ground carries exactly one material: choosing Steel drops Cotton from the
    // Materials section rather than listing both.
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton'), material('m2', 'Steel')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Cotton' }))
    expect(within(container).getByRole('button', { name: 'Cotton' })).toBeInTheDocument()

    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Steel' }))

    expect(within(container).getByRole('button', { name: 'Steel' })).toBeInTheDocument()
    expect(within(container).queryByRole('button', { name: 'Cotton' })).not.toBeInTheDocument()

    // The tick moved with it — Steel is now the selected row, Cotton is not.
    const reopened = openPopup()
    expect(within(reopened).getByRole('radio', { name: 'Steel' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(within(reopened).getByRole('radio', { name: 'Cotton' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('reports "already assigned" when the ticked material is picked again', () => {
    // Nothing to toggle off and nothing to replace — the pick must leave the
    // selection alone and say why, instead of the click vanishing silently.
    const store = makeStore([material('m1', 'Cotton')], {
      draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
    })
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const popup = openPopup()

    fireEvent.click(within(popup).getByRole('radio', { name: 'Cotton' }))

    expect(store.getState().snackbar).toMatchObject({
      message: 'This material is already assigned to Ground.001',
      variant: 'info'
    })
    // No confirmation — nothing is being replaced.
    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(within(container).getByRole('button', { name: 'Cotton' })).toBeInTheDocument()
  })

  // Save is gated on a valid form; fill every required field so it's clickable.
  const fillRequired = (container: HTMLElement): void => {
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
  }

  it('swaps the pick without confirming — nothing is committed until Save', () => {
    const store = makeStore([material('m1', 'Cotton'), material('m2', 'Steel')], {
      draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
    })
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )

    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Steel' }))

    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(within(container).getByRole('button', { name: 'Steel' })).toBeInTheDocument()
    expect(within(container).queryByRole('button', { name: 'Cotton' })).not.toBeInTheDocument()
  })

  it('confirms on Save when the pick displaces the material saved on the ground', () => {
    const store = makeStore([material('m1', 'Cotton'), material('m2', 'Steel')], {
      draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
    })
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fillRequired(container)
    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Steel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The dialog is up and nothing has been sent — the form is still idle.
    expect(
      screen.getByText(
        'Are you sure you want to replace the material already assigned to Ground.001?'
      )
    ).toBeInTheDocument()
    expect(isSaving(store)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))

    expect(isSaving(store)).toBe(true)
  })

  it('does not save when the replace confirmation is cancelled', () => {
    const store = makeStore([material('m1', 'Cotton'), material('m2', 'Steel')], {
      draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
    })
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fillRequired(container)
    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Steel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Nothing sent, and the pick survives so Save can be retried.
    expect(isSaving(store)).toBe(false)
    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(within(container).getByRole('button', { name: 'Steel' })).toBeInTheDocument()
  })

  it('saves a draft-only pick without confirming', () => {
    // Picked this session, never saved: no backend assignment is displaced, so
    // there is no progress to lose. Matches how the trash icon treats it.
    const store = makeStore([material('m1', 'Cotton'), material('m2', 'Steel')], {
      draftMaterials: [{ groupId: 'm1', name: 'Cotton' }],
      materialBaseline: []
    })
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fillRequired(container)
    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Steel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(isSaving(store)).toBe(true)
  })

  it('saves a first-time material pick without confirming', () => {
    // The ground carries nothing yet — adding a material displaces no progress.
    const store = makeStore([material('m1', 'Cotton')])
    const { container } = render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fillRequired(container)
    fireEvent.click(within(openPopup()).getByRole('radio', { name: 'Cotton' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(isSaving(store)).toBe(true)
  })

  it('filters the material list by the search query', () => {
    render(
      <Provider store={makeStore([material('m1', 'Cotton'), material('m2', 'Steel')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const popup = openPopup()

    fireEvent.change(within(popup).getByRole('textbox', { name: 'Search materials' }), {
      target: { value: 'steel' }
    })

    expect(within(popup).getByRole('radio', { name: 'Steel' })).toBeInTheDocument()
    expect(within(popup).queryByRole('radio', { name: 'Cotton' })).not.toBeInTheDocument()
  })

  it('trash icon removes a draft-only material immediately, with no confirm dialog', () => {
    const { container } = render(
      <Provider store={makeStore([material('m1', 'Cotton')])}>
        <ObjectPropertiesForm />
      </Provider>
    )
    // Pick Cotton this session → it's in the draft but NOT the baseline.
    pickCotton()
    expect(within(container).getByRole('button', { name: 'Cotton' })).toBeInTheDocument()

    // Trash it → dropped from the section right away, no dialog opened.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cotton' }))
    expect(within(container).queryByRole('button', { name: 'Cotton' })).not.toBeInTheDocument()
    expect(document.querySelector('dialog[open]')).toBeNull()
  })

  it('trash icon on a saved material opens the unassign confirm dialog', () => {
    render(
      <Provider
        store={makeStore([material('m1', 'Cotton')], {
          // A material seeded here also lands in the baseline (already saved).
          draftMaterials: [{ groupId: 'm1', name: 'Cotton' }]
        })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    expect(
      screen.queryByText('Are you sure you want to unassign "Cotton"?')
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Cotton' }))

    expect(screen.getByText('Are you sure you want to unassign "Cotton"?')).toBeInTheDocument()
    expect(
      screen.getByText('This action will delete any progress made using this material.')
    ).toBeInTheDocument()
  })

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

  it('sizes the popup to 80% of the 3D-window height and vertically centers it', () => {
    // The popup is sized/centered against the surrounding right-panel <aside> —
    // a flex sibling of the 3D window, so it shares the window's top and height.
    // A 600px-tall panel at top 100 → height round(600*0.8)=480, and centering a
    // 480-tall popup in it → top 100+(600-480)/2=160. Its left edge sits 8px
    // clear of the panel → 400-370-8=22.
    const { container } = renderInPanel(panelRect({ top: 100, left: 400, height: 600 }))

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cotton' }))
    fireEvent.click(within(container).getByRole('button', { name: 'Cotton' }))

    // Fixed height (the body scrolls inside it), not a content-hugging box.
    const dialog = screen.getByRole('dialog', { name: 'Cotton properties' })
    expect(dialog).toHaveStyle({ height: '480px' })
    // The portal wrapper carries the computed position — centered in the panel.
    expect(dialog.parentElement).toHaveStyle({ top: '160px', left: '22px' })
  })

  it('follows the panel when the window is resized', async () => {
    // The regression this replaced: the popup measured once on open and froze
    // there, so resizing moved the trigger out from under it. AnchoredPopup
    // re-measures on the resize instead. Shrinking the panel from 700 to 500 tall
    // re-derives the height (round(500*0.8)=400) and the centred top
    // (30+(500-400)/2=80); narrowing it pulls the popup left until it would go
    // negative (300-370-8=-78) and clamps to the 8px viewport padding.
    const rect = panelRect({ top: 30, left: 400, height: 700 })
    const { container } = renderInPanel(rect)

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cotton' }))
    fireEvent.click(within(container).getByRole('button', { name: 'Cotton' }))

    const dialog = screen.getByRole('dialog', { name: 'Cotton properties' })
    expect(dialog).toHaveStyle({ height: '560px' })
    expect(dialog.parentElement).toHaveStyle({ top: '100px', left: '22px' })

    rect.set({ top: 30, left: 300, height: 500 })
    resizeWindow()

    expect(dialog).toHaveStyle({ height: '400px' })
    expect(dialog.parentElement).toHaveStyle({ top: '80px', left: '8px' })
  })

  it("shows an assigned material's properties (from the GET) in the read-only popup", () => {
    const radiationType: MaterialTypeDef = {
      id: 5,
      materialtype: 'Radiation',
      description: '',
      properties: [prop('reflectivity', 1, { group: 'model' })],
      groups: []
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
      <Provider
        store={makeStore([], { draftMaterials: [assigned], materialTypes: [radiationType] })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    // The type accordion is expanded by default, so the resolved property + value show.
    expect(within(dialog).getByText('Reflectivity')).toBeInTheDocument()
    expect(within(dialog).getByText('0.3')).toBeInTheDocument()
  })

  // A Windows backend stores native paths, which contain no '/' at all. Taking the
  // basename by splitting on '/' alone returned the WHOLE path, so the popup's
  // "Texture Name" read as the install directory (title-cased, extension stripped)
  // instead of the texture.
  it('shows only the texture file name, from a Windows-style stored path', () => {
    const visualiserType: MaterialTypeDef = {
      id: 7,
      materialtype: 'Visualiser',
      description: '',
      // `color_r` is what marks a group as the visualisation set.
      properties: [
        prop('color_r', 1, { datatype: 'integer', min: 0, max: 255 }),
        prop('texture_file', 2),
        prop('texture_toggle', 3, { datatype: 'boolean' })
      ],
      groups: []
    }
    const assigned: DraftMaterialGroup = {
      groupId: '41',
      name: 'Grass',
      materials: [
        {
          materialTypeId: 7,
          materialTypeName: 'Visualiser',
          properties: {
            texture_toggle: true,
            texture_file:
              'C:\\Program Files\\Helios\\resources\\backend\\heliosguiBackend.exe\\_Internal\\assets\\grass.jpg'
          }
        }
      ]
    }
    const { container } = render(
      <Provider
        store={makeStore([], { draftMaterials: [assigned], materialTypes: [visualiserType] })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    // The value sits in the <dd> right after the "Texture Name" <dt>. Targeted
    // this way because the material is also NAMED Grass — a bare text query would
    // match the popup heading and prove nothing.
    const label = within(dialog).getByText('Texture Name')
    // The stored file name, verbatim — not prettified into something that
    // matches nothing in the API response.
    expect(label.nextElementSibling).toHaveTextContent('grass.jpg')
    // The texture image's alt is the same derived name.
    expect(within(dialog).getByRole('img', { name: 'grass.jpg' })).toBeInTheDocument()
    // Nothing of the install path leaks into the popup.
    expect(within(dialog).queryByText(/Program Files/)).not.toBeInTheDocument()
  })

  it('shows the freshly-saved library values, not the stale GET baseline, for an assigned material', () => {
    const radiationType: MaterialTypeDef = {
      id: 5,
      materialtype: 'Radiation',
      description: '',
      properties: [prop('reflectivity', 1, { group: 'model' })],
      groups: []
    }
    // The ground's GET baked in reflectivity 0.3 when it loaded…
    const assigned: DraftMaterialGroup = {
      groupId: '41',
      name: 'Grass',
      materials: [
        { materialTypeId: 5, materialTypeName: 'Radiation', properties: { reflectivity: 0.3 } }
      ]
    }
    // …but the material was since edited to 0.7 in the Materials editor, which the
    // library detail cache holds write-through. Because the assignment is synced,
    // the popup must reflect the current library value, not the stale baseline.
    const detail: MaterialGroupDetail = {
      id: '41',
      name: 'Grass',
      members: [{ materialTypeId: 5, properties: { reflectivity: '0.7' } }]
    }
    const { container } = render(
      <Provider
        store={makeStore([], {
          draftMaterials: [assigned],
          materialTypes: [radiationType],
          materialDetails: [detail]
        })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    expect(within(dialog).getByText('0.7')).toBeInTheDocument()
    expect(within(dialog).queryByText('0.3')).not.toBeInTheDocument()
  })

  it("shows a freshly-picked material's properties from the Materials library cache", () => {
    const radiationType: MaterialTypeDef = {
      id: 5,
      materialtype: 'Radiation',
      description: '',
      properties: [prop('reflectivity', 1, { group: 'model' })],
      groups: []
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
    fireEvent.click(screen.getByRole('radio', { name: 'Grass' }))
    // …then open its properties from the row: the cached detail fills the popup.
    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    const dialog = screen.getByRole('dialog', { name: 'Grass properties' })
    expect(within(dialog).getByText('Reflectivity')).toBeInTheDocument()
    expect(within(dialog).getByText('0.3')).toBeInTheDocument()
  })

  it('closes the Select Materials popup when the properties popup opens', () => {
    // A material already assigned to the ground gives us a form row to click while
    // the Select popup is still open — since picking now dismisses the popup, an
    // already-assigned row is the remaining way both could end up open together.
    const { container } = render(
      <Provider
        store={makeStore([material('m1', 'Cotton')], {
          draftMaterials: [{ groupId: 'g1', name: 'Grass' }]
        })}
      >
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByText('Select Materials')).toBeInTheDocument()

    fireEvent.click(within(container).getByRole('button', { name: 'Grass' }))

    // Both popups anchor to the same strip beside the panel and each lays down
    // its own full-screen overlay — two open at once would stack overlays over
    // each other's contents.
    expect(screen.getByRole('dialog', { name: 'Grass properties' })).toBeInTheDocument()
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

describe('<ObjectPropertiesForm /> — numeric keystroke guard', () => {
  it('rejects a leading + in Ground Size instead of silently dropping it', () => {
    // "+5" used to pass every check: it saved as 5, so the field read back "5"
    // on the next load and the '+' vanished with nothing having flagged it.
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const length = fieldInput(container, 'length')

    fireEvent.change(length, { target: { value: '+5' } })

    // The keystroke never reached the value, and the field says why — the same
    // treatment '*' and '/' already get.
    expect(length).toHaveValue('')
    expect(screen.getByLabelText(/This input is not supported/)).toBeInTheDocument()
  })

  it('rejects the other operators the same way', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const length = fieldInput(container, 'length')

    for (const value of ['*', '/', '5*2', '+']) {
      fireEvent.change(length, { target: { value } })
      expect(length).toHaveValue('')
    }
  })

  it('still accepts a negative value, which the range rule judges', () => {
    // '-' is not an operator here: Position takes negatives, and where the
    // catalog forbids them (Ground Size starts at 0) the range message says so.
    // Blocking the keystroke would make a legal number untypeable.
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )
    const positionX = fieldInput(container, 'position_x')

    fireEvent.change(positionX, { target: { value: '-5' } })

    expect(positionX).toHaveValue('-5')
  })
})

describe('<ObjectPropertiesForm /> — required marker', () => {
  it('stars the group heading, not each field, when the group holds a required field', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <ObjectPropertiesForm />
      </Provider>
    )
    // "Ground Size" (length + breadth, both required) carries the star; the
    // individual boxes keep their bare names as placeholders.
    expect(screen.getByText(/Ground Size/).textContent).toBe('Ground Size*')
    expect(fieldInput(container, 'length')).toHaveAttribute('placeholder', 'Length')
    expect(fieldInput(container, 'breadth')).toHaveAttribute('placeholder', 'Breadth')

    // A group of entirely optional fields shows no star. Position's x/y/z are
    // required: false in this fixture, so its heading stays bare.
    expect(screen.getByText('Position').textContent).toBe('Position')
    expect(fieldInput(container, 'position_x')).toHaveAttribute('placeholder', 'X')
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
    // It surfaces as the info-icon tooltip (aria-label), not an inline text node.
    expect(
      screen.getByLabelText(
        "Validation error: Texture repeat can't exceed the ground resolution (10)"
      )
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

// A Texture Repeat only tiles cleanly when it DIVIDES the ground's subdivision
// count, so the valid values for a resolution of 10 are 1, 2, 5 and 10 — not
// every integer up to 10. The field stays a plain numeric input; the constraint
// shows up as a stepper that walks the valid values, helper text listing them,
// and a snap-with-explanation whenever a committed value isn't one of them.
describe('<ObjectPropertiesForm /> — texture repeat divisor constraint', () => {
  // A saved 10×10 ground with a valid 5×5 repeat — the starting point for the
  // editing cases below.
  const TEN_BY_TEN = {
    length: '5',
    breadth: '5',
    resolution_x: '10',
    resolution_y: '10',
    texture_x: '5',
    texture_y: '5'
  }

  const openWith = (values: Record<string, string>): HTMLElement =>
    render(
      <Provider store={makeStore([], { draftValues: values })}>
        <ObjectPropertiesForm />
      </Provider>
    ).container

  const stepper = (direction: 'Next' | 'Previous', axis: string): HTMLButtonElement =>
    screen.getByRole('button', { name: `${direction} valid ${axis} value` }) as HTMLButtonElement

  it('snaps a committed value down to the nearest valid one and says why', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    // 9 doesn't divide 10 — the engine would floor it to 5, so the form does too.
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)

    expect(input.value).toBe('5')
    expect(
      screen.getByText('R: Snapped to 5 (must divide subdivisions of 10)')
    ).toBeInTheDocument()
  })

  it('does NOT snap while the user is still typing', () => {
    // Across 21 subdivisions the valid values are 1, 3, 7 and 21 — so "2", the
    // first character of the perfectly valid 21, is itself invalid. Snapping per
    // keystroke would rewrite it to 1 and make 21 impossible to type.
    const container = openWith({ ...TEN_BY_TEN, resolution_x: '21', texture_x: '' })
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '2' } })
    expect(input.value).toBe('2')

    fireEvent.change(input, { target: { value: '21' } })
    fireEvent.blur(input)
    expect(input.value).toBe('21')
  })

  it('commits on Enter without waiting for a blur', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input.value).toBe('5')
  })

  it('snaps UP to the minimum below the range, citing the floor rather than the rule', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    // Nothing valid exists under 1, so "snap down to the nearest valid value"
    // has nowhere to go — 0 lands on the minimum instead, with its own copy.
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)

    expect(input.value).toBe('1')
    expect(screen.getByText('R: Snapped to 1 (minimum is 1)')).toBeInTheDocument()
  })

  it('clamps a value above the subdivision count down to the count', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)

    expect(input.value).toBe('10')
  })

  it('normalises an already-valid value without claiming it snapped', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '05' } })
    fireEvent.blur(input)

    expect(input.value).toBe('5')
    // 05 IS 5 — nothing was corrected, so there is nothing to explain.
    expect(screen.queryByText(/Snapped to/)).not.toBeInTheDocument()
  })

  it('steps to the next and previous VALID value, not by one', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.click(stepper('Next', 'R'))
    expect(input.value).toBe('10')

    fireEvent.click(stepper('Previous', 'R'))
    expect(input.value).toBe('5')
    fireEvent.click(stepper('Previous', 'R'))
    expect(input.value).toBe('2')
  })

  it('disables each stepper at its end of the range', () => {
    const container = openWith({ ...TEN_BY_TEN, texture_x: '10' })

    expect(stepper('Next', 'R')).toBeDisabled()
    expect(stepper('Previous', 'R')).toBeEnabled()

    fireEvent.change(fieldInput(container, 'texture_x'), { target: { value: '1' } })
    expect(stepper('Next', 'R')).toBeEnabled()
    expect(stepper('Previous', 'R')).toBeDisabled()
  })

  it('moves between valid values with the up and down arrow keys', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('2')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('5')
  })

  it('steps out of a half-typed invalid value to the same place a blur would', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(input.value).toBe('5')
  })

  it('shows no standing list of valid values — the stepper is what discovers them', () => {
    openWith(TEN_BY_TEN)
    expect(screen.queryByText(/[Vv]alid:/)).not.toBeInTheDocument()
    // Including the non-square case, where the two axes have different sets.
    openWith({ ...TEN_BY_TEN, resolution_y: '12', texture_y: '6' })
    expect(screen.queryByText(/[Vv]alid:/)).not.toBeInTheDocument()
  })

  it('re-checks the repeat when the subdivision count changes, and reports the adjustment', () => {
    const container = openWith(TEN_BY_TEN)
    const resolution = fieldInput(container, 'resolution_x')

    // 5 divided 10 but doesn't divide 8. The user didn't touch the repeat, so
    // the note names the old value too — otherwise there's no way to tell what
    // it was.
    fireEvent.change(resolution, { target: { value: '8' } })
    fireEvent.blur(resolution)

    expect(fieldInput(container, 'texture_x').value).toBe('4')
    expect(
      screen.getByText('R: Repeat adjusted 5 → 4 (must divide subdivisions of 8)')
    ).toBeInTheDocument()
    // The other axis is untouched — the rule is per-axis.
    expect(fieldInput(container, 'texture_y').value).toBe('5')
  })

  it('does not drag the repeat down while a resolution is mid-edit', () => {
    const container = openWith(TEN_BY_TEN)
    const resolution = fieldInput(container, 'resolution_x')

    // Typing "20" passes through "2"; re-checking on that would snap the repeat
    // to 2 before the user finished the number.
    fireEvent.change(resolution, { target: { value: '2' } })
    fireEvent.change(resolution, { target: { value: '20' } })
    expect(fieldInput(container, 'texture_x').value).toBe('5')

    fireEvent.blur(resolution)
    // 5 still divides 20, so nothing moves.
    expect(fieldInput(container, 'texture_x').value).toBe('5')
  })

  it('drops the note as soon as the field is edited again', () => {
    const container = openWith(TEN_BY_TEN)
    const input = fieldInput(container, 'texture_x')

    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)
    expect(screen.getByText('R: Snapped to 5 (must divide subdivisions of 10)')).toBeInTheDocument()

    // The note explains the value on screen; a new keystroke makes it stale.
    fireEvent.change(input, { target: { value: '2' } })
    expect(screen.queryByText(/Snapped to/)).not.toBeInTheDocument()
  })

  it('corrects a stored repeat its resolution never allowed, on open', () => {
    // A ground saved before this rule (or by another client): 3 never divided
    // 10, and the engine would have been using 2 all along.
    const container = openWith({ ...TEN_BY_TEN, texture_x: '3' })

    expect(fieldInput(container, 'texture_x').value).toBe('2')
    expect(
      screen.getByText('R: Repeat adjusted 3 → 2 (must divide subdivisions of 10)')
    ).toBeInTheDocument()

    // Tabbing through the field doesn't erase the explanation — only changing
    // the value does, whether by typing or by stepping.
    fireEvent.blur(fieldInput(container, 'texture_x'))
    expect(screen.getByText(/Repeat adjusted 3 → 2/)).toBeInTheDocument()

    fireEvent.click(stepper('Next', 'R'))
    expect(fieldInput(container, 'texture_x').value).toBe('5')
    expect(screen.queryByText(/Repeat adjusted/)).not.toBeInTheDocument()
  })

  it('leaves the field alone while there is no usable resolution', () => {
    // A blank resolution means the valid set is unknown — not that nothing is
    // valid. Guessing here would replace the user's value with a number the
    // constraint can't justify.
    const container = openWith({ ...TEN_BY_TEN, resolution_x: '', texture_x: '7' })
    const input = fieldInput(container, 'texture_x')

    expect(stepper('Next', 'R')).toBeDisabled()
    expect(stepper('Previous', 'R')).toBeDisabled()

    fireEvent.blur(input)
    expect(input.value).toBe('7')
    expect(screen.queryByText(/Snapped to/)).not.toBeInTheDocument()
  })

  it('leaves a blank repeat as a Required error rather than inventing a value', () => {
    const container = openWith({ ...TEN_BY_TEN, texture_x: '' })
    const input = fieldInput(container, 'texture_x')

    fireEvent.blur(input)
    expect(input.value).toBe('')
    expect(screen.getByLabelText('Validation error: Required Field')).toBeInTheDocument()
  })
})

// The form's own trash. The delete is pessimistic, so the panel is NOT closed on
// the click any more: the reducer closes it when DELETE_NODE_SUCCEEDED lands, so a
// rejected delete leaves the form (and the row) in place instead of blanking the
// panel on a delete that never happened. Mirrors the Materials header trash.
describe('<ObjectPropertiesForm /> — delete', () => {
  // The geometry slice is injected, so RootState doesn't statically know the key
  // (same cast the container's own selectors use).
  const geometryState = (store: InjectableStore): GeometryState =>
    (store.getState() as unknown as { geometry: GeometryState }).geometry

  const openConfirm = (store: InjectableStore): void => {
    render(
      <Provider store={store}>
        <ObjectPropertiesForm />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete geometry' }))
  }

  it('confirming dispatches the delete and leaves the form open until it lands', () => {
    const store = makeStore()
    openConfirm(store)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    // Still open: nothing dispatched CLOSE_CREATE_FORM, which would null the draft.
    expect(geometryState(store).createDraft).not.toBeNull()
    expect(screen.getByLabelText('Object name')).toBeInTheDocument()
    // …and the object is marked in flight, which locks the trash.
    expect(geometryState(store).byScope[scopeKey(PROJECT, SCENARIO)].deletingIds).toEqual([
      OBJECT_ID
    ])
    expect(screen.getByRole('button', { name: 'Delete geometry' })).toBeDisabled()
  })

  it('closes the form once the delete succeeds', () => {
    const store = makeStore()
    openConfirm(store)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    act(() => {
      store.dispatch(actions.deleteNodeSucceeded(PROJECT, SCENARIO, OBJECT_ID))
    })
    expect(geometryState(store).createDraft).toBeNull()
    expect(screen.queryByLabelText('Object name')).not.toBeInTheDocument()
  })

  it('a failed delete keeps the form open and releases the trash for a retry', () => {
    const store = makeStore()
    openConfirm(store)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    act(() => {
      store.dispatch(actions.deleteNodeFailed(PROJECT, SCENARIO, OBJECT_ID, 'boom'))
    })
    expect(geometryState(store).createDraft).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Delete geometry' })).toBeEnabled()
  })
})
