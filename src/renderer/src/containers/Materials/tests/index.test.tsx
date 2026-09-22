import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createStore, Reducer, UnknownAction } from 'redux'
import { InjectableStore } from 'store/configureStore'
import { Materials } from '../index'

const mockStore = createStore(
  ((state = {}) => state) as Reducer<unknown, UnknownAction>
) as InjectableStore
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

describe('<Materials />', () => {
  it('renders the Add Materials button and the Saved Materials header', () => {
    render(
      <Provider store={mockStore}>
        <Materials />
      </Provider>
    )
    expect(screen.getByRole('button', { name: 'Add Materials' })).toBeInTheDocument()
    expect(screen.getByText('Saved Materials')).toBeInTheDocument()
  })

  it('shows the empty-state message when there are no materials', () => {
    render(
      <Provider store={mockStore}>
        <Materials />
      </Provider>
    )
    expect(screen.getByText('No saved materials yet.')).toBeInTheDocument()
  })
})
