param(
    [string]$SpecPath = "packaging/t8-backend.spec"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$venvDir = Join-Path $root ".venv-build"
$python = Join-Path $venvDir "Scripts\python.exe"
$pyinstaller = Join-Path $venvDir "Scripts\pyinstaller.exe"

Set-Location $root

if (-not (Test-Path $python)) {
    $systemPython = Get-Command python -ErrorAction Stop
    & $systemPython.Source -m venv $venvDir
}

& $python -m pip install --upgrade pip
& $python -m pip install -r requirements.txt
& $pyinstaller --clean --noconfirm $SpecPath
