// electron-builder afterSign hook: submits the .app to Apple notarization.
//
// Skipped on non-macOS platforms, when SKIP_NOTARIZATION is set, and when
// notary credentials (APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID) are missing
// - e.g. local dev builds, or CI before the Apple secrets are configured.
//
// NOTE: this notarizes the .app *bundle*. The .pkg installer is built later,
// from the already-stapled app, and is notarized separately by
// scripts/notarize-pkg.cjs (an afterAllArtifactBuild hook) - electron-builder
// fires afterSign before any installer target exists, so one hook cannot
// cover both.

const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID, SKIP_NOTARIZATION } = process.env
  if (SKIP_NOTARIZATION === '1' || SKIP_NOTARIZATION === 'true') {
    console.log('[notarize] SKIP_NOTARIZATION set - skipping.')
    return
  }
  if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] missing APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID - skipping.')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  // This wraps `notarytool submit --wait`, which uploads the app then POLLS
  // Apple's notary service until it returns a verdict. The wait is unbounded:
  // Apple's queue can be slow, so if CI appears stuck here it is almost always
  // waiting on Apple, not hung locally. Check status out-of-band with:
  //   xcrun notarytool history --apple-id ... --team-id ... --password ...
  const started = new Date().toISOString()
  console.log(
    `[notarize] ${started} submitting ${appPath} - uploading, then waiting on Apple's notary service (can take minutes to hours)...`
  )
  await notarize({
    tool: 'notarytool',
    appBundleId: 'com.navyug.helios',
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log(
    `[notarize] complete (submitted at ${started}, finished ${new Date().toISOString()}).`
  )
}
