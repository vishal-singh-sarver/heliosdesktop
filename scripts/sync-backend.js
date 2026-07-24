#!/usr/bin/env node
/**
 * Backend Binary Builder & Sync Script
 *
 * This script:
 *   1. Builds the backend executable from helios-desktop-backend/ using PyInstaller
 *   2. Copies the generated binary into resources/backend/<platform>/
 *
 * No machine-specific absolute paths are hardcoded. Everything is built
 * from the local repo structure.
 *
 * Requires:
 *   - Python 3.9+ with venv support
 *   - pip and ability to install dependencies
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const REPO_ROOT = path.join(__dirname, '..')
const BACKEND_API_DIR = path.join(REPO_ROOT, 'helios-desktop-backend')
const BACKEND_BUILD_SCRIPT_UNIX = path.join(BACKEND_API_DIR, 'scripts', 'build_binary.sh')
const BACKEND_BUILD_SCRIPT_WINDOWS = path.join(BACKEND_API_DIR, 'scripts', 'build_binary.ps1')
const BACKEND_DIST_DIR = path.join(BACKEND_API_DIR, 'dist')
const RESOURCES_BACKEND_DIR = path.join(REPO_ROOT, 'resources', 'backend')

/**
 * Determine the current platform and get backend binary name and output paths
 */
function getPlatformConfig() {
  const platform = process.platform

  if (platform === 'darwin') {
    return {
      name: 'mac',
      binaryName: 'heliosgui_backend',
      destDir: path.join(RESOURCES_BACKEND_DIR, 'mac'),
      destPath: path.join(RESOURCES_BACKEND_DIR, 'mac', 'heliosgui_backend')
    }
  }

  if (platform === 'linux') {
    return {
      name: 'linux',
      binaryName: 'heliosgui_backend',
      destDir: path.join(RESOURCES_BACKEND_DIR, 'linux'),
      destPath: path.join(RESOURCES_BACKEND_DIR, 'linux', 'heliosgui_backend')
    }
  }

  if (platform === 'win32') {
    return {
      name: 'win',
      binaryName: 'heliosgui_backend.exe',
      destDir: path.join(RESOURCES_BACKEND_DIR, 'win'),
      destPath: path.join(RESOURCES_BACKEND_DIR, 'win', 'heliosgui_backend.exe')
    }
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

/**
 * Ensure a directory exists, creating it recursively if needed
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`[*] Created directory: ${dir}`)
  }
}

/**
 * Check whether the current platform already has a usable bundled backend.
 * On Windows we prefer reusing the pre-synced binary so packaging does not
 * have to rebuild anything inside helios-desktop-backend/.
 */
function hasUsableBundledBackend(platformConfig) {
  const { binaryName, destPath } = platformConfig

  if (!fs.existsSync(destPath)) {
    return false
  }

  if (fs.statSync(destPath).isDirectory()) {
    return fs.existsSync(path.join(destPath, binaryName))
  }

  return true
}

/**
 * Recursively copy a directory and its contents
 */
function copyDir(src, dest) {
  // Create destination directory
  ensureDir(dest)
  
  // Read all files/folders in source
  const items = fs.readdirSync(src)
  
  for (const item of items) {
    const srcPath = path.join(src, item)
    const destPath = path.join(dest, item)
    
    const stat = fs.statSync(srcPath)
    
    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copyDir(srcPath, destPath)
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath)
      // Preserve file permissions
      fs.chmodSync(destPath, fs.statSync(srcPath).mode)
    }
  }
}

/**
 * Run a shell command and return success/failure
 */
function runCommand(command, description) {
  try {
    console.log(`[*] ${description}...`)
    execSync(command, { stdio: 'inherit' })
    return true
  } catch (error) {
    console.error(`[!] Failed to ${description}`)
    throw error
  }
}

/**
 * Smoke test: confirm the synced --onedir bundle ships the SQL migration
 * files. Without them, `run_migrations()` silently no-ops and the runtime
 * DB ends up with only the bookkeeping table — every API call then crashes
 * with `no such table: projects`. Failing here surfaces the regression at
 * sync time instead of at first launch.
 */
function verifyBundledMigrations(destPath) {
  const migrationsDir = path.join(destPath, '_internal', 'app', 'db', 'migrations')
  if (!fs.existsSync(migrationsDir) || !fs.statSync(migrationsDir).isDirectory()) {
    throw new Error(
      `Bundled backend is missing migrations folder at:\n  ${migrationsDir}\n` +
      `Build script likely lacks "--add-data app/db/migrations:app/db/migrations".`
    )
  }
  const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
  if (sqlFiles.length === 0) {
    throw new Error(
      `Bundled backend has an empty migrations folder at:\n  ${migrationsDir}\n` +
      `Rebuild the backend — the SQL files were not packaged.`
    )
  }
  console.log(`[*] Verified ${sqlFiles.length} migration file(s) in bundle`)
}

/**
 * Build the backend executable from helios-desktop-backend/
 */
function buildBackend() {
  console.log('\n========================================')
  console.log('Building Backend from Local Source')
  console.log('========================================')

  if (!fs.existsSync(BACKEND_API_DIR)) {
    throw new Error(`Backend API directory not found: ${BACKEND_API_DIR}`)
  }

  if (process.platform === 'win32') {
    if (!fs.existsSync(BACKEND_BUILD_SCRIPT_WINDOWS)) {
      throw new Error(
        `Backend build script not found: ${BACKEND_BUILD_SCRIPT_WINDOWS}\n` +
        `Make sure helios-desktop-backend/scripts/build_binary.ps1 exists.`
      )
    }

    runCommand(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${BACKEND_BUILD_SCRIPT_WINDOWS}"`,
      'Build backend executable'
    )
    return
  }

  if (!fs.existsSync(BACKEND_BUILD_SCRIPT_UNIX)) {
    throw new Error(
      `Backend build script not found: ${BACKEND_BUILD_SCRIPT_UNIX}\n` +
      `Make sure helios-desktop-backend/scripts/build_binary.sh exists.`
    )
  }

  // Preserve existing Unix behavior.
  fs.chmodSync(BACKEND_BUILD_SCRIPT_UNIX, 0o755)
  runCommand(`bash "${BACKEND_BUILD_SCRIPT_UNIX}"`, 'Build backend executable')
}

/**
 * Copy the built backend binary/directory to resources
 * 
 * Note: PyInstaller --onedir creates a directory structure, not a single file.
 * The structure is: dist/heliosgui_backend/heliosgui_backend (executable + runtime files)
 * We copy the entire directory to resources.
 */
function syncBackendToResources() {
  console.log('\n========================================')
  console.log('Syncing Backend to Resources')
  console.log('========================================')

  const platformConfig = getPlatformConfig()
  const { name, binaryName, destDir, destPath } = platformConfig

  // With --onedir, the built artifact is a directory, and the executable is inside it
  const builtDirPath = path.join(BACKEND_DIST_DIR, binaryName)
  const builtExecutablePath = path.join(builtDirPath, binaryName)
  
  // Check if it's the new --onedir structure (directory with executable inside)
  const isOnedirStructure = fs.existsSync(builtDirPath) && fs.statSync(builtDirPath).isDirectory()
  
  if (isOnedirStructure) {
    // Handle --onedir: Copy entire directory, preserving all runtime dependencies
    if (!fs.existsSync(builtExecutablePath)) {
      throw new Error(
        `Backend executable not found in onedir structure: ${builtExecutablePath}\n` +
        `Build may have failed. Check output above.`
      )
    }

    // Ensure destination directory exists
    ensureDir(destDir)

    // Remove old directory if it exists
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true })
      console.log(`[*] Removed old backend directory: ${destPath}`)
    }

    // Copy the entire onedir directory with all runtime files
    copyDir(builtDirPath, destPath)
    console.log(`[*] Copied backend directory: ${builtDirPath} → ${destPath}`)

    // Set executable permissions on Unix for the main executable
    if (process.platform !== 'win32') {
      fs.chmodSync(path.join(destPath, binaryName), 0o755)
      console.log(`[*] Set executable permissions on ${binaryName}`)
    }

    verifyBundledMigrations(destPath)
  } else {
    // Handle legacy --onefile: Single executable file
    const builtBinaryPath = path.join(BACKEND_DIST_DIR, binaryName)
    if (!fs.existsSync(builtBinaryPath)) {
      throw new Error(
        `Backend binary not found after build: ${builtBinaryPath}\n` +
        `Build may have failed. Check output above.`
      )
    }

    // Ensure destination directory exists
    ensureDir(destDir)

    // Remove old binary if it exists
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true })
      console.log(`[*] Removed old binary: ${destPath}`)
    }

    // Copy the single executable
    fs.copyFileSync(builtBinaryPath, destPath)
    console.log(`[*] Copied executable: ${builtBinaryPath} → ${destPath}`)

    // Set executable permissions on Unix
    if (process.platform !== 'win32') {
      fs.chmodSync(destPath, 0o755)
    }
  }

  console.log(`[*] Backend destination: ${destPath}`)
}

/**
 * Main entry point
 */
function main() {
  try {
    // Verify we're in the right directory
    if (!fs.existsSync(BACKEND_API_DIR)) {
      throw new Error(
        `This script must be run from the repo root.\n` +
        `Expected helios-desktop-backend directory at: ${BACKEND_API_DIR}`
      )
    }

    const platformConfig = getPlatformConfig()

    // Windows installer builds should not require mutating helios-desktop-backend/ when
    // a valid prebuilt backend is already present in resources/backend/win.
    if (process.platform === 'win32' && hasUsableBundledBackend(platformConfig)) {
      console.log('\n========================================')
      console.log('Using Existing Windows Backend Resource')
      console.log('========================================')
      console.log(`[*] Reusing bundled backend at: ${platformConfig.destPath}`)
      console.log(`[*] Skipping helios-desktop-backend build on Windows`)
      console.log('\n========================================')
      console.log('✓ Backend sync complete')
      console.log('========================================\n')
      return
    }

    // Build the backend
    buildBackend()

    // Sync to resources
    syncBackendToResources()

    console.log('\n========================================')
    console.log('✓ Backend build and sync complete')
    console.log('========================================\n')
  } catch (error) {
    console.error('\n========================================')
    console.error('✗ Backend build failed')
    console.error('========================================')
    console.error(error.message)
    process.exit(1)
  }
}

main()
