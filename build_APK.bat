@echo off
title eCPU App Build Launcher
echo =====================================================================
echo    eCPU App Builder - Offline APK and iOS Prep Tool
echo =====================================================================
echo.
echo  This tool will:
echo  1. Stop any background Gradle/Java daemons to release locked files
echo  2. Configure JDK 17 and Android SDK environments
echo  3. Compile release APK locally via Gradle
echo  4. Save outputs to Output/android/v[version]/
echo.
echo =====================================================================
echo.

:: 1. Force kill any hung background Java / Gradle daemons
echo [INFO] Stopping any hung background Java processes...
taskkill /F /IM java.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: 2. Set JDK 17
if exist "%~dp0jdk17\jdk-17.0.20.1+1" (
    set "JAVA_HOME=%~dp0jdk17\jdk-17.0.20.1+1"
    set "PATH=%~dp0jdk17\jdk-17.0.20.1+1\bin;%PATH%"
    echo [INFO] Configured JAVA_HOME to project OpenJDK 17
)

:: 3. Set Android SDK
if exist "%~dp0android-sdk" (
    set "ANDROID_HOME=%~dp0android-sdk"
    set "ANDROID_SDK_ROOT=%~dp0android-sdk"
    echo [INFO] Configured ANDROID_HOME to project Android SDK
)

:: 4. Memory settings for modern Gradle + Kotlin + React Native
set "GRADLE_OPTS=-Xmx3072m -XX:MaxMetaspaceSize=1024m -XX:+UseG1GC"

cd /d "%~dp0frontend"
node scripts\build-apps.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Please verify Java JDK 17 and Android SDK setups.
) else (
    echo.
    echo [SUCCESS] Build process completed successfully!
)

echo.
pause

