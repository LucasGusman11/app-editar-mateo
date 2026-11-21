@echo off
cd /d "%~dp0"
title Editor web
echo.
echo  Abriendo el editor web...
echo  No cierres esta ventana mientras lo uses.
echo.
start "" cmd /c "timeout /t 4 /nobreak >nul & start chrome http://localhost:4000"
npx --yes serve -l 4000 .
