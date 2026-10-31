@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Python. Cai Python 3.10+ va chon Add Python to PATH.
  pause
  exit /b 1
)
echo Mo trinh duyet tai http://127.0.0.1:8765
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" server.py
  pause
  exit /b
)
python server.py
pause
