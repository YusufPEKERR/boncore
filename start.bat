@echo off
chcp 65001 >nul
title BonCore POS & Restoran Yonetim Sistemi
color 0b
echo ============================================================
echo   BONCORE POS & RESTORAN YONETIM SISTEMI
echo ============================================================
echo.
set "PATH=C:\Program Files\nodejs;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;C:\Program Files\Git\cmd;%PATH%"
python start_all.py
pause
