import { describe, expect, it } from 'vitest'
import { trimText } from '../trimText'

// The point of trimming the STRING rather than leaning on CSS: Chromium ignores
// text-overflow on ::placeholder, and strips an input's own ellipsis while it is
// focused. A pre-shortened placeholder reads the same in both states.

describe('trimText', () => {
  it('leaves text that already fits completely untouched', () => {
    // No "…" on a label with room to spare — that would read as a bug, since
    // there is visibly space left in the box beside it.
    expect(trimText('Object Length', 16)).toBe('Object Length')
  })

  it('leaves text of exactly the budget untouched', () => {
    // The budget counts characters KEPT, so a string of exactly that length has
    // nothing to cut. Off-by-one here would ellipsise a label that fits.
    expect(trimText('1234567890123456', 16)).toBe('1234567890123456')
  })

  it('cuts one character past the budget', () => {
    expect(trimText('12345678901234567', 16)).toBe('1234567890123456…')
  })

  it('shortens the label that prompted this, to what its column actually fits', () => {
    // 15 is the Materials two-column budget — the widest text Chromium reported
    // fitting that box. At 16 the field disagreed with itself: focused showed
    // this string, unfocused showed one character less, because FormField's
    // `text-ellipsis` backstop was still trimming on top of it.
    expect(trimText('Stomatal Sidedness', 15)).toBe('Stomatal Sidedn…')
  })

  it('drops a trailing space before the ellipsis', () => {
    // A cut landing just after a word would otherwise read "Stomatal  …", with
    // a gap between the text and the dots.
    expect(trimText('Stomatal Sidedness', 9)).toBe('Stomatal…')
  })

  it('never splits an astral character in half', () => {
    // slice() would cut this emoji between its two code units and render a
    // replacement box; spreading walks whole characters.
    expect(trimText('ab🌱cd', 3)).toBe('ab🌱…')
  })

  it('returns the text unchanged when no budget is known', () => {
    // A caller passing 0 (or a negative) means "no budget" — showing a clipped
    // label beats replacing every string in the app with a lone ellipsis.
    expect(trimText('Stomatal Sidedness', 0)).toBe('Stomatal Sidedness')
    expect(trimText('Stomatal Sidedness', -5)).toBe('Stomatal Sidedness')
  })

  it('handles an empty string', () => {
    expect(trimText('', 16)).toBe('')
  })
})
