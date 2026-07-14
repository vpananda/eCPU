@echo off
title eCPU App Build Launcher
echo =====================================================================
echo    eCPU Cardio App Builder - Offline APK & iOS Prep Tool
echo =====================================================================
echo.
echo  This tool will:
echo  1. Parse frontend/package.json to find version
echo  2. Generate native android & ios projects (expo prebuild)
echo  3. Compile release APK locally via Gradle
echo  4. Save outputs to Output/android/v[version]/
echo.
echo =====================================================================
echo.

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
