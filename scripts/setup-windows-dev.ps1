#!/usr/bin/env pwsh
<#
.SYNOPSIS
  One-shot setup of the Helios GUI Windows dev environment.

.DESCRIPTION
  Runs the full pipeline so `npm run dev` works on a fresh Windows machine:

    Phase 1: Install the C++ build toolchain (CMake, VS 2022 Build Tools, Ninja)
             via winget. Skipped if already present. Requires Administrator
             only on first install.

    Phase 2: Compile the native PyHelios C++ library
             (helios-desktop-backend/pyhelios/pyhelios_build/build/lib/libhelios.dll).
             Skipped if the DLL already exists, unless -Force is passed.

    Phase 3: Build the backend PyInstaller bundle
             (helios-desktop-backend/dist/heliosgui_backend.exe/).
             Skipped if the bundle already exists, unless -Force is passed.

    Phase 4: Copy the bundle into resources/backend/win/. Any existing bundle
             at that location is renamed to <name>.bak.<timestamp> first
             (non-destructive — delete the .bak dirs once dev mode boots).

    Phase 5: Verify libhelios.dll is in the expected place inside the synced
             bundle.

    Phase 6: Run `npm install` if node_modules/ is missing.

.PARAMETER Force
  Rebuild every artifact even if it already exists. Does not re-install the
  toolchain (that's controlled by whether cmake/MSVC are detected).

.PARAMETER SkipToolchain
  Skip the toolchain detection/install step. Use if you have CMake + MSVC
  installed manually and want to avoid the elevated-shell check.

.PARAMETER Plugins
  Optional list of PyHelios plugins to build. Defaults to whatever
  build_helios.py picks (all integrated plugins). Pass e.g. -Plugins visualizer
  for a minimal build.

.EXAMPLE
  PS> powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-dev.ps1

.EXAMPLE
  PS> .\scripts\setup-windows-dev.ps1 -SkipToolchain -Plugins visualizer
#>

[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$SkipToolchain,
  [string[]]$Plugins
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives in <repo>/scripts/)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

# --- Pre-flight ------------------------------------------------------------
if (-not (Test-Path (Join-Path $repoRoot 'package.json'))) {
  throw "package.json not found at $repoRoot. Place this script in <repo>/scripts/."
}
if (-not (Test-Path (Join-Path $repoRoot 'helios-desktop-backend'))) {
  throw "helios-desktop-backend/ not found at $repoRoot. Did you clone with --recurse-submodules?"
}

function Write-Phase([string]$Title) {
  Write-Host ""
  Write-Host "===== $Title =====" -ForegroundColor Cyan
}

function Test-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-PathFromRegistry {
  $env:Path = ([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
               [Environment]::GetEnvironmentVariable('Path', 'User'))
}

function Test-ToolchainPresent {
  if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { return $false }
  $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path $vswhere)) { return $false }
  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  return [bool]$vsPath
}

# Make submodules are checked out (cheap if already are).
# .gitmodules uses a relative url (../helios-desktop-backend.git) so a GitHub clone follows
# the fork's account automatically; for other origins (e.g. the internal server)
# resolve the owner and force the GitHub url before updating.
Write-Phase 'Phase 0: ensure submodules are present'

$backendOwner = $env:BACKEND_OWNER
if (-not $backendOwner) {
  $ghRemote = (& git remote -v | Select-String 'github\.com' | Select-Object -First 1)
  if ($ghRemote) {
    $m = [regex]::Match($ghRemote.ToString(), 'github\.com[:/]+([^/]+)/')
    if ($m.Success) { $backendOwner = $m.Groups[1].Value }
  }
}
if (-not $backendOwner) { $backendOwner = 'PlantSimulationLab' }

Write-Host "  helios-desktop-backend owner: $backendOwner"
& git submodule sync -- helios-desktop-backend | Out-Null
& git config submodule.helios-desktop-backend.url "git@github.com:$backendOwner/helios-desktop-backend.git"
& git submodule update --init --recursive
if ($LASTEXITCODE -ne 0) {
  Write-Host "  [!] git submodule update returned $LASTEXITCODE - continuing anyway" -ForegroundColor Yellow
}

# --- Phase 1: toolchain ----------------------------------------------------
Write-Phase 'Phase 1: C++ toolchain (CMake + MSVC + Ninja)'
if ($SkipToolchain) {
  Write-Host "  [skip] -SkipToolchain passed"
} elseif (Test-ToolchainPresent) {
  Write-Host "  [ok] cmake + MSVC C++ tools detected"
} else {
  if (-not (Test-Admin)) {
    Write-Host ""
    Write-Host "  [!] CMake or MSVC C++ tools are missing on this machine." -ForegroundColor Yellow
    Write-Host "      Toolchain install needs an elevated PowerShell." -ForegroundColor Yellow
    Write-Host "      Right-click Start -> Terminal (Admin), then re-run this script." -ForegroundColor Yellow
    Write-Host ""
    throw 'Re-run this script from an elevated PowerShell (or pass -SkipToolchain if you installed CMake/MSVC manually).'
  }
  & (Join-Path $PSScriptRoot 'setup-windows-toolchain.ps1')
  if ($LASTEXITCODE -ne 0) { throw "Toolchain install failed (exit $LASTEXITCODE)" }
  Refresh-PathFromRegistry
  if (-not (Test-ToolchainPresent)) {
    throw 'Toolchain still not detected after install. Close this shell, open a new one, and re-run.'
  }
}

# --- Phase 2: libhelios.dll ------------------------------------------------
Write-Phase 'Phase 2: native PyHelios library (libhelios.dll)'
$libheliosDll = Join-Path $repoRoot 'helios-desktop-backend\pyhelios\pyhelios_build\build\lib\libhelios.dll'
if ((Test-Path $libheliosDll) -and -not $Force) {
  Write-Host "  [skip] $libheliosDll already exists (pass -Force to rebuild)"
} else {
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "python not found on PATH. Install Python 3.10+ and re-run."
  }
  Push-Location (Join-Path $repoRoot 'helios-desktop-backend\pyhelios')
  try {
    $pyArgs = @('build_scripts\build_helios.py')
    if ($Plugins) { $pyArgs += @('--plugins') + $Plugins }
    & python @pyArgs
    if ($LASTEXITCODE -ne 0) { throw "build_helios.py failed (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
  if (-not (Test-Path $libheliosDll)) {
    throw "build_helios.py finished but $libheliosDll was not produced"
  }
  Write-Host "  [ok] built $libheliosDll"
}

# --- Phase 3: backend PyInstaller bundle -----------------------------------
Write-Phase 'Phase 3: backend PyInstaller bundle (heliosgui_backend.exe)'
$builtBundleDir = Join-Path $repoRoot 'helios-desktop-backend\dist\heliosgui_backend.exe'
$builtExe       = Join-Path $builtBundleDir 'heliosgui_backend.exe'
if ((Test-Path $builtExe) -and -not $Force) {
  Write-Host "  [skip] $builtExe already exists (pass -Force to rebuild)"
} else {
  & (Join-Path $repoRoot 'helios-desktop-backend\scripts\build_binary.ps1')
  if ($LASTEXITCODE -ne 0) { throw "build_binary.ps1 failed (exit $LASTEXITCODE)" }
  if (-not (Test-Path $builtExe)) {
    throw "build_binary.ps1 finished but $builtExe was not produced"
  }
}

# --- Phase 4: sync to resources/ ------------------------------------------
Write-Phase 'Phase 4: sync bundle to resources\backend\win\'
$destBundle = Join-Path $repoRoot 'resources\backend\win\heliosgui_backend.exe'
if (Test-Path $destBundle) {
  $stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bakLeaf = "heliosgui_backend.exe.bak.$stamp"
  Write-Host "  [*] existing bundle found - renaming to $bakLeaf"
  Rename-Item -LiteralPath $destBundle -NewName $bakLeaf
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node not found on PATH. Install Node.js 22+ and re-run."
}
& node (Join-Path $repoRoot 'scripts\sync-backend.js')
if ($LASTEXITCODE -ne 0) { throw "sync-backend.js failed (exit $LASTEXITCODE)" }

# --- Phase 5: verify -------------------------------------------------------
Write-Phase 'Phase 5: verify synced bundle has libhelios.dll'
$bundledLib = Join-Path $destBundle '_internal\pyhelios\pyhelios_build\build\lib\libhelios.dll'
if (-not (Test-Path $bundledLib)) {
  throw "Synced bundle is missing $bundledLib. Check build_binary.ps1's --add-binary flags."
}
Write-Host "  [ok] $bundledLib"

# --- Phase 6: npm install --------------------------------------------------
Write-Phase 'Phase 6: renderer dependencies (npm install)'
if ((Test-Path (Join-Path $repoRoot 'node_modules')) -and -not $Force) {
  Write-Host "  [skip] node_modules\ already exists (pass -Force to reinstall)"
} else {
  & npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
}

Write-Host ""
Write-Host "All set. Run:" -ForegroundColor Green
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Cleanup tip: remove backup bundles from earlier syncs once dev mode boots:" -ForegroundColor DarkGray
Write-Host "  Remove-Item -Recurse -Force .\resources\backend\win\heliosgui_backend.exe.bak.*" -ForegroundColor DarkGray
