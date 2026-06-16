import type { GeoNode } from './types'

// Default node names are `<Prefix>.NNN` (e.g. Ground.001, Group.001).

const PREFIX = {
  ground: 'Ground',
  group: 'Group'
} as const

// The kinds that get an auto-numbered default name — the keys of PREFIX.
export type CounterKind = keyof typeof PREFIX

export const formatName = (kind: CounterKind, n: number): string =>
  `${PREFIX[kind]}.${String(n).padStart(3, '0')}`

// Parse "Ground.005" -> { kind: 'ground', num: 5 }; null if it isn't a default
// generated name (e.g. a renamed group or an imported file's name).
export function parseNameNumber(name: string): { kind: CounterKind; num: number } | null {
  const match = name.match(/^(Ground|Group)\.(\d+)$/)
  if (!match) return null
  const kindByPrefix: Record<string, CounterKind> = { Ground: 'ground', Group: 'group' }
  return { kind: kindByPrefix[match[1]], num: Number.parseInt(match[2], 10) }
}

// Smallest positive number N (≥1) whose `<Prefix>.NNN` name is not already in
// use for this kind — fills the lowest gap rather than continuing past the max.
// e.g. Ground.001, Ground.002, Ground.015 → next is Ground.003.
export function nextAvailableNumber(nodes: GeoNode[], kind: CounterKind): number {
  const used = new Set<number>()
  for (const node of nodes) {
    const parsed = parseNameNumber(node.name)
    if (parsed && parsed.kind === kind) used.add(parsed.num)
  }
  let n = 1
  while (used.has(n)) n += 1
  return n
}
