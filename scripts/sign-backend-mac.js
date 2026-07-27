#!/usr/bin/env node
/**
 * Signs the macOS PyInstaller backend with a Developer ID + hardened runtime,
 * BEFORE electron-builder packages the app.
 *
 * Why this is a separate step:
 *   Notarization rejects a bundle if ANY executable inside it is unsigned or
 *   lacks the hardened runtime. electron-builder signs the .app and the
 *   Electron framework, but resources/backend/mac/ is copied in via
 *   extraResources - it is opaque to the signing machinery and must be signed
 *   by hand. Missing this produces a build that packages fine and then fails
 *   notarization with a vague "The binary is not signed with a valid Developer
 *   ID certificate" for a path deep inside the bundle.
 *
 * Handles BOTH PyInstaller layouts, because scripts/sync-backend.js supports
 * both and which one ships depends on the backend submodule's build script:
 *   --onefile: resources/backend/mac/heliosgui_backend            (a file)
 *   --onedir:  resources/backend/mac/heliosgui_backend/...        (a directory
 *              of the executable plus dozens of .so/.dylib files, EVERY one of
 *              which needs its own signature)
 *
 * Nested code must be signed INNERMOST-FIRST: signing a parent seals a hash of
 * its children, so re-signing a child afterwards invalidates the parent.
 *
 * No-ops (exit 0) when the backend or a signing identity is absent, so
 * `npm run build` on a dev machine without certs still works. Set
 * REQUIRE_SIGNING=1 (CI does) to turn those no-ops into hard failures.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

const REPO_ROOT = path.join(__dirname, '..')
const BACKEND_ROOT = path.join(REPO_ROOT, 'resources', 'backend', 'mac')
const BINARY_NAME = 'heliosgui_backend'
const ENTITLEMENTS = path.join(REPO_ROOT, 'build', 'backend.entitlements')

const required = process.env.REQUIRE_SIGNING === '1'

function fail(msg) {
  if (required) {
    console.error(`[sign-backend] FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`[sign-backend] skipping: ${msg}`)
  process.exit(0)
}

if (process.platform !== 'darwin') {
  console.log('[sign-backend] not macOS - nothing to do.')
  process.exit(0)
}

const target = path.join(BACKEND_ROOT, BINARY_NAME)
if (!fs.existsSync(target)) {
  fail(`backend not found at ${target} (run "npm run sync-backend" first)`)
}
if (!fs.existsSync(ENTITLEMENTS)) {
  fail(`entitlements not found at ${ENTITLEMENTS}`)
}

// Prefer the identity CI exports; otherwise look for one in the keychain so a
// local `npm run sign:backend:mac` works without extra env setup.
let identity = process.env.APPLE_SIGNING_IDENTITY
if (!identity) {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    const match = out.match(/"(Developer ID Application: [^"]+)"/)
    if (match) {
      identity = match[1]
      console.log(`[sign-backend] using identity from keychain: ${identity}`)
    }
  } catch {
    // fall through to the no-identity failure below
  }
}
if (!identity) {
  fail('no APPLE_SIGNING_IDENTITY set and no "Developer ID Application" identity in the keychain')
}

/** True if the file is a Mach-O binary (executable, dylib, or bundle). */
function isMachO(file) {
  const res = spawnSync('file', ['-b', file], { encoding: 'utf8' })
  return res.status === 0 && /Mach-O/.test(res.stdout || '')
}

/** Every Mach-O under dir, deepest paths first. */
function findMachO(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      found.push(...findMachO(full))
    } else if (entry.isFile() && isMachO(full)) {
      found.push(full)
    }
  }
  // Deepest first: nested code must be signed before its container.
  return found.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)
}

const isOnedir = fs.statSync(target).isDirectory()
let targets
if (isOnedir) {
  console.log(`[sign-backend] --onedir layout detected at ${target}`)
  targets = findMachO(target)
  // The main executable must be signed LAST so its signature seals the
  // already-signed libraries beside it.
  const main = path.join(target, BINARY_NAME)
  targets = targets.filter((t) => t !== main)
  if (fs.existsSync(main)) targets.push(main)
  if (targets.length === 0) fail(`no Mach-O binaries found under ${target}`)
  console.log(`[sign-backend] ${targets.length} Mach-O file(s) to sign`)
} else {
  console.log(`[sign-backend] --onefile layout detected at ${target}`)
  targets = [target]
}

for (const bin of targets) {
  execFileSync(
    'codesign',
    [
      '--force',
      '--options',
      'runtime', // hardened runtime - mandatory for notarization
      '--timestamp', // a secure timestamp is also mandatory
      '--entitlements',
      ENTITLEMENTS,
      '--sign',
      identity,
      bin
    ],
    { stdio: 'inherit' }
  )
  console.log(`[sign-backend] signed ${path.relative(REPO_ROOT, bin)}`)
}

// Prove it took on the main executable, and that hardened runtime is actually
// on - a signature without the runtime flag still fails notarization later.
//
// NOTE: `codesign -dv` writes its report to STDERR, not stdout.
const mainBinary = isOnedir ? path.join(target, BINARY_NAME) : target
const verify = spawnSync('codesign', ['-dv', '--verbose=4', mainBinary], { encoding: 'utf8' })
if (verify.status !== 0) {
  console.error(verify.stderr || '')
  console.error('[sign-backend] FAIL: codesign could not read back the signature')
  process.exit(1)
}
const report = `${verify.stdout || ''}${verify.stderr || ''}`
console.log(report)

if (!/flags=.*runtime/.test(report)) {
  console.error('[sign-backend] FAIL: signature does not carry the hardened-runtime flag')
  process.exit(1)
}

execFileSync('codesign', ['--verify', '--strict', mainBinary], { stdio: 'inherit' })
console.log(`[sign-backend] OK - signed ${targets.length} binary/binaries with hardened runtime.`)
