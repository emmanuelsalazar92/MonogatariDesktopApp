@echo off
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=3000
cd /d "%~dp0"
npm.cmd run dev -- --port %PORT% > next-dev.log 2> next-dev.err.log
