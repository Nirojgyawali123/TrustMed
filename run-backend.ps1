$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location $scriptDir

$venvPath = Join-Path $scriptDir 'venv'
$pythonExe = Join-Path $venvPath 'Scripts\python.exe'

if (-not (Test-Path $pythonExe)) {
  python -m venv $venvPath
}

& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r "$scriptDir\requirements.txt"
$env:PYTHONPATH = $scriptDir
& $pythonExe -m uvicorn backend.main:backend --reload --host 127.0.0.1 --port 8000 --app-dir .
