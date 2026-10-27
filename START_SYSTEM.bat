@echo off
title PMI Portfolio Content Management System
color 0A
cd /d "%~dp0"

echo ===============================================================================
echo            PMI PORTFOLIO CONTENT MANAGEMENT SYSTEM
echo ===============================================================================
echo.
echo [1/2] Connecting SQLite database (8 records)...
echo [2/2] Starting server and generating mobile Cloudflare web link...
echo.

node server.js

pause
