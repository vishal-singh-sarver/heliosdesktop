import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { InjectableStore } from 'store/configureStore'
import { vi } from 'vitest'
import MaterialRow from '../MaterialRow'
import { MATERIAL_DND_MIME, OPEN_SAVED_MATERIAL_REQUESTED } from '../constants'
import type { Material } from '../types'

const material: Material = {
  id: '12',
  name: 'Concrete',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: ''
}

const storeWith = (deletingIds: string[] = [], openingId: string | null = null): InjectableStore => {
  const state = { materials: { deletingIds, openingId } }
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

const renderRow = (): { dispatch: ReturnType<typeof vi.spyOn> } => {
  const store = storeWith()
  const dispatch = vi.spyOn(store, 'dispatch')
  render(
    <Provider store={store}>
      <MaterialRow material={material} selected={false} existingNames={new Set()} />
    </Provider>
  )
  return { dispatch }
}

const openedIds = (dispatch: { mock: { calls: unknown[][] } }): string[] =>
  dispatch.mock.calls
    .map((c) => c[0] as { type?: string; id?: string })
    .filter((a) => a.type === OPEN_SAVED_MATERIAL_REQUESTED)
    .map((a) => a.id as string)

// The row is a role="button" with tabIndex=0 — it takes focus and is announced as
// a button, so it has to answer Enter and Space the way a real <button> does. It
// carried only onClick, which left opening a material mouse-only.
describe('<MaterialRow /> keyboard', () => {
  it('opens the material on Enter', () => {
    const { dispatch } = renderRow()
    fireEvent.keyDown(screen.getByRole('button', { name: /Concrete/ }), { key: 'Enter' })
    expect(openedIds(dispatch)).toEqual(['12'])
  })

  it('opens the material on Space', () => {
    const { dispatch } = renderRow()
    fireEvent.keyDown(screen.getByRole('button', { name: /Concrete/ }), { key: ' ' })
    expect(openedIds(dispatch)).toEqual(['12'])
  })

  it('ignores other keys', () => {
    const { dispatch } = renderRow()
    fireEvent.keyDown(screen.getByRole('button', { name: /Concrete/ }), { key: 'a' })
    expect(openedIds(dispatch)).toEqual([])
  })

  // The trash sits INSIDE the row, so its key events bubble up to it. That button
  // acts on its own; the row must not also open the material.
  it('does not open the material when a key lands on the delete button inside it', () => {
    const { dispatch } = renderRow()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete material' }), { key: 'Enter' })
    expect(openedIds(dispatch)).toEqual([])
  })
})

// The delete is pessimistic — the row stays until success — so its trash must lock
// while a DELETE for this id is in flight, or a second confirm 404s.
describe('<MaterialRow /> delete-in-flight', () => {
  it('disables the trash while this material is being deleted', () => {
    render(
      <Provider store={storeWith(['12'])}>
        <MaterialRow material={material} selected={false} existingNames={new Set()} />
      </Provider>
    )
    expect(screen.getByRole('button', { name: 'Delete material' })).toBeDisabled()
  })

  it('leaves the trash enabled for a material that is NOT being deleted', () => {
    render(
      <Provider store={storeWith(['99'])}>
        <MaterialRow material={material} selected={false} existingNames={new Set()} />
      </Provider>
    )
    expect(screen.getByRole('button', { name: 'Delete material' })).toBeEnabled()
  })
})

// The row is a drag source: dragging it onto a geometry object/group assigns the
// material. It carries the group id (to assign) + name (for the outcome toast).
describe('<MaterialRow /> drag source', () => {
  it('is draggable', () => {
    renderRow()
    expect(screen.getByRole('button', { name: /Concrete/ })).toHaveAttribute('draggable', 'true')
  })

  it('writes { groupId, name } under the material mime on dragstart', () => {
    renderRow()
    const setData = vi.fn()
    fireEvent.dragStart(screen.getByRole('button', { name: /Concrete/ }), {
      dataTransfer: { setData, effectAllowed: '' }
    })
    expect(setData).toHaveBeenCalledWith(
      MATERIAL_DND_MIME,
      JSON.stringify({ groupId: '12', name: 'Concrete' })
    )
  })
})

// Clicking a slow-loading row repeatedly must not fire a fresh GET each time —
// while THIS material's properties are being fetched, further clicks are swallowed.
describe('<MaterialRow /> open de-dupe', () => {
  it('does not re-open while this material is already loading', () => {
    const store = storeWith([], '12') // '12' is this row's material — GET in flight
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialRow material={material} selected={false} existingNames={new Set()} />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Concrete/ }))
    expect(openedIds(dispatch)).toEqual([])
  })

  it('still opens when a DIFFERENT material is loading', () => {
    const store = storeWith([], '99') // a different material is loading
    const dispatch = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MaterialRow material={material} selected={false} existingNames={new Set()} />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Concrete/ }))
    expect(openedIds(dispatch)).toEqual(['12'])
  })
})
