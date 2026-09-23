@echo off
set SCRIPT_DIR=%~dp0
cd /d %SCRIPT_DIR%
if not exist venv\Scripts\python.exe (
  python -m venv venv
)
call venv\Scripts\python -m pip install --upgrade pip
call venv\Scripts\python -m pip install -r "%SCRIPT_DIR%requirements.txt"
set PYTHONPATH=%SCRIPT_DIR%
call venv\Scripts\python -m uvicorn backend.main:backend --reload --host 127.0.0.1 --port 8000 --app-dir .
