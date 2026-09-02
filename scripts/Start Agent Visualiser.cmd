@echo off
setlocal enabledelayedexpansion
title Solarlux Agent Visualiser

rem ---------------------------------------------------------------------------
rem Double-click launcher.
rem
rem Needs ONLY node. It used to call `pnpm exec vite preview`, which failed with
rem "pnpm was not found on PATH" when launched from Explorer: a double-clicked
rem shortcut gets a different environment from a developer shell. The app is now
rem served by scripts/serve.mjs, which has no dependencies, and node is found by
rem probing the usual install locations rather than trusting PATH.
rem
rem PORT is pinned to 5178, the same port as `pnpm dev`. The app keeps its fleets
rem in the browser's IndexedDB, which is scoped to the origin - and an origin
rem includes the port - so a different port would open an empty app with every
rem fleet apparently gone. Export before ever changing it.
rem
rem Closing this window stops the server.
rem ---------------------------------------------------------------------------

set "PORT=5178"
cd /d "%~dp0.."

rem ---- find node -----------------------------------------------------------
set "NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE set "NODE=%%N"

if not defined NODE (
  for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%LOCALAPPDATA%\Volta\bin\node.exe"
    "%APPDATA%\nvm\node.exe"
    "%ProgramData%\nvm\node.exe"
  ) do if not defined NODE if exist "%%~P" set "NODE=%%~P"
)

if not defined NODE (
  echo.
  echo   Node.js was not found on this machine.
  echo   Install it from https://nodejs.org  then double-click this again.
  echo.
  pause
  exit /b 1
)

rem ---- dependencies (only needed to BUILD, not to run) ---------------------
if not exist "node_modules\vite" (
  echo   First run - installing dependencies. This takes a few minutes, once.
  set "PM="
  for /f "delims=" %%P in ('where pnpm 2^>nul') do if not defined PM set "PM=%%P"
  if not defined PM if exist "%APPDATA%\npm\pnpm.cmd" set "PM=%APPDATA%\npm\pnpm.cmd"

  if defined PM (
    call "!PM!" install --frozen-lockfile || goto :failed
  ) else (
    set "NPM="
    for /f "delims=" %%P in ('where npm 2^>nul') do if not defined NPM set "NPM=%%P"
    if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
    if not defined NPM (
      echo   Neither pnpm nor npm was found, so dependencies cannot be installed.
      goto :failed
    )
    call "!NPM!" install || goto :failed
  )
)

rem ---- build when the sources are newer than the last build ----------------
set "NEEDS_BUILD="
if not exist "dist\index.html" set "NEEDS_BUILD=1"
if not defined NEEDS_BUILD (
  for /f %%F in ('powershell -NoProfile -Command ^
    "$b=(Get-Item 'dist/index.html').LastWriteTime;" ^
    "$n=Get-ChildItem -Path src,index.html,public -Recurse -File -ErrorAction SilentlyContinue |" ^
    "  Where-Object { $_.LastWriteTime -gt $b } | Select-Object -First 1;" ^
    "if ($n) { 'yes' } else { 'no' }"') do set "NEWER=%%F"
  if /i "!NEWER!"=="yes" set "NEEDS_BUILD=1"
)

if defined NEEDS_BUILD (
  echo   Building the app...
  "%NODE%" "node_modules\vite\bin\vite.js" build || goto :failed
)

rem ---- serve, and open the browser ----------------------------------------
start "" "http://localhost:%PORT%"
"%NODE%" "scripts\serve.mjs" %PORT%
goto :eof

:failed
echo.
echo   Something went wrong above. The window stays open so you can read it.
echo.
pause
exit /b 1
