// electron-builder afterAllArtifactBuild hook: notarizes + staples the .pkg.
//
// Why a second hook exists (see also scripts/notarize.cjs):
//   electron-builder fires `afterSign` during app packaging, BEFORE any
//   installer target is built - so that hook can only reach the .app bundle.
//   The .pkg is produced afterwards (productbuild, signed with the Developer
//   ID Installer cert). A .pkg downloaded from the internet is itself subject
//   to Gatekeeper, so it needs its own notarization ticket stapled, otherwise
//   users see "cannot be opened because Apple cannot check it for malicious
//   software" when they double-click the installer - even though the .app
//   inside is perfectly notarized.
//
// @electron/notarize only accepts .app bundles, so this shells out to
// `xcrun notarytool` / `xcrun stapler` directly.

const { execFileSync } = require('child_process')
const fs = require('fs')

exports.default = async function notarizePkg(buildResult) {
  if (process.platform !== 'darwin') return []

  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID, SKIP_NOTARIZATION } = process.env
  if (SKIP_NOTARIZATION === '1' || SKIP_NOTARIZATION === 'true') {
    console.log('[notarize-pkg] SKIP_NOTARIZATION set - skipping.')
    return []
  }
  if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize-pkg] missing APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID - skipping.')
    return []
  }

  const pkgs = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.pkg'))
  if (pkgs.length === 0) {
    console.log('[notarize-pkg] no .pkg artifacts in this build - nothing to do.')
    return []
  }

  for (const pkg of pkgs) {
    if (!fs.existsSync(pkg)) {
      throw new Error(`[notarize-pkg] artifact does not exist: ${pkg}`)
    }

    const started = new Date().toISOString()
    console.log(`[notarize-pkg] ${started} submitting ${pkg} - waiting on Apple's notary service...`)

    // --wait blocks until Apple returns a verdict; notarytool exits non-zero
    // on Invalid/Rejected, which execFileSync turns into a throw - failing the
    // build rather than shipping an unnotarized installer.
    execFileSync(
      'xcrun',
      [
        'notarytool',
        'submit',
        pkg,
        '--apple-id',
        APPLE_ID,
        '--password',
        APPLE_PASSWORD,
        '--team-id',
        APPLE_TEAM_ID,
        '--wait'
      ],
      { stdio: 'inherit' }
    )

    console.log(`[notarize-pkg] stapling ${pkg}`)
    execFileSync('xcrun', ['stapler', 'staple', pkg], { stdio: 'inherit' })

    console.log(
      `[notarize-pkg] complete for ${pkg} (submitted ${started}, finished ${new Date().toISOString()}).`
    )
  }

  // No new artifacts were created - stapling mutates the .pkg in place.
  return []
}
