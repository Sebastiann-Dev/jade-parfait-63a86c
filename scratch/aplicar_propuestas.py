import urllib.request
import urllib.error
import json
import os
import sys

# Configuración de Supabase
SUPABASE_URL = "https://flefgvaddvviayctxoou.supabase.co"
SUPABASE_KEY = "sb_publishable_Fo02EzvNfNgQqcUkwLu6mQ_D4JqCodp"
PRODUCTS_API_URL = f"{SUPABASE_URL}/rest/v1/productos"

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

PROPUESTAS_FILE = "scratch/propuestas_migracion.json"

def apply_update_to_supabase(producto_id, update_payload):
    """Realiza un PATCH a la API de Supabase para actualizar un producto existente."""
    url = f"{PRODUCTS_API_URL}?id=eq.{producto_id}"
    req = urllib.request.Request(
        url, 
        data=json.dumps(update_payload).encode('utf-8'),
        headers=SUPABASE_HEADERS,
        method="PATCH"
    )
    try:
        with urllib.request.urlopen(req) as response:
            return True
    except Exception as e:
        print(f"Error al actualizar en Supabase (ID {producto_id}): {e}")
        return False

def insert_new_to_supabase(new_payload):
    """Realiza un POST a la API de Supabase para crear un nuevo producto."""
    # Clonamos el payload y quitamos cualquier campo de ID temporal
    payload = new_payload.copy()
    if "id" in payload:
        del payload["id"]
        
    req = urllib.request.Request(
        PRODUCTS_API_URL, 
        data=json.dumps([payload]).encode('utf-8'),
        headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if res_data and len(res_data) > 0:
                new_id = res_data[0].get("id")
                return new_id
            return True
    except Exception as e:
        print(f"\nError al insertar producto en Supabase: {e}")
        return None

def show_comparison(p_nombre, actual, propuesto, es_nuevo=False):
    """Muestra la comparación de cambios en consola de manera visual y clara."""
    print("=" * 60)
    if es_nuevo:
        print(f"NUEVO PRODUCTO A CREAR: {p_nombre}")
    else:
        print(f"PRODUCTO EXISTENTE (ACTUALIZAR): {p_nombre}")
    print("=" * 60)
    
    cambios_detectados = False
    
    for key in propuesto.keys():
        val_actual = actual.get(key)
        val_propuesto = propuesto.get(key)
        
        # Normalizar para comparación
        str_actual = str(val_actual or "").strip()
        str_propuesto = str(val_propuesto or "").strip()
        
        if es_nuevo or (str_actual != str_propuesto):
            cambios_detectados = True
            print(f"  * Campo: '{key}'")
            if not es_nuevo:
                print(f"    - [Actual]:     {val_actual if val_actual else '<VACÍO>'}")
            print(f"    + [Propuesto]:  {val_propuesto}")
            print("-" * 60)
            
    if not cambios_detectados:
        print("  (No se detectaron cambios con respecto a los datos actuales)")
        print("=" * 60)
        
    return cambios_detectados

def main():
    if not os.path.exists(PROPUESTAS_FILE):
        print(f"❌ No se encontró el archivo de propuestas: {PROPUESTAS_FILE}")
        print("Por favor, ejecuta primero la extracción con: python scratch/migracion_ia.py")
        return

    with open(PROPUESTAS_FILE, 'r', encoding='utf-8') as f:
        propuestas = json.load(f)

    if not propuestas:
        print("El archivo de propuestas está vacío.")
        return

    total = len(propuestas)
    print(f"Se cargaron {total} propuestas del archivo local.")

    # Preguntar modo de ejecución
    print("\nSelecciona el modo de aplicación:")
    print(" 1. Modo Interactivo (Revisar y confirmar una por una)")
    print(" 2. Modo Masivo (Aplicar todas las propuestas de golpe sin preguntar)")
    
    modo = input("Elige una opción (1/2): ").strip()
    while modo not in ["1", "2"]:
        modo = input("Opción inválida. Elige 1 o 2: ").strip()

    aplicados = 0
    
    if modo == "2":
        confirm = input("\n⚠️ ¿Estás seguro de que deseas aplicar las {} propuestas de golpe? (y/n): ".format(total)).strip().lower()
        if confirm != 'y':
            print("Operación cancelada.")
            return
            
        print("\nAplicando propuestas...")
        for idx, pr in enumerate(propuestas):
            p_id = pr["producto_id"]
            nombre = pr["producto_nombre"]
            payload = pr["propuesto"].copy()
            es_nuevo = pr.get("es_nuevo", False)
            
            # Forzar estado completo al migrar exitosamente
            payload["estado"] = "completo"
            payload["motivo_incompleto"] = None
            
            if es_nuevo:
                print(f"[{idx+1}/{total}] Insertando nuevo producto '{nombre}'...", end="", flush=True)
                new_uuid = insert_new_to_supabase(payload)
                if new_uuid:
                    print(f" ✅ Insertado (ID: {new_uuid})")
                    aplicados += 1
                else:
                    print(" ❌ Error.")
            else:
                print(f"[{idx+1}/{total}] Actualizando producto '{nombre}'...", end="", flush=True)
                if apply_update_to_supabase(p_id, payload):
                    print(" ✅ Listo.")
                    aplicados += 1
                else:
                    print(" ❌ Error.")
                
    else: # Modo Interactivo
        for idx, pr in enumerate(propuestas):
            p_id = pr["producto_id"]
            nombre = pr["producto_nombre"]
            actual = pr["actual"]
            propuesto = pr["propuesto"]
            es_nuevo = pr.get("es_nuevo", False)
            
            print(f"\n\nPropuesta [{idx+1}/{total}]")
            tiene_cambios = show_comparison(nombre, actual, propuesto, es_nuevo)
            
            if not tiene_cambios and not es_nuevo:
                opcion = input("El producto ya tiene estos datos. ¿Deseas forzar su actualización de todos modos? (y/n/q): ").strip().lower()
                if opcion == 'q':
                    break
                if opcion != 'y':
                    continue
            else:
                opcion = input("¿Deseas aplicar esta propuesta a Supabase? (y/n/q/s): ").strip().lower()
                
                if opcion == 'q':
                    print("Saliendo del script...")
                    break
                elif opcion == 's':
                    confirm = input("\n¿Seguro que deseas aplicar todas las propuestas restantes de golpe? (y/n): ").strip().lower()
                    if confirm == 'y':
                        # Continuar aplicando masivamente el resto
                        for pr_restante in propuestas[idx:]:
                            payload_rest = pr_restante["propuesto"].copy()
                            payload_rest["estado"] = "completo"
                            payload_rest["motivo_incompleto"] = None
                            
                            is_new_rest = pr_restante.get("es_nuevo", False)
                            
                            if is_new_rest:
                                print(f"Insertando nuevo producto '{pr_restante['producto_nombre']}'...", end="", flush=True)
                                if insert_new_to_supabase(payload_rest):
                                    print(" ✅")
                                    aplicados += 1
                                else:
                                    print(" ❌")
                            else:
                                print(f"Actualizando producto '{pr_restante['producto_nombre']}'...", end="", flush=True)
                                if apply_update_to_supabase(pr_restante["producto_id"], payload_rest):
                                    print(" ✅")
                                    aplicados += 1
                                else:
                                    print(" ❌")
                        break
                    else:
                        continue
                elif opcion != 'y':
                    print("Propuesta saltada.")
                    continue
            
            # Aplicar propuesta individual
            payload = propuesto.copy()
            payload["estado"] = "completo"
            payload["motivo_incompleto"] = None
            
            if es_nuevo:
                print("Insertando nuevo producto en Supabase...", end="", flush=True)
                new_uuid = insert_new_to_supabase(payload)
                if new_uuid:
                    print(f" ✅ (ID: {new_uuid})")
                    aplicados += 1
                else:
                    print(" ❌")
            else:
                print("Actualizando producto en Supabase...", end="", flush=True)
                if apply_update_to_supabase(p_id, payload):
                    print(" ✅")
                    aplicados += 1
                else:
                    print(" ❌")

    print("\n" + "=" * 40)
    print(f"Proceso finalizado. Se aplicaron {aplicados} propuestas a la base de datos.")
    print("=" * 40)

if __name__ == "__main__":
    main()
