@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title OrderTrack Pro

echo.
echo ============================================================
echo                    ORDERTRACK PRO
echo ============================================================
echo.

REM ── Rafraichir le PATH ──
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\PostgreSQL\18\bin;%ProgramFiles%\PostgreSQL\17\bin;%ProgramFiles%\PostgreSQL\16\bin;%ProgramFiles%\PostgreSQL\15\bin;%PATH%"

REM ── Verifier si le serveur repond deja (service actif ou autre instance) ──
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 3;if($r.StatusCode -eq 200){exit 0}}catch{};exit 1" >nul 2>&1
if not errorlevel 1 (
    echo OrderTrack Pro est deja en cours d'execution.
    echo Ouverture dans le navigateur...
    start "" "http://localhost:3000"
    timeout /t 3 /nobreak >nul 2>&1
    exit /b 0
)

REM ── Verifier les prerequis minimaux ──
where node >nul 2>&1
if errorlevel 1 (
    echo Installation incomplete. Lancement de setup.bat...
    call "%~dp0setup.bat"
    exit /b !errorlevel!
)
if not exist "node_modules" (
    echo Installation incomplete. Lancement de setup.bat...
    call "%~dp0setup.bat"
    exit /b !errorlevel!
)
if not exist ".next\BUILD_ID" (
    echo Build absent. Lancement de setup.bat...
    call "%~dp0setup.bat"
    exit /b !errorlevel!
)

REM ── Demarrer PostgreSQL si necessaire ──
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object Status -ne 'Running' | Start-Service -ErrorAction SilentlyContinue" >nul 2>&1

REM ── Generer JWT_SECRET si pas encore fait ──
findstr /C:"change-this-to-a-random-secret" ".env" >nul 2>&1
if not errorlevel 1 (
    echo Generation d'une cle JWT securisee...
    for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '.env') -replace 'change-this-to-a-random-secret-string-at-least-32-chars', '%%S' | Set-Content '.env'" >nul 2>&1
    )
    echo [OK] Cle JWT generee.
)

REM ── Determiner l'adresse IP reseau ──
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4" ^| findstr /V "127.0.0.1"') do (
    if not defined LOCAL_IP for /f "tokens=1" %%B in ("%%A") do set "LOCAL_IP=%%B"
)

REM ── Essayer de demarrer via le service Windows (si installe) ──
sc query "OrderTrackPro" >nul 2>&1
if not errorlevel 1 (
    echo Demarrage du service OrderTrack Pro...
    net start "OrderTrackPro" >nul 2>&1
    
    REM Attendre que le serveur reponde
    set "READY=0"
    for /L %%I in (1,1,45) do (
        if !READY! EQU 0 (
            powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{};exit 1" >nul 2>&1
            if not errorlevel 1 (
                set "READY=1"
            ) else (
                timeout /t 1 /nobreak >nul 2>&1
            )
        )
    )
    if !READY! EQU 1 (
        echo.
        echo ============================================================
        echo   OrderTrack Pro demarre [SERVICE WINDOWS]
        echo   Adresse locale  : http://localhost:3000
        if defined LOCAL_IP echo   Adresse reseau  : http://!LOCAL_IP!:3000
        echo   Compte          : admin / admin123
        echo ============================================================
        start "" "http://localhost:3000"
        timeout /t 3 /nobreak >nul 2>&1
        exit /b 0
    )
    echo Le service n'a pas repondu. Demarrage en mode console...
)

REM ── Essayer via la tache planifiee (si installee) ──
schtasks /Query /TN "OrderTrackPro" >nul 2>&1
if not errorlevel 1 (
    echo Demarrage via tache planifiee...
    schtasks /Run /TN "OrderTrackPro" >nul 2>&1
    
    set "READY=0"
    for /L %%I in (1,1,45) do (
        if !READY! EQU 0 (
            powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{};exit 1" >nul 2>&1
            if not errorlevel 1 (
                set "READY=1"
            ) else (
                timeout /t 1 /nobreak >nul 2>&1
            )
        )
    )
    if !READY! EQU 1 (
        echo.
        echo ============================================================
        echo   OrderTrack Pro demarre [TACHE PLANIFIEE]
        echo   Adresse locale  : http://localhost:3000
        if defined LOCAL_IP echo   Adresse reseau  : http://!LOCAL_IP!:3000
        echo   Compte          : admin / admin123
        echo ============================================================
        start "" "http://localhost:3000"
        timeout /t 3 /nobreak >nul 2>&1
        exit /b 0
    )
    echo La tache n'a pas repondu. Demarrage en mode console...
)

REM ── Fallback : mode console (visible, bloquant) ──
REM Ouvrir le navigateur en arriere-plan des que pret
start "OrderTrack Browser" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$ok=$false;1..45|ForEach-Object{if(-not $ok){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process 'http://localhost:3000';$ok=$true}}catch{};if(-not $ok){Start-Sleep -Seconds 1}}};"

echo Demarrage du serveur en mode console...
echo.
echo ============================================================
echo   Adresse locale  : http://localhost:3000
if defined LOCAL_IP echo   Adresse reseau  : http://!LOCAL_IP!:3000
echo   Compte          : admin / admin123
echo ============================================================
echo.
echo ATTENTION: Ne fermez pas cette fenetre.
echo Le serveur s'arretera si cette fenetre est fermee.
echo Pour un fonctionnement permanent, utilisez le service Windows.
echo.

call npx next start -H 0.0.0.0 -p 3000

if errorlevel 1 (
    echo.
    echo Le serveur n'a pas pu demarrer. Relancez setup.bat pour reparer.
    pause
)
exit /b %errorlevel%
