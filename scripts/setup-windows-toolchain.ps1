#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Installs the C++ build toolchain needed by helios-desktop-backend/pyhelios/build_scripts/build_helios.py.

.DESCRIPTION
  Installs CMake, Visual Studio 2022 Build Tools (with C++ workload + Windows 11 SDK),
  and Ninja via winget. Skips CUDA — pass --nogpu to build_helios.py afterwards.

  Must be run from an ELEVATED PowerShell (Run as Administrator).
#>

$ErrorActionPreference = 'Stop'

# --- 1. Pre-flight checks ----------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "[!] Run this from an elevated PowerShell (right-click Start -> Terminal (Admin))." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host "[!] winget is missing. Install 'App Installer' from the Microsoft Store, then retry." -ForegroundColor Red
  exit 1
}

# --- 2. Install --------------------------------------------------------------
function Install-WingetPackage {
  param(
    [Parameter(Mandatory)] [string]$Id,
    [string[]]$Extra = @()
  )
  Write-Host "==> Installing $Id" -ForegroundColor Cyan
  $cmd = @('install', '--id', $Id, '-e',
           '--accept-source-agreements', '--accept-package-agreements') + $Extra
  & winget @cmd
  # 0 = installed ok; -1978335189 = already installed / no update needed
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
    Write-Host "[!] winget returned $LASTEXITCODE for $Id (continuing)" -ForegroundColor Yellow
  }
}

Install-WingetPackage -Id 'Kitware.CMake'

$vsOverride = @(
  '--quiet --wait --norestart',
  '--add Microsoft.VisualStudio.Workload.VCTools',
  '--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  '--add Microsoft.VisualStudio.Component.Windows11SDK.22621',
  '--includeRecommended'
) -join ' '
Install-WingetPackage -Id 'Microsoft.VisualStudio.2022.BuildTools' -Extra @('--override', $vsOverride)

Install-WingetPackage -Id 'Ninja-build.Ninja'

# --- 3. Refresh PATH inside this process so the verification below works -----
$env:Path = ([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
             [Environment]::GetEnvironmentVariable('Path', 'User'))

# --- 4. Verify ---------------------------------------------------------------
Write-Host ""
Write-Host "==> Verifying tools" -ForegroundColor Cyan

$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if ($cmake) {
  $cmakeVersion = (& cmake --version | Select-Object -First 1)
  Write-Host "  cmake : $($cmake.Source)  ($cmakeVersion)"
} else {
  Write-Host "  cmake : NOT FOUND on PATH" -ForegroundColor Yellow
}

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($vsPath) {
    Write-Host "  MSVC  : $vsPath"
  } else {
    Write-Host "  MSVC  : Build Tools present but C++ workload missing" -ForegroundColor Yellow
  }
} else {
  Write-Host "  MSVC  : vswhere.exe not found" -ForegroundColor Yellow
}

$ninja = Get-Command ninja -ErrorAction SilentlyContinue
if ($ninja) {
  Write-Host "  ninja : $($ninja.Source)"
} else {
  Write-Host "  ninja : NOT FOUND on PATH" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Open a NEW PowerShell window, then run:" -ForegroundColor Green
Write-Host "  cd helios-desktop-backend\pyhelios"
Write-Host "  python build_scripts\build_helios.py --nogpu"
Write-Host "  cd .."
Write-Host "  .\scripts\build_binary.ps1"
