# Default Material and E2E Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 113 failing e2e tests from the 14 Sep 2026 run pass against the shipped app, and add e2e coverage for the default ground material, double-click rename and required-field asterisks.

**Architecture:** Three shared e2e helpers carry most of the repair. The 3D mesh recorder learns the v2 `/geometry/gpu` route and decodes a per-part colour and texture summary. A new `support/defaultMaterial.ts` names, finds and removes a ground's default material. `ObjectProperties.editName()` unlocks the name by double-click. Specs are then updated file by file, and two new spec files hold the new coverage.

**Tech Stack:** WebdriverIO 9 + mocha + wdio-electron-service, TypeScript run through tsx, Electron app built by electron-vite, packaged FastAPI backend with the Helios engine.

**Spec:** `docs/superpowers/specs/2026-09-14-default-material-e2e-design.md`

**Progress (14 Sep 2026):**
- Task 1 done — geometry 2/2 and viewport-lighting 3/3 mesh tests pass.
- Task 2 DONE — colour gate PASSED: a new ground's mesh is `dirt.jpg`, and with its default removed it is `[0, 0.75, 0]` (green). material-assignment **48/48**, after two follow-ups: `editMaterialName` still clicked the removed pencil (2 tests, not in the original count), and the empty-library test now deletes the ground's default from the library first.
- Task 5 DONE — ground **22/22**; materials "renaming from the" **7/7**.
- Task 3 DONE — material-uploads **6/6**; material-submodels **30/30**. "TWO material types render TWO sections" assumed `stomatal_sidedness` differs per card, but backend `_propagate_shared` (d2dcc61) keeps shared editable properties at one value per group, so that test was rewritten to pin it as a DEVIATION.
- Task 4 DONE — large-ground **4/4** (56s). The soil test keeps its default. The one-way-door test failed with "the save reported nothing on the form", was inverted (Step 4), and now passes: the swap succeeds.
- Task 6 — viewport **14/14** (1m 19s); journey and viewport-lighting still to verify.
- Tasks 8 and 12 — spec files written; Task 7a probe written.

## Global Constraints

- No backend code changes. Frontend changes only as `data-testid` derived from existing props — none are planned.
- Tests assert shipped behaviour; a conflict with a requirement is marked `DEVIATION` in a comment, never encoded as a failing test.
- The 3D viewport is asserted by proxy: the mesh the viewport downloads.
- Do not commit unless the user asks. Each task ends with a checkpoint instead of a commit.
- Do not run `prettier` over `e2e/` (CLAUDE.md: it explodes the catalog tables).
- One wdio run at a time. Never `pkill -f electron`; leftover test processes are killed by PID (CLAUDE.md §2.0).
- No `npm run build` is needed: nothing under `src/` changes. The app under test is `out/`, built from `e070eb6` on 14 Sep 12:32.
- If the app is at fault for a failure, stop and report to the user before changing the test (spec, Part A).

## Commands used throughout

```bash
cd /home/navyug/shikhar_milestone_helios_desktop/heliosdesktop
# one spec file
npx wdio run wdio.config.ts --spec ./e2e/tests/<file>.test.ts
# one or more tests by title (mocha grep is a regular expression)
npx wdio run wdio.config.ts --spec ./e2e/tests/<file>.test.ts --mochaOpts.grep "<title fragment>"
# types
npm run e2e:typecheck
```

A spec run prints `N passing` / `N failing` near the end; that is the pass/fail signal every "Expected" below refers to.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `e2e/support/viewport3d.ts` | modify | record mesh fetches on `/geometry/gpu` (and `/geometry/binary`), decode a per-part summary, colour predicates |
| `e2e/support/defaultMaterial.ts` | create | the default material's naming rule, finding it, removing it |
| `e2e/constants/geometry.ts` | modify | `GEOMETRY_MSG.renameHint`, `renameGroupHint` |
| `e2e/constants/materials.ts` | modify | `MATERIALS_MSG.renameHint` |
| `e2e/pages/ObjectProperties.page.ts` | modify | `editName()` by double-click, `nameHint()` |
| `e2e/pages/Viewport3D.page.ts` | modify | `sceneObjectNames()` via the scene selector |
| `e2e/tests/material-assignment.test.ts` | modify | option A in `trackGround` |
| `e2e/tests/material-submodels.test.ts` | modify | option A in `trackGround` |
| `e2e/tests/material-uploads.test.ts` | modify | option A in `trackGround` |
| `e2e/tests/large-ground.test.ts` | modify | option A with `keepDefault`, mesh counters, one-way-door test |
| `e2e/tests/ground.test.ts` | modify | double-click rename tests, hint test |
| `e2e/tests/materials.test.ts` | modify | double-click rename helpers and tests |
| `e2e/tests/viewport.test.ts` | modify | scene oracle without the statistics overlay; Replace on drop |
| `e2e/tests/viewport-lighting.test.ts` | modify | mesh fault URL |
| `e2e/tests/journey.test.ts` | modify | steps 13–15 without the statistics overlay; Replace on drop; red mesh |
| `e2e/pages/LightingDialog.page.ts` | modify only if Task 7c says so | focus retry |
| `e2e/tests/default-material.test.ts` | create | Part B |
| `e2e/tests/required-markers.test.ts` | create | Part C |
| `CLAUDE.md` | modify | traps, coverage, findings |

---

### Task 1: Mesh recorder — `/geometry/gpu` and a decoded summary

**Files:**
- Modify: `e2e/support/viewport3d.ts` (whole file)
- Modify: `e2e/tests/large-ground.test.ts:75` (import) and `:228-245` (`meshCallsFor`, `builtMeshCallsFor`)
- Modify: `e2e/tests/viewport-lighting.test.ts:40-46` (import unchanged) and `:243-259` (fault URL and comment)
- Modify: `e2e/tests/viewport.test.ts:62` (import) and `:335` (selectivity check)

**Interfaces:**
- Produces (from `e2e/support/viewport3d.ts`):
  - `type Rgb = [number, number, number]`
  - `type MeshGroupSummary = { textureFile: string | null; hasColors: boolean; hasUVs: boolean; vertexCount: number; avgColor: Rgb | null }`
  - `type MeshSummary = { primitiveCount: number; totalTris: number; totalVerts: number; groups: MeshGroupSummary[] }`
  - `type MeshCall = { status: number; bytes: number; url: string; summary: MeshSummary | null }`
  - `isMeshUrlFor(url: string, objectId: string): boolean`
  - `recordMeshFetches(): Promise<void>` (unchanged)
  - `meshFetches(): Promise<MeshCall[]>` (unchanged)
  - `waitForMeshFetch(objectId: string, timeout?: number): Promise<MeshCall>`
  - `waitForMeshSummary(objectId: string, accept?: (s: MeshSummary) => boolean, timeout?: number): Promise<MeshSummary>`
  - `solidColour(s: MeshSummary): Rgb | null`, `textureFiles(s: MeshSummary): string[]`
  - `isGreen(c: Rgb | null): boolean`, `isRed(c: Rgb | null): boolean`, `isBlue(c: Rgb | null): boolean`
  - `installMeshFault(urlPart: string)`, `clearMeshFaults()` (unchanged)

- [ ] **Step 1: Confirm the failure**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts --mochaOpts.grep "fetches a non-empty mesh"`
Expected: 1 failing, "the 3D viewport never fetched a mesh for object N".

- [ ] **Step 2: Replace `e2e/support/viewport3d.ts`**

```ts
/**
 * Verifying that geometry actually reached the 3D viewport.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The 3D window is react-three-fiber drawing into a WebGL <canvas>. WebDriver
 * sees one opaque element: there is no DOM for meshes, no testid inside the
 * canvas, and nothing exposes the three.js scene or the Redux store on
 * `window`. Reading pixels back is no good either — the context is created
 * without preserveDrawingBuffer, so toDataURL() returns a blank image.
 *
 * ── What DOES work ────────────────────────────────────────────────────────
 * The renderer talks to the backend through axios, which resolves
 * `new XMLHttpRequest()` at call time — so every REST call is XHR. The ONE
 * exception is the 3D mesh download, which uses `fetch` directly because the
 * response is an ArrayBuffer rather than JSON (3DWindow/api/geometry.ts).
 * Patching `window.fetch` therefore captures the 3D pipeline and NOTHING ELSE.
 *
 * ── The route ─────────────────────────────────────────────────────────────
 * The viewport downloads meshes from `…/objects/{id}/geometry/gpu` (wire
 * format v2, 3DWindow/api/geometryV2.ts) while the geometry-format flag is
 * 'v2', which is the shipped default. `…/geometry/binary` (v1) is still
 * accepted so a flip back to v1 cannot silently blind every caller. A default
 * 10x10 / 1x1 ground is 1 primitive, 2 triangles and 4 vertices.
 *
 * ── The summary ───────────────────────────────────────────────────────────
 * For a v2 response the recorder also decodes, in the page, a summary per
 * part ("group" in v2): its texture path, whether it carries vertex colours,
 * and its average vertex colour. An untextured part carries its colour per
 * vertex and a textured part carries a texture path instead
 * (pyhelios_wrapper_context.cpp packGPUBuffers: has_colors = untextured ||
 * mask). That is the nearest thing to "what colour is this ground" WebDriver
 * can reach. Only the summary is kept, and responses over 8 MB are not decoded.
 *
 * It is still NOT proof of what was painted — treat it as "this geometry, in
 * this colour, reached the 3D layer".
 */

import { TIMEOUTS } from '../config/timeouts'

export type Rgb = [number, number, number]

export type MeshGroupSummary = {
  textureFile: string | null
  hasColors: boolean
  hasUVs: boolean
  vertexCount: number
  avgColor: Rgb | null
}

export type MeshSummary = {
  primitiveCount: number
  totalTris: number
  totalVerts: number
  groups: MeshGroupSummary[]
}

export type MeshCall = { status: number; bytes: number; url: string; summary: MeshSummary | null }

const RECORDER = '__e2eMeshCalls'
const MESH_FAULTS = '__e2eMeshFaults'

/** True when `url` is a mesh download for `objectId`, on either wire format. */
export function isMeshUrlFor(url: string, objectId: string): boolean {
  return (
    url.includes(`/objects/${objectId}/geometry/gpu`) ||
    url.includes(`/objects/${objectId}/geometry/binary`)
  )
}

/**
 * Start recording 3D mesh fetches. Idempotent — safe to call in a before hook
 * and again per test; the patch is installed once and the log is reset.
 *
 * A browser.refresh() drops the patch (fresh renderer), so re-arm after one.
 */
export async function recordMeshFetches(): Promise<void> {
  await browser.execute((key: string, MESH_FAULT_KEY: string) => {
    const w = window as never as Record<string, unknown>
    w[key] = []
    if (!w[MESH_FAULT_KEY]) w[MESH_FAULT_KEY] = []
    if (w[`${key}__patched`]) return
    w[`${key}__patched`] = true

    // The same layout 3DWindow/api/geometryV2.ts parseGpuBuffers reads: a
    // 16-byte header, one descriptor per group, padding to 4 bytes, then
    // positions f32x3 and colors f32x3 per vertex. Returns null for anything
    // that is not a well-formed v2 buffer.
    const summarise = (buf: ArrayBuffer) => {
      if (buf.byteLength < 16) return null
      const view = new DataView(buf)
      if (view.getUint8(0) !== 2) return null
      const groupCount = view.getUint16(2, true)
      const totalVerts = view.getUint32(4, true)
      const totalTris = view.getUint32(8, true)
      const primitiveCount = view.getUint32(12, true)
      const decoder = new TextDecoder()
      const descriptors: {
        vertexStart: number
        vertexCount: number
        textureFile: string | null
        flags: number
      }[] = []
      let offset = 16
      for (let i = 0; i < groupCount; i++) {
        if (offset + 19 > buf.byteLength) return null
        const vertexStart = view.getUint32(offset, true)
        const vertexCount = view.getUint32(offset + 4, true)
        const pathLen = view.getUint16(offset + 16, true)
        const flags = view.getUint8(offset + 18)
        offset += 19
        if (offset + pathLen > buf.byteLength) return null
        const textureFile =
          pathLen > 0 ? decoder.decode(new Uint8Array(buf, offset, pathLen)) : null
        offset += pathLen
        descriptors.push({ vertexStart, vertexCount, textureFile, flags })
      }
      const colorsAt = ((offset + 3) & ~3) + totalVerts * 12
      if (colorsAt + totalVerts * 12 > buf.byteLength) return null
      const colors = new Float32Array(buf, colorsAt, totalVerts * 3)
      return {
        primitiveCount,
        totalTris,
        totalVerts,
        groups: descriptors.map((d) => {
          let avgColor: [number, number, number] | null = null
          if (d.vertexCount > 0) {
            let r = 0
            let g = 0
            let b = 0
            for (let v = d.vertexStart; v < d.vertexStart + d.vertexCount; v++) {
              r += colors[v * 3]
              g += colors[v * 3 + 1]
              b += colors[v * 3 + 2]
            }
            avgColor = [r / d.vertexCount, g / d.vertexCount, b / d.vertexCount]
          }
          return {
            textureFile: d.textureFile,
            hasColors: (d.flags & 0x04) !== 0,
            hasUVs: (d.flags & 0x02) !== 0,
            vertexCount: d.vertexCount,
            avgColor
          }
        })
      }
    }

    const orig = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : String(args[0])
      // Fault injection lives HERE rather than in support/faults.ts, which
      // patches XMLHttpRequest only. The mesh is the one thing in this app that
      // travels by fetch, so this wrapper is the only place that can fail it —
      // and failing it is the only way to reach the viewport's error banner.
      const faults = (w[MESH_FAULT_KEY] as string[] | undefined) ?? []
      if (faults.some((part) => url.includes(part))) {
        throw new TypeError(`Failed to fetch (e2e mesh fault): ${url}`)
      }
      const res = await orig(...args)
      let bytes = Number(res.headers.get('content-length') ?? -1)
      if (Number.isNaN(bytes)) bytes = -1
      const entry: { status: number; bytes: number; url: string; summary: unknown } = {
        status: res.status,
        bytes,
        url,
        summary: null
      }
      ;(w[key] as unknown[]).push(entry)
      if (res.status === 200 && url.includes('/geometry/gpu') && bytes <= 8_000_000) {
        res
          .clone()
          .arrayBuffer()
          .then((buf) => {
            entry.summary = summarise(buf)
          })
          .catch(() => {
            // The summary is optional; the recorded call stands without it.
          })
      }
      return res
    }
  }, RECORDER, MESH_FAULTS)
}

/** Everything recorded since the last recordMeshFetches(). */
export async function meshFetches(): Promise<MeshCall[]> {
  return (await browser.execute(
    (key: string) => (window as never as Record<string, MeshCall[]>)[key] ?? [],
    RECORDER
  )) as MeshCall[]
}

/**
 * Wait until the viewport has fetched a mesh for `objectId` with a 200.
 *
 * Uses MUTATION budget: the fetch only happens after the create or save has
 * returned, which means a real backend build has completed first.
 */
export async function waitForMeshFetch(
  objectId: string,
  timeout: number = TIMEOUTS.MUTATION
): Promise<MeshCall> {
  const found: { call: MeshCall | null } = { call: null }
  await browser.waitUntil(
    async () => {
      found.call =
        (await meshFetches()).find((c) => isMeshUrlFor(c.url, objectId) && c.status === 200) ??
        null
      return found.call !== null
    },
    {
      timeout,
      timeoutMsg:
        `the 3D viewport never fetched a mesh for object ${objectId}. ` +
        'Either the create failed (check for a 500 BUILD_FAILED — usually a stale ' +
        'libhelios), or the viewport stopped requesting geometry.'
    }
  )
  return found.call as MeshCall
}

/**
 * Wait for the NEWEST decoded mesh of `objectId` to satisfy `accept`.
 *
 * Only decoded v2 responses count. On a timeout the error carries the newest
 * summary seen, so a colour or texture mismatch reads as data, not a timeout.
 */
export async function waitForMeshSummary(
  objectId: string,
  accept: (summary: MeshSummary) => boolean = () => true,
  timeout: number = TIMEOUTS.MUTATION
): Promise<MeshSummary> {
  const state: { match: MeshSummary | null; last: MeshSummary | null } = { match: null, last: null }
  try {
    await browser.waitUntil(
      async () => {
        const decoded = (await meshFetches()).filter(
          (c) => isMeshUrlFor(c.url, objectId) && c.status === 200 && c.summary !== null
        )
        state.last = decoded.length ? decoded[decoded.length - 1].summary : null
        if (state.last !== null && accept(state.last)) {
          state.match = state.last
          return true
        }
        return false
      },
      { timeout }
    )
  } catch {
    throw new Error(
      `no decoded mesh for object ${objectId} matched the expectation within ${timeout}ms. ` +
        `Newest decoded summary: ${JSON.stringify(state.last)}`
    )
  }
  return state.match as MeshSummary
}

/** The single untextured, coloured part's average colour, or null. */
export function solidColour(summary: MeshSummary): Rgb | null {
  const coloured = summary.groups.filter((g) => g.hasColors && g.textureFile === null)
  return coloured.length === 1 ? coloured[0].avgColor : null
}

/** Every texture path the mesh is drawn with. */
export function textureFiles(summary: MeshSummary): string[] {
  return summary.groups
    .map((g) => g.textureFile)
    .filter((t): t is string => t !== null)
}

/** The engine's default tile colour is (0, 0.75, 0). */
export const isGreen = (c: Rgb | null): boolean =>
  c !== null && c[1] >= 0.6 && c[0] <= 0.1 && c[2] <= 0.1
export const isRed = (c: Rgb | null): boolean =>
  c !== null && c[0] >= 0.9 && c[1] <= 0.1 && c[2] <= 0.1
export const isBlue = (c: Rgb | null): boolean =>
  c !== null && c[2] >= 0.9 && c[0] <= 0.1 && c[1] <= 0.1

/**
 * Make the mesh fetch fail for any URL containing `urlPart`.
 *
 * Throws a TypeError from fetch, which is exactly what a real network failure
 * produces, so the saga's own catch runs and dispatches LOAD_SCENE_FAILED.
 *
 * Requires recordMeshFetches() to have installed the patch first. Like every
 * renderer-side patch in this suite, a browser.refresh() drops it.
 */
export async function installMeshFault(urlPart: string): Promise<void> {
  await recordMeshFetches()
  await browser.execute(
    (key: string, part: string) => {
      const w = window as never as Record<string, unknown>
      const rules = (w[key] as string[] | undefined) ?? []
      rules.push(part)
      w[key] = rules
    },
    MESH_FAULTS,
    urlPart
  )
}

/** Remove every mesh fault. The patch stays installed but matches nothing. */
export async function clearMeshFaults(): Promise<void> {
  await browser
    .execute((key: string) => {
      ;(window as never as Record<string, unknown>)[key] = []
    }, MESH_FAULTS)
    .catch(() => {
      // The renderer may have been refreshed away; nothing to clear.
    })
}
```

- [ ] **Step 3: Point `large-ground.test.ts` counters at both routes**

In the import on line 75, replace
`import { meshFetches, recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'`
with
`import { isMeshUrlFor, meshFetches, recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'`.

Replace the two counters (lines 228–245) with:

```ts
  const meshCallsFor = async (id: string): Promise<number> =>
    (await meshFetches()).filter((c) => isMeshUrlFor(c.url, id)).length
```

and

```ts
  const builtMeshCallsFor = async (id: string): Promise<number> =>
    (await meshFetches()).filter(
      (c) => isMeshUrlFor(c.url, id) && c.status === 200 && c.bytes !== 0
    ).length
```

Leave the doc comments above each counter as they are.

- [ ] **Step 4: Fault the current route in `viewport-lighting.test.ts`**

In `it('a failed scene load shows the error banner, and no loader'`, replace the comment line
`// The banner is reachable ONLY by failing the binary-mesh fetch.`
with `// The banner is reachable ONLY by failing the mesh fetch.`, the comment line
`// loadSceneWorker's catch is fed by fetchObjectGeometryBinary and nothing`
with `// loadSceneWorker's catch is fed by the mesh fetch (fetchGeometry) and nothing`, and
`await installMeshFault('/geometry/binary')` with `await installMeshFault('/geometry/gpu')`.

- [ ] **Step 5: Fix the selectivity check in `viewport.test.ts`**

Change the import on line 62 to
`import { isMeshUrlFor, meshFetches, recordMeshFetches, waitForMeshFetch } from '../support/viewport3d'`
and line 335 to
`expect(urls.some((u) => isMeshUrlFor(u, untouched))).toBe(false)`.

- [ ] **Step 6: Typecheck**

Run: `npm run e2e:typecheck`
Expected: exit code 0, no output errors.

- [ ] **Step 7: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/geometry.test.ts --mochaOpts.grep "fetches a non-empty mesh|Save PATCHes the edit"`
Expected: 2 passing.

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/viewport-lighting.test.ts --mochaOpts.grep "switching mode fetches NO mesh|a failed scene load|Loading scene"`
Expected: 3 passing.

- [ ] **Step 8: Checkpoint** — show `git diff --stat`; do not commit.

---

### Task 2: `support/defaultMaterial.ts`, option A in `material-assignment.test.ts`, and the colour gate

**Files:**
- Create: `e2e/support/defaultMaterial.ts`
- Modify: `e2e/tests/material-assignment.test.ts:94-108` (imports, `trackGround`) and `:37-46` (header rules)
- Create then delete: `e2e/tests/_probe-default-colour.test.ts`

**Interfaces:**
- Consumes: `waitForMeshSummary`, `solidColour`, `textureFiles`, `isGreen` (Task 1)
- Produces (from `e2e/support/defaultMaterial.ts`):
  - `DEFAULT_MATERIAL_PREFIX = 'Mtl.'`
  - `expectedDefaultMaterialName(groundName: string, libraryNames: readonly string[]): string`
  - `libraryNames(): Promise<string[]>`
  - `waitForLibraryRow(name: string): Promise<string>` — resolves to the library row id
  - `waitForDefaultMaterial(): Promise<string>` — the open ground form's single `Mtl.` material
  - `unassignMaterial(name: string): Promise<void>`

- [ ] **Step 1: Confirm the failure**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/material-assignment.test.ts --mochaOpts.grep "Save assigns the material and confirms"`
Expected: 1 failing, "the save never landed (Save never went quiet again)".

- [ ] **Step 2: Create `e2e/support/defaultMaterial.ts`**

```ts
/**
 * The default material every new ground is born with.
 *
 * Shipped rule (helios-desktop-backend, material_library_service.py):
 *  - a new GROUND is created with one material named `Mtl.<ground name>`: a
 *    single Visualiser member in texture mode on dirt.jpg
 *    (create_default_ground_group);
 *  - material names are unique across the whole library, case-insensitively;
 *    on a clash the first free `.1`, `.2`, … suffix is taken (_auto_group_name);
 *  - names are at most 20 characters, so the ground name is cut to fit;
 *  - renaming or deleting the ground leaves the material alone — deleting a
 *    ground leaving its material behind is intended (confirmed 14 Sep 2026).
 *
 * The frontend refetches the library after every create
 * (Geometry/saga.ts createObjectWorker), and the ground's form counts the
 * default as already SAVED — so picking another material turns Save into the
 * Replace confirmation, and a material dropped on the ground asks to Replace.
 */
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { MATERIALS_MSG, MATERIAL_LIMITS } from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from './dialogs'

export const DEFAULT_MATERIAL_PREFIX = 'Mtl.'

/** The name the backend will give a new ground's default material. */
export function expectedDefaultMaterialName(
  groundName: string,
  libraryNames: readonly string[]
): string {
  const taken = new Set(libraryNames.map((n) => n.toLowerCase()))
  const budget = MATERIAL_LIMITS.NAME_MAX - DEFAULT_MATERIAL_PREFIX.length
  const base = groundName.trim().slice(0, budget)
  const first = `${DEFAULT_MATERIAL_PREFIX}${base}`
  if (!taken.has(first.toLowerCase())) return first
  for (let n = 1; n < 10000; n++) {
    const suffix = `.${n}`
    const candidate = `${DEFAULT_MATERIAL_PREFIX}${base.slice(0, budget - suffix.length)}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  throw new Error(`expectedDefaultMaterialName: no free name for "${groundName}"`)
}

/** Every material name in the library, once the list has finished loading. */
export async function libraryNames(): Promise<string[]> {
  await Materials.clearSearch()
  await browser.waitUntil(
    async () => {
      if (!(await Materials.listEmpty.isExisting().catch(() => false))) return true
      return (await Materials.emptyHint()) !== MATERIALS_MSG.loading
    },
    { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the Materials library never finished loading' }
  )
  return Materials.names()
}

/** Wait for `name` to appear in the Materials library and return its row id. */
export async function waitForLibraryRow(name: string): Promise<string> {
  const found = { id: '' }
  await browser.waitUntil(
    async () => {
      found.id = (await Materials.idForName(name)) ?? ''
      return found.id !== ''
    },
    { timeout: TIMEOUTS.MUTATION, timeoutMsg: `"${name}" never appeared in the Materials library` }
  )
  return found.id
}

/**
 * The single `Mtl.` material on the ground whose form is open.
 *
 * `+ Ground` opens THAT ground's form, so call this straight after creating it.
 */
export async function waitForDefaultMaterial(): Promise<string> {
  const found = { name: '' }
  await browser.waitUntil(
    async () => {
      const names = await ObjectProperties.assignedNames()
      if (names.length !== 1 || !names[0].startsWith(DEFAULT_MATERIAL_PREFIX)) return false
      found.name = names[0]
      return true
    },
    {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: 'the new ground never listed exactly one default Mtl. material'
    }
  )
  return found.name
}

/**
 * Unassign a SAVED material from the ground whose form is open, through the
 * Unassign confirmation. Pessimistic: returns once the DELETE has come back and
 * the row is gone.
 */
export async function unassignMaterial(name: string): Promise<void> {
  await ObjectProperties.removeAssigned(name)
  const dialog = await waitForOpenDialog()
  if (dialog.ariaLabel !== GEOMETRY_MATERIAL_MSG.unassignTitle) {
    throw new Error(
      `removing "${name}" opened "${dialog.ariaLabel}", not the Unassign confirmation`
    )
  }
  await clickDialogButton(GEOMETRY_MATERIAL_MSG.unassignConfirm)
  await waitForNoOpenDialog()
  await browser.waitUntil(
    async () => !(await ObjectProperties.assignedNames()).includes(name),
    {
      timeout: TIMEOUTS.MUTATION,
      timeoutMsg: `"${name}" was never unassigned (the DELETE never came back)`
    }
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run e2e:typecheck`
Expected: exit code 0.

- [ ] **Step 4: The colour gate — create `e2e/tests/_probe-default-colour.test.ts`**

```ts
import Geometry from '../pages/Geometry.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { enterGeometry, waitForBackendReady, waitForMainWindow } from '../support/harness'
import {
  recordMeshFetches,
  solidColour,
  textureFiles,
  waitForMeshSummary
} from '../support/viewport3d'
import { unassignMaterial, waitForDefaultMaterial } from '../support/defaultMaterial'

describe('PROBE — a ground with and without its default material', () => {
  it('prints the decoded mesh before and after removing the default', async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterGeometry('probe')
    await recordMeshFetches()
    const id = await Geometry.addGround()
    await ObjectProperties.waitForOpen()
    const name = await waitForDefaultMaterial()
    const before = await waitForMeshSummary(id)
    console.log(`[probe] default=${name}`)
    console.log(`[probe] before=${JSON.stringify(before)} textures=${JSON.stringify(textureFiles(before))}`)
    await recordMeshFetches()
    await unassignMaterial(name)
    const after = await waitForMeshSummary(id)
    console.log(`[probe] after=${JSON.stringify(after)} solid=${JSON.stringify(solidColour(after))}`)
  })
})
```

- [ ] **Step 5: Run the gate**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/_probe-default-colour.test.ts 2>&1 | grep '\[probe\]'`
Expected: `default=Mtl.Ground.001`; `before` has one group whose `textureFile` ends in `dirt.jpg`; `after` has one group with `textureFile: null`, `hasColors: true`, and `solid` close to `[0, 0.75, 0]`.

- If `solid` is green: continue.
- If `solid` is any other colour: that is an APP BUG — decided by the user, 14 Sep 2026: "if the ground is not showing the green then it is incorrect". Keep every green assertion in this plan unchanged (Task 9's green test will then fail and must stay failing), record the printed lines as a product finding for the report and CLAUDE.md §7, and continue.
- If `after` is `null` (nothing decoded): the oracle is broken, not the app — delete the probe, STOP and investigate `summarise()` before continuing.

- [ ] **Step 6: Delete the probe**

Run: `rm e2e/tests/_probe-default-colour.test.ts`

- [ ] **Step 7: Option A in `material-assignment.test.ts`**

Add after the `import { drainToasts, waitForToast } from '../support/toasts'` line:

```ts
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
```

Replace `trackGround` (lines 104–108) with:

```ts
  /**
   * Create a ground and return its row id.
   *
   * Every new ground is born wearing its default `Mtl.<name>` material
   * (support/defaultMaterial.ts). The tests in this file are about assigning
   * onto an EMPTY ground, so the default is unassigned here — option A, agreed
   * 14 Sep 2026. It is tracked for cleanup either way, because deleting the
   * ground leaves the material in the library.
   */
  const trackGround = async (): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    await unassignMaterial(defaultName)
    return id
  }
```

In the header's "Rules this file depends on" list (after the `+Ground opens THAT ground's form.` bullet), add:

```ts
 *  - EVERY NEW GROUND IS BORN WEARING `Mtl.<name>`. trackGround() unassigns it
 *    before a test sees the ground, and tracks it so afterEach deletes it too.
```

- [ ] **Step 8: Check nothing else reads the `materials` array**

Run: `grep -nE "\bmaterials(\.| =|\[)" e2e/tests/material-assignment.test.ts`
Expected: only `let materials: string[] = []`, `materials.push(...)` inside the track helpers, `materials = []` and `[...materials]` in `afterEach`, and `materials = materials.filter(...)` bookkeeping. If a test reads `materials` for anything else, stop and move the default ids into a separate `defaults` array deleted after `materials` in `afterEach`.

- [ ] **Step 9: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/material-assignment.test.ts`
Expected: 47 passing, 1 pending (the empty-library self-skip), 0 failing. If a failure remains, read its message: a mesh-route message means Task 1 is missing; any other message, stop and investigate before Task 3.

- [ ] **Step 10: Checkpoint** — `git diff --stat`; no commit.

---

### Task 3: Option A in `material-submodels` and `material-uploads`

**Files:**
- Modify: `e2e/tests/material-submodels.test.ts` (imports near line 116, `trackGround` at 157–161)
- Modify: `e2e/tests/material-uploads.test.ts` (imports near line 71, `trackGround` at 87–91)

**Interfaces:**
- Consumes: `unassignMaterial`, `waitForDefaultMaterial`, `waitForLibraryRow` (Task 2)

- [ ] **Step 1: Confirm the failures**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/material-uploads.test.ts --mochaOpts.grep "reaches a ground through assignment"`
Expected: 1 failing, "no toast containing … appeared".

- [ ] **Step 2: `material-submodels.test.ts`**

Add after `import { drainToasts, waitForToast } from '../support/toasts'`:

```ts
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
```

Replace `trackGround` with:

```ts
  /**
   * Create a ground and return its row id, WITHOUT its default material.
   *
   * Every new ground is born wearing `Mtl.<name>` (support/defaultMaterial.ts);
   * this file assigns sub-model materials onto an empty ground, so the default is
   * unassigned here and tracked for cleanup (option A, agreed 14 Sep 2026).
   */
  const trackGround = async (): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    await unassignMaterial(defaultName)
    return id
  }
```

- [ ] **Step 3: `material-uploads.test.ts`**

Add after `import { drainToasts, waitForToast } from '../support/toasts'`:

```ts
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
```

Replace `trackGround` with:

```ts
  /**
   * Create a ground and return its row id, WITHOUT its default material.
   *
   * Every new ground is born wearing `Mtl.<name>` (support/defaultMaterial.ts);
   * the texture test drops an uploaded texture onto an empty ground, so the
   * default is unassigned here and tracked for cleanup (option A, agreed
   * 14 Sep 2026).
   */
  const trackGround = async (): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    await unassignMaterial(defaultName)
    return id
  }
```

- [ ] **Step 4: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 5: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/material-submodels.test.ts`
Expected: 30 passing, 0 failing.

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/material-uploads.test.ts`
Expected: 6 passing, 0 failing.

- [ ] **Step 6: Checkpoint** — `git diff --stat`; no commit.

---

### Task 4: `large-ground` — keep the default where it is the point; the one-way door

**Files:**
- Modify: `e2e/tests/large-ground.test.ts` (imports near line 76, `trackGround` 113–117, soil test at 537, one-way-door test at 680)

**Interfaces:**
- Consumes: `unassignMaterial`, `waitForDefaultMaterial`, `waitForLibraryRow` (Task 2); `isMeshUrlFor` (Task 1)

- [ ] **Step 1: Imports and `trackGround`**

Add after `import { drainToasts, waitForToast } from '../support/toasts'`:

```ts
import {
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
```

Replace `trackGround` with:

```ts
  /**
   * Create a ground and return its row id.
   *
   * Every new ground is born wearing `Mtl.<name>`, a Visualiser on the 512 px
   * dirt.jpg (support/defaultMaterial.ts). That texture is what caps a ground at
   * 511 cells per axis, so the ONE test about the cap keeps it (`keepDefault`);
   * every other test starts from an empty ground — a plain tile with no cap
   * (scene_object_service._winner_surface 'plain'). Tracked for cleanup either way.
   */
  const trackGround = async ({
    keepDefault = false
  }: { keepDefault?: boolean } = {}): Promise<string> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const defaultName = await waitForDefaultMaterial()
    materials.push(await waitForLibraryRow(defaultName))
    if (!keepDefault) await unassignMaterial(defaultName)
    return id
  }
```

- [ ] **Step 2: The cap test keeps its default**

Rename the test
`'a SOIL ground REFUSES 1000 x 1000 — the engine message reaches the form, unattached to a field'`
to
`'a ground wearing its DEFAULT dirt texture REFUSES 1000 x 1000 — the engine message reaches the form, unattached to a field'`,
change its section comment `// ══ 2. A SOIL ground refuses 1e6 cells ═══` to `// ══ 2. A ground wearing its default texture refuses 1e6 cells ═══`, and change its first statement
`const id = await trackGround()` to `const id = await trackGround({ keepDefault: true })`.
Directly above that statement add:

```ts
    // The texture whose pixel cap bites is the DEFAULT material's dirt.jpg: every
    // new ground is born wearing it. Without a material the ground is a plain tile
    // with no cap at all, which is why this — alone in the file — keeps it.
```

- [ ] **Step 3: Run the file as it stands**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/large-ground.test.ts`
Expected: the first three tests pass. The one-way-door test is the one to read:
- If it PASSES, leave it unchanged and go to Step 5.
- If it FAILS with "the save reported nothing on the form", the swap now succeeds — do Step 4.
- Any other failure: stop and investigate.

- [ ] **Step 4: Invert the one-way-door test**

Rename
`'SWAPPING the material on a 1e6-cell ground is REFUSED — the colour surface is a one-way door'`
to
`'SWAPPING the material on a 1e6-cell ground now SUCCEEDS — a ground with no material has no texture cap'`.

Replace the comment block from `// The follow-on nobody expects, and the most useful thing in this file.` down to (and including) `// delete-before-add, then invert this test rather than deleting it.` with:

```ts
    // INVERTED 2026-09-14. This used to pin a one-way door: replacing a material
    // is delete-then-add (updateObjectWorker), and with the last material gone the
    // desired surface was 'soil' — a dirt.jpg rebuild at 1000x1000, which the
    // engine refuses. Since 6878eaf ("a new ground carries no texture and no
    // colour of ours") a ground with no material is a PLAIN tile with no texture
    // cap, so the intermediate state the replace passes through is buildable and
    // the swap succeeds. The CLAUDE.md §7 finding is closed.
```

Replace everything from `await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)` to the end of the test body with:

```ts
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()

    await waitForSaveSettled()
    expect(await formError()).toBe(null)
    await waitForAssigned([second], TIMEOUTS.MUTATION)
  })
```

- [ ] **Step 5: Typecheck and verify**

Run: `npm run e2e:typecheck` — expected exit 0.
Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/large-ground.test.ts`
Expected: 4 passing, 0 failing.

- [ ] **Step 6: Checkpoint** — `git diff --stat`; no commit. Note for Task 13 whether Step 4 was applied.

---

### Task 5: Rename by double-click replaces the pencil

**Files:**
- Modify: `e2e/constants/geometry.ts` (`GEOMETRY_MSG`)
- Modify: `e2e/constants/materials.ts` (`MATERIALS_MSG`)
- Modify: `e2e/pages/ObjectProperties.page.ts:558-648`
- Modify: `e2e/tests/ground.test.ts:149-182` and the file header line 22
- Modify: `e2e/tests/materials.test.ts` — block `describe('renaming from the FORM'` (≈4094–4200) and block `describe('renaming from the Properties form'` (≈6144–6275)

**Interfaces:**
- Produces: `GEOMETRY_MSG.renameHint`, `GEOMETRY_MSG.renameGroupHint`, `MATERIALS_MSG.renameHint`; `ObjectProperties.editName(): Promise<void>` (now double-click), `ObjectProperties.nameHint(): Promise<string | null>`; `ObjectProperties.editNameButton` (absence oracle only)

- [ ] **Step 1: Confirm the failures**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/ground.test.ts --mochaOpts.grep "BLUR commits the rename"`
Expected: 1 failing, `element ("button[aria-label="Edit name"]") still not clickable`.

- [ ] **Step 2: Hint constants**

In `e2e/constants/geometry.ts`, replace
`  groupNameExists: 'Group name already exists',`
with:

```ts
  groupNameExists: 'Group name already exists',

  // Hover hints (native `title`) on every name a double-click renames: the
  // Properties form header while it is locked, and each tree row. 10a5a51
  // removed the pencil and put the gesture here instead.
  renameHint: 'Double-click to rename the geometry.',
  renameGroupHint: 'Double-click to rename the group.',
```

In `e2e/constants/materials.ts`, replace
`  nameExists: 'Material name already exists',`
with:

```ts
  nameExists: 'Material name already exists',
  /** Hover hint on the form header (while locked) and on every library row. */
  renameHint: 'Double-click to rename the material.',
```

- [ ] **Step 3: `ObjectProperties.page.ts`**

Replace the comment line `// ===== The name row: pencil, blur-commit, validation tooltip =====` with `// ===== The name row: double-click, blur-commit, validation tooltip =====`, and replace point 1 of the block below it (the four lines starting `// 1. THE NAME IS READ-ONLY UNTIL THE PENCIL IS TAPPED`) with:

```ts
  // 1. THE NAME IS READ-ONLY UNTIL IT IS DOUBLE-CLICKED. The pencil that used to
  //    unlock it was removed in 10a5a51; while locked the input carries
  //    GEOMETRY_MSG.renameHint as its `title`. Writing into it without editName()
  //    first still mutates the draft — React does not honour `readOnly` against a
  //    native-setter write — so a test that skips the double-click proves nothing
  //    about the lock.
```

Replace the `editNameButton` getter and its doc comment with:

```ts
  /** The REMOVED pencil (10a5a51). An absence oracle only — it must not exist. */
  get editNameButton(): El {
    return this.form.$('button[aria-label="Edit name"]')
  }
```

Replace `editName()` and its doc comment with:

```ts
  /** The name input's hover hint (`title`) — present only while it is locked. */
  async nameHint(): Promise<string | null> {
    return this.nameInput.getAttribute('title')
  }

  /**
   * Double-click the name and wait for the field to actually unlock.
   *
   * Dispatched in-page on the input itself: the double-click is the only way in
   * since the pencil was removed.
   */
  async editName(): Promise<void> {
    await this.nameInput.waitForExist({ timeout: TIMEOUTS.MEDIUM })
    await browser.execute(() => {
      const el = document.querySelector('[data-testid="object-name"]')
      if (!el) throw new Error('editName: the Properties form has no name input')
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    })
    await browser.waitUntil(async () => !(await this.nameState()).readOnly, {
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'double-clicking the name never unlocked it'
    })
  }
```

- [ ] **Step 4: `ground.test.ts`**

In the header, replace `any layer had ever driven the pencil, so handleNameBlur — the only path to a` with `any layer had ever driven the name field, so handleNameBlur — the only path to a`.

Replace the section comment above `describe('rename from the Properties form'` (the three lines starting `// Nothing at any layer had driven this before.`) with:

```ts
  // Nothing at any layer had driven this before. The name unlocks on
  // double-click — the pencil was removed in 10a5a51 — and ObjectProperties
  // scopes every read to object-properties-form.
```

Replace the first two tests of that describe (`'the name is read-only until the pencil unlocks it, and then takes focus'` and `'double-clicking the name unlocks it too — the second route to the same state'`) with:

```ts
    it('the name is read-only until DOUBLE-CLICKED, and then takes focus', async () => {
      await track()
      await ObjectProperties.waitForOpen()

      // Read-only is the SHIPPED lock, not merely a styling choice.
      expect((await ObjectProperties.nameState()).readOnly).toBe(true)

      await ObjectProperties.editName()
      expect((await ObjectProperties.nameState()).readOnly).toBe(false)
      // Polled: the focus lives in an effect keyed on nameEditing, which commits
      // after the render that flipped readOnly.
      await browser.waitUntil(async () => ObjectProperties.nameInput.isFocused(), {
        timeout: TIMEOUTS.SHORT,
        timeoutMsg: 'the unlocked name field never took focus'
      })
    })

    it('the locked name says how to rename it, and there is no pencil any more', async () => {
      // 10a5a51 removed the "Edit name" pencil and put the gesture in a hover
      // hint. The hint is there only while the field is locked.
      await track()
      await ObjectProperties.waitForOpen()
      expect(await ObjectProperties.nameHint()).toBe(GEOMETRY_MSG.renameHint)
      expect(await ObjectProperties.editNameButton.isExisting()).toBe(false)

      await ObjectProperties.editName()
      expect(await ObjectProperties.nameHint()).toBe(null)
      // The blur commits the unchanged name, which handleNameBlur ignores.
      await ObjectProperties.commitName()
    })
```

- [ ] **Step 5: `materials.test.ts` — the "renaming from the FORM" block**

Replace the block's opening comment (three lines starting `// The left-panel row editor is covered eight ways above.`) with:

```ts
    // The left-panel row editor is covered eight ways above. The FORM's own name
    // header — a read-only input a double-click unlocks (its pencil was removed in
    // 10a5a51) — had no coverage at all, and neither did the direction the two
    // panels have to agree in.
```

Replace `clickPencil` and its doc comment with:

```ts
    /** Double-click the form's name header — the only way to unlock it. */
    const unlockFormName = async (): Promise<void> => {
      await browser.execute(() => {
        const el = document.querySelector('[data-testid="material-form-name"]')
        if (!el) throw new Error('unlockFormName: the material Properties form is not open')
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(
        async () =>
          (await $('[data-testid="material-form-name"]').getAttribute('readonly')) === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'double-clicking never unlocked material-form-name' }
      )
    }
```

In `it('the PENCIL renames from the form, and the LEFT ROW follows'`: rename it to `'a DOUBLE-CLICK renames from the form, and the LEFT ROW follows'`, replace `await clickPencil()` with `await unlockFormName()`, and replace `'the pencil rename never reached the left-panel row'` with `'the form rename never reached the left-panel row'`.

In the next test, rename `'blurring the READ-ONLY name fires NO rename — the PENCIL is the only way in'` to `'blurring the READ-ONLY name fires NO rename — a double-click is the only way in'` and replace the comment line `// No pencil. The write still reaches React's onChange (readOnly blocks the` with `// No double-click. The write still reaches React's onChange (readOnly blocks the`.

- [ ] **Step 6: `materials.test.ts` — the "renaming from the Properties form" block**

Replace `startFormNameEdit` and its doc comment with:

```ts
    /**
     * Double-click the name and wait for the field to actually unlock.
     *
     * Dispatched in-page on material-form-name. The pencil this used to click was
     * removed in 10a5a51; the input's own double-click is now the only way in.
     */
    const startFormNameEdit = async (): Promise<void> => {
      await browser.execute(() => {
        const el = document.querySelector('[data-testid="material-form-name"]')
        if (!el) throw new Error('the Material Properties form has no name input')
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(async () => !(await formNameState()).readOnly, {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'double-clicking never unlocked material-form-name'
      })
    }
```

Replace the whole test `it('the EDIT NAME pencil ships on the PROPERTIES FORM only — the library row has NONE'` with:

```ts
    it('NEITHER panel has a pencil — both names unlock on DOUBLE-CLICK and say so on hover', async () => {
      // 10a5a51 removed the form's "Edit name" pencil and put the gesture in a
      // `title` hint on both names: the form header (only while locked) and the
      // library row (always). Pinned both ways, so a pencil coming back or a hint
      // going missing turns this red.
      const id = await track()
      await MaterialProperties.waitForOpen()

      expect(
        await browser.execute(() => document.querySelectorAll('[aria-label="Edit name"]').length)
      ).toBe(0)
      expect(await MaterialProperties.nameInput.getAttribute('title')).toBe(MATERIALS_MSG.renameHint)
      expect(await Materials.rowName(id).getAttribute('title')).toBe(MATERIALS_MSG.renameHint)

      // The row is not simply barren — it still carries its trash.
      expect(
        await browser.execute(
          (rowId: string) =>
            document.querySelectorAll(
              `[data-testid="material-row-${rowId}"] [aria-label="Delete material"]`
            ).length,
          id
        )
      ).toBe(1)

      // Once unlocked, the form's hint is gone — the advice is spent.
      await startFormNameEdit()
      expect(await MaterialProperties.nameInput.getAttribute('title')).toBe(null)
      // Unchanged name: handleNameBlur re-locks without a PATCH.
      await blurFormName()
    })
```

In the next test, rename `'clicking the pencil UNLOCKS material-form-name, FOCUSES it, and lets keystrokes through'` to `'double-clicking UNLOCKS material-form-name, FOCUSES it, and lets keystrokes through'`, and replace `'the pencil unlocked the name field but never put the caret in it'` with `'the double-click unlocked the name field but never put the caret in it'`.

- [ ] **Step 7: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 8: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/ground.test.ts`
Expected: 22 passing, 0 failing (two tests replaced by two).

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/materials.test.ts --mochaOpts.grep "renaming from the"`
Expected: all matched tests passing, 0 failing.

- [ ] **Step 9: Checkpoint** — `git diff --stat`; no commit.

---

### Task 6: The 3D scene without the statistics overlay

**Files:**
- Modify: `e2e/pages/Viewport3D.page.ts` (add `sceneObjectNames()` after `selectSceneObject`; note on `readStats`)
- Modify: `e2e/tests/viewport.test.ts` (header "The oracle" paragraph, imports, `describe('3D viewport — the scene statistics oracle'`, the isolate test's last line, the material test)
- Modify: `e2e/tests/journey.test.ts` (steps 13, 14, 15; imports)

**Interfaces:**
- Consumes: `waitForMeshSummary`, `isMeshUrlFor`, `solidColour`, `isRed` (Task 1)
- Produces: `Viewport3D.sceneObjectNames(): Promise<string[]>`

- [ ] **Step 1: Confirm the failure**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/viewport.test.ts --mochaOpts.grep "the overlay toggles open and closed"`
Expected: 1 failing, "the scene-statistics toggle button is not in the DOM".

- [ ] **Step 2: `Viewport3D.page.ts`**

Directly after `selectSceneObject(...)`, add:

```ts
  /**
   * Names of the objects the 3D scene holds, read from the scene selector
   * ("All" excluded).
   *
   * The replacement for readStats(): the statistics toggle and overlay are
   * hidden (Viewport3D.tsx `SHOW_STATS_UI = false`, d9b9d39). The selector lists
   * every VISIBLE object; it is closed again before this returns so it cannot
   * cover a later click.
   */
  async sceneObjectNames(): Promise<string[]> {
    if (!(await this.sceneSelectorTrigger.isExisting())) return []
    await this.waitForIdle()
    await this.openSelector()
    const names = (await this.selectorOptions()).slice(1)
    await this.sceneSelectorTrigger.click()
    await $('[data-testid="scene-selector-option-all"]').waitForExist({
      reverse: true,
      timeout: TIMEOUTS.SHORT,
      timeoutMsg: 'the scene selector did not close'
    })
    return names
  }
```

In the doc comment of `readStats()`, add as its first line: `* UNUSABLE while Viewport3D.tsx ships SHOW_STATS_UI = false — use sceneObjectNames().`

- [ ] **Step 3: `viewport.test.ts` — header and imports**

Replace the header's `── The oracle, and the trap inside it ──` section (from that heading down to `depends on that; see the header of e2e/pages/Viewport3D.page.ts.`) with:

```ts
 * ── The oracle ────────────────────────────────────────────────────────────
 *
 * The statistics overlay this file used to read is hidden (Viewport3D.tsx
 * SHOW_STATS_UI = false, d9b9d39 — pinned as a DEVIATION below). What the
 * scene holds is read from the scene selector, which lists every visible
 * object (Viewport3D.sceneObjectNames), and how big each object is from the
 * mesh the viewport downloaded (support/viewport3d.ts waitForMeshSummary).
```

Replace the imports block (from `import Geometry from '../pages/Geometry.page'` to `import { DEFAULT_GROUND_STATS, SCENE_SELECTOR, expectedStatsForGrounds } from '../constants/viewport'`) with:

```ts
import Geometry from '../pages/Geometry.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import Viewport from '../pages/Viewport3D.page'
import {
  deleteProjectViaBackend,
  enterGeometry,
  reloadToHome,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import {
  isMeshUrlFor,
  meshFetches,
  recordMeshFetches,
  textureFiles,
  waitForMeshFetch,
  waitForMeshSummary
} from '../support/viewport3d'
import { dragMaterialOnto } from '../support/dnd'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { TIMEOUTS } from '../config/timeouts'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { DEFAULT_GROUND_STATS, SCENE_SELECTOR } from '../constants/viewport'
```

- [ ] **Step 4: `viewport.test.ts` — replace the statistics describe**

Replace the whole `describe('3D viewport — the scene statistics oracle', () => { … })` block with:

```ts
describe('3D viewport — what the scene holds', () => {
  const nameOf = async (id: string): Promise<string> =>
    (await Geometry.rowName(id).getText()).trim()

  it('the statistics toggle and overlay are NOT shipped', async () => {
    // DEVIATION: d9b9d39 hid the statistics button and its overlay
    // (SHOW_STATS_UI = false). Turning the flag back on fails this — restore the
    // overlay tests then.
    await addGroundWithMesh()
    expect(await Viewport.statsToggle.isExisting()).toBe(false)
    expect(await Viewport.statsOverlay.isExisting()).toBe(false)
  })

  it('an empty scene holds no objects', async () => {
    expect(await Viewport.sceneObjectNames()).toEqual([])
  })

  it('a new ground APPEARS in the scene, not just in the tree', async () => {
    const id = await addGroundWithMesh()
    expect(await Viewport.sceneObjectNames()).toEqual([await nameOf(id)])
    const mesh = await waitForMeshSummary(id)
    expect(mesh.primitiveCount).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(mesh.totalTris).toBe(DEFAULT_GROUND_STATS.triangles)
    expect(mesh.totalVerts).toBe(DEFAULT_GROUND_STATS.vertices)
  })

  it('a second ground ADDS to the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const objects = await Viewport.sceneObjectNames()
    expect(objects).toHaveLength(2)
    expect(objects).toContain(await nameOf(first))
    expect(objects).toContain(await nameOf(second))
  })

  it('HIDING a ground removes it from the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const secondName = await nameOf(second)
    expect(await Viewport.sceneObjectNames()).toHaveLength(2)

    await Geometry.clickEye(first)

    await browser.waitUntil(
      async () => {
        const objects = await Viewport.sceneObjectNames()
        return objects.length === 1 && objects[0] === secondName
      },
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'hiding a ground did not remove it from the scene' }
    )
  })

  it('UN-HIDING a ground restores it to the scene', async () => {
    const id = await addGroundWithMesh()
    const name = await nameOf(id)
    await Geometry.clickEye(id)
    await browser.waitUntil(async () => (await Viewport.sceneObjectNames()).length === 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'the ground never left the scene'
    })

    await recordMeshFetches()
    await Geometry.clickEye(id)
    await waitForMeshFetch(id)
    await Viewport.waitForIdle()

    await browser.waitUntil(async () => (await Viewport.sceneObjectNames()).includes(name), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'un-hiding the ground did not bring it back into the scene'
    })
    const mesh = await waitForMeshSummary(id)
    expect(mesh.primitiveCount).toBe(DEFAULT_GROUND_STATS.primitives)
    expect(mesh.totalTris).toBe(DEFAULT_GROUND_STATS.triangles)
  })

  it('DELETING a ground removes it from the scene', async () => {
    const first = await addGroundWithMesh()
    const second = await addGroundWithMesh()
    const secondName = await nameOf(second)
    expect(await Viewport.sceneObjectNames()).toHaveLength(2)

    await Geometry.deleteRow(first)

    await browser.waitUntil(
      async () => {
        const objects = await Viewport.sceneObjectNames()
        return objects.length === 1 && objects[0] === secondName
      },
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'deleting a ground did not remove it from the scene' }
    )
  })
})
```

- [ ] **Step 5: `viewport.test.ts` — the isolate test and the material test**

In `it('picking an object ISOLATES it, and All restores the scene'`, replace its last line
`expect((await Viewport.readStats()).objects).toBe(2)` with
`expect(await Viewport.sceneObjectNames()).toHaveLength(2)`.

In `it('deleting an assigned material refetches ONLY the objects that used it'`, replace from `await Geometry.selectRow(assigned)` down to (and including) `await recordMeshFetches()` that precedes `await Materials.deleteRow(materialId)` with:

```ts
    await Geometry.selectRow(assigned)
    await ObjectProperties.waitForOpen()

    await recordMeshFetches()
    await dragMaterialOnto({ groupId: materialId, name: materialName }, assigned)
    // Every new ground is born wearing its default Mtl. material, so the drop
    // asks to REPLACE it first (TreeRow's own Replace dialog).
    const dialog = await waitForOpenDialog()
    expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()
    await browser.waitUntil(
      async () => (await ObjectProperties.assignedNames()).includes(materialName),
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: `"${materialName}" never replaced the default` }
    )
    // The replace's own refetch: the blank material has no Visualiser, so the
    // ground is rebuilt WITHOUT the default's texture. Wait for exactly that
    // before re-arming, so it cannot satisfy the assertion below.
    await waitForMeshSummary(assigned, (s) => textureFiles(s).length === 0)
    await Viewport.waitForIdle()

    await recordMeshFetches()
```

- [ ] **Step 6: `journey.test.ts`**

Run: `grep -nE "^import|from '" e2e/tests/journey.test.ts`
Add these names to the existing import from each module, creating the import line if that module is not imported yet:
- `'../support/viewport3d'`: `waitForMeshSummary`, `solidColour`, `isRed`
- `'../support/dialogs'`: `clickDialogButton`, `waitForNoOpenDialog`, `waitForOpenDialog`
- `'../constants/geometry'`: `GEOMETRY_MATERIAL_MSG`

In `it('13. a ground APPEARS in the 3D scene'`, replace its comment sentence `// suite. The scene-statistics overlay is the only DOM-readable proxy for` + `// what the scene actually holds.` with `// suite. The scene selector and the downloaded mesh are the DOM-readable` + `// proxies for what the scene actually holds.`, and replace everything from `// readStats() re-toggles the overlay on every read, which is what forces` down to `G.groundName = (await Geometry.rowName(groundId).getText()).trim()` with:

```ts
    // The statistics overlay this step used to read is hidden (SHOW_STATS_UI =
    // false, d9b9d39); read the scene selector and the downloaded mesh instead.
    const groundName = (await Geometry.rowName(groundId).getText()).trim()
    expect(await Viewport.sceneObjectNames()).toEqual([groundName])
    const mesh = await waitForMeshSummary(groundId)
    expect(mesh.primitiveCount).toBeGreaterThan(0)
    expect(mesh.totalTris).toBeGreaterThan(0)

    G.projectId = project.id
    G.groundId = groundId
    G.groundName = groundName
```

In `it('14. give a material a RED Visualiser, then APPLY it to the ground'`, directly after
`await dragMaterialOnto({ groupId: materialId, name: materialName }, G.groundId)` add:

```ts

    // The ground was born wearing its default Mtl. material, so the drop asks
    // to REPLACE it before assigning.
    const replace = await waitForOpenDialog()
    expect(replace.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()
```

and replace the step's closing lines, from `// The half that matters for the 3D window: an assignment that never` to `await waitForMeshFetch(G.groundId)`, with:

```ts
    // The half that matters for the 3D window: the ground is rebuilt RED. The
    // decoded mesh carries the colour per vertex, which is as close to "it is
    // red on screen" as WebDriver can get.
    await waitForMeshSummary(G.groundId, (s) => isRed(solidColour(s)))
```

In `it('15. deleting the ground removes it from the scene'`, replace the six lines from `await browser.waitUntil(async () => (await Viewport.readStats()).objects === 0, {` through `await Viewport.closeStats()` with:

```ts
    await browser.waitUntil(async () => (await Viewport.sceneObjectNames()).length === 0, {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: 'deleting the ground did not remove it from the 3D scene'
    })
```

If `waitForMeshFetch` is no longer used in `journey.test.ts`, remove it from its import.

- [ ] **Step 7: Typecheck** — `npm run e2e:typecheck`, expected exit 0 (fix any now-unused import it reports).

- [ ] **Step 8: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/viewport.test.ts`
Expected: 14 passing, 0 failing.

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/journey.test.ts`
Expected: 17 passing, 0 failing.

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/viewport-lighting.test.ts`
Expected: 13 passing — or 12 with "typing alone does NOT commit" failing, which Task 7c handles.

- [ ] **Step 9: Checkpoint** — `git diff --stat`; no commit.

---

### Task 7: The already-failing nine and the flaky one

**Files:**
- Create then delete: `e2e/tests/_probe-weather-cancel.test.ts`
- Modify only on a test-side cause: `e2e/pages/Materials.page.ts:150-160`, `e2e/tests/materials.test.ts` (search describe)
- Modify only if 7c fails: `e2e/pages/LightingDialog.page.ts:136-147`

This task ends with a report to the user. Do not change the 8 weather tests before they decide.

- [ ] **Step 1 (7a): Weather probe — create `e2e/tests/_probe-weather-cancel.test.ts`**

```ts
import Weather from '../pages/Weather.page'
import { enterWeather, waitForBackendReady, waitForMainWindow } from '../support/harness'

describe('PROBE — does the dialog footer move when the focused field blurs?', () => {
  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
  })

  for (const which of ['column', 'rows'] as const) {
    it(`measures Cancel before and after the blur (${which})`, async () => {
      await enterWeather(`probe${which}`)
      if (which === 'column') await Weather.openAddColumns()
      else await Weather.openAddRows()
      const testid = which === 'column' ? 'add-column-dialog' : 'add-rows-dialog'
      const read = async () =>
        browser.execute((id: string) => {
          const dialog = document.querySelector(`[data-testid="${id}"]`)
          const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
            (b) => (b.textContent || '').trim() === 'Cancel'
          )
          const rect = cancel?.getBoundingClientRect()
          const active = document.activeElement as HTMLElement | null
          return {
            focused: active?.getAttribute('name') ?? active?.tagName ?? null,
            cancelTop: rect ? Math.round(rect.top) : null,
            dialogHeight: dialog ? Math.round(dialog.getBoundingClientRect().height) : null
          }
        }, testid)
      const before = await read()
      await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur())
      await browser.pause(300)
      const after = await read()
      console.log(`[probe] ${which} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      await browser.keys(['Escape'])
    })
  }
})
```

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/_probe-weather-cancel.test.ts 2>&1 | grep '\[probe\]'`
Then: `rm e2e/tests/_probe-weather-cancel.test.ts`

Record both lines for the report. `after.cancelTop > before.cancelTop` means the footer moves down when the auto-focused first field blurs, so a real click that starts on Cancel ends somewhere else. That confirms the app cause for all 8 weather failures (Cancel ×5 and the data-type dropdown ×3 sit below the first field). Anything else means the cause is still unknown.

- [ ] **Step 2 (7b): Materials search test alone**

Run three times: `npx wdio run wdio.config.ts --spec ./e2e/tests/materials.test.ts --mochaOpts.grep "a MID-NAME and a TRAILING fragment"`

- If it fails when run alone, go to Step 3.
- If it passes 3/3 alone, run it after the block that precedes it:
  `npx wdio run wdio.config.ts --spec ./e2e/tests/materials.test.ts --mochaOpts.grep "backend failures — loading the library|search — substring matching"`
  If that fails, go to Step 3. If that passes too, record it as intermittent and skip to Step 5.

- [ ] **Step 3 (7b): Diagnose the rename editor**

In `e2e/pages/Materials.page.ts` `openRename(id)`, replace the `await this.nameEditor.waitForDisplayed({ … })` call with:

```ts
    try {
      await this.nameEditor.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
    } catch {
      const diag = await browser.execute((rowId: string) => {
        const active = document.activeElement as HTMLElement | null
        return {
          span: !!document.querySelector(`[data-testid="material-row-name-${rowId}"]`),
          editorInRow: !!document.querySelector(`[data-testid="material-row-${rowId}"] input`),
          editors: document.querySelectorAll('[data-testid="materials-panel"] [aria-label="Material name"]').length,
          emptyHint: document.querySelector('[data-testid="materials-list-empty"]')?.textContent ?? null,
          active: active?.getAttribute('data-testid') ?? active?.getAttribute('aria-label') ?? active?.tagName ?? null
        }
      }, id)
      throw new Error(`the rename editor never opened for material ${id} — ${JSON.stringify(diag)}`)
    }
```

Re-run the failing command from Step 2 and read the JSON in the error:
- `editors: 1` → the editor exists but is not displayed: replace the `waitForDisplayed` with `waitForExist` (same timeout) and keep the diagnostic catch.
- `span: true, editorInRow: false, editors: 0`, with `active` naming `material-form-name` → the right-panel form took focus and blurred the editor. In `materials.test.ts` `renameAndSettle`, before `Materials.renameRow(...)`, add:
  ```ts
    await MaterialProperties.waitForOpen()
    await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === (await nameOf(id)), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the Properties form never settled on material ${id} before the rename`
    })
  ```
- `emptyHint: 'Loading materials…'` → a library reload was in flight. Add as the first statement of `openRename`:
  ```ts
    await browser.waitUntil(
      async () =>
        !(await this.listEmpty.isExisting().catch(() => false)) ||
        (await this.emptyHint()) !== MATERIALS_MSG.loading,
      { timeout: TIMEOUTS.LONG, timeoutMsg: 'the Materials library never finished loading' }
    )
  ```
  and add `import { MATERIALS_MSG } from '../constants/materials'` at the top of `Materials.page.ts`.
- Any other shape: stop and include the JSON in the report.

- [ ] **Step 4 (7b): Verify the fix**

Run the Step 2 command that failed, three times. Expected: passing 3/3.

- [ ] **Step 5 (7c): The flaky lighting test**

Run three times: `npx wdio run wdio.config.ts --spec ./e2e/tests/viewport-lighting.test.ts --mochaOpts.grep "typing alone does NOT commit"`

- 3/3 pass: no change; record it as intermittent.
- Any "never took focus" failure: in `e2e/pages/LightingDialog.page.ts` `type()`, replace the focus call and its wait (from `await browser.execute((sel: string) => {` to the closing `})` of the `browser.waitUntil(async () => el.isFocused(), …)` call, keeping the comments) with:
  ```ts
    await browser.waitUntil(
      async () => {
        // Re-issue focus on every poll: a re-render from the PREVIOUS field's
        // commit can land between one focus() and the check.
        await browser.execute((sel: string) => {
          ;(document.querySelector(sel) as HTMLElement | null)?.focus()
        }, selector)
        return el.isFocused()
      },
      { timeout: TIMEOUTS.SHORT, timeoutMsg: `${selector} never took focus` }
    )
  ```
  Then run the full `viewport-lighting.test.ts` twice. Expected: 13 passing both times.

- [ ] **Step 6: Report to the user and wait**

Report:
- The two `[probe]` lines and what they mean. If the footer moves, this is an app bug: Cancel and the data-type dropdown miss the first click on a fresh Add Column / Add Rows dialog.
- The options for those 8 tests: fix the app; keep the tests red until it is fixed; or pin the shipped behaviour as a DEVIATION and close the dialogs with Escape.
- The materials search outcome, and the lighting outcome.

Wait for the user's decision on the weather tests before touching them. Continue with Task 8 meanwhile.

- [ ] **Step 7: Checkpoint** — `git diff --stat`; no commit.

---

### Task 8: `default-material.test.ts` — scaffold, items 1, 4, 2, 3

**Files:**
- Create: `e2e/tests/default-material.test.ts`

**Interfaces:**
- Consumes: Task 1 (`recordMeshFetches`, `waitForMeshSummary`, `textureFiles`), Task 2 (`expectedDefaultMaterialName`, `libraryNames`, `waitForDefaultMaterial`, `waitForLibraryRow`)
- Produces (file-local, reused by Tasks 9–11): `trackGround(): Promise<{ id: string; name: string; defaultName: string; defaultId: string }>`, `trackMaterial()`, `newMaterial()`, `openPicker()`, `pick(name)`, `waitForAssigned(names, timeout?)`, `clickSave()`, `waitForSaveSettled()`, `openForm(id)`, `closeDetail(name)`, `sweepPopups()`

- [ ] **Step 1: Create the file**

```ts
/**
 * The default material every new ground is born with.
 *
 * Requirements (agreed 14 Sep 2026; spec
 * docs/superpowers/specs/2026-09-14-default-material-e2e-design.md, Part B):
 *  1, 4  `+ Ground` adds the ground, wearing exactly one material: its default
 *  2, 3  the default's name and what it is
 *  5     removing it (the ground turns green and can still be deleted);
 *        different materials on different grounds
 *  6     changing the default reaches the ground
 *  7     the library is shared across projects
 *  9     replacing the default
 *  10    renaming by double-click reaches every place the name shows
 *
 * Shipped rule: support/defaultMaterial.ts. Expected names are computed from
 * the library as it is just before the ground is created — never hard-coded,
 * because names are unique across the whole library and a clash takes `.N`.
 *
 * ── State model ───────────────────────────────────────────────────────────
 * One project for the file. Each test creates rows via trackGround /
 * trackMaterial; afterEach deletes them, GROUNDS FIRST, then materials — and a
 * ground's default is tracked as a material, because deleting the ground leaves
 * it in the library. The cross-project describe is LAST: it leaves this project.
 *
 * +Ground and +Add Materials each swap the right panel to the thing just
 * created, so every test creates its materials FIRST and its grounds after.
 */

import Geometry from '../pages/Geometry.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { materialLabel } from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import {
  enterGeometry,
  reloadToHome,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { clearApiFaults } from '../support/faults'
import {
  expectedDefaultMaterialName,
  libraryNames,
  unassignMaterial,
  waitForDefaultMaterial,
  waitForLibraryRow
} from '../support/defaultMaterial'
import {
  isBlue,
  isGreen,
  isRed,
  recordMeshFetches,
  solidColour,
  textureFiles,
  waitForMeshSummary
} from '../support/viewport3d'

describe('Default material', () => {
  /** Grounds created by the running test, oldest first. */
  let grounds: string[] = []
  /** Materials created by the running test — including grounds' defaults. */
  let materials: string[] = []

  type TrackedGround = { id: string; name: string; defaultName: string; defaultId: string }

  /** Create a ground; return it with its default material, both tracked. */
  const trackGround = async (): Promise<TrackedGround> => {
    const id = await Geometry.addGround()
    grounds.push(id)
    await ObjectProperties.waitForOpen()
    const name = (await Geometry.rowState(id))?.name ?? ''
    const defaultName = await waitForDefaultMaterial()
    const defaultId = await waitForLibraryRow(defaultName)
    materials.push(defaultId)
    return { id, name, defaultName, defaultId }
  }

  const trackMaterial = async (): Promise<string> => {
    const id = await Materials.addMaterial()
    materials.push(id)
    return id
  }

  const newMaterial = async (): Promise<string> =>
    (await Materials.rowState(await trackMaterial()))?.name ?? ''

  const openPicker = async (): Promise<void> => {
    await ObjectProperties.openMaterialPicker()
    await browser.waitUntil(async () => (await ObjectProperties.pickerState()).heading !== null, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'the Select Materials popup opened but never rendered its contents'
    })
  }

  const pick = async (name: string): Promise<void> => {
    await openPicker()
    await browser.waitUntil(
      async () => (await ObjectProperties.pickerState()).rows.some((r) => r.name === name),
      { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the picker never listed "${name}"` }
    )
    await ObjectProperties.pickMaterial(name)
    await browser.waitUntil(async () => !(await ObjectProperties.pickerOpen()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `picking "${name}" never closed the picker`
    })
  }

  const waitForAssigned = async (names: string[], timeout: number = TIMEOUTS.MEDIUM): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const got = await ObjectProperties.assignedNames()
        return got.length === names.length && names.every((n) => got.includes(n))
      },
      { timeout, timeoutMsg: `the Materials section never listed exactly [${names.join(', ')}]` }
    )
  }

  const clickSave = async (): Promise<void> => {
    await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled — the form did not become dirty'
    })
    await ObjectProperties.saveButton.click()
  }

  /** The label reads "Saving…" for exactly the in-flight window. */
  const waitForSaveSettled = async (): Promise<void> => {
    await browser.waitUntil(
      async () => {
        const label = (await ObjectProperties.saveButton.getText()).trim()
        return label === 'Save' && !(await ObjectProperties.saveEnabled())
      },
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the save never landed (Save never went quiet again)' }
    )
  }

  /** Select a ground and wait for the form to actually switch to it. */
  const openForm = async (id: string): Promise<void> => {
    await Geometry.selectRow(id)
    await ObjectProperties.waitForOpen()
    await browser.waitUntil(
      async () =>
        (await ObjectProperties.nameState()).value === ((await Geometry.rowState(id))?.name ?? ''),
      { timeout: TIMEOUTS.MUTATION, timeoutMsg: `the Properties form never switched to row ${id}` }
    )
  }

  const closeDetail = async (name: string): Promise<void> => {
    await ObjectProperties.closeMaterialDetail(name)
    await browser.waitUntil(async () => !(await ObjectProperties.materialDetail(name).isExisting()), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the properties popup for "${name}" never closed`
    })
  }

  const sweepPopups = async (): Promise<void> => {
    await browser.execute(() => {
      document
        .querySelectorAll('[data-testid="anchored-popup-overlay"]')
        .forEach((el) => (el as HTMLElement).click())
    })
  }

  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
    await enterGeometry('dmat')
    await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
      timeout: TIMEOUTS.LONG,
      timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
    })
  })

  afterEach(async () => {
    const failures: string[] = []
    const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn()
      } catch (err) {
        failures.push(`${label} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Dialogs, then popups and listboxes: each intercepts every later click.
    await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    await step('sweepPopups', () => sweepPopups())
    await step('closeEnum', () => MaterialProperties.closeEnum())
    await step('Geometry.clearSearch', () => Geometry.clearSearch())
    await step('Materials.clearSearch', () => Materials.clearSearch())

    // GROUNDS FIRST, then materials (defaults included).
    const trackedGrounds = [...grounds].reverse()
    const trackedMaterials = [...materials].reverse()
    for (const id of trackedGrounds) {
      await step(`Geometry.deleteRow(${id})`, () => Geometry.deleteRow(id))
      await step('closeAnyOpenDialog', () => Geometry.closeAnyOpenDialog())
    }
    for (const id of trackedMaterials) {
      await step(`Materials.deleteRow(${id})`, () => Materials.deleteRow(id))
      await step('closeAnyOpenDialog', () => Materials.closeAnyOpenDialog())
    }
    grounds = []
    materials = []
    await step('clearApiFaults', () => clearApiFaults())

    const leakedGrounds: string[] = []
    for (const id of trackedGrounds) {
      if (await Geometry.row(id).isExisting().catch(() => false)) leakedGrounds.push(id)
    }
    const leakedMaterials: string[] = []
    for (const id of trackedMaterials) {
      if (await Materials.row(id).isExisting().catch(() => false)) leakedMaterials.push(id)
    }
    if (leakedGrounds.length || leakedMaterials.length) {
      throw new Error(
        'Cleanup left rows behind.\n' +
          (leakedGrounds.length ? `  geometry: ${leakedGrounds.join(', ')}\n` : '') +
          (leakedMaterials.length ? `  materials (shared library): ${leakedMaterials.join(', ')}\n` : '') +
          (failures.length
            ? `  cleanup errors:\n    ${failures.join('\n    ')}`
            : '  No cleanup step reported an error, so the delete silently no-opped.')
      )
    }
  })

  // ══ Items 1 and 4 — + Ground adds a ground wearing its default ══════════

  describe('a new ground and its default material', () => {
    it('+ Ground adds the row, and the ground wears exactly ONE material — Mtl.<its name>', async () => {
      const before = await libraryNames()
      const ground = await trackGround()
      expect(await Geometry.row(ground.id).isExisting()).toBe(true)
      expect(ground.defaultName).toBe(expectedDefaultMaterialName(ground.name, before))
      expect(await ObjectProperties.assignedNames()).toEqual([ground.defaultName])
    })

    it('the default also appears in the Materials library, without a reload', async () => {
      // Geometry/saga.ts createObjectWorker refetches the library after a create
      // for exactly this reason; trackGround already waited for the row.
      const ground = await trackGround()
      expect(await libraryNames()).toContain(ground.defaultName)
    })

    // ══ Item 2 — what the default is ═══════════════════════════════════════

    it('the default is a Visualiser showing dirt.jpg — in the popup and in the mesh', async () => {
      await recordMeshFetches()
      const ground = await trackGround()

      await ObjectProperties.openMaterialDetail(ground.defaultName)
      expect(await ObjectProperties.detailSections(ground.defaultName)).toEqual(['Visualiser'])
      expect((await ObjectProperties.detailImages(ground.defaultName)).length).toBeGreaterThan(0)
      await closeDetail(ground.defaultName)

      const mesh = await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)
      expect(textureFiles(mesh).every((path) => path.endsWith('dirt.jpg'))).toBe(true)
    })

    // ══ Item 3 — the name ═════════════════════════════════════════════════

    it('a second ground gets its OWN default, named after it', async () => {
      const first = await trackGround()
      const before = await libraryNames()
      const second = await trackGround()
      expect(second.defaultName).toBe(expectedDefaultMaterialName(second.name, before))
      expect(second.defaultName).not.toBe(first.defaultName)
    })

    it('re-creating a ground name takes the next free suffix, and the old default stays', async () => {
      const first = await trackGround()
      await Geometry.deleteRow(first.id)
      grounds = grounds.filter((g) => g !== first.id)
      // Deleting a ground leaves its default in the library — intended.
      expect(await libraryNames()).toContain(first.defaultName)

      const before = await libraryNames()
      const again = await trackGround()
      // Ground.NNN is gap-filling, so the new ground reuses the freed name…
      expect(again.name).toBe(first.name)
      // …and its default cannot, so it takes the backend's `.N` suffix.
      expect(again.defaultName).toBe(expectedDefaultMaterialName(again.name, before))
      expect(again.defaultName).toMatch(/\.\d+$/)
    })
  })
})
```

- [ ] **Step 2: Typecheck** — `npm run e2e:typecheck`, expected exit 0. Imports that only Tasks 9–11 use are fine here: `e2e/tsconfig.json` does not set `noUnusedLocals`.

- [ ] **Step 3: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/default-material.test.ts`
Expected: 5 passing, 0 failing.

If `detailSections` returns a different heading than `['Visualiser']`, read the actual value from the failure: it is the shipped heading — use it in the assertion and note it in the test comment.

- [ ] **Step 4: Checkpoint** — `git diff --stat`; no commit.

---

### Task 9: `default-material.test.ts` — item 5

**Files:**
- Modify: `e2e/tests/default-material.test.ts` (new helpers after `sweepPopups`; new describes after `describe('a new ground and its default material'`)

**Interfaces:**
- Consumes: Task 8 helpers; `unassignMaterial`, `libraryNames`; `waitForMeshSummary`, `solidColour`, `isGreen`, `isRed`, `isBlue`, `textureFiles`
- Produces (file-local): `colourMaterial(r, g, b): Promise<string>`, `replaceDefaultWith(name): Promise<void>`

- [ ] **Step 1: Add the helpers after `sweepPopups`**

```ts
  /**
   * Create a material with ONE saved colour-mode Visualiser card; return its
   * name. A fresh material ships one blank card, so addCard() returns card 2 —
   * card 1 is never typed or saved and contributes nothing.
   */
  const colourMaterial = async (r: string, g: string, b: string): Promise<string> => {
    const id = await trackMaterial()
    await MaterialProperties.waitForOpen()
    const name = (await Materials.rowState(id))?.name ?? ''
    await browser.waitUntil(async () => (await MaterialProperties.nameValue()) === name, {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: `the Material Properties form never switched to "${name}"`
    })
    const cardId = await MaterialProperties.addCard()
    await MaterialProperties.pickType(cardId, 'Visualiser')
    await MaterialProperties.setColorChannel('r', r)
    await MaterialProperties.setColorChannel('g', g)
    await MaterialProperties.setColorChannel('b', b)
    await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
      timeout: TIMEOUTS.MEDIUM,
      timeoutMsg: 'Save never enabled for a complete colour'
    })
    await MaterialProperties.saveCard(cardId)
    return name
  }

  /** Pick `name` for the open ground and SAVE through the Replace confirmation. */
  const replaceDefaultWith = async (name: string): Promise<void> => {
    await pick(name)
    await clickSave()
    const dialog = await waitForOpenDialog()
    expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
    await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
    await waitForNoOpenDialog()
    await waitForSaveSettled()
    await waitForAssigned([name], TIMEOUTS.MUTATION)
  }
```

- [ ] **Step 2: Add the describes after `describe('a new ground and its default material'`**

```ts
  // ══ Item 5 — removing the default ════════════════════════════════════════

  describe('removing the default material', () => {
    it('removing it empties the section, turns the ground GREEN, and leaves the material in the library', async () => {
      await recordMeshFetches()
      const ground = await trackGround()
      await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)

      await recordMeshFetches()
      await unassignMaterial(ground.defaultName)
      expect(await ObjectProperties.assignedNames()).toEqual([])

      // A ground with no material is a plain tile in the engine's own default
      // colour, green (0, 0.75, 0) — scene_object_service._winner_surface 'plain'.
      const mesh = await waitForMeshSummary(ground.id, (s) => isGreen(solidColour(s)))
      expect(textureFiles(mesh)).toEqual([])
      expect(await libraryNames()).toContain(ground.defaultName)
    })

    it('a ground without its default can still be deleted', async () => {
      const ground = await trackGround()
      await unassignMaterial(ground.defaultName)

      await Geometry.deleteRow(ground.id)
      grounds = grounds.filter((g) => g !== ground.id)
      await Geometry.row(ground.id).waitForExist({
        reverse: true,
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the ground without a material was not deleted'
      })
    })
  })

  // ══ Item 5 — different materials on different grounds ═══════════════════

  describe('different materials on different grounds', () => {
    it('two grounds wear two different materials — each only its own, one RED and one BLUE', async function () {
      this.timeout(180_000)
      const red = await colourMaterial('255', '0', '0')
      const blue = await colourMaterial('0', '0', '255')
      await recordMeshFetches()

      const one = await trackGround()
      await replaceDefaultWith(red)
      const two = await trackGround()
      await replaceDefaultWith(blue)

      await openForm(one.id)
      await waitForAssigned([red])
      await openForm(two.id)
      await waitForAssigned([blue])

      await waitForMeshSummary(one.id, (s) => isRed(solidColour(s)))
      await waitForMeshSummary(two.id, (s) => isBlue(solidColour(s)))
    })
  })
```

- [ ] **Step 3: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 4: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/default-material.test.ts`
Expected: 8 passing, 0 failing — unless Task 2's colour gate showed a non-green ground. Then "removing it … turns the ground GREEN" fails on the colour and stays failing: an app bug, per the user's decision. Record it and continue.

- [ ] **Step 5: Checkpoint** — `git diff --stat`; no commit.

---

### Task 10: `default-material.test.ts` — items 6 and 9

**Files:**
- Modify: `e2e/tests/default-material.test.ts` (new describes after `describe('different materials on different grounds'`)

**Interfaces:**
- Consumes: Tasks 8–9 helpers; `materialLabel` from `e2e/constants/materials.ts`

- [ ] **Step 1: Add the describes**

```ts
  // ══ Item 6 — changing the default ════════════════════════════════════════

  describe('changing the default material', () => {
    it('switching the default to solid RED updates the ground popup and the mesh — and it stays assigned', async function () {
      this.timeout(180_000)
      await recordMeshFetches()
      const ground = await trackGround()
      await waitForMeshSummary(ground.id, (s) => textureFiles(s).length > 0)

      // Edit the DEFAULT in the Materials panel: its one Visualiser card, from
      // texture to a solid colour.
      await Materials.openMaterial(ground.defaultId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.nameValue()) === ground.defaultName,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the form never switched to "${ground.defaultName}"` }
      )
      const [cardId] = await MaterialProperties.cardIds()
      await MaterialProperties.visTab('custom').click()
      await MaterialProperties.setColorChannel('r', '255')
      await MaterialProperties.setColorChannel('g', '0')
      await MaterialProperties.setColorChannel('b', '0')
      await MaterialProperties.setColorChannel('opacity', '100')
      await browser.waitUntil(async () => MaterialProperties.saveEnabled(cardId), {
        timeout: TIMEOUTS.MEDIUM,
        timeoutMsg: 'Save never enabled after switching the default to a red colour'
      })
      await recordMeshFetches()
      await MaterialProperties.saveCard(cardId)

      // Back on the ground, with no reload.
      await openForm(ground.id)
      await waitForAssigned([ground.defaultName])
      await ObjectProperties.openMaterialDetail(ground.defaultName)
      await browser.waitUntil(
        async () =>
          ObjectProperties.valueIn(
            await ObjectProperties.detailRows(ground.defaultName),
            'Visualiser',
            materialLabel('color_r')
          ) === '255',
        { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the ground popup never showed R = 255' }
      )
      const rows = await ObjectProperties.detailRows(ground.defaultName)
      expect(ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_g'))).toBe('0')
      expect(ObjectProperties.valueIn(rows, 'Visualiser', materialLabel('color_b'))).toBe('0')
      await closeDetail(ground.defaultName)

      await waitForMeshSummary(ground.id, (s) => isRed(solidColour(s)))
    })
  })

  // ══ Item 9 — replacing the default ═══════════════════════════════════════

  describe('replacing the default material', () => {
    it('Save raises Replace NAMING the ground; Cancel keeps the default on the saved ground', async () => {
      const other = await newMaterial()
      const first = await trackGround()

      await pick(other)
      await clickSave()
      const dialog = await waitForOpenDialog()
      expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
      expect(dialog.heading).toBe(GEOMETRY_MATERIAL_MSG.replaceHeading(first.name))
      await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceCancel)
      await waitForNoOpenDialog()

      // Cancel leaves the pick as an unsaved draft; switching rows discards it,
      // so the ground shows what is SAVED — its default.
      await trackGround()
      await openForm(first.id)
      await waitForAssigned([first.defaultName])
    })

    it('Replace leaves exactly the new material, and the default stays in the library', async () => {
      const other = await newMaterial()
      const first = await trackGround()

      await replaceDefaultWith(other)
      expect(await ObjectProperties.assignedNames()).toEqual([other])
      expect(await libraryNames()).toContain(first.defaultName)

      // Saved, not drafted: it survives switching away and back.
      await trackGround()
      await openForm(first.id)
      await waitForAssigned([other])
    })
  })
```

- [ ] **Step 2: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 3: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/default-material.test.ts`
Expected: 11 passing, 0 failing.

If the item 6 test fails because `visTab('custom')` did not switch or Save stayed shut, read `MaterialProperties.activeVisTab()` and the card's error in a one-off `console.log` inside the test, fix the step order to what the form ships, and remove the log.

- [ ] **Step 4: Checkpoint** — `git diff --stat`; no commit.

---

### Task 11: `default-material.test.ts` — items 10 and 7

**Files:**
- Modify: `e2e/tests/default-material.test.ts` (new describes after `describe('replacing the default material'`; the cross-project describe LAST)

**Interfaces:**
- Consumes: Tasks 8–10 helpers; `ObjectProperties.editName`, `setName`, `commitName` (Task 5); `Materials.renameRow`

- [ ] **Step 1: Add the describes**

```ts
  // ══ Item 10 — renaming by double-click ═══════════════════════════════════

  describe('renaming the default material by double-click', () => {
    /** A name no earlier run can have taken: tag + 6 base-36 chars, ≤ 20 total. */
    const freshName = (tag: string): string => `${tag}${Date.now().toString(36).slice(-6)}`

    it('a LIBRARY-ROW rename relabels the ground, the picker and the popup — and survives a reselect', async () => {
      const ground = await trackGround()
      const next = freshName('DmRow')

      await Materials.renameRow(ground.defaultId, next, 'enter')
      await browser.waitUntil(async () => (await Materials.rowState(ground.defaultId))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: `the library row never took "${next}"`
      })

      // The OPEN ground form relabels in place.
      await waitForAssigned([next], TIMEOUTS.MUTATION)

      // The picker offers the new name and not the old one.
      await openPicker()
      const offered = (await ObjectProperties.pickerState()).rows.map((r) => r.name)
      expect(offered).toContain(next)
      expect(offered).not.toContain(ground.defaultName)
      await ObjectProperties.closeMaterialPicker()

      // The popup is titled with the new name.
      await ObjectProperties.openMaterialDetail(next)
      await closeDetail(next)

      // A reselect reads it back from the store, not the open draft.
      await trackGround()
      await openForm(ground.id)
      await waitForAssigned([next])
    })

    it('a FORM rename (double-click the header) reaches the library row and the ground', async () => {
      const ground = await trackGround()
      const next = freshName('DmForm')

      await Materials.openMaterial(ground.defaultId)
      await MaterialProperties.waitForOpen()
      await browser.waitUntil(
        async () => (await MaterialProperties.nameValue()) === ground.defaultName,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the form never switched to "${ground.defaultName}"` }
      )
      // Unlock by double-click and WAIT for it: only a field a double-click
      // actually unlocked commits a rename on blur.
      await browser.execute(() => {
        const node = document.querySelector('[data-testid="material-form-name"]')
        if (!node) throw new Error('the material Properties form is not open')
        node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      await browser.waitUntil(
        async () => (await MaterialProperties.nameInput.getAttribute('readonly')) === null,
        { timeout: TIMEOUTS.MEDIUM, timeoutMsg: 'double-clicking never unlocked material-form-name' }
      )
      await browser.execute((val: string) => {
        const node = document.querySelector('[data-testid="material-form-name"]') as HTMLInputElement | null
        if (!node) throw new Error('the material Properties form is not open')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        node.focus()
        setter?.call(node, val)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      }, next)
      await browser.execute(() =>
        (document.querySelector('[data-testid="material-form-name"]') as HTMLElement | null)?.blur()
      )

      await browser.waitUntil(async () => (await Materials.rowState(ground.defaultId))?.name === next, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the form rename never reached the library row'
      })
      // The form header shows it too.
      expect(await MaterialProperties.nameValue()).toBe(next)
      await openForm(ground.id)
      await waitForAssigned([next])
    })

    it("renaming the GROUND leaves its default material's name alone", async () => {
      const ground = await trackGround()
      const groundName = freshName('Gr')

      await ObjectProperties.editName()
      await ObjectProperties.setName(groundName)
      await ObjectProperties.commitName()
      await browser.waitUntil(async () => (await Geometry.rowState(ground.id))?.name === groundName, {
        timeout: TIMEOUTS.MUTATION,
        timeoutMsg: 'the ground rename never reached the tree'
      })

      expect(await ObjectProperties.assignedNames()).toEqual([ground.defaultName])
      expect(await libraryNames()).toContain(ground.defaultName)
    })
  })

  // ══ Item 7 — across projects (LAST: leaves this file's project) ══════════

  describe('across projects — the library is shared', () => {
    it("project A's default shows in project B's library and picker, and B's first ground takes the next suffix", async function () {
      this.timeout(240_000)
      const a = await trackGround()
      // Only the MATERIAL has to outlive project A; its ground can go now, while
      // it is still reachable in the tree.
      await Geometry.deleteRow(a.id)
      grounds = grounds.filter((g) => g !== a.id)

      await reloadToHome()
      await enterGeometry('dmatB')
      await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: '+ Add Materials never became enabled in project B'
      })

      expect(await libraryNames()).toContain(a.defaultName)

      const before = await libraryNames()
      const b = await trackGround()
      // Both projects' first ground is the gap-filled Ground.001…
      expect(b.name).toBe(a.name)
      // …so B's default cannot take A's name and gets the backend's `.N` suffix.
      expect(b.defaultName).toBe(expectedDefaultMaterialName(b.name, before))
      expect(b.defaultName).toMatch(/\.\d+$/)

      await openPicker()
      expect((await ObjectProperties.pickerState()).rows.map((r) => r.name)).toContain(a.defaultName)
      await ObjectProperties.closeMaterialPicker()
    })
  })
```

- [ ] **Step 2: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 3: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/default-material.test.ts`
Expected: 15 passing, 0 failing.

- [ ] **Step 4: Checkpoint** — `git diff --stat`; no commit.

---

### Task 12: `required-markers.test.ts` — Part C

**Files:**
- Create: `e2e/tests/required-markers.test.ts`

**Interfaces:**
- Consumes: `HomePage.openCreateDialogViaSidebar()`, `HomePage.requestRename(id)`; `Weather.openAddRows()`, `Weather.openAddColumns()`; `Geometry.addGround()`; `Materials.addMaterial()`; `MaterialProperties.addCard()`, `pickType()`, `renderedProps()`, `visTab()`; `backendFetch()`; `createNamedReturnHome()`; `waitForDefaultMaterial`, `waitForLibraryRow` (Task 2)

- [ ] **Step 1: Create the file**

```ts
/**
 * Required-field asterisks — where the red `*` shows, and where it deliberately
 * does not (spec Part C, user item 11).
 *
 * FormField renders `*` unless the field is `optional`; ColorPicker renders one
 * when `required`. The ground Properties form hides every field label
 * (screen-reader only) and its headings carry no star since dffdbd0 — so a `*`
 * still EXISTS there, inside the hidden labels, but nobody can see it. That is
 * why every assertion here is about VISIBLE markers: outside a `.sr-only`
 * ancestor, with a non-zero box.
 *
 * Material fields follow the live catalog: a field shows `*` exactly when
 * /api/catalog/material-types marks it `required` (Materials/materialBlueprint.ts).
 */

import Geometry from '../pages/Geometry.page'
import HomePage from '../pages/HomePage.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import Weather from '../pages/Weather.page'
import { TIMEOUTS } from '../config/timeouts'
import {
  backendFetch,
  createNamedReturnHome,
  enterWeather,
  reloadToHome,
  uniqueName,
  waitForBackendReady,
  waitForMainWindow
} from '../support/harness'
import { waitForNoOpenDialog } from '../support/dialogs'
import { waitForDefaultMaterial, waitForLibraryRow } from '../support/defaultMaterial'

type Marker = { field: string | null; label: string; visible: boolean }

/** Every red `*` under `scopeSelector`: the field it marks, and whether it can be seen. */
async function requiredMarkers(scopeSelector: string): Promise<Marker[]> {
  return browser.execute((sel: string) => {
    const scope = document.querySelector(sel)
    if (!scope) throw new Error(`requiredMarkers: nothing matches ${sel}`)
    return Array.from(scope.querySelectorAll('span.text-red-400'))
      .filter((s) => (s.textContent || '').trim() === '*')
      .map((s) => {
        const rect = s.getBoundingClientRect()
        const host = s.closest('[data-testid^="formfield-"]')
        return {
          field: host ? (host.getAttribute('data-testid') || '').replace(/^formfield-/, '') : null,
          label: (s.parentElement?.textContent || '').replace('*', '').trim(),
          visible: s.closest('.sr-only') === null && rect.width > 0 && rect.height > 0
        }
      })
  }, scopeSelector) as Promise<Marker[]>
}

const visibleFields = (markers: Marker[]): string[] =>
  markers
    .filter((m) => m.visible)
    .map((m) => m.field ?? `(label: ${m.label})`)
    .sort()

type CatalogType = { materialtype: string; properties: { property: string; required?: boolean }[] }

async function requiredCatalogProps(type: string): Promise<string[]> {
  const res = await backendFetch('/api/catalog/material-types')
  const types = ((res.body as { material_types?: CatalogType[] } | null)?.material_types ?? [])
  const def = types.find((t) => t.materialtype === type)
  if (!def) throw new Error(`the catalog has no material type "${type}"`)
  return def.properties.filter((p) => p.required === true).map((p) => p.property)
}

const closeDialogWithEscape = async (): Promise<void> => {
  await browser.keys(['Escape'])
  await waitForNoOpenDialog()
}

describe('Required-field asterisks', () => {
  before(async () => {
    await waitForMainWindow()
    await waitForBackendReady()
  })

  describe('on the Home screen', () => {
    beforeEach(async () => {
      await reloadToHome()
    })

    it('New Project: Project Name, Latitude and Longitude carry a visible *', async () => {
      await HomePage.openCreateDialogViaSidebar()
      expect(visibleFields(await requiredMarkers('dialog[open]'))).toEqual([
        'latitude',
        'longitude',
        'projectName'
      ])
      await closeDialogWithEscape()
    })

    it('Rename Project: its name field carries a visible *', async () => {
      const { id } = await createNamedReturnHome(uniqueName('req'))
      await HomePage.requestRename(id)
      await HomePage.renameDialog.waitForDisplayed({ timeout: TIMEOUTS.MEDIUM })
      expect(visibleFields(await requiredMarkers('dialog[open]'))).toEqual(['projectName'])
      await closeDialogWithEscape()
    })
  })

  describe('inside a project', () => {
    const grounds: string[] = []
    const materials: string[] = []

    before(async () => {
      await reloadToHome()
      await enterWeather('req')
    })

    after(async () => {
      for (const id of grounds.reverse()) await Geometry.deleteRow(id).catch(() => {})
      for (const id of materials.reverse()) await Materials.deleteRow(id).catch(() => {})
    })

    it('Add Rows: every field shown carries a visible *', async () => {
      await Weather.openAddRows()
      expect(visibleFields(await requiredMarkers('[data-testid="add-rows-dialog"]'))).toEqual([
        'deltaHours',
        'numberOfRows',
        'startDate',
        'startTime'
      ])
      await closeDialogWithEscape()
    })

    it('Add Column: exactly one visible *, on the field not marked optional', async () => {
      await Weather.openAddColumns()
      expect(visibleFields(await requiredMarkers('[data-testid="add-column-dialog"]'))).toEqual([
        'parameterName'
      ])
      await closeDialogWithEscape()
    })

    it('the ground Properties form shows NO visible * — though hidden labels still carry one', async () => {
      await browser.waitUntil(async () => Geometry.addGroundButton.isEnabled().catch(() => false), {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: '+ Ground never became enabled'
      })
      const id = await Geometry.addGround()
      grounds.push(id)
      await ObjectProperties.waitForOpen()
      materials.push(await waitForLibraryRow(await waitForDefaultMaterial()))

      const markers = await requiredMarkers('[data-testid="object-properties-form"]')
      expect(visibleFields(markers)).toEqual([])
      // The differential: the reader DOES find stars here, all hidden. Without
      // this, "no visible stars" would also pass for a reader that finds nothing.
      expect(markers.filter((m) => !m.visible).length).toBeGreaterThan(0)
    })

    it('a material type card shows * on exactly the properties the catalog marks required', async () => {
      await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
        timeout: TIMEOUTS.LONG,
        timeoutMsg: '+ Add Materials never became enabled'
      })
      materials.push(await Materials.addMaterial())
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.pickType(cardId, 'Radiation')

      const rendered = await MaterialProperties.renderedProps(cardId)
      const required = await requiredCatalogProps('Radiation')
      const expected = rendered
        .filter((p) => required.includes(p))
        .map((p) => `${cardId}-${p}`)
        .sort()
      expect(visibleFields(await requiredMarkers(`[data-testid="material-card-${cardId}"]`))).toEqual(
        expected
      )
    })

    it('the Visualiser colour picker shows * if and only if a colour channel is required', async () => {
      materials.push(await Materials.addMaterial())
      await MaterialProperties.waitForOpen()
      const cardId = await MaterialProperties.addCard()
      await MaterialProperties.pickType(cardId, 'Visualiser')
      await MaterialProperties.visTab('custom').click()

      const required = await requiredCatalogProps('Visualiser')
      const channelRequired = ['color_r', 'color_g', 'color_b', 'opacity'].some((p) =>
        required.includes(p)
      )
      const pickerMarkers = (await requiredMarkers(`[data-testid="material-card-${cardId}"]`)).filter(
        (m) => m.visible && m.field === null
      )
      expect(pickerMarkers.map((m) => m.label)).toEqual(channelRequired ? ['RGB Values'] : [])
    })
  })
})
```

- [ ] **Step 2: Typecheck** — `npm run e2e:typecheck`, expected exit 0.

- [ ] **Step 3: Verify**

Run: `npx wdio run wdio.config.ts --spec ./e2e/tests/required-markers.test.ts`
Expected: 7 passing, 0 failing.

Reading failures: an unexpected extra field in a dialog's list is a shipped required field — confirm in that dialog's source that it has no `optional`, then add it to the expectation. A missing expected field that the source marks non-optional is a real finding — report it.

- [ ] **Step 4: Checkpoint** — `git diff --stat`; no commit.

---

### Task 13: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (§2.0 table, §5 traps, §6 coverage, §7 findings, §8)

- [ ] **Step 1: §2.0**

Replace the table row
`| "reaping is POSIX-only, so on Windows every run leaves orphans" | \`reapOrphans\` **does** run here, and no orphan accumulation was observed across six full spec runs |`
with
`| "reaping is POSIX-only, so on Windows every run leaves orphans" | \`reapOrphans\` runs here, but \`afterSession\` passes \`includeElectron = false\`, so every finished spec file leaves its Electron app running until \`onComplete\` — 11 were alive late in the 14 Sep 2026 run, and the final sweep killed 38 processes |`

- [ ] **Step 2: §5 trap 9**

Replace the bullet starting `- A **soil ground physically cannot exceed 511 per axis.**` and its sub-lines (through `save that cannot happen at all.`) with:

```markdown
   - **A new ground wears its default `Mtl.<name>` material — a Visualiser on
     `dirt.jpg` (512×512) — and that texture caps it at 511 per axis.** The engine
     refuses `subdiv >= repeat × texture_px` (`Context_object.cpp`), so 1000×1000
     comes back **422 `RESOLUTION_TOO_HIGH`**. A ground with **no** material is a
     plain tile (6878eaf) with no cap at all.
```

- [ ] **Step 3: §5 — append traps 24–26 after trap 23**

```markdown
24. **EVERY NEW GROUND IS BORN WEARING `Mtl.<ground name>`** — a Visualiser on
    `dirt.jpg` (429d57d / 701894c). Names are unique across the whole library
    (case-insensitive); a clash takes `.1`, `.2`, …; at most 20 characters.
    Deleting or renaming the ground leaves the material in the library
    (intended). The form counts it as SAVED, so picking another material makes
    Save raise **Replace**, and a drop on the ground asks to Replace first. Use
    `e2e/support/defaultMaterial.ts`; the material specs unassign it in
    `trackGround()` (option A) and track it for cleanup.
25. **THE 3D VIEW DOWNLOADS MESHES FROM `…/geometry/gpu`** (wire format v2), not
    `…/geometry/binary`. `support/viewport3d.ts` records both and decodes a
    per-part summary (texture path, vertex colour) — `waitForMeshSummary`,
    `solidColour`, `isGreen/isRed/isBlue`. The **statistics overlay is hidden**
    (`SHOW_STATS_UI = false`, d9b9d39): read the scene with
    `Viewport3D.sceneObjectNames()` and the mesh summary instead of `readStats()`.
26. **NAMES UNLOCK ON DOUBLE-CLICK; THE PENCIL IS GONE** (10a5a51). Both
    Properties forms and both left-panel rows carry a `title` hint
    (`GEOMETRY_MSG.renameHint`, `MATERIALS_MSG.renameHint`); the form's hint is
    present only while the name is locked. `ObjectProperties.editName()`
    double-clicks.
```

- [ ] **Step 4: §6 — add the two new files**

Append at the end of §6, before `### Supporting files`:

```markdown
### `e2e/tests/default-material.test.ts` — 15 tests

New file, 14 Sep 2026. The default `Mtl.<name>` material on new grounds: creation
and its library row, what it is (Visualiser on `dirt.jpg`), naming with the `.N`
suffix, removing it (the ground turns green and can still be deleted), different
materials on different grounds (red / blue mesh), changing it (red), replacing it
(Cancel and Replace), renaming it by double-click everywhere it shows, and the
library shared across projects (last describe; leaves the file's project).

### `e2e/tests/required-markers.test.ts` — 7 tests

New file, 14 Sep 2026. Visible red `*` on New Project, Rename Project, Add Rows,
Add Column; none visible on the ground Properties form (hidden labels still carry
one — asserted as the differential); material cards and the Visualiser colour
picker follow the live catalog's `required`.
```

Update the counts and runtimes in these two headings, and in the headings of every spec touched by this plan, from the Task 14 run.

- [ ] **Step 5: §7**

If Task 4 Step 4 was applied, replace the bullet starting `- **A COLOUR MATERIAL ON A HIGH-RESOLUTION GROUND IS A ONE-WAY DOOR,` (through `first, and nothing in the UI says so. **Product decision needed.**`) with:

```markdown
- **CLOSED 14 Sep 2026 — the colour-surface "one-way door".** Replacing the
  material on a 1000×1000 ground used to fail, because the delete-then-add passed
  through a soil (dirt.jpg) rebuild the engine refuses. Since 6878eaf a ground
  with no material is a plain tile with no cap, so the swap succeeds;
  `large-ground.test.ts` now pins the success.
```

If Task 7 confirmed the footer moves, add:

```markdown
- **Add Column / Add Rows: Cancel and the data-type dropdown miss the first
  click.** The dialog focuses its first required field; clicking anything below
  it blurs that field, its inline error appears, and the controls below move down
  between mousedown and mouseup — so the click lands nowhere. Probe numbers in the
  14 Sep 2026 report. 8 `weather.test.ts` tests fail on it.
```

- [ ] **Step 6: §8**

Replace the bullet `- **A high-resolution ground cannot have its material swapped** — the one-way` (and its continuation lines) with `- ~~A high-resolution ground cannot have its material swapped~~ **closed** (see §7), if Task 4 Step 4 was applied; otherwise leave it.`

- [ ] **Step 7: Checkpoint** — `git diff --stat CLAUDE.md`; no commit.

---

### Task 14: Final verification

**Files:** none changed except `CLAUDE.md` counts.

- [ ] **Step 1: Typecheck**

Run: `npm run e2e:typecheck`
Expected: exit code 0.

- [ ] **Step 2: No leftover probes or test processes**

Run: `ls e2e/tests/_probe-* 2>/dev/null; ps -eo pid=,args= | grep -F "$PWD" | grep -E 'wdio|resources/backend|--app=' | grep -v grep`
Expected: no output.

- [ ] **Step 3: Full suite**

Run in the background, logging to the scratchpad: `npm run e2e`
Expected: every spec passes, except the 8 `weather.test.ts` tests if the user chose to keep them red, plus the known self-skips.

- [ ] **Step 4: Report**

Collate with the scratchpad `parse_results.py`, and report per spec file: passing / failing / pending, and the run time. Update the counts and runtimes in `CLAUDE.md` §6 for every touched spec and the two new files.

- [ ] **Step 5: Checkpoint** — show the final `git diff --stat`. Ask the user whether to commit.
