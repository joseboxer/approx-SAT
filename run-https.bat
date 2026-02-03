@echo off
chcp 65001 >nul
setlocal

:: Arrancar Garantia SAT con HTTPS (para que las notificaciones funcionen en todos los equipos)
cd /d "%~dp0"
cd backend

if not exist "key.pem" goto :no_cert
if not exist "cert.pem" goto :no_cert
goto :run

:no_cert
echo No se encontraron key.pem y cert.pem en la carpeta backend.
echo.
echo Genera un certificado con SAN ^(necesario para que el navegador lo marque como seguro^):
echo   Ejecuta en esta carpeta: generate-cert.bat
echo   O con OpenSSL: openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -config openssl-san.cnf -extensions v3_req
echo.
pause
exit /b 1

:run
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
echo   La primera vez acepta el aviso del certificado autofirmado.
echo   Para detener: Ctrl+C
echo.
uvicorn main:app --host 0.0.0.0 --port 8443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem

pause
