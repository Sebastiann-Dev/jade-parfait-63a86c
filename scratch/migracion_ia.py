import urllib.request
import urllib.error
import json
import base64
import time
import os
import sys
import glob

# Configuración de Supabase
SUPABASE_URL = "https://flefgvaddvviayctxoou.supabase.co"
SUPABASE_KEY = "sb_publishable_i1JKutd_pGnC2wGz49d8xQ_WDjy_FMs"
PRODUCTS_API_URL = f"{SUPABASE_URL}/rest/v1/productos"

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

# API Keys ofuscadas de Gemini
OBFUSCATED_KEYS = [
    "Bj0tWj5ALh0OPyEWWy09BDYVAQw+I1UMHDoEPSBBPkQJCwoAXC1HCxgGBTJXICZRBTNPJyg=", # Clave Principal
    "MCYrCwEAKw4fMjAiBAAbOBgiDzY2NREDBwIqOgcEMAQ/JzlEAD0VA0IoMTVXICZRBTNPJyg="  # Clave de Respaldo
]

# Archivos de persistencia local
LOCAL_PDF_DIR = "scratch/pdfs"
ESTADO_FILE = "scratch/estado_migracion.json"
PROPUESTAS_FILE = "scratch/propuestas_migracion.json"

def decrypt_key(encrypted_str, xor_key="antigravity"):
    try:
        encrypted_bytes = base64.b64decode(encrypted_str)
        decrypted_chars = []
        for i, byte in enumerate(encrypted_bytes):
            key_char = ord(xor_key[i % len(xor_key)])
            decrypted_chars.append(chr(byte ^ key_char))
        return "".join(decrypted_chars)[::-1]
    except Exception as e:
        print(f"Error decodificando clave API: {e}")
        return None

# Descifrar las llaves Gemini disponibles
GEMINI_KEYS = [decrypt_key(k) for k in OBFUSCATED_KEYS if decrypt_key(k)]
active_key_index = 0

def fetch_products():
    """Descarga todos los productos de Supabase."""
    print("Conectando con Supabase para obtener lista de productos...")
    req = urllib.request.Request(PRODUCTS_API_URL, headers=SUPABASE_HEADERS)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error al descargar productos de Supabase: {e}")
        sys.exit(1)

def download_pdf_base64(pdf_url):
    """Descarga un PDF remoto y lo codifica en base64."""
    try:
        req = urllib.request.Request(
            pdf_url, 
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            pdf_bytes = response.read()
            return base64.b64encode(pdf_bytes).decode('utf-8')
    except Exception as e:
        print(f"Error descargando PDF ({pdf_url}): {e}")
        return None

def upload_pdf_to_storage(producto_id, tipo, file_path):
    """Sube un archivo PDF local a Supabase Storage (bucket product-docs) y retorna su URL pública."""
    filename = os.path.basename(file_path)
    ext = filename.split('.')[-1].lower() if '.' in filename else 'pdf'
    path_in_bucket = f"{producto_id}/{tipo}.{ext}"
    
    upload_url = f"{SUPABASE_URL}/storage/v1/object/product-docs/{path_in_bucket}"
    
    try:
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
            
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/pdf",
            "x-upsert": "true"
        }
        
        req = urllib.request.Request(
            upload_url,
            data=file_bytes,
            headers=headers,
            method="POST"
        )
        
        with urllib.request.urlopen(req) as response:
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/product-docs/{path_in_bucket}"
            return public_url
    except Exception as e:
        print(f"Error subiendo '{filename}' a Supabase Storage: {e}")
        return None

def analyze_pdf_with_gemini(pdf_base64, api_key):
    """Envía el PDF en base64 a la API de Gemini para la extracción estructurada."""
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    prompt = (
        "Analiza esta ficha de producto y extrae la información para rellenar los siguientes campos. "
        "Devuelve un objeto JSON con las siguientes claves (y los tipos de datos correspondientes):\n"
        "- nombre: string (nombre comercial corto del producto, ej. BucaTrafic, sin marcas como ® TM)\n"
        "- nota: string (breve descripción de una línea de para qué sirve o qué es, ej. Pintura epóxica de altos sólidos para tráfico vehicular)\n"
        "- tieneRendimiento: boolean (true si se menciona rendimiento por m² o consumo por m²)\n"
        "- rendimiento: number o null (si tieneRendimiento es true, extrae el rendimiento promedio en m² por litro o por kilogramo. Por ejemplo, si dice \"rendimiento de 4 a 6 m²/L\", extrae 5. Si no aplica, null)\n"
        "- espesorRecomendado: string o null (espesor de película recomendado en milésimas de pulgada (mils) o micras, ej: \"4 a 6 mils\" o \"100-150 micras\")\n"
        "- manosRecomendadas: string o null (número de capas o manos recomendadas, ej: \"1 a 2 manos\")\n"
        "- densidadRecomendada: string o null (densidad o peso específico, ej: \"1.25 g/cm³\")\n"
        "- pros: string o null (las 2 o 3 ventajas clave resumidas en 1 o 2 palabras cada una separadas por coma, ej: \"Rápido secado, alta resistencia\")\n"
        "- cons: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)\n"
        "- cuidadoCon: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)\n"
        "- proporcionesMezcla: string o null (proporción de mezcla si es kit, o de volumen A:B, ej: \"4 partes A : 1 parte B\")\n\n"
        "REGLA DE GUARDRAIL CRÍTICA: Queda estrictamente prohibido alucinar, inventar, deducir o asumir información genérica o de sentido común. Si un dato no está explícitamente mencionado en el texto de la ficha técnica/seguridad, debes establecer su valor exactamente en null. Para los campos \"cons\" y \"cuidadoCon\", debes retornar siempre el valor null de forma incondicional.\n\n"
        "Responde ÚNICAMENTE con el objeto JSON válido en formato de texto plano. No incluyas bloques de código Markdown (como ```json), comentarios, ni texto introductorio."
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "data": pdf_base64,
                            "mimeType": "application/pdf"
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    req = urllib.request.Request(
        gemini_url, 
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            res_json = json.loads(response.read().decode('utf-8'))
            text_response = res_json['candidates'][0]['content']['parts'][0]['text']
    except urllib.error.HTTPError as e:
        print(f"⚠️ Error con gemini-2.5-flash (HTTP {e.code}). Intentando fallback a gemini-1.5-flash...")
        fallback_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        try:
            req_fallback = urllib.request.Request(
                fallback_url, 
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_fallback, timeout=60) as response:
                res_json = json.loads(response.read().decode('utf-8'))
                text_response = res_json['candidates'][0]['content']['parts'][0]['text']
        except urllib.error.HTTPError as e_fallback:
            if e_fallback.code == 429:
                raise Exception("RATE_LIMIT_ERROR")
            else:
                raise Exception(f"HTTP_{e_fallback.code}: {e_fallback.read().decode('utf-8')}")
        except Exception as e_fallback:
            raise Exception(f"Gemini Fallback API Error: {e_fallback}")
    except Exception as e:
        print(f"⚠️ Error general con gemini-2.5-flash ({e}). Intentando fallback a gemini-1.5-flash...")
        fallback_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        try:
            req_fallback = urllib.request.Request(
                fallback_url, 
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_fallback, timeout=60) as response:
                res_json = json.loads(response.read().decode('utf-8'))
                text_response = res_json['candidates'][0]['content']['parts'][0]['text']
        except urllib.error.HTTPError as e_fallback:
            if e_fallback.code == 429:
                raise Exception("RATE_LIMIT_ERROR")
            else:
                raise Exception(f"HTTP_{e_fallback.code}: {e_fallback.read().decode('utf-8')}")
        except Exception as e_fallback:
            raise Exception(f"Gemini Fallback API Error: {e_fallback}")

    clean_text = text_response.strip()
    if clean_text.startswith("```"):
        clean_text = clean_text.replace("```json", "", 1).replace("```", "").strip()
        
    return json.loads(clean_text)

def encontrar_producto_por_archivo(filename, productos):
    """Busca coincidencias heurísticas entre el nombre del archivo PDF y los productos en Supabase."""
    fname_clean = filename.lower().replace("_", " ").replace("-", " ")
    for word in [".pdf", "tds", "sds", "ficha", "tecnica", "seguridad", "hoja", "msds"]:
        fname_clean = fname_clean.replace(word, "")
    fname_clean = fname_clean.strip()
    
    if not fname_clean:
        return None
        
    mejor_match = None
    mejor_score = 0
    
    for p in productos:
        prod_name = p['nombre'].lower()
        # Si el nombre limpio del archivo está contenido en el del producto, o viceversa
        if fname_clean in prod_name or prod_name in fname_clean:
            score = len(fname_clean) if fname_clean in prod_name else len(prod_name)
            if score > mejor_score:
                mejor_score = score
                mejor_match = p
                
    return mejor_match

def determinar_tipo_documento(filename):
    """Determina si un PDF corresponde a TDS (ficha técnica) o SDS (hoja de seguridad)."""
    fname = filename.lower()
    if any(word in fname for word in ["msds", "sds", "seguridad", "safety"]):
        return "ficha_seguridad"
    return "ficha_tecnica"

def main():
    global active_key_index

    # Asegurar directorios de scratch
    os.makedirs(LOCAL_PDF_DIR, exist_ok=True)

    # Cargar o inicializar estado de progreso
    if os.path.exists(ESTADO_FILE):
        with open(ESTADO_FILE, 'r', encoding='utf-8') as f:
            estado = json.load(f)
    else:
        estado = {"procesados": []}

    # Cargar propuestas previas
    if os.path.exists(PROPUESTAS_FILE):
        with open(PROPUESTAS_FILE, 'r', encoding='utf-8') as f:
            propuestas = json.load(f)
    else:
        propuestas = []

    # Obtener límite de ejecución desde consola
    limite = None
    if len(sys.argv) > 1:
        try:
            limite = int(sys.argv[1])
            print(f"Límite de ejecución establecido: procesar un máximo de {limite} productos/archivos en esta sesión.")
        except ValueError:
            pass

    productos = fetch_products()
    
    # 1. Buscar archivos PDF en la carpeta local scratch/pdfs/
    local_pdfs = glob.glob(os.path.join(LOCAL_PDF_DIR, "*.pdf")) + glob.glob(os.path.join(LOCAL_PDF_DIR, "*.PDF"))
    
    items_a_procesar = []
    
    if local_pdfs:
        repetidos = []
        nuevos = []
        
        print(f"Escaneando {len(local_pdfs)} archivos PDF locales en la carpeta '{LOCAL_PDF_DIR}'...")
        for pdf_path in local_pdfs:
            fname = os.path.basename(pdf_path)
            
            # Saltamos si este archivo ya fue procesado en esta sesión o previas
            if fname in estado.get("archivos_procesados", []):
                continue
                
            match_p = encontrar_producto_por_archivo(fname, productos)
            tipo_doc = determinar_tipo_documento(fname)
            
            if match_p:
                url_existente = match_p.get('ficha_tecnica_url') if tipo_doc == 'ficha_tecnica' else match_p.get('ficha_seguridad_url')
                if url_existente:
                    repetidos.append({
                        "file_path": pdf_path,
                        "nombre_archivo": fname,
                        "producto": match_p,
                        "tipo_documento": tipo_doc,
                        "url_existente": url_existente
                    })
                else:
                    nuevos.append({
                        "origen": "local",
                        "file_path": pdf_path,
                        "nombre_archivo": fname,
                        "producto": match_p,
                        "tipo_documento": tipo_doc,
                        "es_nuevo": False
                    })
            else:
                # Crear un pseudo-producto para el formulario
                pseudo_p = {
                    "id": f"nuevo_{int(time.time() * 1000)}",
                    "nombre": fname.replace(".pdf", "").replace(".PDF", "").replace("_TDS","").replace("_SDS","").replace("_"," "),
                    "unidad": "L",
                    "moneda": "MXN",
                    "precio": 0,
                    "cantRef": 19
                }
                nuevos.append({
                    "origen": "local",
                    "file_path": pdf_path,
                    "nombre_archivo": fname,
                    "producto": pseudo_p,
                    "tipo_documento": tipo_doc,
                    "es_nuevo": True
                })

        # Mostrar reporte de archivos
        print("\n=== REPORTE DE ARCHIVOS PDF DETECTADOS ===")
        if repetidos:
            print(f"\n⚠️ ARCHIVOS REPETIDOS DETECTADOS ({len(repetidos)}):")
            for rep in repetidos:
                print(f"  - '{rep['nombre_archivo']}' -> Ya existe en BD para el producto '{rep['producto']['nombre']}' ({rep['tipo_documento']}).")
        else:
            print("\n✅ No se encontraron archivos repetidos.")

        if nuevos:
            print(f"\n✨ ARCHIVOS NUEVOS LISTOS PARA PROCESAR ({len(nuevos)}):")
            for n in nuevos:
                asoc_txt = f"Asociado a '{n['producto']['nombre']}'" if not n.get("es_nuevo") else "Crear como NUEVO producto"
                print(f"  - '{n['nombre_archivo']}' ({n['tipo_documento']}) -> {asoc_txt}")
        else:
            print("\nNo hay archivos nuevos para procesar.")

        # Si hay repetidos o nuevos, pedir confirmación del usuario
        if repetidos or nuevos:
            confirmacion = input("\n🚦 ¿Deseas dar LUZ VERDE para eliminar los repetidos y procesar los nuevos? (S/N): ").strip().upper()
            if confirmacion not in ["S", "SI"]:
                print("Operación cancelada por el usuario. Saliendo...")
                return
            
            # Eliminar físicamente los archivos repetidos
            if repetidos:
                print("\nEliminando archivos repetidos físicamente...")
                for rep in repetidos:
                    try:
                        os.remove(rep["file_path"])
                        print(f"  🗑️ Eliminado del disco: {rep['nombre_archivo']}")
                    except Exception as e:
                        print(f"  ❌ Error eliminando {rep['nombre_archivo']}: {e}")
            
            items_a_procesar = nuevos
    else:
        print(f"No hay archivos PDF en la carpeta local '{LOCAL_PDF_DIR}'.")
        print("Buscando productos en Supabase que tengan PDFs ya vinculados...")
        
        for p in productos:
            prod_id = p.get('id')
            if prod_id in estado["procesados"]:
                continue
                
            pdf_url = p.get('ficha_tecnica_url') or p.get('ficha_seguridad_url')
            if not pdf_url:
                continue
                
            # Validar si falta información
            campos_tecnicos = [
                p.get('rendimiento'), p.get('espesorRecomendado'), 
                p.get('manosRecomendadas'), p.get('densidadRecomendada'), 
                p.get('pros'), p.get('cons'), p.get('cuidadoCon'), 
                p.get('proporcionesMezcla')
            ]
            
            if any(v is None or str(v).strip() == "" for v in campos_tecnicos):
                items_a_procesar.append({
                    "origen": "remoto",
                    "pdf_url": pdf_url,
                    "producto": p,
                    "tipo_documento": "ficha_seguridad" if p.get('ficha_seguridad_url') and not p.get('ficha_tecnica_url') else "ficha_tecnica"
                })

    total_a_procesar = len(items_a_procesar)
    print(f"\nTotal de elementos pendientes por procesar: {total_a_procesar}")
    
    if total_a_procesar == 0:
        print("¡Nada que procesar! Asegúrate de haber colocado PDFs en 'scratch/pdfs/' o que existan productos en Supabase con URLs de PDF incompletos.")
        return

    procesados_count = 0
    
    # Inicializar la clave 'archivos_procesados' en el estado si no existe
    if "archivos_procesados" not in estado:
        estado["archivos_procesados"] = []

    try:
        for item in items_a_procesar:
            if limite is not None and procesados_count >= limite:
                print(f"Alcanzado el límite de {limite} elementos para esta sesión.")
                break

            p = item["producto"]
            nombre_prod = p.get("nombre")
            origen = item["origen"]
            tipo_doc = item["tipo_documento"]
            
            print(f"\n[{procesados_count + 1}/{total_a_procesar}] Procesando '{nombre_prod}' ({tipo_doc})...")
            
            # Obtener el base64 del PDF
            pdf_base64 = None
            if origen == "local":
                file_path = item["file_path"]
                print(f"Leyendo archivo local: {file_path}")
                try:
                    with open(file_path, 'rb') as f:
                        pdf_base64 = base64.b64encode(f.read()).decode('utf-8')
                except Exception as e:
                    print(f"❌ Error leyendo archivo local: {e}")
                    continue
            else:
                pdf_url = item["pdf_url"]
                print(f"Descargando PDF remoto: {pdf_url}")
                pdf_base64 = download_pdf_base64(pdf_url)
                
            if not pdf_base64:
                print(f"❌ Saltando '{nombre_prod}' debido a error de lectura/descarga de PDF.")
                continue

            # Consultar Gemini con reintento rotando claves
            exito = False
            intentos = 0
            datos_extraidos = None
            
            while not exito and intentos < len(GEMINI_KEYS):
                current_key = GEMINI_KEYS[active_key_index]
                try:
                    print(f"Llamando a Gemini (clave índice {active_key_index})...")
                    datos_extraidos = analyze_pdf_with_gemini(pdf_base64, current_key)
                    exito = True
                except Exception as err:
                    err_msg = str(err)
                    if "RATE_LIMIT_ERROR" in err_msg or "HTTP_429" in err_msg:
                        print(f"⚠️ Rate limit alcanzado para la clave {active_key_index}. Rotando...")
                        active_key_index = (active_key_index + 1) % len(GEMINI_KEYS)
                        intentos += 1
                        time.sleep(5)
                    else:
                        print(f"❌ Error Gemini API: {err_msg}")
                        break

            if not exito or not datos_extraidos:
                print(f"❌ No se pudo extraer información para '{nombre_prod}'. Saltando...")
                continue

            # Asociación inteligente post-extracción
            nombre_extraido = datos_extraidos.get("nombre", "").strip().lower()
            match_real = None
            if nombre_extraido:
                for prod in productos:
                    if prod.get("nombre", "").strip().lower() == nombre_extraido:
                        match_real = prod
                        break
            
            if match_real:
                print(f"🔍 Asociación inteligente: El material extraído '{datos_extraidos.get('nombre')}' coincide con el producto existente '{match_real['nombre']}' (ID: {match_real['id']}).")
                p = match_real
                nombre_prod = match_real["nombre"]
                item["es_nuevo"] = False

            # Subir PDF a Supabase Storage si es local
            pdf_final_url = item.get("pdf_url")
            if origen == "local":
                # Si es un producto nuevo o existente, intentamos subir el PDF a Storage
                # Usamos el id del producto para crear la carpeta en Storage
                print(f"Subiendo PDF a Supabase Storage...")
                uploaded_url = upload_pdf_to_storage(p["id"], tipo_doc, item["file_path"])
                if uploaded_url:
                    print(f"✅ PDF subido con éxito: {uploaded_url}")
                    pdf_final_url = uploaded_url
                else:
                    print(f"⚠️ No se pudo subir el PDF a Storage. Se mantendrá como propuesta sin PDF en la nube.")

            # Modificar la propuesta de datos para incluir la URL del PDF
            propuesto_payload = datos_extraidos.copy()
            if pdf_final_url:
                if tipo_doc == "ficha_tecnica":
                    propuesto_payload["ficha_tecnica_url"] = pdf_final_url
                else:
                    propuesto_payload["ficha_seguridad_url"] = pdf_final_url

            # Crear propuesta
            propuesta = {
                "producto_id": p.get("id"),
                "producto_nombre": nombre_prod,
                "origen_pdf": origen,
                "tipo_documento": tipo_doc,
                "es_nuevo": item.get("es_nuevo", False),
                "actual": {
                    "nombre": p.get("nombre") or "",
                    "nota": p.get("nota") or "",
                    "tieneRendimiento": p.get("tieneRendimiento") or False,
                    "rendimiento": p.get("rendimiento") or "",
                    "espesorRecomendado": p.get("espesorRecomendado") or "",
                    "manosRecomendadas": p.get("manosRecomendadas") or "",
                    "densidadRecomendada": p.get("densidadRecomendada") or "",
                    "pros": p.get("pros") or "",
                    "cons": p.get("cons") or "",
                    "cuidadoCon": p.get("cuidadoCon") or "",
                    "proporcionesMezcla": p.get("proporcionesMezcla") or "",
                    "ficha_tecnica_url": p.get("ficha_tecnica_url") or "",
                    "ficha_seguridad_url": p.get("ficha_seguridad_url") or ""
                },
                "propuesto": propuesto_payload
            }

            # Guardar propuesta localmente
            propuestas = [pr for pr in propuestas if pr["producto_id"] != p["id"]]
            propuestas.append(propuesta)
            
            with open(PROPUESTAS_FILE, 'w', encoding='utf-8') as f:
                json.dump(propuestas, f, indent=2, ensure_ascii=False)

            # Actualizar estado de progreso
            if origen == "local":
                estado["archivos_procesados"].append(item["nombre_archivo"])
            else:
                estado["procesados"].append(p["id"])
                
            with open(ESTADO_FILE, 'w', encoding='utf-8') as f:
                json.dump(estado, f, indent=2, ensure_ascii=False)

            print(f"✅ Propuesta para '{nombre_prod}' guardada localmente.")
            procesados_count += 1
            
            # Pausa obligatoria para respetar Rate Limit
            if procesados_count < total_a_procesar:
                delay = 12
                print(f"Pausa de {delay} segundos antes del siguiente elemento...")
                time.sleep(delay)

    except KeyboardInterrupt:
        print("\n\nProceso interrumpido por el usuario. Avance y propuestas guardadas con éxito.")
    
    print(f"\nSesión terminada. Se procesaron {procesados_count} elementos con éxito.")
    print(f"Propuestas en: {PROPUESTAS_FILE}")
    print("Ejecuta 'python scratch/aplicar_propuestas.py' para aplicar los cambios a Supabase.")

if __name__ == "__main__":
    main()
