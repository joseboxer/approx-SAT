# Despliegue en Windows (red local)

Para que cualquier ordenador de la red pueda acceder a la aplicación desde un servidor Windows.

## 1. Requisitos en el Windows

- **Python 3** (con pip): [python.org](https://www.python.org/downloads/)
- **Node.js** (solo para compilar el frontend una vez): [nodejs.org](https://nodejs.org/)

## 2. Compilar el frontend (solo una vez)

Desde la carpeta del proyecto en Windows:

```cmd
cd frontend
npm install
npm run build
cd ..
```

Esto genera la carpeta `frontend\dist` con la aplicación lista para producción. Esa carpeta es la que sirve el backend.

## 3. Configurar el backend

En la carpeta `backend`:

1. Copia `.env.example` a `.env` y rellena las variables que uses (base de datos, correo, etc.).
2. Para que otros PCs de la red puedan entrar, en `.env` añade o deja:

   ```
   CORS_ORIGINS=*
   ```

3. Crea el entorno virtual e instala dependencias:

   ```cmd
   cd backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. (Opcional) Usuario inicial:

   ```cmd
   python create_initial_user.py
   ```

## 4. Arrancar el servidor

Sigue en `backend` con el entorno virtual activado:

```cmd
uvicorn main:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` hace que escuche en todas las interfaces (no solo en localhost), así otros PCs de la red pueden conectarse.
- `--port 8000` es el puerto; puedes cambiarlo si lo necesitas.

## 5. Acceder desde la red

- **En el propio servidor:** `http://localhost:8000`
- **Desde otro PC de la red:** `http://<IP-del-servidor-Windows>:8000`  
  Ejemplo: si la IP del Windows es `192.168.1.100`, usa `http://192.168.1.100:8000`.

Para saber la IP del servidor en Windows: `ipconfig` en CMD y mira “Adaptador de Ethernet” o “Wi-Fi” → “Dirección IPv4”.

## 6. Firewall de Windows

Si desde otros PCs no carga, puede estar bloqueando el puerto:

1. Panel de control → Sistema y seguridad → Firewall de Windows → Configuración avanzada.
2. Reglas de entrada → Nueva regla → Puerto → TCP, puerto 8000 (o el que uses) → Permitir la conexión.

## 7. Script automático (actualizar + compilar + arrancar)

En la raíz del proyecto hay un script para Windows que hace todo en un solo paso:

1. **`update-and-run.bat`** (doble clic o desde CMD):
   - Actualiza el código desde Git (`git pull`)
   - Instala dependencias del frontend (`npm install`)
   - Compila el frontend (`npm run build`)
   - Crea el entorno virtual del backend si no existe
   - Instala dependencias del backend (`pip install -r requirements.txt`)
   - Arranca el servidor (`uvicorn main:app --host 0.0.0.0 --port 8000`)

Requisitos: tener **Git**, **Node.js** y **Python** instalados y en el PATH. La primera vez configura el backend (`.env` en `backend`) y, si quieres, crea un usuario con `create_initial_user.py`.

## Resumen rápido

| Paso | Comando / Acción |
|------|-------------------|
| **Todo en uno** | Ejecutar `update-and-run.bat` en la raíz del proyecto |
| Compilar frontend | `cd frontend` → `npm install` → `npm run build` |
| Backend | `cd backend` → `venv` + `pip install -r requirements.txt` |
| .env | `CORS_ORIGINS=*` para acceso desde la red |
| Arrancar | `uvicorn main:app --host 0.0.0.0 --port 8000` |
| URL en red | `http://<IP-del-servidor>:8000` |

No hace falta volver a compilar el frontend salvo que cambies código del frontend; el script `update-and-run.bat` ya lo hace cada vez que lo ejecutas.

---

## HTTPS para que las notificaciones funcionen en todos los equipos

Las **notificaciones del navegador** (aviso cuando otro usuario te envía una notificación) solo funcionan en un **contexto seguro**: **HTTPS** o **localhost**. Si accedes por `http://192.168.1.x:8000` o `http://www.Approx-SAT.com:8000` desde otro PC, el navegador puede bloquear las notificaciones. Para que funcionen en todos los equipos de la red, sirve la aplicación por **HTTPS**.

### Opción A: Uvicorn con certificado (red interna)

1. **Generar un certificado autofirmado con SAN** (solo para uso interno):

   Los navegadores modernos (Chrome 58+) exigen **Subject Alternative Name (SAN)** en el certificado; si solo tiene CN, seguirán mostrando "No seguro" aunque instales el certificado. Necesitas **OpenSSL** (viene con [Git for Windows](https://git-scm.com/download/win) o [Win64 OpenSSL](https://slproweb.com/products/Win32OpenSSL.html)). Desde la carpeta `backend`:

   ```cmd
   cd backend
   generate-cert.bat
   ```

   O manualmente con OpenSSL (usa el archivo `openssl-san.cnf` del repo, que incluye SAN para www.Approx-SAT.com, localhost, etc.):

   ```cmd
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -config openssl-san.cnf -extensions v3_req
   ```

   Esto crea `key.pem` y `cert.pem` en `backend`. No subas estos archivos al repositorio (están en `.gitignore`).

2. **Arrancar el servidor con HTTPS**:

   Ejecuta **como administrador** (clic derecho → Ejecutar como administrador) el script `update-and-run.bat` o `run-https.bat` desde la raíz del proyecto. Así el servidor usará el puerto **443** (HTTPS por defecto) y no tendrás que escribir el puerto en la URL.

   Si prefieres no usar administrador, puedes arrancar manualmente en otro puerto (por ejemplo 8443):
   ```cmd
   cd backend
   venv\Scripts\activate
   uvicorn main:app --host 0.0.0.0 --port 8443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem
   ```
   Entonces la URL sería `https://www.Approx-SAT.com:8443`.

3. **Acceder desde la red**:
   - Con puerto 443 (servidor arrancado como admin): `https://www.Approx-SAT.com` o `https://localhost`
   - Con puerto 8443: `https://www.Approx-SAT.com:8443`

   La primera vez cada navegador puede mostrar un aviso de “conexión no segura” (certificado autofirmado). Para que salga el candado verde, instala el certificado como de confianza (ver apartado siguiente).

4. **Firewall**: Abre el puerto **443** (o el 8443 si usas ese) en el Firewall de Windows (igual que el 8000 para HTTP).

#### Quitar el aviso "No seguro" instalando el certificado como de confianza

Para que cada equipo confíe en tu certificado autofirmado y muestre el candado como seguro:

**Requisito:** El certificado debe haberse generado **con SAN** (script `generate-cert.bat` o `openssl-san.cnf`). Si lo generaste solo con `-subj "/CN=..."` sin SAN, los navegadores seguirán mostrando "No seguro"; en ese caso regenera el certificado con `generate-cert.bat` y vuelve a instalar `cert.pem` en cada equipo.

**En cada PC que acceda a la app (incluido el servidor):**

1. Copia el archivo **`backend\cert.pem`** del servidor a ese PC (o descárgalo desde Configuración en la app).
2. Ejecuta **`install-cert.bat`** con ese `cert.pem` en la misma carpeta, **como administrador** (clic derecho → Ejecutar como administrador). O instala manualmente: doble clic en el certificado → Instalar certificado → Equipo local → "Entidades de certificación raíz de confianza".
3. Cierra el navegador por completo y vuelve a abrir la página (`https://www.Approx-SAT.com` o `https://www.approx-sat.com`). Debería aparecer el candado como seguro.

Solo hace falta hacerlo **una vez por equipo**. Si generas un certificado nuevo, instala de nuevo el nuevo `cert.pem` en cada cliente.

### Opción B: Reverse proxy (Caddy o nginx) con Let's Encrypt

Si el servidor tiene un nombre de dominio público y quieres un certificado válido (sin avisos en el navegador):

- **Caddy**: Puedes poner Caddy delante de la app; obtiene y renueva certificados Let's Encrypt automáticamente. Caddy hace proxy a `http://127.0.0.1:8000` y sirve HTTPS hacia fuera.
- **nginx** (o IIS): Configuras HTTPS con un certificado (Let's Encrypt con certbot u otro) y el proxy hacia `http://127.0.0.1:8000`.

En ambos casos, los equipos acceden por `https://www.Approx-SAT.com` (puerto 443) y las notificaciones funcionan sin avisos de certificado.

### Resumen

| Objetivo | Qué hacer |
|----------|-----------|
| Notificaciones en todos los equipos | Servir la app por **HTTPS** (Opción A o B). |
| Red interna, rápido | Certificado autofirmado + uvicorn con `--ssl-keyfile` y `--ssl-certfile` (Opción A). |
| Dominio público, sin avisos | Reverse proxy (Caddy/nginx) + Let's Encrypt (Opción B). |
