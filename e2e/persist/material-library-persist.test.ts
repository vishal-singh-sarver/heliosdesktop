/**
 * The material library is shared ACROSS PROJECTS — and stays shared across a FULL
 * app relaunch.
 *
 * Runs under wdio.persist.config.ts (fixed profile). One relaunch in this file,
 * for the same reason as import-persist.test.ts.
 *
 * A material made in project A is assigned to a ground in project B before the
 * relaunch; afterwards B's ground still wears it with its colour, A still lists
 * it, and a project created AFTER the relaunch can pick it too.
 */

import { existsSync } from 'node:fs'
import { TIMEOUTS } from '../config/timeouts'
import { enterGeometry, reloadToHome } from '../support/harness'
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
  switchToProject,
  waitForAssigned,
  waitForMaterialsReady
} from './ground-material-helpers'
import ProjectScreen from '../pages/ProjectScreen.page'
import HomePage from '../pages/HomePage.page'

describe('Persistence — the material library across projects and a relaunch', () => {
  it('a material made in project A is worn by project B’s ground, survives a relaunch there, and a NEW project can use it', async function () {
    this.timeout(360_000)
    await startOnHome()

    // 1) Project A makes a BLUE material.
    const projectA = await enterGeometry('plibA')
    await waitForMaterialsReady()
    const shared = await createColourMaterial('0', '0', '255')

    // 2) Project B sees it without doing anything, and puts it on a ground.
    await reloadToHome()
    const projectB = await enterGeometry('plibB')
    await waitForMaterialsReady()
    expect(await libraryNames()).toContain(shared.name)
    const ground = await addGroundWithDefault()
    await replaceDefaultWith(shared.name)

    expect(existsSync(PERSIST_DB)).toBe(true)

    // 3) FULL relaunch, back into project B.
    const homeId = await relaunchAndReopen(projectB.name)
    await openProjectFromHome(homeId)

    // B's ground still wears A's material, colour and all.
    await openGroundForm(ground.name)
    await waitForAssigned([shared.name], TIMEOUTS.MUTATION)
    expect(await readColour(shared.name)).toEqual(['0', '0', '255'])

    // 4) Project A, where it was made, still lists it.
    await switchToProject(projectA.name)
    expect(await libraryNames()).toContain(shared.name)

    // 5) A project created AFTER the relaunch can pick it for its own ground.
    //    Navigate Home in-app rather than refresh: a refresh after reloadSession is
    //    what import-persist.test.ts found to flake.
    await ProjectScreen.goHome()
    await HomePage.sidebarNewProject.waitForDisplayed({ timeout: TIMEOUTS.XLONG })
    await enterGeometry('plibC')
    await waitForMaterialsReady()
    expect(await libraryNames()).toContain(shared.name)
    await addGroundWithDefault()
    await replaceDefaultWith(shared.name)
  })
})
