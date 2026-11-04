@echo off
chcp 65001 > nul
title POLE CLUB — Servidor de Desarrollo
echo ======================================================================
echo    POLE CLUB — Servidor Full Stack & Plataforma de Validacion PMV
echo ======================================================================
echo.
echo  Iniciando servidor local...
echo  - Landing Page: http://localhost:3000
echo  - Panel Admin:  http://localhost:3000/admin
echo  - Clave Admin:  poleclub2026
echo.
echo  Presiona Ctrl+C para detener el servidor en cualquier momento.
echo ======================================================================

start http://localhost:3000

"C:\Users\luceg\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js

pause
