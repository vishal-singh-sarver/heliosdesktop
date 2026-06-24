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

// Smallest positive N (≥1) whose `Material.NNN` label isn't already taken —
// fills the lowest gap rather than continuing past the max (matches Geometry).
export function nextMaterialNumber(labels: string[]): number {
  const used = new Set<number>()
  for (const label of labels) {
    const n = parseMaterialNumber(label)
    if (n !== null) used.add(n)
  }
  let n = 1
  while (used.has(n)) n += 1
  return n
}
