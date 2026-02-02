@echo off
chcp 65001 >nul
setlocal

:: Ir a la carpeta del proyecto (donde está este script)
cd /d "%~dp0"

echo ========================================
echo   Actualizar y arrancar Garantia SAT
echo ========================================
echo.

:: 1. Actualizar desde Git
echo [1/5] Actualizando desde Git...
git pull
if errorlevel 1 (
  echo AVISO: git pull falló o no hay repositorio. Continuando...
)
echo.

:: 2. Frontend: instalar dependencias y compilar
echo [2/5] Instalando dependencias del frontend...
cd frontend
call npm install
if errorlevel 1 (
  echo ERROR: npm install falló.
  cd ..
  pause
  exit /b 1
)
echo [3/5] Compilando frontend...
call npm run build
if errorlevel 1 (
  echo ERROR: npm run build falló.
  cd ..
  pause
  exit /b 1
)
cd ..
echo.

:: 3. Backend: entorno virtual y dependencias
echo [4/5] Preparando backend...
cd backend
if not exist "venv\Scripts\activate.bat" (
  echo Creando entorno virtual Python...
  python -m venv venv
  if errorlevel 1 (
    echo ERROR: No se pudo crear el entorno virtual. ¿Tienes Python instalado?
    cd ..
    pause
    exit /b 1
  )
)
call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: pip install falló.
  cd ..
  pause
  exit /b 1
)
echo.

:: 4. Arrancar servidor
echo [5/5] Iniciando servidor (puerto 8000)...
echo.
echo   Abre en el navegador: http://localhost:8000
echo   Desde la red: http://[IP-de-este-PC]:8000
echo   Para detener: Ctrl+C
echo.
uvicorn main:app --host 0.0.0.0 --port 8000

cd ..
pause
