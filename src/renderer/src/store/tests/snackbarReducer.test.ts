import { describe, expect, it } from 'vitest'
import snackbarReducer, {
  dismissSnackbar,
  initialState,
  showSnackbar
} from '../snackbarReducer'

describe('snackbarReducer', () => {
  it('starts with no message', () => {
    expect(initialState.message).toBeNull()
  })

  it('shows a success message and bumps the key', () => {
    const next = snackbarReducer(initialState, showSnackbar('Saved'))
    expect(next).toEqual({ message: 'Saved', variant: 'success', key: 1 })
  })

  it('defaults the variant to success', () => {
    expect(snackbarReducer(initialState, showSnackbar('Hi')).variant).toBe('success')
  })

  it('carries an error variant', () => {
    const next = snackbarReducer(initialState, showSnackbar('Nope', 'error'))
    expect(next.variant).toBe('error')
  })

  it('carries an info variant for a neutral, no-op outcome', () => {
    const next = snackbarReducer(initialState, showSnackbar('Already assigned', 'info'))
    expect(next.variant).toBe('info')
  })

  it('bumps the key on every show so a repeat toast restarts its timer', () => {
    const first = snackbarReducer(initialState, showSnackbar('Again'))
    const second = snackbarReducer(first, showSnackbar('Again'))
    expect(second.key).toBe(2)
  })

  it('clears the message on dismiss but keeps the variant', () => {
    const shown = snackbarReducer(initialState, showSnackbar('Nope', 'error'))
    const dismissed = snackbarReducer(shown, dismissSnackbar())
    expect(dismissed.message).toBeNull()
    expect(dismissed.variant).toBe('error')
  })
})
