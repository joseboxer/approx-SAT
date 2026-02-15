#!/usr/bin/env bash
set -e

# Ir a la carpeta del proyecto (donde está este script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Actualizar y arrancar Garantia SAT"
echo "========================================"
echo ""

# 1. Actualizar desde Git
echo "[1/5] Actualizando desde Git..."
git pull || echo "AVISO: git pull falló o no hay repositorio. Continuando..."
echo ""

# 2. Frontend: instalar dependencias y compilar
echo "[2/5] Instalando dependencias del frontend..."
cd frontend
npm install
echo "[3/5] Compilando frontend..."
npm run build
cd ..
echo ""

# 3. Backend: entorno virtual y dependencias
echo "[4/5] Preparando backend..."
cd backend
if [[ ! -f venv/bin/activate ]]; then
  echo "Creando entorno virtual Python..."
  python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
echo ""

# 4. Arrancar servidor (HTTPS si hay certificados, si no HTTP)
echo "[5/5] Iniciando servidor..."
if [[ -f key.pem && -f cert.pem ]]; then
  echo "  Modo HTTPS (puerto 443, por defecto). Certificados encontrados."
  echo "  IMPORTANTE: Ejecuta este script con sudo para usar el puerto 443."
  echo ""
  echo "  Abre en el navegador: https://localhost"
  echo "  Desde la red: https://www.Approx-SAT.com o https://[IP]"
  echo "  Para detener: Ctrl+C"
  echo ""
  exec uvicorn main:app --host 0.0.0.0 --port 443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem
else
  echo "  Modo HTTP (puerto 8000). Para HTTPS, genera key.pem y cert.pem en backend."
  echo ""
  echo "  Abre en el navegador: http://localhost:8000"
  echo "  Desde la red: http://[IP-de-este-PC]:8000"
  echo "  Para detener: Ctrl+C"
  echo ""
  exec uvicorn main:app --host 0.0.0.0 --port 8000
fi
