import React from 'react'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, UnknownAction, Reducer } from 'redux'
import { Geometry } from '../index'
import { InjectableStore } from 'store/configureStore'
import type { RootState } from 'store/reducers'

// An inert store: it returns whatever state it is given. The cast supplies the
// RootState shape the store type demands without building every slice, none of
// which this render actually reads.
const mockStore = createStore((state: RootState = {} as RootState) => state) as InjectableStore
mockStore.injectedReducers = {}
mockStore.injectedSagas = {}
mockStore.runSaga = () =>
  ({
    cancel: () => {},
    error: () => {},
    result: () => {},
    toPromise: () => Promise.resolve()
  }) as any
mockStore.createReducer = () => ((state = {}) => state) as Reducer<unknown, UnknownAction>

describe('<Geometry />', () => {
  it('renders without error', () => {
    render(
      <Provider store={mockStore}>
        <Geometry />
      </Provider>
    )
  })

  it('should match the snapshot', () => {
    const { container } = render(
      <Provider store={mockStore}>
        <Geometry />
      </Provider>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
