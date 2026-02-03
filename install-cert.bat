@echo off
chcp 65001 >nul
:: Instalar certificado HTTPS (cert.pem) en el equipo cliente para confiar en el servidor Garantia SAT.
:: Ejecutar como administrador: clic derecho en el archivo -> Ejecutar como administrador.
:: Coloca cert.pem (copiado desde la carpeta backend del servidor) en la misma carpeta que este .bat.

set "DIR=%~dp0"
set "CERT="
if exist "%DIR%cert.pem" set "CERT=%DIR%cert.pem"
if not defined CERT if exist "%DIR%cert.cer" set "CERT=%DIR%cert.cer"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

if not defined CERT (
  echo No se encontró cert.pem ni cert.cer en esta carpeta.
  echo.
  echo Copia el archivo cert.pem desde la carpeta backend del servidor
  echo donde corre Garantia SAT a la misma carpeta donde está este script,
  echo y vuelve a ejecutarlo como administrador.
  echo.
  pause
  exit /b 1
)

echo Instalando certificado en Autoridades de certificación raíz de confianza...
certutil -addstore "Root" "%CERT%"
if %errorLevel% equ 0 (
  echo.
  echo Certificado instalado correctamente. Puedes cerrar el aviso del navegador
  echo al acceder por HTTPS y las notificaciones funcionarán.
) else (
  echo.
  echo Error al instalar. Comprueba que ejecutaste como administrador.
)
echo.
pause
