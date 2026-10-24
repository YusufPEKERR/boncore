@echo off
chcp 65001 >nul
title BonCore Donanım Köprüsü Otomatik Kurulum
color 0A

echo ================================================================
echo         BONCORE DONANIM KÖPRÜSÜ - OTOMATİK KURULUM
echo ================================================================
echo.
echo Bu kurulum:
echo  1. Uygulamayı güvenli sistem klasörünüze yükler.
echo  2. Masaüstünüze "BonCore Donanım Köprüsü" kısayolu ekler.
echo  3. Bilgisayarınız her açıldığında arka planda otomatik başlatır.
echo.
echo Lütfen bekleyiniz, kuruluyor...
echo.

set TARGET_DIR=%LocalAppData%\BonCoreAgent
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

copy /Y "%~dp0BonCoreAgent.exe" "%TARGET_DIR%\" >nul
copy /Y "%~dp0config.json" "%TARGET_DIR%\" >nul

:: Windows Açılışına Otomatik Ekle (Registry)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "BonCoreAgent" /t REG_SZ /d "\"%TARGET_DIR%\BonCoreAgent.exe\"" /f >nul

:: Masaüstüne Kısayol Oluştur (VBScript ile)
set VBS_SCRIPT=%TEMP%\create_boncore_shortcut.vbs
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\BonCore Donanım Köprüsü.lnk" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%TARGET_DIR%\BonCoreAgent.exe" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%TARGET_DIR%" >> "%VBS_SCRIPT%"
echo oLink.Description = "BonCore POS Donanım Köprüsü" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"
cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" >nul 2>&1

:: Uygulamayı Şimdi Başlat
start "" "%TARGET_DIR%\BonCoreAgent.exe"

echo ================================================================
echo  ✅ KURULUM BAŞARIYLA TAMAMLANDI!
echo ================================================================
echo.
echo  • Uygulama saatin yanındaki simgeler alanına yerleşti.
echo  • Bilgisayarınızı yeniden başlatsanız dahi otomatik açılacaktır.
echo  • POS web ekranınız artık dükkandaki teraziyi doğrudan görecektir.
echo.
timeout /t 3 >nul
exit
