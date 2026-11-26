@echo off
chcp 65001 >nul
title BonCore Donanım Köprüsü Kurulumu
color 0A

echo ================================================================
echo         BONCORE DONANIM KÖPRÜSÜ - KURULUM SİHİRBAZI
echo ================================================================
echo.
echo Kurulum sihirbazı başlatılıyor...
echo.

if exist "%~dp0BonCoreDonanimKoprusuSetup.exe" (
    start "" "%~dp0BonCoreDonanimKoprusuSetup.exe"
) else if exist "%~dp0BonCoreAgent.exe" (
    start "" "%~dp0BonCoreAgent.exe"
) else (
    echo [HATA] Kurulum dosyası bulunamadı.
    pause
)

exit
