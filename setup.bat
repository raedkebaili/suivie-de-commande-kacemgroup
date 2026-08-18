@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Installation - OrderTrack Pro

REM ============================================================================
REM OrderTrack Pro - Installation Windows en un clic
REM Double-cliquer sur setup.bat. Le script installe les prerequis manquants,
REM prepare PostgreSQL, installe l'application et la lance dans le navigateur.
REM ============================================================================

REM Demander automatiquement les droits administrateur.
net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Demande des droits administrateur...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c','""%~f0""' -Verb RunAs"
    exit /b
)

echo.
echo ============================================================
echo             ORDERTRACK PRO - INSTALLATION WINDOWS
echo ============================================================
echo.

REM Winget est fourni avec App Installer sur Windows 10/11.
where winget >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Windows Package Manager ^(winget^) est introuvable.
    echo Installez "App Installer" depuis le Microsoft Store, puis relancez ce fichier.
    start "" "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    pause
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM 1. Node.js LTS
REM ---------------------------------------------------------------------------
echo [1/8] Verification de Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js absent. Installation automatique de Node.js LTS...
    winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 goto :install_error
)

REM Rafraichir le PATH apres une installation Winget.
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\PostgreSQL\17\bin;%ProgramFiles%\PostgreSQL\16\bin;%ProgramFiles%\PostgreSQL\15\bin;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Node.js a ete installe mais n'est pas encore accessible.
    echo Fermez cette fenetre puis double-cliquez de nouveau sur setup.bat.
    pause
    exit /b 1
)
for /f "delims=" %%V in ('node --version') do echo [OK] Node.js %%V

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] npm est introuvable. Reinstallez Node.js LTS.
    pause
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM 2. PostgreSQL
REM ---------------------------------------------------------------------------
echo.
echo [2/8] Verification de PostgreSQL...
call :find_postgres
if not defined PSQL_EXE (
    echo PostgreSQL absent. Installation automatique de PostgreSQL 17...
    winget install --id PostgreSQL.PostgreSQL.17 --exact --accept-package-agreements --accept-source-agreements --override "--mode unattended --unattendedmodeui none --superpassword postgres --serverport 5432"
    if errorlevel 1 goto :install_error
    call :find_postgres
)
if not defined PSQL_EXE (
    echo [ERREUR] PostgreSQL a ete installe mais ses outils sont introuvables.
    echo Redemarrez Windows, puis relancez setup.bat.
    pause
    exit /b 1
)
echo [OK] PostgreSQL trouve dans %PG_BIN%

REM Essayer de demarrer le service PostgreSQL s'il est arrete.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object Status -ne 'Running' | Start-Service -ErrorAction SilentlyContinue" >nul 2>&1

REM ---------------------------------------------------------------------------
REM 3. Configuration
REM ---------------------------------------------------------------------------
echo.
echo [3/8] Preparation de la configuration...
if not exist ".env.example" (
    echo [ERREUR] Le fichier .env.example est absent.
    pause
    exit /b 1
)
if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    REM Generer automatiquement un JWT_SECRET securise
    for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '.env') -replace 'change-this-to-a-random-secret-string-at-least-32-chars', '%%S' | Set-Content '.env'"
    )
    echo [OK] Fichier .env cree avec cle JWT securisee.
) else (
    echo [OK] Fichier .env existant conserve.
)
if not exist "backups" mkdir backups

REM Lire DATABASE_URL sans supposer le nom de la base.
set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_USER=postgres"
set "DB_PASSWORD=postgres"
set "DB_NAME=otp_db"
for /f "tokens=1,* delims==" %%A in ('node -e "const fs=require('fs');const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find(x=>x.trim().startsWith('DATABASE_URL='));if(line){const u=new URL(line.slice(line.indexOf('=')+1).trim());console.log('DB_HOST='+u.hostname);console.log('DB_PORT='+(u.port||'5432'));console.log('DB_USER='+decodeURIComponent(u.username));console.log('DB_PASSWORD='+decodeURIComponent(u.password));console.log('DB_NAME='+u.pathname.replace(/^\//,''));}"') do set "%%A=%%B"

REM ---------------------------------------------------------------------------
REM 4. Base de donnees
REM ---------------------------------------------------------------------------
echo.
echo [4/8] Preparation de la base PostgreSQL "%DB_NAME%"...
set "PGPASSWORD=%DB_PASSWORD%"
"%PSQL_EXE%" -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d postgres -tAc "SELECT 1" >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Connexion PostgreSQL impossible.
    echo La configuration attend l'utilisateur "%DB_USER%" avec le mot de passe defini dans .env.
    echo Pour l'installation automatique par defaut, le mot de passe est: postgres
    echo Si PostgreSQL existait deja, adaptez DATABASE_URL dans .env puis relancez.
    set "PGPASSWORD="
    pause
    exit /b 1
)

"%PSQL_EXE%" -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" | findstr /x /c:"1" >nul
if errorlevel 1 (
    echo Creation de la base "%DB_NAME%"...
    "%CREATEDB_EXE%" -h "%DB_HOST%" -p "%DB_PORT%" -U "%DB_USER%" "%DB_NAME%"
    if errorlevel 1 (
        echo [ERREUR] Impossible de creer la base "%DB_NAME%".
        set "PGPASSWORD="
        pause
        exit /b 1
    )
)
echo [OK] Base de donnees disponible.
set "PGPASSWORD="

REM ---------------------------------------------------------------------------
REM 5. Dependances npm
REM ---------------------------------------------------------------------------
echo.
echo [5/8] Installation des dependances de l'application...
call npm install
if errorlevel 1 goto :npm_error
echo [OK] Dependances installees.

REM ---------------------------------------------------------------------------
REM 6. Schema Drizzle
REM ---------------------------------------------------------------------------
echo.
echo [6/8] Creation/mise a jour des tables PostgreSQL...
call npx drizzle-kit push
if errorlevel 1 (
    echo [ERREUR] L'application n'a pas pu appliquer le schema PostgreSQL.
    pause
    exit /b 1
)
echo [OK] Schema applique.

REM ---------------------------------------------------------------------------
REM 7. Build de production
REM ---------------------------------------------------------------------------
echo.
echo [7/8] Construction de l'application ^(cela peut prendre quelques minutes^) ...
call npm run build
if errorlevel 1 (
    echo [ERREUR] La construction de l'application a echoue.
    pause
    exit /b 1
)
echo [OK] Application construite.

REM Creer un raccourci Bureau vers le lanceur leger.
echo.
echo [8/8] Creation du raccourci et lancement...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\OrderTrack Pro.lnk');$s.TargetPath='%~dp0start-ordertrack.bat';$s.WorkingDirectory='%~dp0';$s.Description='Lancer OrderTrack Pro';$s.Save()" >nul 2>&1
echo [OK] Raccourci "OrderTrack Pro" cree sur le Bureau.

echo.
echo ============================================================
echo Installation terminee.
echo Adresse      : http://localhost:3000
echo Compte       : admin
echo Mot de passe : admin123
echo Pour arreter : fermer la fenetre du serveur.
echo ============================================================
echo.
call "%~dp0start-ordertrack.bat"
exit /b %errorlevel%

:find_postgres
set "PG_BIN="
set "PSQL_EXE="
set "CREATEDB_EXE="
for %%V in (18 17 16 15 14) do (
    if not defined PSQL_EXE if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" (
        set "PG_BIN=%ProgramFiles%\PostgreSQL\%%V\bin"
        set "PSQL_EXE=%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe"
        set "CREATEDB_EXE=%ProgramFiles%\PostgreSQL\%%V\bin\createdb.exe"
    )
)
if not defined PSQL_EXE (
    for /f "delims=" %%P in ('where psql 2^>nul') do if not defined PSQL_EXE (
        set "PSQL_EXE=%%P"
        for %%D in ("%%~dpP.") do set "PG_BIN=%%~fD"
    )
)
if defined PG_BIN if not defined CREATEDB_EXE set "CREATEDB_EXE=%PG_BIN%\createdb.exe"
exit /b 0

:install_error
echo.
echo [ERREUR] L'installation automatique d'un prerequis a echoue.
echo Verifiez votre connexion Internet et les messages Winget ci-dessus.
pause
exit /b 1

:npm_error
echo.
echo [ERREUR] npm install a echoue. Verifiez votre connexion Internet.
pause
exit /b 1
