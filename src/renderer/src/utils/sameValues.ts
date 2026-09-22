// Raw-string equality over the union of both maps' keys (a missing key reads as
// ''). Drives the Save button's dirty check in the right-panel property forms:
// any field whose current value differs from the loaded/last-saved baseline makes
// the form dirty, and editing back to the baseline makes it clean again. Shared
// so the Geometry object form and the Materials parameter-group cards decide
// "has this changed?" identically.
export function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if ((a[k] ?? '') !== (b[k] ?? '')) return false
  }
  return true
}
