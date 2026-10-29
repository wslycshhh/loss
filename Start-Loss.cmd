@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Preview dependencies are missing. Run npm ci in this folder first.
  echo For a ready-built offline copy, open dist\offline.html directly.
  pause
  exit /b 1
)
if not exist "dist\offline.html" (
  echo Build output is missing. Run npm run build first.
  pause
  exit /b 1
)
echo Opening http://127.0.0.1:4175/offline.html
echo Keep this window open while using the local preview. Ctrl+C stops it.
node "node_modules\vite\bin\vite.js" preview --host 127.0.0.1 --port 4175 --strictPort --open /offline.html
if errorlevel 1 pause
