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
