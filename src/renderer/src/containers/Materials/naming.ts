// Default material labels are `Material.NNN` (e.g. Material.001), mirroring the
// Geometry section's Ground.NNN auto-numbering.

export const MATERIAL_PREFIX = 'Material'

export const formatMaterialName = (n: number): string =>
  `${MATERIAL_PREFIX}.${String(n).padStart(3, '0')}`

// Parse "Material.005" -> 5; null if the label isn't a default generated name
// (e.g. a renamed material).
export function parseMaterialNumber(label: string): number | null {
  const match = label.match(/^Material\.(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : null
}

// Smallest positive N (≥1) not present in `used` — fills the lowest gap rather
// than continuing past the max (matches Geometry). Shared by material naming and
// the Properties form's parameter-group numbering.
export function lowestFreeNumber(used: Iterable<number>): number {
  const taken = new Set(used)
  let n = 1
  while (taken.has(n)) n += 1
  return n
}

// Smallest positive N (≥1) whose `Material.NNN` label isn't already taken.
export function nextMaterialNumber(labels: string[]): number {
  const used: number[] = []
  for (const label of labels) {
    const n = parseMaterialNumber(label)
    if (n !== null) used.push(n)
  }
  return lowestFreeNumber(used)
}
