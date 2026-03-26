@echo off
title VENIPS - Installation
color 0A
echo.
echo  =============================================
echo   VENIPS - Installation
echo  =============================================
echo.

:: Verifier si Node.js est installe
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js n'est pas installe sur cet ordinateur.
    echo.
    echo  1. Ouvre ton navigateur
    echo  2. Va sur : https://nodejs.org
    echo  3. Clique sur "LTS" pour telecharger
    echo  4. Installe-le normalement
    echo  5. Relance ce fichier INSTALLER.bat
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)

echo  [OK] Node.js detecte
echo.
echo  Installation des dependances...
cd /d "%~dp0"
call npm install --production
if %errorlevel% neq 0 (
    echo  [ERREUR] Echec de l'installation
    pause
    exit /b 1
)

echo.
echo  =============================================
echo   Installation terminee avec succes !
echo   Lance VENIPS.bat pour demarrer l'application
echo  =============================================
echo.
pause
