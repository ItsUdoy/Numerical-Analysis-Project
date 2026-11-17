@echo off
title Smart Water Tank Simulator - Launcher
color 0B
cls

echo ============================================================
echo        SMART WATER TANK SIMULATOR - AUTO LAUNCHER
echo ============================================================
echo.

:: Detect directory
if exist "package.json" (
    goto :IN_PROJECT_DIR
)

if exist "SMART_WATER_TANK_SIMULATOR\package.json" (
    cd SMART_WATER_TANK_SIMULATOR
    goto :IN_PROJECT_DIR
)

echo [ERROR] Could not locate SMART_WATER_TANK_SIMULATOR directory!
pause
exit /b 1

:IN_PROJECT_DIR
echo [*] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed or not found in system PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [*] First-time setup detected: Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

echo [*] Starting Vite Development Server...
echo [*] Your browser will open automatically at http://localhost:5173
echo.

:: Start the project (Vite automatically opens a single browser tab via server.open)
call npm run dev

pause
