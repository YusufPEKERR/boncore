@echo off
chcp 65001 >nul
title BonCore Donanım Köprüsü Kurulumu
color 0A

echo ================================================================
echo         BONCORE DONANIM KÖPRÜSÜ - GÜVENLİ KURULUM
echo ================================================================
echo.
echo Windows SmartScreen engeli kaldırılıyor ve sertifika onaylanıyor...

:: 1. Mark-of-the-Web (Zone.Identifier) engelini kaldir (SmartScreen'i sifirlar)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File" >nul 2>&1

:: 2. BonCore Guvenlik Sertifikasini guvenilen yayimcilara ekle
if exist "%~dp0BonCoreCertificate.cer" (
    certutil -addstore -f "TrustedPublisher" "%~dp0BonCoreCertificate.cer" >nul 2>&1
    certutil -addstore -f "Root" "%~dp0BonCoreCertificate.cer" >nul 2>&1
)

echo.
echo Kurulum sihirbazi baslatiliyor...
echo.

:: 3. Setup sihirbazini baslat
if exist "%~dp0BonCoreDonanimKoprusuSetup.exe" (
    start "" "%~dp0BonCoreDonanimKoprusuSetup.exe"
) else if exist "%~dp0BonCoreAgent.exe" (
    start "" "%~dp0BonCoreAgent.exe"
)

exit
