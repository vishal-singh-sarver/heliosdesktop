#!/usr/bin/env node
/**
 * Electron builder after-pack hook
 * 
 * Ensures backend binary and other packaged executables have proper
 * permissions after macOS packaging. This is critical for .pkg installer
 * and DMG builds, as file permissions can be lost during archiving.
 * 
 * Runs after electron-builder creates the app bundle but before creating
 * the final DMG/PKG/etc.
 */

const fs = require('fs')
const path = require('path')

async function afterPack(context) {
  // Only run on macOS
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appPath = context.appOutDir
  const resourcesPath = path.join(appPath, 'Helios.app', 'Contents', 'Resources')
  const backendDir = path.join(resourcesPath, 'backend')
  const backendBinary = path.join(backendDir, 'heliosgui_backend')

  console.log(`[afterPack] Checking backend binary permissions...`)
  console.log(`[afterPack] Backend binary path: ${backendBinary}`)

  if (!fs.existsSync(backendBinary)) {
    console.warn(`[afterPack] Backend binary not found at ${backendBinary}`)
    return
  }

  try {
    // Ensure binary is executable
    fs.chmodSync(backendBinary, 0o755)
    console.log(`[afterPack] Set executable permissions on backend binary`)

    // Verify the binary is actually executable
    try {
      fs.accessSync(backendBinary, fs.constants.X_OK)
      console.log(`[afterPack] Backend binary verified as executable`)
    } catch {
      throw new Error(`Backend binary is not executable after chmod`)
    }

    // NOTE: this hook used to strip com.apple.quarantine from the backend
    // binary here. That was a workaround for shipping an UNSIGNED sidecar and
    // is no longer needed: the quarantine flag is applied by the OS when a user
    // downloads the installer, not on the build machine, so removing it at pack
    // time never had any effect on the shipped artifact. Now that the binary is
    // signed with a Developer ID + hardened runtime and the .pkg is notarized,
    // Gatekeeper clears it on the user's machine properly.
  } catch (error) {
    console.error(`[afterPack] Failed to fix backend binary permissions: ${error.message}`)
    throw error
  }
}

module.exports = { afterPack }
