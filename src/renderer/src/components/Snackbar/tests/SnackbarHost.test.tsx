import { act, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { combineReducers, createStore } from 'redux'
import snackbarReducer, { showSnackbar } from '@renderer/store/snackbarReducer'
import SnackbarHost from '../SnackbarHost'

// The host owns two things the reducer can't express: that EVERY toast is on
// screen at once, and that each expires on its own clock counted from when it
// arrived. Both are timer-driven, so these drive the clock rather than wait.

const AUTO_DISMISS_MS = 4000
// The exit animation plays before the toast leaves the store, so "gone" is a
// dwell PLUS an exit away — see EXIT_MS in SnackbarHost.
const EXIT_MS = 160

// Dwell, then exit — as two advances, because the exit timer is only scheduled
// once React commits the "leaving" state at the end of the dwell's act(), so a
// single combined advance would leave it pending.
const retire = (): void => {
  advanceBy(AUTO_DISMISS_MS)
  advanceBy(EXIT_MS)
}

const renderHost = (): ReturnType<typeof createStore> => {
  // Mounted under `snackbar`, as the real root reducer does — the selector
  // reads state.snackbar, so a bare slice store would hand it undefined.
  const store = createStore(combineReducers({ snackbar: snackbarReducer }))
  render(
    <Provider store={store}>
      <SnackbarHost />
    </Provider>
  )
  return store
}

const show = (store: ReturnType<typeof createStore>, message: string): void => {
  act(() => {
    store.dispatch(showSnackbar(message))
  })
}

const advanceBy = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('<SnackbarHost />', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders nothing when there are no toasts', () => {
    renderHost()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows every toast at once rather than one at a time', () => {
    const store = renderHost()
    show(store, 'First')
    show(store, 'Second')

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('stacks them oldest-first, so the newest sits nearest the corner', () => {
    const store = renderHost()
    show(store, 'First')
    show(store, 'Second')

    const messages = screen.getAllByRole('status').map((el) => el.textContent)
    expect(messages[0]).toContain('First')
    expect(messages[1]).toContain('Second')
  })

  it('expires each toast on its OWN clock, counted from when it arrived', () => {
    const store = renderHost()
    show(store, 'First')
    // Half a dwell later a second arrives — it must not inherit the first's
    // remaining time, nor extend it.
    advanceBy(AUTO_DISMISS_MS / 2)
    show(store, 'Second')

    advanceBy(AUTO_DISMISS_MS / 2)
    advanceBy(EXIT_MS)
    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()

    advanceBy(AUTO_DISMISS_MS / 2)
    advanceBy(EXIT_MS)
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('dismisses only the toast whose × was clicked', () => {
    const store = renderHost()
    show(store, 'First')
    show(store, 'Second')

    const [firstClose] = screen.getAllByLabelText('Dismiss notification')
    act(() => {
      firstClose.click()
    })
    advanceBy(EXIT_MS)

    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('leaves the survivor alone when a dismissed toast’s timer would have fired', () => {
    const store = renderHost()
    show(store, 'First')
    show(store, 'Second')

    const [firstClose] = screen.getAllByLabelText('Dismiss notification')
    act(() => {
      firstClose.click()
    })
    // The closed toast's timer still fires somewhere; it must not take the
    // remaining one with it.
    advanceBy(EXIT_MS)
    expect(screen.getByText('Second')).toBeInTheDocument()

    retire()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  describe('motion', () => {
    it('slides a new toast in', () => {
      const store = renderHost()
      show(store, 'First')

      expect(screen.getByRole('status').parentElement).toHaveClass('animate-toast-in')
    })

    it('plays the exit BEFORE the toast leaves — not after it has vanished', () => {
      const store = renderHost()
      show(store, 'First')
      advanceBy(AUTO_DISMISS_MS)

      // Still mounted, now animating out. Removing it here instead would cut
      // the animation off before its first frame.
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByRole('status').parentElement).toHaveClass('animate-toast-out')

      advanceBy(EXIT_MS)
      expect(screen.queryByText('First')).not.toBeInTheDocument()
    })

    it('plays the exit for a toast closed by hand too', () => {
      const store = renderHost()
      show(store, 'First')

      act(() => {
        screen.getByLabelText('Dismiss notification').click()
      })

      expect(screen.getByRole('status').parentElement).toHaveClass('animate-toast-out')
    })
  })

  // A toast crowded off the top by a fourth arrival used to be dropped by the
  // reducer in the same frame the new one mounted: the top card was replaced by
  // the one below it between two frames, which reads as the message CHANGING.
  // It now leaves the way everything else does — visibly.
  describe('eviction', () => {
    const fillStack = (): ReturnType<typeof createStore> => {
      const store = renderHost()
      show(store, 'First')
      show(store, 'Second')
      show(store, 'Third')
      return store
    }

    it('keeps the crowded-out toast on screen to play its exit', () => {
      const store = fillStack()
      show(store, 'Fourth')

      // Briefly four: the three that fit, plus one on its way out.
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getAllByRole('status')).toHaveLength(4)
    })

    it('gives it the ordinary exit, not a second animation of its own', () => {
      const store = fillStack()
      show(store, 'Fourth')

      const [first, second] = screen.getAllByRole('status')
      // The same slide-out a toast whose dwell ran out plays: one departure
      // animation in the app, so leaving always looks like leaving.
      expect(first.parentElement).toHaveClass('animate-toast-out')
      // Only the evicted one. Everything still standing keeps its entrance.
      expect(second.parentElement).toHaveClass('animate-toast-in')
    })

    it('drops it once that animation has played, and no sooner', () => {
      const store = fillStack()
      show(store, 'Fourth')

      advanceBy(EXIT_MS - 1)
      expect(screen.getByText('First')).toBeInTheDocument()

      advanceBy(1)
      expect(screen.queryByText('First')).not.toBeInTheDocument()
      expect(screen.getAllByRole('status')).toHaveLength(3)
    })

    it('does not make the survivors wait — they keep their own clocks', () => {
      const store = fillStack()
      show(store, 'Fourth')
      advanceBy(EXIT_MS)

      retire()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('retires a toast evicted while it was ALREADY on its way out just once', () => {
      const store = fillStack()
      // All three were raised at the same instant, so all three start retiring
      // together; 'First' is then crowded out mid-exit by 'Fourth'.
      advanceBy(AUTO_DISMISS_MS)
      show(store, 'Fourth')

      advanceBy(EXIT_MS)
      expect(screen.queryByText('First')).not.toBeInTheDocument()
      // The second dismiss its eviction schedules must not take an unrelated
      // toast with it — ids are matched, so 'Fourth' survives its own dwell.
      expect(screen.getByText('Fourth')).toBeInTheDocument()
    })
  })

  describe('colour', () => {
    // The × used to be an <img> with its fill baked in, so it stayed near-black
    // on every variant while the text beside it took the variant's colour.
    it.each([
      ['success', '#067647'],
      ['error', '#b42318'],
      ['info', '#B54708']
    ] as const)('draws the dismiss × in the %s text colour', (variant, hex) => {
      const store = renderHost()
      act(() => {
        store.dispatch(showSnackbar('Message', variant))
      })

      const dismiss = screen.getByLabelText('Dismiss notification')
      expect(dismiss).toHaveClass(`text-[${hex}]`)
      // Inline SVG filling with currentColor — an <img> could not take the class.
      expect(dismiss.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
      expect(dismiss.querySelector('img')).toBeNull()
    })
  })
})
