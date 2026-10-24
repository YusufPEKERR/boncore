@echo off
chcp 65001 >nul
title BonCore Donanim Koprusu Kurulumu
color 0A

echo ================================================================
echo         BONCORE DONANIM KOPRUSU - OTOMATIK KURULUM
echo ================================================================
echo.
echo Kurulum yapiliyor, lutfen bekleyiniz...
echo.

set "TARGET_DIR=%LocalAppData%\BonCoreAgent"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

taskkill /F /IM BonCoreAgent.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

copy /Y "%~dp0BonCoreAgent.exe" "%TARGET_DIR%\BonCoreAgent.exe" >nul
copy /Y "%~dp0config.json" "%TARGET_DIR%\config.json" >nul

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "BonCoreAgent" /t REG_SZ /d "\"%TARGET_DIR%\BonCoreAgent.exe\"" /f >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'BonCore Donanim Koprusu.lnk')); $s.TargetPath = '%TARGET_DIR%\BonCoreAgent.exe'; $s.WorkingDirectory = '%TARGET_DIR%'; $s.Save()" >nul 2>&1

start "" "%TARGET_DIR%\BonCoreAgent.exe"

echo.
echo ================================================================
echo  [OK] KURULUM BASARIYLA TAMAMLANDI!
echo ================================================================
echo.
echo  - Uygulama arka planda ve saatin yaninda calismaya basladi.
echo  - Bilgisayar her acildiginda otomatik baslayacaktir.
echo.
ping 127.0.0.1 -n 4 >nul
exit
