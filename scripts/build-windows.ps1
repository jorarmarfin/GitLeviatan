<#
.SYNOPSIS
  Compila GitLeviatan en Windows y genera el instalador con Inno Setup.

.DESCRIPTION
  1. pnpm install y `pnpm tauri build --no-bundle` (solo el .exe, sin NSIS).
  2. Compila installer\windows\gitleviatan.iss con ISCC.
  El instalador queda en dist-installer\GitLeviatan_<version>_x64-inno-setup.exe

  Requisitos: Node 24+, pnpm 10+, Rust (toolchain msvc con Visual Studio Build Tools),
  Git for Windows e Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php).

.PARAMETER Check
  Ejecuta antes lint, formato y tests (frontend y Rust).

.PARAMETER SkipBuild
  No recompila: reutiliza src-tauri\target\release\gitleviatan.exe.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
  powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Check
#>
param(
  [switch]$Check,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Need([string]$name, [string]$hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Falta '$name' en el PATH. $hint"
  }
}

# Los comandos nativos no lanzan excepción por sí solos: se comprueba el código de salida.
function Run([string]$exe, [string[]]$arguments) {
  Write-Host "==> $exe $($arguments -join ' ')" -ForegroundColor Cyan
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe terminó con código $LASTEXITCODE" }
}

function Find-Iscc {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
  )
  foreach ($path in $candidates) { if (Test-Path $path) { return $path } }
  throw "No se encontró Inno Setup (ISCC.exe). Instálalo desde https://jrsoftware.org/isdl.php o añade su carpeta al PATH."
}

Need pnpm "Instálalo con: npm install -g pnpm"
Need cargo "Instala Rust desde https://rustup.rs"
Need git "Instala Git for Windows desde https://git-scm.com/download/win"
$iscc = Find-Iscc

$version = (Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
$exe = Join-Path $root "src-tauri\target\release\gitleviatan.exe"

if ($Check) {
  Run pnpm @("install", "--frozen-lockfile")
  Run pnpm @("lint")
  Run pnpm @("format:check")
  Run pnpm @("test")
  Run cargo @("fmt", "--manifest-path", "src-tauri\Cargo.toml", "--check")
  Run cargo @("clippy", "--manifest-path", "src-tauri\Cargo.toml", "--all-targets", "--", "-D", "warnings")
  Run cargo @("test", "--manifest-path", "src-tauri\Cargo.toml")
}

if (-not $SkipBuild) {
  Run pnpm @("install", "--frozen-lockfile")
  Run pnpm @("tauri", "build", "--no-bundle")
}
if (-not (Test-Path $exe)) { throw "No existe $exe. Ejecuta sin -SkipBuild." }

$outDir = Join-Path $root "dist-installer"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Run $iscc @(
  "/Qp",
  "/DAppVersion=$version",
  "/DSourceExe=$exe",
  "/DRepoRoot=$root",
  "/O$outDir",
  "installer\windows\gitleviatan.iss"
)

$setup = Get-ChildItem $outDir -Filter "GitLeviatan_${version}_*setup.exe" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Instalador: $($setup.FullName)" -ForegroundColor Green
Write-Host "No está firmado: SmartScreen mostrará un aviso (Más información > Ejecutar de todas formas)."
