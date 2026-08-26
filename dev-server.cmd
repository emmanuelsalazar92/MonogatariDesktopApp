@echo off
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=3000
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port %PORT% > next-dev.log 2> next-dev.err.log
