@echo off
chcp 65001 >nul
setlocal

:: Arrancar Garantia SAT con HTTPS (para que las notificaciones funcionen en todos los equipos)
cd /d "%~dp0"
cd backend

if not exist "key.pem" (
  echo No se encontraron key.pem ni cert.pem.
  echo Genera un certificado autofirmado con OpenSSL:
  echo   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=www.Approx-SAT.com"
  echo.
  echo Ejecuta ese comando en la carpeta backend y vuelve a ejecutar este script.
  pause
  exit /b 1
)
if not exist "cert.pem" (
  echo No se encontró cert.pem. Genera el certificado (ver mensaje anterior).
  pause
  exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
  echo Crea primero el entorno virtual: python -m venv venv
  pause
  exit /b 1
)
call venv\Scripts\activate.bat

echo Iniciando servidor con HTTPS (puerto 8443)...
echo.
echo   Abre en el navegador: https://localhost:8443
echo   Desde la red: https://www.Approx-SAT.com:8443 o https://[IP]:8443
echo   La primera vez acepta el aviso del certificado autofirmado para que funcionen las notificaciones.
echo   Para detener: Ctrl+C
echo.
uvicorn main:app --host 0.0.0.0 --port 8443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem

pause
