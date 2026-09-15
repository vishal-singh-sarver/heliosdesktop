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
 * Material fields follow the live catalog: a field shows `*` when
 * /api/catalog/material-types marks it `required` (Materials/materialBlueprint.ts)
 * — with one override: the Radiation card's spectrum fields
 * (reflectivity_spectrum, transmissivity_spectrum) are ALWAYS starred by
 * MaterialRadiationEditor.tsx, whatever the catalog says.
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
import { sweepBlockingOverlays, waitForNoOpenDialog } from '../support/dialogs'
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
  const types = (res.body as { material_types?: CatalogType[] } | null)?.material_types ?? []
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
      const { id, name } = await createNamedReturnHome(uniqueName('req'))
      // Rename lives in the row's kebab menu — open it first, as homepage.test.ts does.
      await HomePage.openRowMenu(name)
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

    // The Add Rows / Add Column tests close their modal only at the END, so a
    // failing expect skips the close and the <dialog> stays in the top layer —
    // every later click in this block would then fail as "element click
    // intercepted" against the wrong element (CLAUDE.md trap 1). Sweep always.
    afterEach(async () => {
      await Geometry.closeAnyOpenDialog().catch(() => {})
      await sweepBlockingOverlays().catch(() => {})
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

    it('a Radiation card shows * on the catalog-required properties AND the always-starred spectrum fields', async () => {
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
      // The catalog never marks these object-type properties required, but
      // MaterialRadiationEditor.tsx passes `required: true` for the spectrum
      // fields ALWAYS ("a standing property of the field"), overriding it.
      const ALWAYS_STARRED = ['reflectivity_spectrum', 'transmissivity_spectrum']
      const expected = rendered
        .filter((p) => required.includes(p) || ALWAYS_STARRED.includes(p))
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
