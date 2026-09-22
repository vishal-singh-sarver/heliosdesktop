// Shorten display text that has to sit in a box narrower than it is.
//
// Written for input PLACEHOLDERS, where CSS cannot do the job. Two browser rules
// combine against it:
//   • Chromium has never supported `text-overflow` on ::placeholder (Firefox
//     does), so the ellipsis cannot be put on the placeholder itself.
//   • An input drops its OWN `text-overflow: ellipsis` while focused — a
//     deliberate rule, so a long value can be scrolled and edited without an
//     ellipsis sitting under the caret.
// Together those meant a long placeholder read "Stomatal Sidedn…" until it was
// clicked, then snapped back to the full name cut off mid-letter. Shortening the
// STRING sidesteps both: there is nothing left for focus to un-truncate, so the
// field reads the same whether it has focus or not.
//
// The trade is that a character count is not a width — the app's font (Geist) is
// proportional, so "WWWW" is far wider than "llll". Callers therefore pass a
// deliberately conservative budget for their column, and FormField keeps
// `text-ellipsis` on the input as a backstop: if a budget ever proves too
// generous, the unfocused state still degrades to an ellipsis rather than a hard
// cut.

const ELLIPSIS = '…'

/**
 * `text` shortened to at most `maxChars` characters, with an ellipsis marking the
 * cut. Text that already fits is returned untouched, so a short label is never
 * given a needless "…".
 *
 * `maxChars` counts the characters KEPT; the ellipsis is added on top of them.
 * A non-positive budget is treated as "no budget known" and returns `text`
 * unchanged — better to show a clipped label than to replace every string in the
 * app with a lone ellipsis if a caller ever passes 0.
 */
export function trimText(text: string, maxChars: number): string {
  // Spread, not slice(): slicing a string can cut an emoji or other astral
  // character in half and render a replacement box. Spreading walks whole
  // characters.
  const chars = [...text]
  if (maxChars <= 0 || chars.length <= maxChars) return text
  // trimEnd, so a cut landing just after a space doesn't read "Stomatal  …".
  return chars.slice(0, maxChars).join('').trimEnd() + ELLIPSIS
}

export default trimText
