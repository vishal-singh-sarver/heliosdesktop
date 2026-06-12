import type { GeoNode } from './types'

// In-memory fake backend for the Geometry feature, used while the real
// scenario-scoped endpoints don't exist (VITE_USE_MOCK). Two properties make
// it a useful stand-in:
//   1. it is STATEFUL per scope — adds/deletes persist across calls in a
//      session, so the tree behaves like a real store, and
//   2. it simulates latency + failure, so loaders and error states are
//      actually exercisable.
// Every returned node is a deep copy so the Redux slice owns its own data.

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// Tunable at runtime (e.g. from the console) to exercise UI states.
export const mockConfig = {
  latencyMs: 350,
  forceListError: false,
  forceCreateError: false,
  forceRenameError: false,
  forceDeleteError: false
}

const leaf = (id: string, name: string, parentId: string | null = null): GeoNode => ({
  id,
  name,
  kind: 'ground',
  parentId,
  childIds: [],
  expanded: false,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

const group = (
  id: string,
  name: string,
  childIds: string[],
  expanded = false
): GeoNode => ({
  id,
  name,
  kind: 'group',
  parentId: null,
  childIds,
  expanded,
  visibleInViewport: true,
  modelVisibility: { mode: 'all' }
})

// Seed mirrors the mockup: a couple of root grounds plus a group with children.
const seed = (): GeoNode[] => [
  leaf('geo-ground-1', 'Ground.001'),
  group('geo-group-1', 'Group.001', ['geo-ground-3', 'geo-ground-4']),
  leaf('geo-ground-3', 'Ground.003', 'geo-group-1'),
  leaf('geo-ground-4', 'Ground.004', 'geo-group-1'),
  leaf('geo-ground-2', 'Ground.002')
]

const scopeKey = (projectId: string, scenarioId: string): string =>
  `${projectId}::${scenarioId}`

// Per-scope node list. Seeded lazily the first time a scope is read.
const store: Record<string, GeoNode[]> = {}

const ensureScope = (key: string): GeoNode[] => {
  if (!store[key]) store[key] = seed()
  return store[key]
}

const clone = (node: GeoNode): GeoNode => ({ ...node, childIds: [...node.childIds] })

export async function mockListNodes(projectId: string, scenarioId: string): Promise<GeoNode[]> {
  await sleep(mockConfig.latencyMs)
  if (mockConfig.forceListError) throw new Error('Unable to load Geometries')
  return ensureScope(scopeKey(projectId, scenarioId)).map(clone)
}

// Persists a new leaf into the scope's store so a later list reflects it.
export async function mockCreateGeometry(
  projectId: string,
  scenarioId: string,
  input: { id: string; name: string; kind: 'ground' }
): Promise<void> {
  await sleep(mockConfig.latencyMs)
  if (mockConfig.forceCreateError) throw new Error('Unable to create geometry')
  ensureScope(scopeKey(projectId, scenarioId)).push({
    id: input.id,
    name: input.name,
    kind: input.kind,
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    modelVisibility: { mode: 'all' }
  })
}

// Persists a full object created from the Properties form. Mirrors
// mockCreateGeometry but accepts the richer create payload and returns the
// created node (the real backend assigns the id + visibility, so the mock does
// too). Property values are ignored by the mock store — only the node shape
// matters for the tree.
export async function mockCreateObject(
  projectId: string,
  scenarioId: string,
  input: { objectTypeId: number; name: string }
): Promise<GeoNode> {
  await sleep(mockConfig.latencyMs)
  if (mockConfig.forceCreateError) throw new Error('Unable to create geometry')
  const node: GeoNode = {
    id: `geo-${crypto.randomUUID()}`,
    name: input.name,
    kind: 'ground',
    parentId: null,
    childIds: [],
    expanded: false,
    visibleInViewport: true,
    modelVisibility: { mode: 'all' }
  }
  ensureScope(scopeKey(projectId, scenarioId)).push(node)
  return clone(node)
}

export async function mockRenameGroup(
  projectId: string,
  scenarioId: string,
  id: string,
  name: string
): Promise<void> {
  await sleep(mockConfig.latencyMs)
  if (mockConfig.forceRenameError) throw new Error('Unable to rename group. Please try again')
  const node = ensureScope(scopeKey(projectId, scenarioId)).find((n) => n.id === id)
  if (node) node.name = name
}

// Removes a node from the store; a group also removes its children.
export async function mockDeleteNode(
  projectId: string,
  scenarioId: string,
  id: string
): Promise<void> {
  await sleep(mockConfig.latencyMs)
  if (mockConfig.forceDeleteError) throw new Error('Unable to delete geometry')
  const key = scopeKey(projectId, scenarioId)
  const list = ensureScope(key)
  const node = list.find((n) => n.id === id)
  const removeIds = new Set<string>([id, ...(node?.childIds ?? [])])
  store[key] = list.filter((n) => !removeIds.has(n.id))
}

// Test-only: reset the in-memory store between cases.
export function __resetMockStore(): void {
  for (const key of Object.keys(store)) delete store[key]
}
