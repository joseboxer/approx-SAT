@echo off
chcp 65001 >nul
:: Instalar certificado HTTPS (cert.pem) en el equipo cliente para confiar en el servidor Garantia SAT.
:: Ejecutar como administrador: clic derecho -> Ejecutar como administrador.
:: Coloca cert.pem (desde la carpeta backend del servidor) en la misma carpeta que este .bat.

cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

set "CERT="
if exist "cert.pem" set "CERT=cert.pem"
if not defined CERT if exist "cert.cer" set "CERT=cert.cer"

if not defined CERT (
  echo No se encontró cert.pem ni cert.cer en esta carpeta.
  echo.
  echo Copia cert.pem desde la carpeta backend del servidor
  echo a la misma carpeta donde está este script y vuelve a ejecutarlo.
  echo.
  pause
  exit /b 1
)

echo Instalando certificado en Autoridades de certificación raíz de confianza...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pem = Get-Content -Path '%CERT%' -Raw -ErrorAction Stop; $b64 = $pem -replace '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r?\n',''; $bytes = [System.Convert]::FromBase64String($b64); $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,$bytes); $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine'); $store.Open('ReadWrite'); $store.Add($cert); $store.Close()"
if %errorLevel% equ 0 (
  echo.
  echo Listo. El navegador ya no mostrará avisos de seguridad para este servidor
  echo y las notificaciones funcionarán.
) else (
  echo.
  echo Error al instalar. Comprueba que ejecutaste como administrador
  echo y que cert.pem es un certificado válido.
)
echo.
pause
