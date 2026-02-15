#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generando certificado HTTPS con SAN (Subject Alternative Name)..."
echo ""

if [[ ! -f openssl-san.cnf ]]; then
  echo "Error: No se encuentra openssl-san.cnf en esta carpeta."
  exit 1
fi

if ! openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -config openssl-san.cnf -extensions v3_req; then
  echo ""
  echo "Error al generar el certificado. Comprueba que OpenSSL está instalado."
  echo "En Linux: sudo apt install openssl   (Debian/Ubuntu)  o  sudo dnf install openssl   (Fedora)"
  echo "En macOS: OpenSSL suele venir con Xcode Command Line Tools."
  exit 1
fi

echo ""
echo "Listo: key.pem y cert.pem generados con SAN para www.Approx-SAT.com, localhost, etc."
echo "En cada equipo cliente ejecuta el script \"Instalar certificado\" con cert.pem para que el navegador lo marque como seguro."
echo ""
