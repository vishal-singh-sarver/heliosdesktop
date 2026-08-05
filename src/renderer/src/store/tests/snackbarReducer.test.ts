import { describe, expect, it } from 'vitest'
import snackbarReducer, {
  dismissSnackbar,
  initialState,
  selectSnackbarStack,
  showSnackbar,
  type SnackbarState
} from '../snackbarReducer'

// Reduce a list of actions over the slice — stacking is about SEQUENCES, so
// most of these read better as one.
const run = (...actions: Parameters<typeof snackbarReducer>[1][]): SnackbarState =>
  actions.reduce((s, a) => snackbarReducer(s, a), initialState)

const messages = (state: SnackbarState): string[] => state.toasts.map((i) => i.message)

describe('snackbarReducer', () => {
  it('starts with nothing to show', () => {
    expect(initialState.toasts).toEqual([])
    expect(selectSnackbarStack({ snackbar: initialState })).toEqual([])
  })

  it('shows a success message', () => {
    const next = run(showSnackbar('Saved'))
    expect(selectSnackbarStack({ snackbar: next })[0]).toMatchObject({
      message: 'Saved',
      variant: 'success'
    })
  })

  it('defaults the variant to success', () => {
    expect(run(showSnackbar('Hi')).toasts[0].variant).toBe('success')
  })

  it('carries an error variant', () => {
    expect(run(showSnackbar('Nope', 'error')).toasts[0].variant).toBe('error')
  })

  it('carries an info variant for a neutral, no-op outcome', () => {
    expect(run(showSnackbar('Already assigned', 'info')).toasts[0].variant).toBe('info')
  })

  describe('stacking', () => {
    it('keeps both on screen instead of one replacing the other', () => {
      const state = run(showSnackbar('First'), showSnackbar('Second'))

      // Oldest first — the host renders top-to-bottom, so 'Second' ends up
      // nearest the corner and 'First' drifts up.
      expect(messages(state)).toEqual(['First', 'Second'])
    })

    it('dismisses ONLY the toast whose id was given', () => {
      const shown = run(showSnackbar('First'), showSnackbar('Second'))
      const second = shown.toasts[1].id
      const state = snackbarReducer(shown, dismissSnackbar(second))

      expect(messages(state)).toEqual(['First'])
    })

    it('empties out once every toast has been dismissed', () => {
      const shown = run(showSnackbar('Only'))
      const state = snackbarReducer(shown, dismissSnackbar(shown.toasts[0].id))

      expect(state.toasts).toEqual([])
      expect(selectSnackbarStack({ snackbar: state })).toEqual([])
    })

    it('ignores a dismiss for a toast that is already gone', () => {
      const shown = run(showSnackbar('Only'))
      const once = snackbarReducer(shown, dismissSnackbar(shown.toasts[0].id))
      // A timer firing after the user already clicked × — must not throw or
      // take an unrelated toast with it.
      expect(snackbarReducer(once, dismissSnackbar(shown.toasts[0].id))).toEqual(once)
    })

    it('gives every toast a unique id, so two identical messages are two toasts', () => {
      const state = run(showSnackbar('Again'), showSnackbar('Again'))

      expect(messages(state)).toEqual(['Again', 'Again'])
      expect(state.toasts[0].id).not.toBe(state.toasts[1].id)
    })

    it('caps the stack, dropping the OLDEST — it has had the longest to be read', () => {
      // A burst (a save failing per row) must not paper the window over.
      const state = run(
        showSnackbar('1'),
        showSnackbar('2'),
        showSnackbar('3'),
        showSnackbar('4'),
        showSnackbar('5')
      )

      expect(messages(state)).toEqual(['3', '4', '5'])
    })
  })

  it('does not mutate the state it is given', () => {
    const first = run(showSnackbar('One'))
    snackbarReducer(first, showSnackbar('Two'))
    expect(first.toasts).toHaveLength(1)
  })
})
