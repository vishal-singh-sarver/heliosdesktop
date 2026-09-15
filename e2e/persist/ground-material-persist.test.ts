/**
 * Grounds and the materials on them, across a FULL app relaunch.
 *
 * Runs under wdio.persist.config.ts (fixed profile, so the SQLite DB survives
 * browser.reloadSession). One relaunch per spec file on purpose — see
 * import-persist.test.ts for the CDP quirk that makes chained relaunches flaky.
 *
 * The main suite only reopens a project inside ONE app process; this closes the
 * app and starts a new one, so it proves the grounds, their material assignments
 * and the library entries reached the database.
 */

import { existsSync } from 'node:fs'
import Geometry from '../pages/Geometry.page'
import { TIMEOUTS } from '../config/timeouts'
import { enterGeometry } from '../support/harness'
import { libraryNames } from '../support/defaultMaterial'
import { PERSIST_DB, relaunchAndReopen } from './persist-helpers'
import {
  addGroundWithDefault,
  createColourMaterial,
  openGroundForm,
  openProjectFromHome,
  readColour,
  replaceDefaultWith,
  startOnHome,
  waitForAssigned,
  waitForMaterialsReady
} from './ground-material-helpers'

describe('Persistence — grounds and their materials across relaunch', () => {
  it('two grounds — one on its DEFAULT material, one on a created RED material — come back after a relaunch, each wearing its own', async function () {
    this.timeout(300_000)
    await startOnHome()

    // 1) A project with a red material and two grounds. Materials first: + Ground
    //    and + Add Materials each swap the right panel to what they created.
    const project = await enterGeometry('pgeo')
    await waitForMaterialsReady()
    const red = await createColourMaterial('255', '0', '0')

    const kept = await addGroundWithDefault()
    const swapped = await addGroundWithDefault()
    // + Ground opened the SECOND ground's form, so this replaces its default.
    await replaceDefaultWith(red.name)

    expect(existsSync(PERSIST_DB)).toBe(true)

    // 2) FULL relaunch on the same profile, then open the project again.
    const homeId = await relaunchAndReopen(project.name)
    await openProjectFromHome(homeId)

    // 3) Both grounds are back…
    const names = await Geometry.names()
    expect(names).toContain(kept.name)
    expect(names).toContain(swapped.name)

    // …the first still on its default…
    await openGroundForm(kept.name)
    await waitForAssigned([kept.defaultName], TIMEOUTS.MUTATION)

    // …the second on the red material, with its colour intact — not its default.
    await openGroundForm(swapped.name)
    await waitForAssigned([red.name], TIMEOUTS.MUTATION)
    expect(await readColour(red.name)).toEqual(['255', '0', '0'])

    // 4) The library kept all three: the created material, and BOTH defaults —
    //    the replaced one is unassigned, not deleted.
    const library = await libraryNames()
    expect(library).toContain(red.name)
    expect(library).toContain(kept.defaultName)
    expect(library).toContain(swapped.defaultName)
  })
})
