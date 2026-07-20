import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { InjectableStore } from 'store/configureStore'
import { vi } from 'vitest'
import MaterialRow from '../MaterialRow'
import { OPEN_SAVED_MATERIAL_REQUESTED } from '../constants'
import type { Material } from '../types'

const material: Material = {
  id: '12',
  name: 'Concrete',
  materialTypeId: 1,
  materialType: 'Radiation',
  preview: null,
  createdAt: '',
  visible: true
}

const storeWith = (): InjectableStore => {
  const store = createStore(
    ((s = {}) => s) as Reducer<unknown, UnknownAction>
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
  store.createReducer = () => ((s = {}) => s) as Reducer<unknown, UnknownAction>
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

  // The eye and trash sit INSIDE the row, so their key events bubble up to it.
  // Those buttons act on their own; the row must not also open the material.
  it('does not open the material when a key lands on the eye button inside it', () => {
    const { dispatch } = renderRow()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hide material' }), { key: 'Enter' })
    expect(openedIds(dispatch)).toEqual([])
  })
})
