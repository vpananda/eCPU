@echo off
echo Starting E3 Backend...
start "E3 Backend" cmd /k "cd backend && run.bat"

echo Starting E3 Frontend (Android Simulator)...
start "E3 Frontend" cmd /k "cd frontend && npm install && npm start -- --clear"

echo Services are starting in new terminal windows.
