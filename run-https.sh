#!/usr/bin/env bash
set -e

# Arrancar Garantia SAT con HTTPS (para que las notificaciones funcionen en todos los equipos)
# Resolver ruta del script de forma robusta (Linux: readlink -f; symlinks y ejecución desde cualquier sitio)
SOURCE="${BASH_SOURCE[0]}"
if command -v readlink &>/dev/null && readlink -f "$SOURCE" &>/dev/null; then
  SCRIPT_DIR="$(dirname "$(readlink -f "$SOURCE")")"
else
  SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
fi
BACKEND_DIR="$SCRIPT_DIR/backend"
cd "$BACKEND_DIR"

if [[ ! -f key.pem || ! -f cert.pem ]]; then
  echo "Buscando certificados en: $BACKEND_DIR"
  echo "No se encontraron key.pem y cert.pem en la carpeta backend."
  echo ""
  echo "Genera un certificado con SAN (necesario para que el navegador lo marque como seguro):"
  echo "  Desde backend: ./generate-cert.sh   (Linux/Mac)  o  generate-cert.bat   (Windows)"
  echo "  O con OpenSSL: openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -config openssl-san.cnf -extensions v3_req"
  echo ""
  exit 1
fi

if [[ ! -f venv/bin/activate ]]; then
  echo "Crea primero el entorno virtual: python3 -m venv venv"
  exit 1
fi
source venv/bin/activate

echo "Iniciando servidor con HTTPS (puerto 443, por defecto)..."
echo "  IMPORTANTE: Ejecuta este script con sudo para usar el puerto 443."
echo ""
echo "  Abre en el navegador: https://localhost"
echo "  Desde la red: https://www.Approx-SAT.com o https://[IP]"
echo "  Para detener: Ctrl+C"
echo ""
exec uvicorn main:app --host 0.0.0.0 --port 443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem
