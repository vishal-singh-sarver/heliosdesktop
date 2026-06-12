import type { GeoNode, GeometryCounters } from './types'

// Default node names are `<Prefix>.NNN` (e.g. Ground.001, Group.001).
// The numeric counter is monotonic per scenario: it is bumped on the create
// REQUEST (synchronously, in the reducer) so rapid double-adds can't collide,
// and seeded from existing names whenever the tree loads.

const PREFIX = {
  ground: 'Ground',
  group: 'Group'
} as const

export type CounterKind = keyof GeometryCounters

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

// Highest number seen per kind across the loaded nodes, so the next create
// continues the sequence instead of restarting at 001.
export function deriveCounters(nodes: GeoNode[]): GeometryCounters {
  const counters: GeometryCounters = { ground: 0, group: 0 }
  for (const node of nodes) {
    const parsed = parseNameNumber(node.name)
    if (parsed) counters[parsed.kind] = Math.max(counters[parsed.kind], parsed.num)
  }
  return counters
}
