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
