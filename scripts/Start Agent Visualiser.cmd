@echo off
setlocal
title Solarlux Agent Visualiser

rem ---------------------------------------------------------------------------
rem Double-click launcher.
rem
rem Serves the PRODUCTION build rather than the dev server: it starts faster, and
rem the dev server's hot reload has nothing to do while nobody is editing code.
rem
rem The app keeps its data in the browser's IndexedDB, which is per ORIGIN, and an
rem origin includes the PORT. 5178 is the same port the dev server uses, so the app
rem and the dev server share one set of fleets instead of each having its own and
rem the data appearing to vanish. Changing PORT hides every fleet already saved -
rem export first if you ever must.
rem
rem --strictPort therefore matters: if the dev server is already on 5178 this fails
rem loudly rather than quietly starting on another port with an empty app.
rem
rem Closing this window stops the server. That is deliberate - it is the only
rem visible sign the app is running.
rem ---------------------------------------------------------------------------

set "PORT=5178"
cd /d "%~dp0.."

where pnpm >nul 2>&1
if errorlevel 1 (
  echo.
  echo   pnpm was not found on PATH.
  echo   Install Node.js and run:  npm install -g pnpm
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   First run - installing dependencies. This happens once.
  call pnpm install --frozen-lockfile || goto :failed
)

rem Rebuild when the build is missing, or when any source file is newer than it.
set "NEEDS_BUILD="
if not exist "dist\index.html" set "NEEDS_BUILD=1"
if not defined NEEDS_BUILD (
  for /f %%F in ('powershell -NoProfile -Command ^
    "$b=(Get-Item 'dist/index.html').LastWriteTime;" ^
    "$n=Get-ChildItem -Path src,index.html,public -Recurse -File -ErrorAction SilentlyContinue |" ^
    "  Where-Object { $_.LastWriteTime -gt $b } | Select-Object -First 1;" ^
    "if ($n) { 'yes' } else { 'no' }"') do set "NEWER=%%F"
  if /i "%NEWER%"=="yes" set "NEEDS_BUILD=1"
)

if defined NEEDS_BUILD (
  echo   Building the app...
  call pnpm build || goto :failed
)

echo.
echo   Solarlux Agent Visualiser is starting on http://localhost:%PORT%
echo   Close this window to stop it.
echo.

start "" "http://localhost:%PORT%"
call pnpm exec vite preview --port %PORT% --strictPort
goto :eof

:failed
echo.
echo   Something went wrong above. The window stays open so you can read it.
echo.
pause
exit /b 1
