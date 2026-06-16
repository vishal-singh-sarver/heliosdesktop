import { anyModelOn, isModelOn, unionVisibility, type VisibilityLike } from '../models'

const member = (
  modelVisibility: Record<number, boolean>,
  renderEnabled = true,
  visibleInViewport = true
): VisibilityLike => ({ modelVisibility, renderEnabled, visibleInViewport })

describe('model visibility helpers', () => {
  it('isModelOn defaults absent ids to on, and reflects explicit flags', () => {
    expect(isModelOn({}, 1)).toBe(true) // absent → visible
    expect(isModelOn({ 1: false }, 1)).toBe(false)
    expect(isModelOn({ 1: false, 2: true }, 2)).toBe(true)
  })

  it('anyModelOn is true iff at least one of the given ids is on', () => {
    expect(anyModelOn({ 1: false, 2: false }, [1, 2])).toBe(false)
    expect(anyModelOn({ 1: false, 2: true }, [1, 2])).toBe(true)
    expect(anyModelOn({}, [1, 2])).toBe(true) // absent → on
  })
})

describe('unionVisibility (group = union of members)', () => {
  it('keeps a model on for the group while any member has it on', () => {
    const u = unionVisibility([member({ 1: false, 2: false }), member({ 1: false, 2: true })])
    expect(u.modelVisibility).toEqual({ 1: false, 2: true })
    expect(u.renderEnabled).toBe(true)
  })

  it('turns the group off only once every member is off', () => {
    const u = unionVisibility([
      member({ 1: false, 2: false }, false),
      member({ 1: false, 2: false }, false)
    ])
    expect(u.modelVisibility).toEqual({ 1: false, 2: false })
    expect(u.renderEnabled).toBe(false)
  })

  // The mixed implicit/explicit case: a member with an empty map defaults every
  // model on, so it must keep the group on even when a sibling is explicitly off.
  it('treats a member with an omitted id as on (does not let an off sibling mask it)', () => {
    const u = unionVisibility([member({}), member({ 1: false, 2: false })])
    expect(u.modelVisibility).toEqual({ 1: true, 2: true })
    expect(u.renderEnabled).toBe(true)
  })

  it('unions viewport across members', () => {
    expect(unionVisibility([member({}, true, false), member({}, true, true)]).visibleInViewport).toBe(
      true
    )
    expect(
      unionVisibility([member({}, true, false), member({}, true, false)]).visibleInViewport
    ).toBe(false)
  })

  it('defaults an empty group to shown', () => {
    expect(unionVisibility([])).toEqual({
      modelVisibility: {},
      renderEnabled: true,
      visibleInViewport: true
    })
  })
})
