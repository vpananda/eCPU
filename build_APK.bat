@echo off
title eCPU App Build Launcher
echo =====================================================================
echo    eCPU Cardio App Builder - Offline APK & iOS Prep Tool
echo =====================================================================
echo.
echo  This tool will:
echo  1. Stop any background Gradle/Java daemons to release locked files
echo  2. Wipe old native directories to guarantee a clean build
echo  3. Parse frontend/package.json to find version
echo  4. Generate native android & ios projects (expo prebuild)
echo  5. Compile release APK locally via Gradle
echo  6. Save outputs to Output/android/v[version]/
echo.
echo =====================================================================
echo.

echo [INFO] Stopping background Java/Gradle daemons...
taskkill /F /IM java.exe >nul 2>nul

echo [INFO] Cleaning native android & ios build directories...
if exist "%~dp0\frontend\android" rd /s /q "%~dp0\frontend\android"
if exist "%~dp0\frontend\ios" rd /s /q "%~dp0\frontend\ios"

cd /d "%~dp0\frontend"
node scripts\build-apps.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Please verify Java JDK 17 and Android SDK setups.
) else (
    echo.
    echo [SUCCESS] Build process completed successfully.
)

echo.
pause
