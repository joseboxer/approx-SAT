@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Generando certificado HTTPS con SAN ^(Subject Alternative Name^)...
echo.

if not exist "openssl-san.cnf" (
  echo Error: No se encuentra openssl-san.cnf en esta carpeta.
  pause
  exit /b 1
)

openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -config openssl-san.cnf -extensions v3_req
if errorlevel 1 (
  echo.
  echo Error al generar el certificado. Comprueba que OpenSSL está instalado.
  echo OpenSSL viene con Git for Windows o instala Win64 OpenSSL.
  pause
  exit /b 1
)

echo.
echo Listo: key.pem y cert.pem generados con SAN para www.Approx-SAT.com, localhost, etc.
echo En cada equipo cliente ejecuta el script "Instalar certificado" con cert.pem para que el navegador lo marque como seguro.
echo.
pause
