"""
Script para crear cuentas de administrador BUCA sin confirmacion de correo.
Usa el service role key de Supabase para crear el usuario y confirmar el email automaticamente.

Uso:
  python crear_admin.py correo@bucamx.com contraseña
"""
import sys
import json
import urllib.request
import urllib.error
import os

SUPABASE_URL = "https://flefgvaddvviayctxoou.supabase.co"
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "AQUI_TU_NUEVO_SERVICE_KEY")

if len(sys.argv) < 3:
    print("Uso: python crear_admin.py correo@bucamx.com contraseña")
    sys.exit(1)

email = sys.argv[1]
password = sys.argv[2]

if not email.endswith("@bucamx.com"):
    print(f"Error: El correo '{email}' no es un correo oficial @bucamx.com")
    sys.exit(1)

if len(password) < 6:
    print("Error: La contraseña debe tener al menos 6 caracteres")
    sys.exit(1)

url = f"{SUPABASE_URL}/auth/v1/admin/users"
headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "email": email,
    "password": password,
    "email_confirm": True   # <-- Sin confirmacion de correo
}).encode("utf-8")

req = urllib.request.Request(url, data=body, headers=headers, method="POST")
try:
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read().decode())
        print(f"\n[OK] Cuenta creada exitosamente!")
        print(f"     Correo  : {data.get('email')}")
        print(f"     ID      : {data.get('id')}")
        print(f"     Creado  : {data.get('created_at')}")
        print(f"\n  La cuenta ya puede iniciar sesion en /admin sin necesidad de confirmar el correo.")
except urllib.error.HTTPError as e:
    err = json.loads(e.read().decode())
    if "already registered" in str(err).lower() or e.code == 422:
        print(f"\n[WARN] El correo '{email}' ya tiene una cuenta registrada.")
        print(f"       Si olvidaste la contraseña, crea otra cuenta o contáctame.")
    else:
        print(f"\n[ERROR] HTTP {e.code}: {err}")
except Exception as ex:
    print(f"\n[ERROR] {ex}")
