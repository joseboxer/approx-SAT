# Backend API Garantías

## Web Push (notificaciones)

Para que las notificaciones push funcionen, configura las claves VAPID en `.env`:

```bash
python generate_vapid_keys.py
```

Copia las líneas `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` que imprime el script a tu archivo `.env`. Sin ellas, `GET /api/push/vapid-public` devuelve **503** y el frontend no podrá registrar la suscripción push (el resto de la app sigue funcionando).

## ConnectionResetError (WinError 10054) en Windows

Si en consola aparece algo como:

```
ConnectionResetError: [WinError 10054] Se ha forzado la interrupción de una conexión existente
  ...
  self._sock.shutdown(socket.SHUT_RDWR)
```

suele deberse a que el **cliente** (navegador) cerró la conexión antes de que el servidor terminara (pestaña cerrada, navegación rápida, etc.). Es un comportamiento normal del protocolo HTTP y **no indica fallo del servidor**: la petición se da por perdida y el servidor sigue atendiendo. En Windows, uvicorn/asyncio puede mostrar este error al limpiar el socket; puedes ignorarlo si la aplicación responde bien por lo demás.
