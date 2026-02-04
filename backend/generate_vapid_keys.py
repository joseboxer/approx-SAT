#!/usr/bin/env python3
"""Genera un par de claves VAPID para Web Push. Añade las líneas a .env o configúralas en el sistema."""
import os
import sys

def main():
    try:
        from pywebpush import WebPusher
        # pywebpush no expone generación; usar py_vapid si está
        try:
            from py_vapid import Vapid01
            v = Vapid01()
            v.generate_keys()
            pub = v.public_key
            priv = v.private_key
            if isinstance(pub, bytes):
                pub = pub.decode("utf-8")
            if isinstance(priv, bytes):
                priv = priv.decode("utf-8")
        except (ImportError, AttributeError):
            # Alternativa: vapid --gen escribe .pem en cwd
            import subprocess
            subprocess.run([sys.executable, "-m", "py_vapid", "--gen"], check=True, capture_output=True)
            base = os.path.dirname(os.path.abspath(__file__))
            with open(os.path.join(base, "public_key.pem")) as f:
                pub = f.read().strip()
            with open(os.path.join(base, "private_key.pem")) as f:
                priv = f.read().strip()
            # pywebpush espera claves en formato distinto; las .pem son PEM estándar
            print("Se generaron public_key.pem y private_key.pem.")
            print("En .env usa: VAPID_PRIVATE_KEY=<contenido de private_key.pem (una línea)>")
            print("Para la clave pública en base64url, usa el endpoint GET /api/push/vapid-public tras configurar VAPID_PRIVATE_KEY (el servidor la deriva).")
            return
        print("Añade estas líneas a tu archivo .env (o exporta las variables):")
        print()
        print("VAPID_PUBLIC_KEY=" + pub)
        print("VAPID_PRIVATE_KEY=" + priv)
        print()
        print("Reinicia el servidor después de configurar las variables.")
    except ImportError as e:
        print("Instala dependencias: pip install pywebpush py_vapid")
        print("Luego ejecuta de nuevo: python generate_vapid_keys.py")
        sys.exit(1)

if __name__ == "__main__":
    main()
