@echo off
title E3 Drying Plant Manager Launcher
echo ==============================================
echo       E3 - DRYING PLANT MANAGER LAUNCHER
echo ==============================================
echo.

:: 1. Check Python
python --version >nul 2>&1
if not errorlevel 1 goto START_PY

py --version >nul 2>&1
if not errorlevel 1 goto START_PY_LAUNCHER

goto NO_PYTHON

:START_PY
echo [1/2] Checking FastAPI ^& Supabase dependencies...
python -c "import uvicorn, supabase" >nul 2>&1
if not errorlevel 1 goto LAUNCH_PY

echo Dependencies missing. Installing from backend\requirements.txt...
python -m pip install -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies. Please run "pip install -r backend\requirements.txt" manually.
    pause
    exit /b
)

:LAUNCH_PY
echo [1/2] Starting FastAPI Backend using Python...
start "E3 Backend" cmd /k "cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
goto EXP_CHECK


:START_PY_LAUNCHER
echo [1/2] Checking FastAPI ^& Supabase dependencies...
py -c "import uvicorn, supabase" >nul 2>&1
if not errorlevel 1 goto LAUNCH_PY_LAUNCHER

echo Dependencies missing. Installing from backend\requirements.txt...
py -m pip install -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies. Please run "pip install -r backend\requirements.txt" manually.
    pause
    exit /b
)

:LAUNCH_PY_LAUNCHER
echo [1/2] Starting FastAPI Backend using Python Launcher (py)...
start "E3 Backend" cmd /k "cd backend && py -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
goto EXP_CHECK


:NO_PYTHON
echo [1/2] ERROR: Python was not found on your system!
echo Please ensure Python 3.11+ is installed.
echo IMPORTANT: Check the box "Add Python to PATH" during installation.
echo.
echo Press any key to open the Python download page...
pause >nul
start https://www.python.org/downloads/
exit /b

:EXP_CHECK
:: 2. Check Frontend
where yarn >nul 2>nul
if not errorlevel 1 goto START_YARN

where npm >nul 2>nul
if not errorlevel 1 goto START_NPM

where npx >nul 2>nul
if not errorlevel 1 goto START_NPX

goto NO_NODE

:START_YARN
echo [2/2] Starting Expo Frontend using Yarn...
if not exist "frontend\node_modules\" (
    echo [2/2] node_modules not found. Installing Yarn dependencies...
    pushd frontend
    call yarn install
    popd
)
start "E3 Frontend" cmd /k "cd frontend && yarn start"
goto END_LAUNCH

:START_NPM
echo [2/2] Yarn not found. Starting Expo Frontend using NPM...
if not exist "frontend\node_modules\" (
    echo [2/2] node_modules not found. Installing NPM dependencies...
    pushd frontend
    call npm install
    popd
)
start "E3 Frontend" cmd /k "cd frontend && npm start"
goto END_LAUNCH

:START_NPX
echo [2/2] Warning: Yarn and NPM commands not found. Trying npx expo start...
start "E3 Frontend" cmd /k "cd frontend && npx expo start"
goto END_LAUNCH

:NO_NODE
echo [2/2] ERROR: Node.js was not found on your system!
echo Please install Node.js (LTS version) to run the Expo Frontend.
echo.
echo Press any key to open the Node.js download page...
pause >nul
start https://nodejs.org/
goto END_LAUNCH

:END_LAUNCH
echo.
echo ==============================================
echo Launcher finished! Both windows should be open.
echo Backend: http://localhost:8001/docs (Swagger UI)
echo Frontend: Metro Bundler running in cmd window.
echo ==============================================
pause
