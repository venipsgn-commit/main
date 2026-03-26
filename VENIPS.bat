@echo off
title VENIPS - Gestion Commerciale
color 0A

cd /d "%~dp0"

:: Verifier si Node.js est installe
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js non trouve. Lance d'abord INSTALLER.bat
    pause
    exit /b 1
)

:: Verifier si les dependances sont installees
if not exist "node_modules" (
    echo  Installation des dependances...
    call npm install --production
)

:: Demarrer le serveur si pas deja en cours
netstat -an | find "0.0.0.0:3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Serveur deja en cours d'execution
) else (
    echo  Demarrage du serveur VENIPS...
    start "" /min node server.js
    :: Attendre que le serveur soit pret
    timeout /t 3 /nobreak >nul
)

:: Ouvrir dans le navigateur par defaut
echo  Ouverture de VENIPS dans le navigateur...
start "" "http://localhost:3000"

echo.
echo  VENIPS est lance !
echo  Adresse : http://localhost:3000
echo.
echo  NE PAS FERMER CETTE FENETRE pendant que vous utilisez VENIPS.
echo  Pour arreter l'application, fermez cette fenetre.
echo.
echo  Appuyez sur une touche pour fermer le serveur et quitter...
pause >nul

:: Arreter le serveur Node.js
taskkill /f /im node.exe >nul 2>&1
echo  Serveur arrete. Au revoir !
