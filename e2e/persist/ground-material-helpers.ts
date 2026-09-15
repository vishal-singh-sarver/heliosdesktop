/**
 * Ground + material steps shared by the persist specs that relaunch the app
 * around them (ground-material-persist, material-library-persist).
 *
 * The same moves default-material.test.ts makes, lifted here because the persist
 * suite runs under its own config and each relaunch spec wants them unchanged:
 *  - every new ground is born wearing `Mtl.<ground name>` (support/defaultMaterial);
 *  - the ground form counts that default as SAVED, so picking another material
 *    and saving goes through the Replace confirmation;
 *  - the material library is GLOBAL — one library for every project.
 */
import Geometry from '../pages/Geometry.page'
import HomePage from '../pages/HomePage.page'
import MaterialProperties from '../pages/MaterialProperties.page'
import Materials from '../pages/Materials.page'
import ObjectProperties from '../pages/ObjectProperties.page'
import ProjectScreen from '../pages/ProjectScreen.page'
import { GEOMETRY_MATERIAL_MSG } from '../constants/geometry'
import { materialLabel } from '../constants/materials'
import { TIMEOUTS } from '../config/timeouts'
import { waitForBackendReady, waitForMainWindow } from '../support/harness'
import { clickDialogButton, waitForNoOpenDialog, waitForOpenDialog } from '../support/dialogs'
import { waitForDefaultMaterial } from '../support/defaultMaterial'

/**
 * Land on Home at the start of a spec. The fixed profile can boot straight into
 * the project a previous spec left open.
 */
export async function startOnHome(): Promise<void> {
  await waitForMainWindow()
  await waitForBackendReady()
  if (await ProjectScreen.goHomeButton.isDisplayed().catch(() => false)) {
    await ProjectScreen.goHome()
  }
  await HomePage.sidebarNewProject.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
}

/** + Add Materials is gated on the material catalog loading. */
export async function waitForMaterialsReady(): Promise<void> {
  await browser.waitUntil(async () => Materials.addButton.isEnabled().catch(() => false), {
    timeout: TIMEOUTS.LONG,
    timeoutMsg: '+ Add Materials never became enabled (the material catalog never loaded)'
  })
}

/** Open a project from its Home row and wait until its tree and library are usable. */
export async function openProjectFromHome(homeRowId: string): Promise<void> {
  await HomePage.openProject(homeRowId)
  await ProjectScreen.projectTitle.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  await Geometry.panel.waitForDisplayed({ timeout: TIMEOUTS.LONG })
  await Geometry.waitForTree()
  await waitForMaterialsReady()
}

/** Go Home from a project and open another project by NAME. */
export async function switchToProject(name: string): Promise<void> {
  await ProjectScreen.goHome()
  await HomePage.header.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
  let rowId: string | null = null
  await browser.waitUntil(
    async () => {
      rowId = await HomePage.rowIdForName(name)
      return rowId !== null
    },
    { timeout: TIMEOUTS.LONG, timeoutMsg: `project "${name}" is not listed on Home` }
  )
  await openProjectFromHome(rowId as unknown as string)
}

/**
 * Create a material with ONE saved colour-mode Visualiser card and return it. A
 * fresh material ships one blank card, so addCard() returns card 2 — card 1 is
 * never typed or saved and contributes nothing.
 */
export async function createColourMaterial(
  r: string,
  g: string,
  b: string
): Promise<{ id: string; name: string }> {
  const id = await Materials.addMaterial()
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
  await browser.waitUntil(async () => !(await MaterialProperties.saveEnabled(cardId)), {
    timeout: TIMEOUTS.MUTATION,
    timeoutMsg: `the colour card on "${name}" never finished saving`
  })
  return { id, name }
}

export type CreatedGround = { id: string; name: string; defaultName: string }

/** + Ground, returning the ground with the default material it was born wearing. */
export async function addGroundWithDefault(): Promise<CreatedGround> {
  const id = await Geometry.addGround()
  await ObjectProperties.waitForOpen()
  const name = (await Geometry.rowState(id))?.name ?? ''
  const defaultName = await waitForDefaultMaterial()
  return { id, name, defaultName }
}

/** Select a ground by NAME and wait for the form to actually switch to it. */
export async function openGroundForm(name: string): Promise<void> {
  let id: string | null = null
  await browser.waitUntil(
    async () => {
      id = await Geometry.idForName(name)
      return id !== null
    },
    { timeout: TIMEOUTS.LONG, timeoutMsg: `ground "${name}" is not in the tree` }
  )
  await Geometry.selectRow(id as unknown as string)
  await ObjectProperties.waitForOpen()
  await browser.waitUntil(async () => (await ObjectProperties.nameState()).value === name, {
    timeout: TIMEOUTS.MUTATION,
    timeoutMsg: `the Properties form never switched to "${name}"`
  })
}

/** The open ground's Materials section lists exactly `names`. */
export async function waitForAssigned(names: string[], timeout: number = TIMEOUTS.MUTATION): Promise<void> {
  await browser.waitUntil(
    async () => {
      const got = await ObjectProperties.assignedNames()
      return got.length === names.length && names.every((n) => got.includes(n))
    },
    { timeout, timeoutMsg: `the Materials section never listed exactly [${names.join(', ')}]` }
  )
}

/** Pick `name` for the open ground and SAVE it through the Replace confirmation. */
export async function replaceDefaultWith(name: string): Promise<void> {
  await ObjectProperties.openMaterialPicker()
  await browser.waitUntil(
    async () => (await ObjectProperties.pickerState()).rows.some((r) => r.name === name),
    { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the picker never listed "${name}"` }
  )
  await ObjectProperties.pickMaterial(name)
  await browser.waitUntil(async () => !(await ObjectProperties.pickerOpen()), {
    timeout: TIMEOUTS.MEDIUM,
    timeoutMsg: `picking "${name}" never closed the picker`
  })
  await browser.waitUntil(async () => ObjectProperties.saveEnabled(), {
    timeout: TIMEOUTS.MEDIUM,
    timeoutMsg: 'Save never enabled — the form did not become dirty'
  })
  await ObjectProperties.saveButton.click()
  const dialog = await waitForOpenDialog()
  expect(dialog.ariaLabel).toBe(GEOMETRY_MATERIAL_MSG.replaceTitle)
  await clickDialogButton(GEOMETRY_MATERIAL_MSG.replaceConfirm)
  await waitForNoOpenDialog()
  await browser.waitUntil(
    async () =>
      (await ObjectProperties.saveButton.getText()).trim() === 'Save' &&
      !(await ObjectProperties.saveEnabled()),
    { timeout: TIMEOUTS.MUTATION, timeoutMsg: 'the save never landed (Save never went quiet again)' }
  )
  await waitForAssigned([name])
}

/** The R/G/B the open ground's read-only popup shows for `materialName`. */
export async function readColour(materialName: string): Promise<string[]> {
  await ObjectProperties.openMaterialDetail(materialName)
  const channels = ['color_r', 'color_g', 'color_b'] as const
  let values: string[] = []
  await browser.waitUntil(
    async () => {
      const rows = await ObjectProperties.detailRows(materialName)
      values = channels.map((c) => ObjectProperties.valueIn(rows, 'Visualiser', materialLabel(c)))
      return values.every((v) => /^\d+$/.test(v))
    },
    { timeout: TIMEOUTS.MUTATION, timeoutMsg: `the popup for "${materialName}" never showed its colour` }
  )
  await ObjectProperties.closeMaterialDetail(materialName)
  await browser.waitUntil(
    async () => !(await ObjectProperties.materialDetail(materialName).isExisting()),
    { timeout: TIMEOUTS.MEDIUM, timeoutMsg: `the properties popup for "${materialName}" never closed` }
  )
  return values
}
