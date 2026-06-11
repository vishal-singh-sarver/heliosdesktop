import React from 'react'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, UnknownAction, Reducer } from 'redux'
import { Geometry } from '../index'
import { InjectableStore } from 'store/configureStore'

const mockStore = createStore((state = {}) => state) as InjectableStore
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
