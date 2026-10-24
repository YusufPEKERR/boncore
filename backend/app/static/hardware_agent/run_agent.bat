@echo off
title BonCore Yerel Donanim Ajani
color 0A
echo ================================================================
echo               BONCORE YEREL DONANIM AJANI v1.0
echo ================================================================
echo.
echo Bu pencere acik oldugu surece BonCore POS siteniz
echo dukkaninizdaki CAS CL-3000 terazisine ve yerel yazicilara baglanabilir.
echo.
echo Ajan baslatiliyor (127.0.0.1:9099)...
echo.
python boncore_agent.py
if %errorlevel% neq 0 (
    echo.
    echo [HATA] Python bulunamadi veya bir hata olustu.
    echo Lutfen bilgisayarinizda Python yuklu oldugundan emin olunuz.
    pause
)
pause
