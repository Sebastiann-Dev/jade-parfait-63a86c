import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  fetchProductosSupabase, 
  saveProductoSupabase, 
  deleteProductoSupabase, 
  updateProductoSupabase, 
  supabase,
  fetchSistemasSupabase,
  fetchSistemaProductosSupabase,
  saveSistemaSupabase,
  updateSistemaSupabase,
  deleteSistemaSupabase,
  uploadPdfProducto,
  deletePdfProducto,
  registrarLogActividad,
  type Sistema,
  type SistemaProducto
} from '../supabase'
import { Producto } from '../data/productos'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

const DEFAULT_PRODUCTO: Omit<Producto, 'id'> & { cantRef: number | string; precio: number | string; rendimiento: number | string; estado?: string; motivo_incompleto?: string } = {
  nombre: '',
  cantRef: '',
  unidad: 'L',
  moneda: 'MXN',
  precio: '',
  tieneRendimiento: false,
  nota: '',
  rendimiento: '',
  espesorRecomendado: '',
  manosRecomendadas: '',
  pros: '',
  cons: '',
  cuidadoCon: '',
  kitInfo: '',
  proporcionesMezcla: '',
  densidadRecomendada: '',
  bitacora: '',
  ficha_tecnica_url: '',
  ficha_seguridad_url: '',
  estado: 'borrador',
  motivo_incompleto: ''
}

interface FilaMigracion {
  id: string;
  fileName: string;
  file: File;
  productoAsociado: any | null;
  tipoDoc: 'ficha_tecnica' | 'ficha_seguridad';
  estado: 'pre_analisis' | 'cola' | 'subiendo' | 'analizando' | 'completado' | 'guardado' | 'error';
  errorMsg?: string;
  pdfUrl?: string;
  propuesta?: any;
  yaExisteEnBd?: boolean;
}

function parseKitInfo(kitInfoStr?: string): { numPartes: number; presentaciones: any[] } {
  if (!kitInfoStr) return { numPartes: 2, presentaciones: [] }
  try {
    if (kitInfoStr.startsWith('{')) {
      const parsed = JSON.parse(kitInfoStr)
      return {
        numPartes: parsed.numPartes || 2,
        presentaciones: parsed.presentaciones || []
      }
    } else if (kitInfoStr.startsWith('[')) {
      const list = JSON.parse(kitInfoStr)
      return {
        numPartes: 2,
        presentaciones: list || []
      }
    }
  } catch (e) {
    console.error("Error parsing kitInfo:", e)
  }
  return { numPartes: 2, presentaciones: [] }
}

// Helper to decrypt the preconfigured API key
function decryptApiKey(encryptedStr: string): string {
  try {
    const encryptedBytes = atob(encryptedStr);
    const xorKey = "antigravity";
    const decryptedChars: string[] = [];
    for (let i = 0; i < encryptedBytes.length; i++) {
      const byte = encryptedBytes.charCodeAt(i);
      const keyChar = xorKey.charCodeAt(i % xorKey.length);
      decryptedChars.push(String.fromCharCode(byte ^ keyChar));
    }
    return decryptedChars.join("").split("").reverse().join("");
  } catch (e) {
    console.error("Error decrypting API Key", e);
    return "";
  }
}

const OBFUSCATED_KEYS = [
  "Bj0tWj5ALh0OPyEWWy09BDYVAQw+I1UMHDoEPSBBPkQJCwoAXC1HCxgGBTJXICZRBTNPJyg=", // Clave Principal (Ofuscada)
  "MCYrCwEAKw4fMjAiBAAbOBgiDzY2NREDBwIqOgcEMAQ/JzlEAD0VA0IoMTVXICZRBTNPJyg="  // Clave de Respaldo (Ofuscada)
];

const PRECONFIGURED_KEYS = OBFUSCATED_KEYS.map(decryptApiKey).filter(Boolean);

function getMaskedKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••••';
  return `${key.substring(0, 7)}••••••••••••${key.substring(key.length - 4)}`;
}

function AdminPage() {
  const fileInputTdsRef = useRef<HTMLInputElement>(null)
  const fileInputSdsRef = useRef<HTMLInputElement>(null)
  const [productos, setProductos] = useState<(Producto & {id: string})[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<any>(DEFAULT_PRODUCTO)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'ok'|'error'} | null>(null)
  const [tipoCambio, setTipoCambio] = useState<number>(17.5)

  // Auth state variables
  const [user, setUser] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authIsSignUp, setAuthIsSignUp] = useState(false)

  // Kit presentations state variables
  const [esKitProduct, setEsKitProduct] = useState(false)
  const [kitPresentaciones, setKitPresentaciones] = useState<any[]>([])
  const [newKitNombre, setNewKitNombre] = useState('')
  const [newKitPrecio, setNewKitPrecio] = useState('')
  const [newKitMoneda, setNewKitMoneda] = useState<'MXN'|'USD'>('MXN')
  const [numPartesKit, setNumPartesKit] = useState<number>(2)
  const [partesLtrs, setPartesLtrs] = useState<string[]>(['', '', '', ''])
  const [numPresentacionesKit, setNumPresentacionesKit] = useState<number>(1)

  // File upload state for PDFs
  const [fichaTecnicaFile, setFichaTecnicaFile] = useState<File | null>(null)
  const [fichaSeguridadFile, setFichaSeguridadFile] = useState<File | null>(null)
  const [activePdfPreview, setActivePdfPreview] = useState<'ficha_tecnica' | 'ficha_seguridad' | null>(null)
  const [activeKeyIndex, setActiveKeyIndex] = useState<number>(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1]
        resolve(base64String)
      }
      reader.onerror = error => reject(error)
    })
  }

  async function urlToBase64(url: string): Promise<string> {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1]
        resolve(base64String)
      }
      reader.onerror = error => reject(error)
    })
  }

  function calcularConsumoSugerido(p: any): number | null {
    if (p.tieneRendimiento && p.rendimiento && parseFloat(p.rendimiento) > 0) {
      return Number((1 / parseFloat(p.rendimiento)).toFixed(4))
    }
    if (p.espesorRecomendado && p.densidadRecomendada) {
      const espMatch = String(p.espesorRecomendado).match(/(\d+(\.\d+)?)/)
      const denMatch = String(p.densidadRecomendada).match(/(\d+(\.\d+)?)/)
      if (espMatch && denMatch) {
        const esp = parseFloat(espMatch[1])
        const den = parseFloat(denMatch[1])
        if (esp > 0 && den > 0) {
          return Number((esp * den).toFixed(3))
        }
      }
    }
    return null
  }

  async function extraerConGemini() {
    if (PRECONFIGURED_KEYS.length === 0) {
      alert("No hay ninguna API Key de Gemini configurada en el sistema.")
      return
    }

    let activeFile: File | null = null
    let activeUrl: string | null = null

    if (activePdfPreview === 'ficha_tecnica') {
      activeFile = fichaTecnicaFile
      activeUrl = formData.ficha_tecnica_url
    } else if (activePdfPreview === 'ficha_seguridad') {
      activeFile = fichaSeguridadFile
      activeUrl = formData.ficha_seguridad_url
    }

    if (!activeFile && !activeUrl) {
      alert("No hay ningún PDF seleccionado o cargado para analizar.")
      return
    }

    setIsExtracting(true)
    try {
      let base64Data = ''
      if (activeFile) {
        base64Data = await fileToBase64(activeFile)
      } else if (activeUrl) {
        base64Data = await urlToBase64(activeUrl)
      }

      const prompt = `Analiza esta ficha de producto y extrae la información para rellenar los siguientes campos. Devuelve un objeto JSON con las siguientes claves (y los tipos de datos correspondientes):
- nombre: string (nombre comercial corto del producto, ej. BucaTrafic, sin marcas como ®, TM)
- nota: string (breve descripción de una línea de para qué sirve o qué es, ej. Pintura epóxica de altos sólidos para tráfico vehicular)
- tieneRendimiento: boolean (true si se menciona rendimiento por m² o consumo por m²)
- rendimiento: number o null (si tieneRendimiento es true, extrae el rendimiento promedio en m² por litro o por kilogramo. Por ejemplo, si dice "rendimiento de 4 a 6 m²/L", extrae 5. Si no aplica, null)
- espesorRecomendado: string o null (espesor de película recomendado en milésimas de pulgada (mils) o micras, ej: "4 a 6 mils" o "100-150 micras")
- manosRecomendadas: string o null (número de capas o manos recomendadas, ej: "1 a 2 manos")
- densidadRecomendada: string o null (densidad o peso específico, ej: "1.25 g/cm³")
- pros: string o null (las 2 o 3 ventajas clave resumidas en 1 o 2 palabras cada una separadas por coma, ej: "Rápido secado, alta resistencia")
- cons: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)
- cuidadoCon: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)
- proporcionesMezcla: string o null (proporción de mezcla si es kit, o de volumen A:B, ej: "4 partes A : 1 parte B")

REGLA DE GUARDRAIL CRÍTICA: Queda estrictamente prohibido alucinar, inventar, deducir o asumir información genérica o de sentido común. Si un dato no está explícitamente mencionado en el texto de la ficha técnica/seguridad, debes establecer su valor exactamente en null. Para los campos "cons" y "cuidadoCon", debes retornar siempre el valor null de forma incondicional.

Responde ÚNICAMENTE con el objeto JSON válido en formato de texto plano. No incluyas bloques de código Markdown (como \`\`\`json), comentarios, ni texto introductorio.`

      // Try API Keys sequentially to support automatic rate-limit/error fallback
      let success = false
      let lastErrorMsg = ''

      for (let i = 0; i < PRECONFIGURED_KEYS.length; i++) {
        const currentKeyIndex = (activeKeyIndex + i) % PRECONFIGURED_KEYS.length
        const currentKey = PRECONFIGURED_KEYS[currentKeyIndex]

        try {
          console.log(`Intentando extracción con Gemini API Key (índice ${currentKeyIndex})...`)
          let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        data: base64Data,
                        mimeType: 'application/pdf'
                      }
                    },
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorMsg = errorData.error?.message || `HTTP ${response.status}`
            console.warn(`Error con gemini-2.5-flash: ${errorMsg}. Intentando fallback a gemini-1.5-flash...`)
            
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentKey}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          data: base64Data,
                          mimeType: 'application/pdf'
                        }
                      },
                      {
                        text: prompt
                      }
                    ]
                  }
                ],
                generationConfig: {
                  responseMimeType: "application/json"
                }
              })
            })

            if (!response.ok) {
              const errorDataFallback = await response.json().catch(() => ({}))
              throw new Error(errorDataFallback.error?.message || `HTTP ${response.status}`)
            }
          }

          const resJson = await response.json()
          const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text
          
          if (!textResponse) {
            throw new Error('La respuesta de Gemini no contiene texto.')
          }

          let extractedData: any
          try {
            extractedData = JSON.parse(textResponse.trim())
          } catch (e) {
            let cleanText = textResponse.trim()
            if (cleanText.startsWith('```')) {
              cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim()
            }
            extractedData = JSON.parse(cleanText)
          }

          // Update active index and form data on success
          setActiveKeyIndex(currentKeyIndex)
          setFormData((prev: any) => ({
            ...prev,
            nombre: extractedData.nombre || prev.nombre,
            nota: extractedData.nota || prev.nota,
            tieneRendimiento: extractedData.tieneRendimiento !== undefined ? extractedData.tieneRendimiento : prev.tieneRendimiento,
            rendimiento: extractedData.rendimiento !== null && extractedData.rendimiento !== undefined ? String(extractedData.rendimiento) : prev.rendimiento,
            espesorRecomendado: extractedData.espesorRecomendado || prev.espesorRecomendado,
            manosRecomendadas: extractedData.manosRecomendadas || prev.manosRecomendadas,
            densidadRecomendada: extractedData.densidadRecomendada || prev.densidadRecomendada,
            pros: extractedData.pros || prev.pros,
            cons: extractedData.cons || prev.cons,
            cuidadoCon: extractedData.cuidadoCon || prev.cuidadoCon,
            proporcionesMezcla: extractedData.proporcionesMezcla || prev.proporcionesMezcla,
          }))

          success = true
          alert("🎉 Información extraída con éxito de la ficha técnica/seguridad. Los campos han sido rellenados en el formulario de la izquierda. Por favor, revísalos y guarda el producto.")
          break // Exit key rotation loop
        } catch (err: any) {
          console.warn(`Error con la API Key en índice ${currentKeyIndex}:`, err.message)
          lastErrorMsg = err.message || 'Error desconocido'
        }
      }

      if (!success) {
        throw new Error(`Todas las API Keys fallaron. Último error: ${lastErrorMsg}`)
      }

    } catch (error: any) {
      console.error(error)
      alert(`❌ Error al extraer información con Gemini: ${error.message || 'Verifica que el PDF sea válido.'}`)
    } finally {
      setIsExtracting(false)
    }
  }

  // Automatically adjust and size kit presentations array based on selections
  useEffect(() => {
    if (!esKitProduct) return
    setKitPresentaciones(prev => {
      let updated = [...prev]
      // 1. Adjust number of presentations
      if (updated.length < numPresentacionesKit) {
        const padding = Array.from({ length: numPresentacionesKit - updated.length }).map(() => ({
          nombre: '',
          precio: '',
          moneda: 'MXN',
          partes: Array(numPartesKit).fill('')
        }))
        updated = [...updated, ...padding]
      } else if (updated.length > numPresentacionesKit) {
        updated = updated.slice(0, numPresentacionesKit)
      }

      // 2. Adjust number of parts for each presentation
      updated = updated.map(pres => {
        const currentPartes = pres.partes || []
        let newPartes = [...currentPartes]
        if (newPartes.length < numPartesKit) {
          const padLen = numPartesKit - newPartes.length
          newPartes = [...newPartes, ...Array(padLen).fill('')]
        } else if (newPartes.length > numPartesKit) {
          newPartes = newPartes.slice(0, numPartesKit)
        }
        return { ...pres, partes: newPartes }
      })

      return updated
    })
  }, [numPresentacionesKit, numPartesKit, esKitProduct])

  function updatePresentacion(idx: number, field: string, value: any) {
    setKitPresentaciones(prev => {
      const updated = [...prev]
      if (!updated[idx]) {
        updated[idx] = { nombre: '', precio: '', moneda: 'MXN', partes: Array(numPartesKit).fill('') }
      }
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  function updateParte(idx: number, partIdx: number, value: any) {
    setKitPresentaciones(prev => {
      const updated = [...prev]
      if (!updated[idx]) {
        updated[idx] = { nombre: '', precio: '', moneda: 'MXN', partes: Array(numPartesKit).fill('') }
      }
      const newPartes = [...(updated[idx].partes || [])]
      newPartes[partIdx] = value
      updated[idx] = { ...updated[idx], partes: newPartes }
      return updated
    })
  }

  async function loadProductos() {
    setLoading(true)
    const data = await fetchProductosSupabase(true) // includeDrafts = true en admin panel
    setProductos(data)
    setLoading(false)
  }

  // Systems state variables and migration
  const [currentTab, setCurrentTab] = useState<'productos' | 'sistemas' | 'migracion'>('productos')
  const [colaMigracion, setColaMigracion] = useState<FilaMigracion[]>([])
  const [procesandoCola, setProcesandoCola] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loadingSistemas, setLoadingSistemas] = useState(false)
  const [showSistemaForm, setShowSistemaForm] = useState(false)
  const [editingSistemaId, setEditingSistemaId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  
  const DEFAULT_SISTEMA = {
    nombre: '',
    descripcion: '',
    consumo_por_m2: '0.25',
    productos: [] as { producto_id: string; consumo_por_m2: string; orden: string }[]
  }
  const [sistemaFormData, setSistemaFormData] = useState(DEFAULT_SISTEMA)

  async function loadSistemas() {
    setLoadingSistemas(true)
    const data = await fetchSistemasSupabase()
    setSistemas(data)
    setLoadingSistemas(false)
  }

  function encontrarProductoPorNombreArchivo(filename: string) {
    let nameClean = filename.toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
    const stopWords = [".pdf", "tds", "sds", "ficha", "tecnica", "seguridad", "hoja", "msds"];
    stopWords.forEach(word => {
      nameClean = nameClean.replace(word, "");
    });
    nameClean = nameClean.trim();

    if (!nameClean) return null;

    let mejorMatch: any = null;
    let mejorScore = 0;

    productos.forEach(p => {
      const prodName = p.nombre.toLowerCase();
      if (nameClean.includes(prodName) || prodName.includes(nameClean)) {
        const score = nameClean.includes(prodName) ? prodName.length : nameClean.length;
        if (score > mejorScore) {
          mejorScore = score;
          mejorMatch = p;
        }
      }
    });

    return mejorMatch;
  }

  function determinarTipoDocArchivo(filename: string): 'ficha_tecnica' | 'ficha_seguridad' {
    const fname = filename.toLowerCase();
    if (fname.includes("msds") || fname.includes("sds") || fname.includes("seguridad") || fname.includes("safety")) {
      return 'ficha_seguridad';
    }
    return 'ficha_tecnica';
  }

  async function extraerDatosPdfGemini(file: File): Promise<any> {
    const base64Data = await fileToBase64(file);
    const prompt = `Analiza esta ficha de producto y extrae la información para rellenar los siguientes campos. Devuelve un objeto JSON con las siguientes claves (y los tipos de datos correspondientes):
- nombre: string (nombre comercial corto del producto, ej. BucaTrafic, sin marcas como ®, TM)
- nota: string (breve descripción de una línea de para qué sirve o qué es, ej. Pintura epóxica de altos sólidos para tráfico vehicular)
- tieneRendimiento: boolean (true si se menciona rendimiento por m² o consumo por m²)
- rendimiento: number o null (si tieneRendimiento es true, extrae el rendimiento promedio en m² por litro o por kilogramo. Por ejemplo, si dice "rendimiento de 4 a 6 m²/L", extrae 5. Si no aplica, null)
- espesorRecomendado: string o null (espesor de película recomendado en milésimas de pulgada (mils) o micras, ej: "4 a 6 mils" o "100-150 micras")
- manosRecomendadas: string o null (número de capas o manos recomendadas, ej: "1 a 2 manos")
- densidadRecomendada: string o null (densidad o peso específico, ej: "1.25 g/cm³")
- pros: string o null (las 2 o 3 ventajas clave resumidas en 1 o 2 palabras cada una separadas por coma, ej: "Rápido secado, alta resistencia")
- cons: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)
- cuidadoCon: null (debes establecer su valor siempre en null de forma incondicional. Queda estrictamente prohibido extraer o inventar información para este campo)
- proporcionesMezcla: string o null (proporción de mezcla si es kit, o de volumen A:B, ej: "4 partes A : 1 parte B")

REGLA DE GUARDRAIL CRÍTICA: Queda estrictamente prohibido alucinar, inventar, deducir o asumir información genérica o de sentido común. Si un dato no está explícitamente mencionado en el texto de la ficha técnica/seguridad, debes establecer su valor exactamente en null. Para los campos "cons" y "cuidadoCon", debes retornar siempre el valor null de forma incondicional.

Responde ÚNICAMENTE con el objeto JSON válido en formato de texto plano. No incluyas bloques de código Markdown (como \`\`\`json), comentarios, ni texto introductorio.`;
    
    let success = false;
    let lastErrorMsg = '';
    let extractedData: any = null;

    let currentKeyIndex = activeKeyIndex;
    for (let i = 0; i < PRECONFIGURED_KEYS.length; i++) {
      const targetIndex = (currentKeyIndex + i) % PRECONFIGURED_KEYS.length;
      const currentKey = PRECONFIGURED_KEYS[targetIndex];

      try {
        let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: 'application/pdf'
                    }
                  },
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
          console.warn(`Error con gemini-2.5-flash: ${errorMsg}. Intentando fallback a gemini-1.5-flash...`);

          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        data: base64Data,
                        mimeType: 'application/pdf'
                      }
                    },
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          });

          if (!response.ok) {
            const errorDataFallback = await response.json().catch(() => ({}));
            throw new Error(errorDataFallback.error?.message || `HTTP ${response.status}`);
          }
        }

        const resJson = await response.json();
        const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) {
          throw new Error('La respuesta de Gemini no contiene texto.');
        }

        try {
          extractedData = JSON.parse(textResponse.trim());
        } catch (e) {
          let cleanText = textResponse.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
          }
          extractedData = JSON.parse(cleanText);
        }

        setActiveKeyIndex(targetIndex);
        success = true;
        break;
      } catch (err: any) {
        lastErrorMsg = err.message || 'Error desconocido';
      }
    }

    if (!success) {
      throw new Error(lastErrorMsg || 'Error desconocido al consultar Gemini.');
    }

    return extractedData;
  }

  async function aplicarPropuestaWeb(item: FilaMigracion) {
    if (!item.propuesta) return;

    try {
      const payload: any = {
        ...item.propuesta,
        estado: 'completo',
        motivo_incompleto: null
      };

      // Safe conversions for edited values
      payload.tieneRendimiento = !!payload.tieneRendimiento;
      if (payload.tieneRendimiento && payload.rendimiento !== '' && payload.rendimiento !== null && payload.rendimiento !== undefined) {
        payload.rendimiento = parseFloat(payload.rendimiento) || null;
      } else {
        payload.rendimiento = null;
      }

      if (item.tipoDoc === 'ficha_tecnica') {
        payload.ficha_tecnica_url = item.pdfUrl || '';
      } else {
        payload.ficha_seguridad_url = item.pdfUrl || '';
      }

      if (item.productoAsociado) {
        await updateProductoSupabase(item.productoAsociado.id, payload, item.productoAsociado.updated_at);
        showMsg(`✅ Producto '${item.productoAsociado.nombre}' actualizado con éxito`, 'ok');
      } else {
        const nuevoPayload = {
          ...DEFAULT_PRODUCTO,
          ...payload,
          precio: payload.precio || 0,
          cantRef: payload.cantRef || 19,
          unidad: payload.unidad || 'L',
          moneda: payload.moneda || 'MXN',
          tieneRendimiento: !!payload.tieneRendimiento,
          estado: 'completo'
        };
        const nuevoId = await saveProductoSupabase(nuevoPayload);
        
        if (item.pdfUrl) {
          const finalUrl = await uploadPdfProducto(nuevoId, item.tipoDoc, item.file);
          const updatePayload: any = {};
          if (item.tipoDoc === 'ficha_tecnica') {
            updatePayload.ficha_tecnica_url = finalUrl;
          } else {
            updatePayload.ficha_seguridad_url = finalUrl;
          }
          await updateProductoSupabase(nuevoId, updatePayload);
        }
        showMsg(`✅ Nuevo producto '${payload.nombre}' creado e importado`, 'ok');
      }

      setColaMigracion(prev => prev.map(x => x.id === item.id ? { ...x, estado: 'guardado' } : x));
      loadProductos();
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al aplicar cambios en base de datos: ${err.message || 'Verifica tu conexión.'}`);
    }
  }

  // Cola de procesamiento automático en background
  useEffect(() => {
    if (procesandoCola) return;
    
    const siguiente = colaMigracion.find(item => item.estado === 'cola');
    if (!siguiente) return;

    setProcesandoCola(true);

    (async () => {
      const id = siguiente.id;
      setColaMigracion(prev => prev.map(item => item.id === id ? { ...item, estado: 'subiendo' } : item));
      
      try {
        const prodId = siguiente.productoAsociado?.id || `nuevo_${Date.now()}`;
        const publicUrl = await uploadPdfProducto(prodId, siguiente.tipoDoc, siguiente.file);
        
        setColaMigracion(prev => prev.map(item => item.id === id ? { ...item, estado: 'analizando', pdfUrl: publicUrl } : item));
        
        const extraidos = await extraerDatosPdfGemini(siguiente.file);
        
        // Asociación inteligente post-extracción
        const nombreExtraido = extraidos?.nombre?.trim().toLowerCase();
        let prodAsociadoFinal = siguiente.productoAsociado;
        if (nombreExtraido) {
          const matchExistente = productos.find(p => p.nombre.toLowerCase().trim() === nombreExtraido);
          if (matchExistente) {
            prodAsociadoFinal = matchExistente;
          }
        }
        
        setColaMigracion(prev => prev.map(item => item.id === id ? { 
          ...item, 
          estado: 'completado', 
          pdfUrl: publicUrl,
          productoAsociado: prodAsociadoFinal,
          propuesta: extraidos 
        } : item));
        
      } catch (err: any) {
        console.error("Error en procesamiento de cola:", err);
        setColaMigracion(prev => prev.map(item => item.id === id ? { 
          ...item, 
          estado: 'error', 
          errorMsg: err.message || 'Error al procesar PDF' 
        } : item));
      } finally {
        setTimeout(() => {
          setProcesandoCola(false);
        }, 3000);
      }
    })();
  }, [colaMigracion, procesandoCola, productos]);

  async function handleSistemaSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sistemaFormData.nombre.trim()) {
      showMsg('❌ El nombre del sistema es obligatorio', 'error')
      return
    }
    const validProds = sistemaFormData.productos
      .filter(p => p.producto_id)
      .map((p, i) => ({
        producto_id: p.producto_id,
        consumo_por_m2: parseFloat(p.consumo_por_m2) || 0.25,
        orden: i + 1
      }))

    setSaving(true)
    try {
      if (editingSistemaId) {
        await updateSistemaSupabase(editingSistemaId, sistemaFormData.nombre, sistemaFormData.descripcion, validProds)
        showMsg('✅ Sistema actualizado con éxito', 'ok')
      } else {
        await saveSistemaSupabase(sistemaFormData.nombre, sistemaFormData.descripcion, validProds)
        showMsg('✅ Sistema guardado con éxito', 'ok')
      }
      setShowSistemaForm(false)
      setEditingSistemaId(null)
      setSistemaFormData(DEFAULT_SISTEMA)
      loadSistemas()
    } catch (err) {
      showMsg('❌ Error al guardar el sistema', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSistemaEdit(sys: Sistema) {
    setSaving(true)
    try {
      const rels = await fetchSistemaProductosSupabase(sys.id)
      setSistemaFormData({
        nombre: sys.nombre,
        descripcion: sys.descripcion || '',
        consumo_por_m2: rels.length > 0 ? String(rels[0].consumo_por_m2) : '0.25',
        productos: rels.map(r => ({
          producto_id: r.producto_id,
          consumo_por_m2: String(r.consumo_por_m2),
          orden: String(r.orden)
        }))
      })
      setEditingSistemaId(sys.id)
      setShowSistemaForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      showMsg('❌ Error al cargar los detalles del sistema', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSistemaDelete(id: string, nombre: string) {
    if (confirm(`¿Seguro que deseas eliminar el sistema "${nombre}"?`)) {
      setLoadingSistemas(true)
      try {
        await deleteSistemaSupabase(id)
        showMsg('🗑️ Sistema eliminado', 'ok')
        loadSistemas()
      } catch (err) {
        showMsg('❌ Error al eliminar el sistema', 'error')
      } finally {
        setLoadingSistemas(false)
      }
    }
  }

  function handleSistemaCancel() {
    setShowSistemaForm(false)
    setEditingSistemaId(null)
    setSistemaFormData(DEFAULT_SISTEMA)
  }

  function agregarProductoAlSistema() {
    setSistemaFormData(prev => ({
      ...prev,
      productos: [
        ...prev.productos,
        {
          producto_id: '',
          consumo_por_m2: prev.consumo_por_m2,
          orden: String(prev.productos.length + 1)
        }
      ]
    }))
  }

  function reordenarProductos(fromIdx: number, toIdx: number) {
    setSistemaFormData(prev => {
      const updated = [...prev.productos]
      const [moved] = updated.splice(fromIdx, 1)
      updated.splice(toIdx, 0, moved)
      return { ...prev, productos: updated }
    })
  }

  function eliminarProductoDelSistema(idx: number) {
    setSistemaFormData(prev => ({
      ...prev,
      productos: prev.productos.filter((_, i) => i !== idx)
    }))
  }

  function actualizarProductoEnSistema(idx: number, field: string, value: string) {
    setSistemaFormData(prev => {
      const updated = [...prev.productos]
      updated[idx] = { ...updated[idx], [field]: value }

      // If product_id changes, auto-calculate suggested consumption from its technical data
      if (field === 'producto_id' && value) {
        const prod = productos.find(p => p.id === value)
        if (prod) {
          const sugerido = calcularConsumoSugerido(prod)
          if (sugerido !== null) {
            updated[idx].consumo_por_m2 = String(sugerido)
          } else {
            updated[idx].consumo_por_m2 = '0.25' // Default fallback
          }
        }
      }
      return { ...prev, productos: updated }
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setAuthChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setAuthChecking(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadProductos()
      loadSistemas()
    }
  }, [user])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      if (authIsSignUp) {
        if (!authEmail.endsWith('@bucamx.com') && authEmail !== 'sebastian.grajales.rmzz@gmail.com') {
          throw new Error('El correo debe terminar en @bucamx.com')
        }
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        })
        if (error) throw error
        
        if (data?.session) {
          showMsg('✅ Registro e inicio de sesión exitoso.', 'ok')
        } else {
          showMsg('✅ Cuenta registrada exitosamente.', 'ok')
          setAuthIsSignUp(false)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setAuthError(err.message || 'Credenciales incorrectas. Intenta de nuevo.')
    } finally {
      setAuthLoading(false)
    }
  }

  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate({ to: '/' })
  }

  useEffect(() => {
    async function fetchExchangeRate() {
      const apis = [
        'https://open.er-api.com/v6/latest/USD',
        'https://api.exchangerate-api.com/v4/latest/USD',
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
      ];
      for (const url of apis) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const data = await res.json()
          let rate: number | undefined
          if (url.includes('currency-api')) {
            rate = data?.usd?.mxn
          } else {
            rate = data?.rates?.MXN
          }
          if (rate && !isNaN(rate) && rate > 10 && rate < 30) {
            setTipoCambio(rate)
            return
          }
        } catch (e) {
          console.warn(`Failed to fetch exchange rate from ${url}:`, e)
        }
      }
    }
    fetchExchangeRate()
  }, [])

  function showMsg(texto: string, tipo: 'ok'|'error') {
    setMensaje({texto, tipo})
    setTimeout(() => setMensaje(null), 4000)
  }

  function validarCamposProducto(data: any): string[] {
    const missing: string[] = []
    
    if (!data.nombre?.trim()) {
      missing.push("Nombre comercial")
    }
    if (data.precio === '' || isNaN(Number(data.precio)) || Number(data.precio) <= 0) {
      missing.push("Precio válido")
    }
    if (data.cantRef === '' || isNaN(Number(data.cantRef)) || Number(data.cantRef) <= 0) {
      missing.push("Cantidad de referencia (envase)")
    }
    if (data.tieneRendimiento) {
      if (data.rendimiento === '' || isNaN(Number(data.rendimiento)) || Number(data.rendimiento) <= 0) {
        missing.push("Rendimiento por m²")
      }
    }
    
    const hasTds = !!data.ficha_tecnica_url || !!fichaTecnicaFile
    const hasSds = !!data.ficha_seguridad_url || !!fichaSeguridadFile
    
    if (!hasTds) {
      missing.push("Ficha Técnica (TDS) PDF")
    }
    if (!hasSds) {
      missing.push("Ficha de Seguridad (SDS) PDF")
    }
    
    return missing
  }

  const validationIssues = useMemo(() => validarCamposProducto(formData), [formData, fichaTecnicaFile, fichaSeguridadFile])
  const isValidToPublish = validationIssues.length === 0

  async function handleSave(estadoDestino: 'borrador' | 'completo') {
    if (!formData.nombre?.trim()) {
      showMsg('❌ El nombre comercial del producto es obligatorio', 'error')
      return
    }

    if (estadoDestino === 'borrador' && !formData.motivo_incompleto?.trim()) {
      showMsg('❌ Para guardar como borrador debes describir el motivo pendiente', 'error')
      return
    }

    setSaving(true)
    try {
      let finalFichaTecnica = formData.ficha_tecnica_url
      let finalFichaSeguridad = formData.ficha_seguridad_url

      const payload: any = {
        nombre: formData.nombre,
        cantRef: formData.cantRef !== '' ? Number(formData.cantRef) : null,
        unidad: formData.unidad,
        moneda: formData.moneda,
        precio: formData.precio !== '' ? Number(formData.precio) : null,
        tieneRendimiento: !!formData.tieneRendimiento,
        nota: formData.nota || '',
        rendimiento: (formData.tieneRendimiento && formData.rendimiento !== '') ? Number(formData.rendimiento) : null,
        espesorRecomendado: formData.espesorRecomendado || null,
        manosRecomendadas: formData.manosRecomendadas || null,
        pros: formData.pros || null,
        cons: formData.cons || null,
        cuidadoCon: formData.cuidadoCon || null,
        kitInfo: esKitProduct ? (() => {
          const validPresentaciones = kitPresentaciones
            .filter(pres => pres && pres.nombre && pres.precio !== '')
            .map(pres => ({
              nombre: pres.nombre,
              precio: parseFloat(pres.precio) || 0,
              moneda: pres.moneda || 'MXN',
              partes: (pres.partes || []).map((val: any) => parseFloat(val) || 0)
            }))
          return validPresentaciones.length > 0
            ? JSON.stringify({ numPartes: numPartesKit, presentaciones: validPresentaciones })
            : null
        })() : null,
        proporcionesMezcla: formData.proporcionesMezcla || null,
        densidadRecomendada: formData.densidadRecomendada || null,
        bitacora: formData.bitacora || null,
        estado: estadoDestino,
        motivo_incompleto: estadoDestino === 'borrador' ? formData.motivo_incompleto : null
      }

      if (editingId) {
        if (fichaTecnicaFile) {
          finalFichaTecnica = await uploadPdfProducto(editingId, 'ficha_tecnica', fichaTecnicaFile)
        }
        if (fichaSeguridadFile) {
          finalFichaSeguridad = await uploadPdfProducto(editingId, 'ficha_seguridad', fichaSeguridadFile)
        }

        payload.ficha_tecnica_url = finalFichaTecnica || null
        payload.ficha_seguridad_url = finalFichaSeguridad || null

        try {
          await updateProductoSupabase(editingId, payload, lastUpdatedAt)
        } catch (err: any) {
          if (err.message === 'CONCURRENCY_ERROR') {
            alert("❌ Conflicto de Concurrencia:\n\nEste producto fue modificado por otro usuario mientras lo editabas. Para evitar perder los cambios de otros, tus ediciones no se guardaron.\n\nPor favor, copia tu información, cierra este formulario, recarga la lista de productos y vuelve a intentarlo.")
            setSaving(false)
            return
          }
          throw err
        }

        await registrarLogActividad(user?.email || 'admin_anonimo', 'EDITAR', editingId, {
          nombre: payload.nombre,
          estado: estadoDestino
        })

        showMsg('✅ Producto actualizado con éxito', 'ok')
      } else {
        payload.ficha_tecnica_url = null
        payload.ficha_seguridad_url = null

        const newId = await saveProductoSupabase(payload)
        
        let updateNeeded = false
        const updatePayload: any = {}

        if (fichaTecnicaFile) {
          finalFichaTecnica = await uploadPdfProducto(newId, 'ficha_tecnica', fichaTecnicaFile)
          updatePayload.ficha_tecnica_url = finalFichaTecnica
          updateNeeded = true
        }
        if (fichaSeguridadFile) {
          finalFichaSeguridad = await uploadPdfProducto(newId, 'ficha_seguridad', fichaSeguridadFile)
          updatePayload.ficha_seguridad_url = finalFichaSeguridad
          updateNeeded = true
        }

        if (updateNeeded) {
          await updateProductoSupabase(newId, updatePayload)
        }

        await registrarLogActividad(user?.email || 'admin_anonimo', 'CREAR', newId, {
          nombre: payload.nombre,
          estado: estadoDestino
        })

        showMsg('✅ Producto guardado en la base de datos', 'ok')
      }

      setShowForm(false)
      setEditingId(null)
      setLastUpdatedAt(undefined)
      setFormData(DEFAULT_PRODUCTO)
      setEsKitProduct(false)
      setKitPresentaciones([])
      setNewKitNombre('')
      setNewKitPrecio('')
      setNewKitMoneda('MXN')
      setNumPartesKit(2)
      setPartesLtrs(['', '', '', ''])
      setNumPresentacionesKit(1)
      setFichaTecnicaFile(null)
      setFichaSeguridadFile(null)
      setActivePdfPreview(null)
      loadProductos()
    } catch (error) {
      console.error(error)
      showMsg('❌ Error al guardar. Verifica tu conexión con Supabase.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setLastUpdatedAt(undefined)
    setFormData(DEFAULT_PRODUCTO)
    setEsKitProduct(false)
    setKitPresentaciones([])
    setNewKitNombre('')
    setNewKitPrecio('')
    setNewKitMoneda('MXN')
    setNumPartesKit(2)
    setPartesLtrs(['', '', '', ''])
    setNumPresentacionesKit(1)
    setFichaTecnicaFile(null)
    setFichaSeguridadFile(null)
    setActivePdfPreview(null)
  }

  function handleEdit(p: Producto & {id: string, updated_at?: string, estado?: string, motivo_incompleto?: string}) {
    setFormData({
      nombre: p.nombre,
      cantRef: p.cantRef ?? '',
      unidad: p.unidad,
      moneda: p.moneda,
      precio: p.precio ?? '',
      tieneRendimiento: p.tieneRendimiento,
      nota: p.nota || '',
      rendimiento: p.rendimiento ?? '',
      espesorRecomendado: p.espesorRecomendado || '',
      manosRecomendadas: p.manosRecomendadas || '',
      pros: p.pros || '',
      cons: p.cons || '',
      cuidadoCon: p.cuidadoCon || '',
      kitInfo: p.kitInfo || '',
      proporcionesMezcla: p.proporcionesMezcla || '',
      densidadRecomendada: p.densidadRecomendada || '',
      bitacora: p.bitacora || '',
      ficha_tecnica_url: p.ficha_tecnica_url || '',
      ficha_seguridad_url: p.ficha_seguridad_url || '',
      estado: p.estado || 'borrador',
      motivo_incompleto: p.motivo_incompleto || ''
    })

    const parsed = parseKitInfo(p.kitInfo)
    setEsKitProduct(parsed.presentaciones.length > 0)
    setNumPartesKit(parsed.numPartes)
    setNumPresentacionesKit(parsed.presentaciones.length || 1)
    setKitPresentaciones(parsed.presentaciones)
    setNewKitNombre('')
    setNewKitPrecio('')
    setNewKitMoneda('MXN')
    setPartesLtrs(['', '', '', ''])
    setFichaTecnicaFile(null)
    setFichaSeguridadFile(null)

    if (p.ficha_tecnica_url) {
      setActivePdfPreview('ficha_tecnica')
    } else if (p.ficha_seguridad_url) {
      setActivePdfPreview('ficha_seguridad')
    } else {
      setActivePdfPreview(null)
    }

    setLastUpdatedAt(p.updated_at)
    setEditingId(p.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, nombre: string) {
    if (confirm(`¿Seguro que deseas eliminar "${nombre}"?`)) {
      await deleteProductoSupabase(id)
      await registrarLogActividad(user?.email || 'admin_anonimo', 'ELIMINAR', id, { nombre })
      showMsg('🗑️ Producto eliminado', 'ok')
      loadProductos()
    }
  }

  if (authChecking) {
    return (
      <div style={{minHeight:'100vh', background:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div style={{textAlign:'center', color:'#2563eb', fontFamily:'sans-serif'}}>
          <div style={{fontSize:'32px', marginBottom:'12px'}}>🔐</div>
          <p style={{fontWeight:600, color:'#1e293b'}}>Verificando sesión...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{minHeight:'100vh', background:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:'sans-serif'}}>
        <div style={{maxWidth:'400px', width:'100%', background:'white', padding:'32px', borderRadius:'16px', boxShadow:'0 10px 25px -5px rgba(37, 99, 235, 0.1), 0 8px 10px -6px rgba(37, 99, 235, 0.1)', border:'1px solid #bfdbfe', margin:'auto'}}>
          <div style={{textAlign:'center', marginBottom:'24px'}}>
            <div style={{width:'48px', height:'48px', background:'#2563eb', color:'white', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'12px', fontSize:'20px', fontWeight:800, margin:'0 auto 12px'}}>🔐</div>
            <h1 style={{margin:0, fontSize:'20px', fontWeight:700, color:'#1e293b'}}>Panel de Administración</h1>
            <p style={{margin:'4px 0 0', fontSize:'13px', color:'#64748b'}}>Acceso exclusivo para personal autorizado</p>
          </div>

          {authError && (
            <div style={{background:'#fee2e2', color:'#991b1b', padding:'10px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, marginBottom:'16px'}}>
              ⚠️ {authError}
            </div>
          )}

          {mensaje && (
            <div style={{background:'#dcfce7', color:'#166534', padding:'10px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, marginBottom:'16px'}}>
              {mensaje.texto}
            </div>
          )}

          <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:'16px'}}>
            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:600, color:'#374151', marginBottom:'6px'}}>Correo Electrónico *</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder=""
                style={{width:'100%', height:'38px', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box'}}
              />
            </div>

            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:600, color:'#374151', marginBottom:'6px'}}>Contraseña *</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                style={{width:'100%', height:'38px', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box'}}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              style={{width:'100%', height:'40px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s'}}
            >
              {authLoading ? 'Procesando...' : (authIsSignUp ? 'Registrarse' : 'Iniciar Sesión')}
            </button>
          </form>

          <div style={{marginTop:'20px', textAlign:'center', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
            <button
              onClick={() => {
                setAuthIsSignUp(!authIsSignUp)
                setAuthError('')
              }}
              style={{background:'none', border:'none', color:'#2563eb', fontSize:'13px', fontWeight:600, cursor:'pointer'}}
            >
              {authIsSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          </div>

          <div style={{marginTop:'16px', textAlign:'center'}}>
            <Link to="/" style={{fontSize:'12px', color:'#64748b', textDecoration:'none'}}>
              ← Volver al Cotizador
            </Link>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh', background:'#f8fafc', padding:'24px', fontFamily:'sans-serif'}}>
      <div style={{maxWidth:'1100px', margin:'0 auto'}}>
        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'white', padding:'16px 24px', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
          <div>
            <h1 style={{margin:0, fontSize:'20px', fontWeight:700, color:'#1e293b'}}>Panel de Administración — BUCA</h1>
            <p style={{margin:'4px 0 0', fontSize:'13px', color:'#64748b'}}>
              {currentTab === 'productos' 
                ? (loading ? 'Cargando productos...' : `${productos.length} productos en la base de datos`)
                : (loadingSistemas ? 'Cargando sistemas...' : `${sistemas.length} sistemas en la base de datos`)}
            </p>
          </div>
          <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
            {currentTab === 'productos' ? (
              <button
                disabled={showForm}
                onClick={() => {
                  if (!showForm) {
                    setEditingId(null)
                    setFormData(DEFAULT_PRODUCTO)
                    setEsKitProduct(false)
                    setKitPresentaciones([])
                    setNewKitNombre('')
                    setNewKitPrecio('')
                    setNewKitMoneda('MXN')
                    setShowForm(true)
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: showForm ? '#cbd5e1' : '#2563eb',
                  color: showForm ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: showForm ? 'not-allowed' : 'pointer',
                  opacity: showForm ? 0.7 : 1
                }}
              >
                + Nuevo Producto
              </button>
            ) : (
              <button
                disabled={showSistemaForm}
                onClick={() => {
                  if (!showSistemaForm) {
                    setEditingSistemaId(null)
                    setSistemaFormData(DEFAULT_SISTEMA)
                    setShowSistemaForm(true)
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: showSistemaForm ? '#cbd5e1' : '#7c3aed',
                  color: showSistemaForm ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: showSistemaForm ? 'not-allowed' : 'pointer',
                  opacity: showSistemaForm ? 0.7 : 1
                }}
              >
                + Nuevo Sistema
              </button>
            )}
            <Link to="/" style={{padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', color:'#374151', textDecoration:'none', background:'white'}}>
              ← Cotizador
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{display:'flex', gap:'12px', borderBottom:'1px solid #e2e8f0', paddingBottom:'8px', marginTop:'4px'}}>
          <button
            onClick={() => setCurrentTab('productos')}
            style={{
              padding: '8px 16px',
              background: currentTab === 'productos' ? '#2563eb' : 'transparent',
              color: currentTab === 'productos' ? 'white' : '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📦 Productos ({productos.length})
          </button>
          <button
            onClick={() => {
              setCurrentTab('sistemas');
              loadSistemas();
            }}
            style={{
              padding: '8px 16px',
              background: currentTab === 'sistemas' ? '#7c3aed' : 'transparent',
              color: currentTab === 'sistemas' ? 'white' : '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🧪 Sistemas Multicapa ({sistemas.length})
          </button>
          <button
            onClick={() => setCurrentTab('migracion')}
            style={{
              padding: '8px 16px',
              background: currentTab === 'migracion' ? '#0ea5e9' : 'transparent',
              color: currentTab === 'migracion' ? 'white' : '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📥 Importación Masiva (Drag & Drop)
          </button>
        </div>

        {/* Mensaje de estado */}
        {mensaje && (
          <div style={{padding:'12px 20px', borderRadius:'8px', background: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', fontWeight:600, fontSize:'14px'}}>
            {mensaje.texto}
          </div>
        )}

        {/* Formulario */}
        {currentTab === 'productos' && showForm && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '24px',
            alignItems: 'start',
            transition: 'all 0.3s ease'
          }}>
            {/* Left Column: Form */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(37, 99, 235, 0.15), 0 10px 10px -5px rgba(37, 99, 235, 0.1)',
              border: '2px solid #3b82f6',
            }}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
                <h2 style={{margin:0, fontSize:'17px', fontWeight:700, color:'#1e40af'}}>
                  {editingId ? '✏️ Editar Producto' : '➕ Agregar Nuevo Producto'}
                </h2>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{padding:'6px 12px', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', fontSize:'13px', fontWeight:600, cursor:'pointer'}}
                >
                  ✕ Cancelar
                </button>
              </div>

              {/* Selector de producto existente */}
              <div style={{background:'#eff6ff', padding:'16px', borderRadius:'8px', marginBottom:'20px', border:'1px solid #bfdbfe'}}>
                <label style={{display:'block', fontSize:'13px', fontWeight:700, color:'#1d4ed8', marginBottom:'8px'}}>
                  ¿Quieres editar un producto existente? Selecciónalo aquí:
                </label>
                <select
                  style={{width:'100%', padding:'8px', border:'1px solid #93c5fd', borderRadius:'6px', fontSize:'13px', background:'white'}}
                  value={editingId || ''}
                  onChange={(e) => {
                    const p = productos.find(prod => prod.id === e.target.value)
                    if (p) {
                      handleEdit(p)
                    } else {
                      setEditingId(null)
                      setFormData(DEFAULT_PRODUCTO)
                    }
                  }}
                >
                  <option value="">-- Seleccionar producto para editar --</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <form onSubmit={e => e.preventDefault()} style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px', alignItems:'start'}}>

                <div>
                  <label style={labelStyle}>Nombre del Producto *</label>
                  <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputStyle} placeholder="Ej. BucaTrafic" />
                </div>

                <div>
                  <label style={labelStyle}>Unidad</label>
                  <select value={formData.unidad} onChange={e => setFormData({...formData, unidad: e.target.value})} style={inputStyle}>
                    <option value="L">L (Litros)</option>
                    <option value="Gal">Gal (Galones)</option>
                    <option value="Kg">Kg (Kilogramos)</option>
                    <option value="Cubeta">Cubeta</option>
                    <option value="Saco">Saco</option>
                    <option value="Kit">Kit</option>
                    <option value="Pieza">Pieza</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Moneda</label>
                  <select value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value as 'MXN'|'USD'})} style={inputStyle}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Precio Unitario *</label>
                  <input type="number" step="0.01" required value={formData.precio} onChange={e => setFormData({...formData, precio: e.target.value})} style={inputStyle} placeholder="0.00" />
                </div>

                <div>
                  <label style={labelStyle}>Cantidad de Referencia (tamaño del envase)</label>
                  <input type="number" step="0.1" required value={formData.cantRef} onChange={e => setFormData({...formData, cantRef: e.target.value})} style={inputStyle} placeholder="Ej. 19 (litros)" />
                </div>

                <div style={{gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px'}}>
                  <div>
                    <label style={labelStyle}>Descripción</label>
                    <input value={formData.nota} onChange={e => setFormData({...formData, nota: e.target.value})} style={inputStyle} placeholder="Ej. Tráfico vehicular" />
                  </div>
                  <div>
                    <label style={labelStyle}>Bitácora</label>
                    <textarea
                      rows={3}
                      value={formData.bitacora || ''}
                      onChange={e => setFormData({...formData, bitacora: e.target.value})}
                      style={{
                        ...inputStyle,
                        height: 'auto',
                        minHeight: '80px',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                      placeholder="Notas internas, registro de cambios, etc."
                    />
                  </div>
                </div>

                {/* Rendimiento */}
                <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                  <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'14px', fontWeight:500}}>
                    <input type="checkbox" checked={formData.tieneRendimiento} onChange={e => setFormData({...formData, tieneRendimiento: e.target.checked})} />
                    ¿Este producto se calcula por metros cuadrados (rendimiento)?
                  </label>
                </div>

                {formData.tieneRendimiento && (
                  <div>
                    <label style={{...labelStyle, color:'#1d4ed8'}}>Rendimiento (m² por {formData.unidad})</label>
                    <input type="number" step="0.1" value={formData.rendimiento} onChange={e => setFormData({...formData, rendimiento: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} placeholder="Ej. 5" />
                  </div>
                )}

                {/* Especificaciones técnicas */}
                <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px'}}>
                  <div>
                    <label style={{...labelStyle, color:'#1d4ed8'}}>Espesor Recomendado</label>
                    <input placeholder="Ej. 4 a 6 milésimas" value={formData.espesorRecomendado || ''} onChange={e => setFormData({...formData, espesorRecomendado: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                  </div>
                  <div>
                    <label style={{...labelStyle, color:'#1d4ed8'}}>Manos / Pasadas Recomendadas</label>
                    <input placeholder="Ej. 1 a 2 manos" value={formData.manosRecomendadas || ''} onChange={e => setFormData({...formData, manosRecomendadas: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                  </div>
                  <div>
                    <label style={{...labelStyle, color:'#1d4ed8'}}>Densidad Recomendada</label>
                    <input placeholder="Ej. 1.8 kg/L" value={formData.densidadRecomendada || ''} onChange={e => setFormData({...formData, densidadRecomendada: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                  </div>
                </div>

                {/* Documentación técnica */}
                <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                  <h3 style={{fontSize:'14px', fontWeight:700, color:'#0369a1', marginBottom:'12px'}}>📄 Documentación Técnica (PDFs)</h3>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
                    <div>
                      <label style={{...labelStyle, color:'#0369a1'}}>Ficha Técnica (TDS)</label>
                      
                      {formData.ficha_tecnica_url && (
                        <div style={{display:'flex', alignItems:'center', gap:'8px', background:'#f0f9ff', padding:'6px 10px', borderRadius:'6px', border:'1px solid #7dd3fc', marginBottom:'8px'}}>
                          <span style={{fontSize:'12px', color:'#0369a1', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>
                            📄 Ya cargado en base de datos
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if(confirm("¿Seguro que deseas eliminar el archivo de ficha técnica?")) {
                                setFormData({...formData, ficha_tecnica_url: ''})
                                setFichaTecnicaFile(null)
                              }
                            }}
                            style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'12px', fontWeight:600}}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => fileInputTdsRef.current?.click()}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: '2px dashed #bae6fd',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s',
                          marginBottom: '8px',
                          outline: 'none'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#e0f2fe';
                          e.currentTarget.style.borderColor = '#7dd3fc';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#f0f9ff';
                          e.currentTarget.style.borderColor = '#bae6fd';
                        }}
                      >
                        📁 Importar desde mis archivos
                      </button>
                      <input
                        ref={fileInputTdsRef}
                        type="file"
                        accept=".pdf"
                        onChange={e => {
                          const file = e.target.files?.[0] || null
                          setFichaTecnicaFile(file)
                          if (file) {
                            setActivePdfPreview('ficha_tecnica')
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                      
                      {fichaTecnicaFile && (
                        <div style={{fontSize:'11px', color:'#16a34a', marginTop:'4px', display:'flex', justifyContent:'space-between'}}>
                          <span>📎 Nuevo archivo: {fichaTecnicaFile.name}</span>
                          <button type="button" onClick={() => setFichaTecnicaFile(null)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:0}}>Quitar</button>
                        </div>
                      )}

                      <div style={{marginTop:'8px'}}>
                        <label style={{fontSize:'11px', color:'#64748b', display:'block', marginBottom:'2px'}}>O introduce URL manual:</label>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={formData.ficha_tecnica_url || ''}
                          onChange={e => {
                            setFormData({...formData, ficha_tecnica_url: e.target.value})
                            if (e.target.value) {
                              setActivePdfPreview('ficha_tecnica')
                            }
                          }}
                          style={{...inputStyle, height:'30px', fontSize:'12px', borderColor:'#bae6fd'}}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{...labelStyle, color:'#0369a1'}}>Hoja de Seguridad (SDS)</label>
                      
                      {formData.ficha_seguridad_url && (
                        <div style={{display:'flex', alignItems:'center', gap:'8px', background:'#fbf7f0', padding:'6px 10px', borderRadius:'6px', border:'1px solid #fed7aa', marginBottom:'8px'}}>
                          <span style={{fontSize:'12px', color:'#c2410c', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>
                            🛡️ Ya cargado en base de datos
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if(confirm("¿Seguro que deseas eliminar el archivo de hoja de seguridad?")) {
                                setFormData({...formData, ficha_seguridad_url: ''})
                                setFichaSeguridadFile(null)
                              }
                            }}
                            style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'12px', fontWeight:600}}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => fileInputSdsRef.current?.click()}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: '#fff7ed',
                          color: '#ea580c',
                          border: '2px dashed #fed7aa',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s',
                          marginBottom: '8px',
                          outline: 'none'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#ffedd5';
                          e.currentTarget.style.borderColor = '#fdba74';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#fff7ed';
                          e.currentTarget.style.borderColor = '#fed7aa';
                        }}
                      >
                        🛡️ Importar desde mis archivos
                      </button>
                      <input
                        ref={fileInputSdsRef}
                        type="file"
                        accept=".pdf"
                        onChange={e => {
                          const file = e.target.files?.[0] || null
                          setFichaSeguridadFile(file)
                          if (file) {
                            setActivePdfPreview('ficha_seguridad')
                          }
                        }}
                        style={{ display: 'none' }}
                      />

                      {fichaSeguridadFile && (
                        <div style={{fontSize:'11px', color:'#16a34a', marginTop:'4px', display:'flex', justifyContent:'space-between'}}>
                          <span>📎 Nuevo archivo: {fichaSeguridadFile.name}</span>
                          <button type="button" onClick={() => setFichaSeguridadFile(null)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:0}}>Quitar</button>
                        </div>
                      )}

                      <div style={{marginTop:'8px'}}>
                        <label style={{fontSize:'11px', color:'#64748b', display:'block', marginBottom:'2px'}}>O introduce URL manual:</label>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={formData.ficha_seguridad_url || ''}
                          onChange={e => {
                            setFormData({...formData, ficha_seguridad_url: e.target.value})
                            if (e.target.value) {
                              setActivePdfPreview('ficha_seguridad')
                            }
                          }}
                          style={{...inputStyle, height:'30px', fontSize:'12px', borderColor:'#bae6fd'}}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kit y Mezcla */}
                <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                  <h3 style={{fontSize:'14px', fontWeight:700, color:'#7c3aed', marginBottom: '12px'}}>📦 Configuración de Kit y Mezcla</h3>
                  
                  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px', marginBottom: '12px', alignItems:'start'}}>
                    <div>
                      <label style={{...labelStyle, color:'#0369a1'}}>🧪 Proporciones de Mezcla</label>
                      <input
                        placeholder="Ej: 2:1 (Parte A : Parte B) · 3:1:0.5 si es tricomponente"
                        value={formData.proporcionesMezcla || ''}
                        onChange={e => setFormData({...formData, proporcionesMezcla: e.target.value})}
                        style={{...inputStyle, borderColor:'#7dd3fc', background:'#f0f9ff'}}
                      />
                      <span style={{fontSize:'11px', color:'#0369a1', marginTop:'3px', display:'block'}}>Para bicomponentes y tricomponentes</span>
                    </div>
                    
                    <div>
                      <label style={{...labelStyle, color:'#7c3aed'}}>¿Este producto se vende en diferentes presentaciones (Kit)?</label>
                      <div style={{display:'flex', gap:'12px', alignItems:'center', height:'38px'}}>
                        <label style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px'}}>
                          <input
                            type="checkbox"
                            checked={esKitProduct}
                            onChange={(e) => setEsKitProduct(e.target.checked)}
                          />
                          Sí, configurar presentaciones de kit
                        </label>
                      </div>
                    </div>
                  </div>

                  {esKitProduct && (
                    <div style={{background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:'8px', padding:'16px', marginBottom:'16px'}}>
                      <h4 style={{margin:'0 0 12px', fontSize:'13px', fontWeight:700, color:'#6d28d9'}}>Presentaciones del Kit</h4>
                      
                      {/* Choose how many parts and presentations */}
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px', background:'white', padding:'12px', borderRadius:'6px', border:'1px solid #e2e8f0'}}>
                        <div>
                          <label style={{fontSize:'12px', fontWeight:700, color:'#6d28d9', display:'block', marginBottom:'6px'}}>
                            ¿Cuántas partes tiene el kit?
                          </label>
                          <select
                            value={numPartesKit}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 2
                              setNumPartesKit(val)
                            }}
                            style={{...inputStyle, height:'34px', padding:'4px 8px'}}
                          >
                            <option value="1">1 Parte (Monocomponente)</option>
                            <option value="2">2 Partes (Bicomponente)</option>
                            <option value="3">3 Partes (Tricomponente)</option>
                            <option value="4">4 Partes (Tetracomponente)</option>
                          </select>
                        </div>
                        
                        <div>
                          <label style={{fontSize:'12px', fontWeight:700, color:'#6d28d9', display:'block', marginBottom:'6px'}}>
                            ¿Cuántas presentaciones de kit hay?
                          </label>
                          <select
                            value={numPresentacionesKit}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 1
                              setNumPresentacionesKit(val)
                            }}
                            style={{...inputStyle, height:'34px', padding:'4px 8px'}}
                          >
                            {[1, 2, 3, 4, 5, 6].map(n => (
                              <option key={n} value={n}>{n} {n === 1 ? 'Presentación' : 'Presentaciones'}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Dynamic list of presentations fields */}
                      <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                        {Array.from({ length: numPresentacionesKit }).map((_, idx) => (
                          <div key={idx} style={{background:'white', padding:'16px', borderRadius:'8px', border:'1px solid #e2e8f0', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'}}>
                            <h5 style={{margin:'0 0 12px', fontSize:'13px', fontWeight:700, color:'#475569'}}>
                              Presentación #{idx + 1}
                            </h5>
                            
                            <div style={{display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end'}}>
                              <div style={{flex:'2 1 200px'}}>
                                <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                  Nombre / Tamaño (ej. Kit 3L)
                                </label>
                                <input
                                  type="text"
                                  value={kitPresentaciones[idx]?.nombre || ''}
                                  onChange={e => updatePresentacion(idx, 'nombre', e.target.value)}
                                  placeholder="Ej. Kit 3L"
                                  style={inputStyle}
                                />
                              </div>
                              
                              <div style={{flex:'1 1 120px'}}>
                                <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                  Precio
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={kitPresentaciones[idx]?.precio ?? ''}
                                  onChange={e => updatePresentacion(idx, 'precio', e.target.value)}
                                  placeholder="0.00"
                                  style={inputStyle}
                                />
                              </div>
                              
                              <div style={{width:'100px'}}>
                                <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                  Moneda
                                </label>
                                <select
                                  value={kitPresentaciones[idx]?.moneda || 'MXN'}
                                  onChange={e => updatePresentacion(idx, 'moneda', e.target.value)}
                                  style={inputStyle}
                                >
                                  <option value="MXN">MXN</option>
                                  <option value="USD">USD</option>
                                </select>
                              </div>
                            </div>

                            {/* Volumes per part */}
                            <div style={{marginTop:'12px', borderTop:'1px dashed #f1f5f9', paddingTop:'12px'}}>
                              <label style={{fontSize:'11px', fontWeight:700, color:'#0369a1', display:'block', marginBottom:'6px'}}>
                                Volumen por cada Parte (Litros):
                              </label>
                              <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                                {Array.from({ length: numPartesKit }).map((_, partIdx) => (
                                  <div key={partIdx} style={{flex:'1 1 80px'}}>
                                    <label style={{fontSize:'10px', fontWeight:600, color:'#0284c7', display:'block', marginBottom:'2px'}}>
                                      Parte {String.fromCharCode(65 + partIdx)} (L)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={kitPresentaciones[idx]?.partes?.[partIdx] ?? ''}
                                      onChange={e => updateParte(idx, partIdx, e.target.value)}
                                      placeholder="0.00"
                                      style={{...inputStyle, height:'32px', padding:'4px 8px', fontSize:'12px'}}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Pros / Cons */}
                <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px'}}>
                  <div>
                    <label style={{...labelStyle, color:'#166534'}}>✅ Pros (Ventajas)</label>
                    <input placeholder="Ej. Secado rápido" value={formData.pros || ''} onChange={e => setFormData({...formData, pros: e.target.value})} style={{...inputStyle, borderColor:'#86efac', background:'#f0fdf4'}} />
                  </div>
                  <div>
                    <label style={{...labelStyle, color:'#9a3412'}}>⚠️ Cons (Limitantes)</label>
                    <input placeholder="Ej. Sensible a humedad" value={formData.cons || ''} onChange={e => setFormData({...formData, cons: e.target.value})} style={{...inputStyle, borderColor:'#fdba74', background:'#fff7ed'}} />
                  </div>
                  <div>
                    <label style={{...labelStyle, color:'#991b1b'}}>🚫 Cuidado con</label>
                    <input placeholder="Ej. No usar en asfalto" value={formData.cuidadoCon || ''} onChange={e => setFormData({...formData, cuidadoCon: e.target.value})} style={{...inputStyle, borderColor:'#fca5a5', background:'#fef2f2'}} />
                  </div>
                </div>

                {/* Borrador Motivo Area (solo si no es válido para publicar) */}
                {!isValidToPublish && (
                  <div style={{gridColumn:'1 / -1', display:'flex', flexDirection:'column', gap:'4px', marginTop:'8px'}}>
                    <label style={{fontSize:'12px', fontWeight:700, color:'#b45309'}}>
                      Motivo de Borrador / Datos Pendientes *
                    </label>
                    <textarea
                      placeholder="Indica qué información hace falta para publicar el producto más adelante (ej: esperando hoja de seguridad del proveedor)..."
                      value={formData.motivo_incompleto || ''}
                      onChange={e => setFormData({...formData, motivo_incompleto: e.target.value})}
                      style={{...inputStyle, height:'60px', padding:'8px', fontSize:'13px', borderColor:'#f59e0b', background:'#fffbeb', resize:'vertical', fontFamily:'inherit'}}
                    />
                  </div>
                )}

                {/* Diagnostics Banner */}
                {validationIssues.length > 0 && (
                  <div style={{gridColumn:'1 / -1', background:'#fffbeb', border:'1px solid #fef3c7', padding:'12px', borderRadius:'8px', marginTop:'8px'}}>
                    <span style={{fontSize:'13px', fontWeight:700, color:'#b45309', display:'block', marginBottom:'4px'}}>
                      ⚠️ Requisitos pendientes para publicar producto en el cotizador:
                    </span>
                    <ul style={{margin:0, paddingLeft:'20px', fontSize:'12px', color:'#78350f'}}>
                      {validationIssues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                    <p style={{margin:'6px 0 0', fontSize:'11px', color:'#92400e'}}>
                      Puedes guardarlo como Borrador temporal mientras consigues esta información.
                    </p>
                  </div>
                )}

                <div style={{gridColumn:'1 / -1', display:'flex', gap:'12px', justifyContent:'flex-end', paddingTop:'12px', borderTop:'1px solid #f1f5f9', marginTop:'8px'}}>
                  <button
                    type="button"
                    onClick={handleCancel}
                    style={{padding:'10px 20px', background:'#e2e8f0', color:'#475569', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:600, cursor:'pointer'}}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave('borrador')}
                    style={{
                      padding:'10px 20px', 
                      background: saving ? '#cbd5e1' : '#f59e0b', 
                      color:'white', 
                      border:'none', 
                      borderRadius:'8px', 
                      fontSize:'14px', 
                      fontWeight:600, 
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {saving ? 'Guardando...' : '💾 Guardar como Borrador'}
                  </button>

                  <button
                    type="button"
                    disabled={saving || !isValidToPublish}
                    onClick={() => handleSave('completo')}
                    style={{
                      padding:'10px 20px', 
                      background: (saving || !isValidToPublish) ? '#cbd5e1' : '#0284c7', 
                      color: (saving || !isValidToPublish) ? '#64748b' : 'white', 
                      border:'none', 
                      borderRadius:'8px', 
                      fontSize:'14px', 
                      fontWeight:700, 
                      cursor: (saving || !isValidToPublish) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {saving ? 'Guardando...' : (editingId ? '🚀 Publicar Cambios' : '🚀 Publicar Producto')}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: PDF Viewer and AI extractor */}
            <div style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(37, 99, 235, 0.15), 0 10px 10px -5px rgba(37, 99, 235, 0.1)',
              border: '2px solid #0284c7',
              position: 'sticky',
              top: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              minHeight: '600px'
            }}>
              <div style={{borderBottom:'1px solid #e2e8f0', paddingBottom:'12px'}}>
                <h3 style={{margin:0, fontSize:'16px', fontWeight:700, color:'#0369a1', display:'flex', alignItems:'center', gap:'8px'}}>
                  🛡️ Referencia de PDF y Asistente IA
                </h3>
                <p style={{margin:'4px 0 0', fontSize:'12px', color:'#64748b'}}>
                  Visualiza las fichas técnicas y de seguridad del producto y utiliza Gemini para autocompletar la información.
                </p>
              </div>

              {/* Gemini API Key Configuration */}
              <div style={{background:'#f0f9ff', padding:'12px', borderRadius:'8px', border:'1px solid #bae6fd'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                  <span style={{fontSize:'12px', fontWeight:700, color:'#0369a1', display:'flex', alignItems:'center', gap:'4px'}}>
                    🔑 API Key de Google Gemini
                  </span>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                  <div style={{fontFamily:'monospace', fontSize:'12px', color:'#334155', background:'#e0f2fe', padding:'6px 10px', borderRadius:'6px', border:'1px solid #bae6fd'}}>
                    {getMaskedKey(PRECONFIGURED_KEYS[activeKeyIndex] || '')}
                  </div>
                  <div style={{fontSize:'11px', color:'#047857', fontWeight:600}}>
                    ✅ API Key integrada y protegida
                  </div>
                </div>
              </div>

              {/* Tab Selector */}
              <div style={{display:'flex', gap:'8px', borderBottom:'2px solid #f1f5f9', paddingBottom:'8px'}}>
                <button
                  type="button"
                  onClick={() => setActivePdfPreview('ficha_tecnica')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: activePdfPreview === 'ficha_tecnica' ? '#0284c7' : '#f1f5f9',
                    color: activePdfPreview === 'ficha_tecnica' ? 'white' : '#475569',
                    border: 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  📄 Ficha Técnica (TDS) { (fichaTecnicaFile || formData.ficha_tecnica_url) ? '•' : '' }
                </button>
                <button
                  type="button"
                  onClick={() => setActivePdfPreview('ficha_seguridad')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: activePdfPreview === 'ficha_seguridad' ? '#0284c7' : '#f1f5f9',
                    color: activePdfPreview === 'ficha_seguridad' ? 'white' : '#475569',
                    border: 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  🛡️ Hoja de Seguridad (SDS) { (fichaSeguridadFile || formData.ficha_seguridad_url) ? '•' : '' }
                </button>
              </div>

              {/* AI Extraction Button */}
              {((activePdfPreview === 'ficha_tecnica' && (fichaTecnicaFile || formData.ficha_tecnica_url)) ||
                (activePdfPreview === 'ficha_seguridad' && (fichaSeguridadFile || formData.ficha_seguridad_url))) ? (
                <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                  <button
                    type="button"
                    disabled={isExtracting}
                    onClick={extraerConGemini}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: isExtracting ? '#94a3b8' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: isExtracting ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {isExtracting ? (
                      <>⏳ Analizando PDF y extrayendo campos...</>
                    ) : (
                      <>🤖 Rellenar campos automáticamente con Gemini IA</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activePdfPreview === 'ficha_tecnica') {
                        fileInputTdsRef.current?.click()
                      } else {
                        fileInputSdsRef.current?.click()
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.borderColor = '#94a3b8';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                  >
                    📁 Reemplazar archivo PDF
                  </button>
                </div>
              ) : null}

              {/* PDF Viewer Display */}
              <div style={{flex:1, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                {(() => {
                  const hasLocal = activePdfPreview === 'ficha_tecnica' ? !!fichaTecnicaFile : !!fichaSeguridadFile
                  const hasRemote = activePdfPreview === 'ficha_tecnica' ? !!formData.ficha_tecnica_url : !!formData.ficha_seguridad_url
                  
                  if (!activePdfPreview) {
                    return (
                      <div style={{padding:'24px', textAlign:'center', color:'#64748b'}}>
                        <div style={{fontSize:'36px', marginBottom:'8px'}}>📄</div>
                        <p style={{fontSize:'13px', fontWeight:600}}>Selecciona Ficha Técnica o Hoja de Seguridad arriba para ver el visor.</p>
                      </div>
                    )
                  }

                  if (!hasLocal && !hasRemote) {
                    const isTds = activePdfPreview === 'ficha_tecnica'
                    return (
                      <div style={{padding:'24px', textAlign:'center', color:'#64748b', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px'}}>
                        <div style={{fontSize:'36px', marginBottom:'4px'}}>📤</div>
                        <p style={{fontSize:'13px', fontWeight:600, margin:0}}>No hay ningún archivo cargado.</p>
                        <p style={{fontSize:'12px', color:'#94a3b8', margin:0, maxWidth:'280px'}}>
                          Selecciona un archivo PDF local para previsualizarlo y poder rellenar el formulario con IA.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (isTds) {
                              fileInputTdsRef.current?.click()
                            } else {
                              fileInputSdsRef.current?.click()
                            }
                          }}
                          style={{
                            marginTop: '8px',
                            padding: '8px 16px',
                            background: isTds ? '#f0f9ff' : '#fff7ed',
                            color: isTds ? '#0284c7' : '#ea580c',
                            border: `1px solid ${isTds ? '#bae6fd' : '#fed7aa'}`,
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = isTds ? '#e0f2fe' : '#ffedd5';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = isTds ? '#f0f9ff' : '#fff7ed';
                          }}
                        >
                          {isTds ? '📁 Importar Ficha Técnica (TDS)' : '🛡️ Importar Hoja de Seguridad (SDS)'}
                        </button>
                      </div>
                    )
                  }

                  const previewUrl = activePdfPreview === 'ficha_tecnica'
                    ? (fichaTecnicaFile ? URL.createObjectURL(fichaTecnicaFile) : formData.ficha_tecnica_url)
                    : (fichaSeguridadFile ? URL.createObjectURL(fichaSeguridadFile) : formData.ficha_seguridad_url)

                  return (
                    <iframe
                      src={previewUrl}
                      title="PDF Preview"
                      style={{width:'100%', height:'100%', border:'none', minHeight:'450px'}}
                    />
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Lista de productos */}
        {currentTab === 'productos' && !showForm && (
          <div style={{background:'white', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'}}>
            {loading ? (
              <div style={{padding:'60px', textAlign:'center', color:'#64748b'}}>Conectando con Supabase...</div>
            ) : productos.length === 0 ? (
              <div style={{padding:'60px', textAlign:'center'}}>
                <div style={{fontSize:'48px', marginBottom:'12px'}}>📦</div>
                <h3 style={{color:'#1e293b', margin:'0 0 8px'}}>No hay productos aún</h3>
                <p style={{color:'#64748b', fontSize:'14px'}}>La migración debería haber creado los productos automáticamente. Verifica que la integración de Supabase con GitHub esté activa.</p>
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                  <thead>
                    <tr style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
                      <th style={thStyle}>Producto</th>
                      <th style={thStyle}>Precio</th>
                      <th style={thStyle}>Unidad</th>
                      <th style={thStyle}>Kit</th>
                      <th style={thStyle}>Rendimiento</th>
                      <th style={thStyle}>Densidad</th>
                      <th style={thStyle}>Nota</th>
                      <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map(p => (
                      <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                        <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>
                          {p.nombre}
                          {p.kitInfo && (p.kitInfo.startsWith('[') || p.kitInfo.startsWith('{')) && (() => {
                            const parsed = parseKitInfo(p.kitInfo)
                            return (
                              <div style={{fontSize:'11px', fontWeight:400, color:'#7c3aed', marginTop:'4px'}}>
                                📦 Presentaciones: {parsed.presentaciones.map((k: any) => {
                                  const partsStr = k.partes && k.partes.length > 0 ? ` [${k.partes.join('+')}L]` : ''
                                  return `${k.nombre}${partsStr} (${k.moneda === 'USD' ? '≈$' : '$'}${k.precio} ${k.moneda})`
                                }).join(' · ')}
                              </div>
                            )
                          })()}
                          {p.proporcionesMezcla && (
                            <div style={{fontSize:'11px', fontWeight:400, color:'#0369a1', marginTop:'2px'}}>
                              🧪 Mezcla: {p.proporcionesMezcla}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                            <div>
                              <span style={{fontWeight:700, color:'#166534'}}>
                                MXN ${p.moneda === 'USD'
                                  ? ((Number(p.precio) || 0) * tipoCambio).toFixed(2)
                                  : (Number(p.precio) || 0).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span style={{fontSize:'11px', color:'#0369a1', fontWeight:500}}>
                                USD ≈${p.moneda === 'USD'
                                  ? (Number(p.precio) || 0).toFixed(2)
                                  : ((Number(p.precio) || 0) / tipoCambio).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>{p.unidad}</td>
                        <td style={tdStyle}>
                          {p.kitInfo && (p.kitInfo.startsWith('[') || p.kitInfo.startsWith('{')) ? (() => {
                            const parsed = parseKitInfo(p.kitInfo)
                            return (
                              <span style={{color: '#7c3aed', fontWeight: 600}}>
                                {parsed.presentaciones.map((k: any) => {
                                  const partsStr = k.partes && k.partes.length > 0 ? ` (${k.partes.join('+')}L)` : ''
                                  return `${k.nombre}${partsStr}`
                                }).join(', ')}
                              </span>
                            )
                          })() : (
                            p.kitInfo || <span style={{color:'#cbd5e1'}}>—</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {p.tieneRendimiento ? `${p.rendimiento} m²/${p.unidad}` : <span style={{color:'#cbd5e1'}}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          {p.densidadRecomendada || <span style={{color:'#cbd5e1'}}>—</span>}
                        </td>
                        <td style={{...tdStyle, color:'#64748b', maxWidth:'200px'}}>
                          <div>{p.nota}</div>
                          {p.bitacora && (
                            <div style={{fontSize:'11px', color:'#7c3aed', marginTop:'4px', fontWeight:500}}>
                              📓 Bitácora: {p.bitacora}
                            </div>
                          )}
                        </td>
                        <td style={{...tdStyle, textAlign:'right', whiteSpace:'nowrap'}}>
                          <button
                            onClick={() => handleEdit(p)}
                            style={{padding:'4px 12px', background:'#dbeafe', color:'#1d4ed8', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer', marginRight:'8px'}}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleDelete(p.id, p.nombre)}
                            style={{padding:'4px 12px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer'}}
                          >
                            🗑️ Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Formulario de Sistemas */}
        {currentTab === 'sistemas' && showSistemaForm && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(124, 58, 237, 0.15), 0 10px 10px -5px rgba(124, 58, 237, 0.1)',
            border: '2px solid #a78bfa',
            marginBottom: '20px'
          }}>
            <h2 style={{marginTop: 0, fontSize: '18px', fontWeight: 700, color: '#6d28d9', borderBottom: '1px solid #f3e8ff', paddingBottom: '12px', marginBottom: '16px'}}>
              {editingSistemaId ? '📝 Editar Sistema Multicapa' : '🧪 Crear Nuevo Sistema Multicapa'}
            </h2>
            
            <form onSubmit={handleSistemaSubmit} style={{display:'grid', gridTemplateColumns:'1fr', gap:'16px'}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 2fr 260px', gap:'16px'}}>
                <div>
                  <label style={labelStyle}>Nombre del Sistema *</label>
                  <input
                    required
                    placeholder="Ej. Sistema Autonivelante 3mm"
                    value={sistemaFormData.nombre}
                    onChange={e => setSistemaFormData({...sistemaFormData, nombre: e.target.value})}
                    style={{...inputStyle, borderColor: '#c4b5fd', background: '#fcfaff'}}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Descripción del Sistema</label>
                  <input
                    placeholder="Ej. Recommended para tráfico pesado..."
                    value={sistemaFormData.descripcion}
                    onChange={e => setSistemaFormData({...sistemaFormData, descripcion: e.target.value})}
                    style={{...inputStyle, borderColor: '#c4b5fd', background: '#fcfaff'}}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Consumo por defecto *</label>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <input
                      required
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="0.25"
                      value={sistemaFormData.consumo_por_m2}
                      onChange={e => setSistemaFormData({...sistemaFormData, consumo_por_m2: e.target.value})}
                      style={{...inputStyle, borderColor: '#c4b5fd', background: '#fcfaff'}}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = sistemaFormData.consumo_por_m2
                        setSistemaFormData(prev => ({
                          ...prev,
                          productos: prev.productos.map(p => ({ ...p, consumo_por_m2: val }))
                        }))
                      }}
                      style={{padding: '0 10px', background: '#e9d5ff', color: '#6d28d9', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'}}
                    >
                      Aplicar a todos
                    </button>
                  </div>
                </div>
              </div>

              <div style={{borderTop: '1px solid #f3e8ff', paddingTop: '16px', marginTop: '8px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <h3 style={{margin: 0, fontSize: '14px', fontWeight: 700, color: '#6d28d9'}}>
                    Componentes / Capas del Sistema
                  </h3>
                  <button
                    type="button"
                    onClick={agregarProductoAlSistema}
                    style={{padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}
                  >
                    ➕ Agregar producto al sistema
                  </button>
                </div>

                {sistemaFormData.productos.length === 0 ? (
                  <div style={{padding: '28px', textAlign: 'center', background: '#faf5ff', borderRadius: '8px', border: '2px dashed #d8b4fe', color: '#6b21a8', fontSize: '13px'}}>
                    <div style={{fontSize: '28px', marginBottom: '8px'}}>📦</div>
                    <strong>Sin productos aún</strong><br/>
                    <span style={{color: '#9333ea', fontSize: '12px'}}>Haz clic en "Agregar producto al sistema" para elegir de tu catálogo</span>
                  </div>
                ) : (
                  <div
                    style={{display: 'flex', flexDirection: 'column', gap: '0px'}}
                    onDragOver={e => e.preventDefault()}
                  >
                    {sistemaFormData.productos.map((prodRow, idx) => (
                      <>
                        {/* Línea indicadora ENCIMA del elemento si dropIdx === idx */}
                        {dragIdx !== null && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1 && (
                          <div style={{height: '3px', background: '#7c3aed', borderRadius: '2px', margin: '2px 0', transition: 'all 0.15s'}} />
                        )}
                        <div
                          key={idx}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', String(idx))
                            setDragIdx(idx)
                          }}
                          onDragEnter={e => {
                            e.preventDefault()
                            setDropIdx(idx)
                          }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            e.preventDefault()
                            const from = parseInt(e.dataTransfer.getData('text/plain'))
                            if (from !== idx) reordenarProductos(from, idx)
                            setDragIdx(null)
                            setDropIdx(null)
                          }}
                          onDragEnd={() => {
                            setDragIdx(null)
                            setDropIdx(null)
                          }}
                          style={{
                            display: 'flex', gap: '10px', alignItems: 'center',
                            background: dragIdx === idx ? '#f3e8ff' : '#fdfbfd',
                            padding: '10px', borderRadius: '8px',
                            border: dropIdx === idx && dragIdx !== idx ? '2px solid #7c3aed' : '1px solid #f3e8ff',
                            cursor: 'grab',
                            opacity: dragIdx === idx ? 0.5 : 1,
                            marginBottom: '8px',
                            transition: 'border 0.1s, opacity 0.1s'
                          }}
                        >
                        {/* Badge de orden */}
                        <div style={{width: '28px', height: '28px', borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0}}>
                          {idx + 1}
                        </div>

                        {/* Handle de arrastre */}
                        <div style={{color: '#a78bfa', fontSize: '16px', flexShrink: 0, userSelect: 'none'}} title="Arrastra para reordenar">
                          ⠿
                        </div>

                        <div style={{flex: '1 1 auto'}}>
                          <label style={{fontSize: '11px', fontWeight: 600, color: '#6b21a8', display: 'block', marginBottom: '4px'}}>
                            Producto
                          </label>
                          <select
                            required
                            value={prodRow.producto_id}
                            onChange={e => actualizarProductoEnSistema(idx, 'producto_id', e.target.value)}
                            style={{...inputStyle, height: '34px', padding: '4px 8px', borderColor: prodRow.producto_id ? '#c4b5fd' : '#dc2626'}}
                          >
                            <option value="">-- Elige un producto --</option>
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nombre} ({p.unidad})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{width: '130px', flexShrink: 0}}>
                          <label style={{fontSize: '11px', fontWeight: 600, color: '#6b21a8', display: 'block', marginBottom: '4px'}}>
                            Consumo por m²
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            required
                            placeholder="0.25"
                            value={prodRow.consumo_por_m2}
                            onChange={e => actualizarProductoEnSistema(idx, 'consumo_por_m2', e.target.value)}
                            style={{...inputStyle, height: '34px', padding: '4px 8px'}}
                          />
                          {(() => {
                            const prod = productos.find(p => p.id === prodRow.producto_id)
                            if (!prod) return null
                            const sugerido = calcularConsumoSugerido(prod)
                            if (sugerido === null) return null
                            return (
                              <span style={{fontSize: '10px', color: '#16a34a', fontWeight: 600, display: 'block', marginTop: '3px'}}>
                                💡 Sugerido: {sugerido} {prod.unidad}/m²
                              </span>
                            )
                          })()}
                        </div>

                        <div style={{flexShrink: 0, paddingTop: '18px'}}>
                          <button
                            type="button"
                            onClick={() => eliminarProductoDelSistema(idx)}
                            style={{padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600}}
                          >
                            🗑️
                          </button>
                        </div>
                        </div>
                        {/* Línea indicadora DEBAJO del último elemento */}
                        {dragIdx !== null && dropIdx === idx && idx === sistemaFormData.productos.length - 1 && dragIdx !== idx && (
                          <div style={{height: '3px', background: '#7c3aed', borderRadius: '2px', margin: '2px 0'}} />
                        )}
                      </>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f3e8ff', paddingTop: '16px', marginTop: '8px'}}>
                <button
                  type="button"
                  onClick={handleSistemaCancel}
                  style={{padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'}}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || sistemaFormData.productos.length === 0}
                  style={{
                    padding: '10px 24px',
                    background: (saving || sistemaFormData.productos.length === 0) ? '#cbd5e1' : '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: (saving || sistemaFormData.productos.length === 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Guardando...' : '💾 Guardar Sistema'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de Sistemas */}
        {!showSistemaForm && currentTab === 'sistemas' && (
          <div style={{background:'white', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'}}>
            {loadingSistemas ? (
              <div style={{padding:'60px', textAlign:'center', color:'#64748b'}}>Cargando sistemas...</div>
            ) : sistemas.length === 0 ? (
              <div style={{padding:'60px', textAlign:'center'}}>
                <div style={{fontSize:'48px', marginBottom:'12px'}}>🧪</div>
                <h3 style={{color:'#1e293b', margin:'0 0 8px'}}>No hay sistemas multicapa aún</h3>
                <p style={{color:'#64748b', fontSize:'14px'}}>Crea uno nuevo presionando el botón "+ Nuevo Sistema".</p>
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                  <thead>
                    <tr style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
                      <th style={thStyle}>Nombre del Sistema</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={thStyle}>Productos Vinculados (Dosificación)</th>
                      <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sistemas.map(sys => (
                      <tr key={sys.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                        <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>{sys.nombre}</td>
                        <td style={{...tdStyle, color:'#64748b'}}>{sys.descripcion || 'Sin descripción'}</td>
                        <td style={tdStyle}>
                          <SystemProductListSummary sysId={sys.id} productosDisponibles={productos} />
                        </td>
                        <td style={{...tdStyle, textAlign:'right', whiteSpace:'nowrap'}}>
                          <button
                            onClick={() => handleSistemaEdit(sys)}
                            style={{padding:'4px 12px', background:'#f5f3ff', color:'#7c3aed', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer', marginRight:'8px'}}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleSistemaDelete(sys.id, sys.nombre)}
                            style={{padding:'4px 12px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer'}}
                          >
                            🗑️ Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer legend */}
        {/* Pestaña de Importación Masiva por Drag & Drop */}
        {currentTab === 'migracion' && (
          <div style={{display:'flex', flexDirection:'column', gap:'24px', animation:'fadeIn 0.3s ease'}}>
            
            {/* Cabecera */}
            <div style={{background:'white', padding:'24px', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', border:'1px solid #bae6fd'}}>
              <h2 style={{margin:0, fontSize:'18px', fontWeight:700, color:'#0369a1', display:'flex', alignItems:'center', gap:'8px'}}>
                📥 Importación de PDFs por Lotes (Arrastrar y Soltar)
              </h2>
              <p style={{margin:'6px 0 0', fontSize:'13px', color:'#475569', lineHeight:'1.5'}}>
                Sube múltiples fichas técnicas (TDS) o de seguridad (SDS) en formato PDF al mismo tiempo. El sistema las asociará a tus productos actuales de BUCA por coincidencia de nombre o propondrá la creación de nuevos productos, extrayendo la información técnica con Gemini IA.
              </p>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
                if (files.length === 0) {
                  alert("Por favor, arrastra únicamente archivos PDF.");
                  return;
                }

                const nuevasFilas = files.map(file => {
                  const yaEnCola = colaMigracion.some(x => x.fileName === file.name && x.file.size === file.size);
                  if (yaEnCola) return null;

                  const pMatch = encontrarProductoPorNombreArchivo(file.name);
                  const tipo = determinarTipoDocArchivo(file.name);

                  // Verificar si ya existe en Supabase
                  let yaExisteEnBd = false;
                  if (pMatch) {
                    const urlExistente = tipo === 'ficha_tecnica' ? pMatch.ficha_tecnica_url : pMatch.ficha_seguridad_url;
                    yaExisteEnBd = !!urlExistente;
                  }

                  return {
                    id: `fila_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    fileName: file.name,
                    file: file,
                    productoAsociado: pMatch,
                    tipoDoc: tipo,
                    estado: 'pre_analisis' as const,
                    errorMsg: yaExisteEnBd ? 'Este PDF ya está registrado para este producto en la base de datos de Supabase.' : undefined,
                    yaExisteEnBd
                  };
                }).filter(Boolean) as FilaMigracion[];

                setColaMigracion(prev => [...prev, ...nuevasFilas]);
              }}
              style={{
                background: isDragging ? '#e0f2fe' : 'white',
                border: `3px dashed ${isDragging ? '#0284c7' : '#bae6fd'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isDragging ? '0 10px 15px -3px rgba(2, 132, 199, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)'
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf';
                input.multiple = true;
                input.onchange = (e: any) => {
                  const files = Array.from(e.target.files || []).filter((f: any) => f.type === 'application/pdf');
                  if (files.length === 0) return;
                  
                  const nuevasFilas = files.map((file: any) => {
                    const yaEnCola = colaMigracion.some(x => x.fileName === file.name && x.file.size === file.size);
                    if (yaEnCola) return null;

                    const pMatch = encontrarProductoPorNombreArchivo(file.name);
                    const tipo = determinarTipoDocArchivo(file.name);

                    // Verificar si ya existe en Supabase
                    let yaExisteEnBd = false;
                    if (pMatch) {
                      const urlExistente = tipo === 'ficha_tecnica' ? pMatch.ficha_tecnica_url : pMatch.ficha_seguridad_url;
                      yaExisteEnBd = !!urlExistente;
                    }

                    return {
                      id: `fila_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                      fileName: file.name,
                      file: file,
                      productoAsociado: pMatch,
                      tipoDoc: tipo,
                      estado: 'pre_analisis' as const,
                      errorMsg: yaExisteEnBd ? 'Este PDF ya está registrado para este producto en la base de datos de Supabase.' : undefined,
                      yaExisteEnBd
                    };
                  }).filter(Boolean) as FilaMigracion[];
                  setColaMigracion(prev => [...prev, ...nuevasFilas]);
                };
                input.click();
              }}
            >
              <div style={{fontSize:'48px', marginBottom:'12px'}}>📥</div>
              <h3 style={{margin:0, fontSize:'16px', fontWeight:700, color: isDragging ? '#0284c7' : '#0369a1'}}>
                {isDragging ? '¡Suelta los archivos aquí!' : 'Arrastra aquí tus archivos PDF (TDS / SDS)'}
              </h3>
              <p style={{margin:'6px 0 0', fontSize:'13px', color:'#64748b'}}>
                O haz clic para seleccionar archivos desde tu computadora
              </p>
              <div style={{marginTop:'12px', display:'flex', gap:'8px', justifyContent:'center'}}>
                <span style={{background:'#f0f9ff', color:'#0369a1', fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'12px', border:'1px solid #bae6fd'}}>
                  📁 Autodetecta TDS / SDS
                </span>
                <span style={{background:'#f0f9ff', color:'#0369a1', fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'12px', border:'1px solid #bae6fd'}}>
                  🤖 Extracción Gemini
                </span>
              </div>
            </div>

            {/* List of elements in queue */}
            {colaMigracion.length > 0 && (
              <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e2e8f0', paddingBottom:'8px'}}>
                  <h3 style={{margin:0, fontSize:'14px', fontWeight:700, color:'#1e293b'}}>
                    Archivos en Proceso ({colaMigracion.filter(x => x.estado === 'guardado' || x.estado === 'completado').length}/{colaMigracion.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Deseas limpiar toda la lista de migración?")) {
                        setColaMigracion([]);
                      }
                    }}
                    style={{background:'none', border:'none', color:'#ef4444', fontSize:'12px', fontWeight:600, cursor:'pointer'}}
                  >
                    Limpiar lista
                  </button>
                </div>

                {/* Panel de control de Lote (Luz Verde / Descartar) */}
                {colaMigracion.some(x => x.estado === 'pre_analisis') && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #bbf7d0',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02)'
                  }}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                      <span style={{fontSize:'24px'}}>🚦</span>
                      <div>
                        <h4 style={{margin:0, fontSize:'14px', fontWeight:700, color:'#14532d'}}>
                          Revisión Preliminar de Lote (Luz Verde requerida)
                        </h4>
                        <p style={{margin:'2px 0 0', fontSize:'12px', color:'#166534'}}>
                          Detectamos <strong>{colaMigracion.filter(x => x.estado === 'pre_analisis' && !x.yaExisteEnBd).length}</strong> nuevos y <strong>{colaMigracion.filter(x => x.estado === 'pre_analisis' && x.yaExisteEnBd).length}</strong> repetidos en la base de datos.
                        </p>
                      </div>
                    </div>
                    
                    <div style={{display:'flex', gap:'12px', flexWrap:'wrap'}}>
                      {colaMigracion.some(x => x.estado === 'pre_analisis' && !x.yaExisteEnBd) && (
                        <button
                          type="button"
                          onClick={() => {
                            setColaMigracion(prev => prev.map(x => x.estado === 'pre_analisis' && !x.yaExisteEnBd ? { ...x, estado: 'cola' } : x));
                          }}
                          style={{
                            background: '#16a34a',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                          }}
                        >
                          🟢 Dar Luz Verde (Procesar Nuevos)
                        </button>
                      )}
                      
                      {colaMigracion.some(x => x.estado === 'pre_analisis' && x.yaExisteEnBd) && (
                        <button
                          type="button"
                          onClick={() => {
                            setColaMigracion(prev => prev.filter(x => !(x.estado === 'pre_analisis' && x.yaExisteEnBd)));
                          }}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                          }}
                        >
                          🗑️ Descartar Repetidos
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                  {colaMigracion.map((item) => {
                    const esTds = item.tipoDoc === 'ficha_tecnica';
                    
                    // Definir colores según estado
                    let borderColor = '#e2e8f0';
                    let bgColor = 'white';
                    if (item.estado === 'error') {
                      borderColor = '#fca5a5';
                      bgColor = '#fff5f5';
                    } else if (item.estado === 'guardado') {
                      borderColor = '#bbf7d0';
                      bgColor = '#f0fdf4';
                    } else if (item.estado === 'pre_analisis') {
                      if (item.yaExisteEnBd) {
                        borderColor = '#fde68a';
                        bgColor = '#fffbeb';
                      } else {
                        borderColor = '#bae6fd';
                        bgColor = '#f0f9ff';
                      }
                    }

                    return (
                      <div
                        key={item.id}
                        style={{
                          background: bgColor,
                          borderRadius: '10px',
                          border: `1px solid ${borderColor}`,
                          padding: '16px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          transition: 'all 0.2s'
                        }}
                      >
                        {/* Fila superior: info archivo */}
                        <div style={{display:'flex', alignItems:'center', justifyBetween:'space-between', gap:'12px', flexWrap:'wrap', justifyContent:'space-between'}}>
                          <div style={{display:'flex', alignItems:'center', gap:'8px', minWidth:0, flex:1}}>
                            <span style={{fontSize:'18px', flexShrink:0}}>{esTds ? '📄' : '🛡️'}</span>
                            <div style={{minWidth:0}}>
                              <h4 style={{margin:0, fontSize:'13px', fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={item.fileName}>
                                {item.fileName}
                              </h4>
                              <span style={{fontSize:'11px', color: esTds ? '#0284c7' : '#ea580c', fontWeight:600}}>
                                {esTds ? 'Ficha Técnica (TDS)' : 'Hoja de Seguridad (MSDS)'}
                              </span>
                            </div>
                          </div>

                          <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                            {/* Producto Asociado */}
                            {item.productoAsociado ? (
                              <span style={{background:'#f0f9ff', color:'#0369a1', fontSize:'11px', fontWeight:600, padding:'4px 8px', borderRadius:'6px', border:'1px solid #7dd3fc'}}>
                                🔗 Asociado a: {item.productoAsociado.nombre}
                              </span>
                            ) : (
                              <span style={{background:'#fef3c7', color:'#92400e', fontSize:'11px', fontWeight:600, padding:'4px 8px', borderRadius:'6px', border:'1px solid #fde68a'}}>
                                ✨ Crear como NUEVO
                              </span>
                            )}

                            {/* Indicador de Estado */}
                            {item.estado === 'pre_analisis' && (
                              <span style={{fontSize:'11px', color: item.yaExisteEnBd ? '#b45309' : '#0369a1', fontWeight:600}}>
                                {item.yaExisteEnBd ? '⚠️ Repetido en BD' : '⏳ Pendiente Luz Verde'}
                              </span>
                            )}
                            {item.estado === 'cola' && (
                              <span style={{fontSize:'11px', color:'#64748b', fontWeight:600}}>⏳ En espera...</span>
                            )}
                            {item.estado === 'subiendo' && (
                              <span style={{fontSize:'11px', color:'#2563eb', fontWeight:600, display:'flex', alignItems:'center', gap:'4px'}}>
                                <div style={{width:'8px', height:'8px', border:'2px solid #2563eb', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.6s linear infinite'}} />
                                Subiendo PDF...
                              </span>
                            )}
                            {item.estado === 'analizando' && (
                              <span style={{fontSize:'11px', color:'#7c3aed', fontWeight:600, display:'flex', alignItems:'center', gap:'4px'}}>
                                <div style={{width:'8px', height:'8px', border:'2px solid #7c3aed', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.6s linear infinite'}} />
                                Gemini analizando...
                              </span>
                            )}
                            {item.estado === 'error' && (
                              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                <span style={{fontSize:'11px', color: item.yaExisteEnBd ? '#d97706' : '#ef4444', fontWeight:600}} title={item.errorMsg}>
                                  {item.yaExisteEnBd ? '⚠️ Ya existe en BD' : '❌ Error'}
                                </span>
                                {item.yaExisteEnBd && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setColaMigracion(prev => prev.map(x => x.id === item.id ? { ...x, estado: 'cola', errorMsg: undefined } : x));
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      background: '#fef3c7',
                                      color: '#d97706',
                                      border: '1px solid #fde68a',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Forzar re-procesamiento
                                  </button>
                                )}
                              </div>
                            )}
                            {item.estado === 'guardado' && (
                              <span style={{fontSize:'11px', color:'#16a34a', fontWeight:700}}>✅ Guardado exitosamente</span>
                            )}
                            {item.estado === 'completado' && (
                              <span style={{fontSize:'11px', color:'#047857', fontWeight:700}}>🤖 Análisis listo</span>
                            )}

                            {/* Botón de descarte individual */}
                            <button
                              type="button"
                              onClick={() => {
                                setColaMigracion(prev => prev.filter(x => x.id !== item.id));
                              }}
                              style={{
                                background: '#fee2e2',
                                border: 'none',
                                color: '#dc2626',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s',
                                marginLeft: '6px'
                              }}
                              title="Descartar de la lista"
                            >
                              🗑️ Descartar
                            </button>
                          </div>
                        </div>

                        {/* Selector de relación manual y tipo de documento */}
                        {(item.estado === 'pre_analisis' || item.estado === 'error') && (
                          <div style={{
                            display: 'flex',
                            gap: '12px',
                            background: '#f8fafc',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            marginTop: '4px'
                          }}>
                            <div style={{display:'flex', flexDirection:'column', gap:'4px', flex:1, minWidth:'200px'}}>
                              <label style={{fontSize:'11px', fontWeight:700, color:'#475569'}}>Asociar a Producto:</label>
                              <select
                                value={item.productoAsociado?.id || 'nuevo'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  let pMatch = null;
                                  if (val !== 'nuevo') {
                                    pMatch = productos.find(x => x.id === val) || null;
                                  }
                                  
                                  // Calcular de nuevo si ya existe en BD para este nuevo producto
                                  let yaExisteEnBd = false;
                                  if (pMatch) {
                                    const urlExistente = item.tipoDoc === 'ficha_tecnica' ? pMatch.ficha_tecnica_url : pMatch.ficha_seguridad_url;
                                    yaExisteEnBd = !!urlExistente;
                                  }
                                  
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? { 
                                    ...x, 
                                    productoAsociado: pMatch, 
                                    yaExisteEnBd,
                                    errorMsg: yaExisteEnBd ? 'Este PDF ya está registrado para este producto en la base de datos de Supabase.' : undefined,
                                    estado: 'pre_analisis' // Resetear a pre-analisis
                                  } : x));
                                }}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: 'white',
                                  color: '#1e293b',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  outline: 'none'
                                }}
                              >
                                <option value="nuevo">✨ Crear como NUEVO producto</option>
                                {productos.map(p => (
                                  <option key={p.id} value={p.id}>🔗 {p.nombre}</option>
                                ))}
                              </select>
                            </div>

                            <div style={{display:'flex', flexDirection:'column', gap:'4px', width:'200px'}}>
                              <label style={{fontSize:'11px', fontWeight:700, color:'#475569'}}>Tipo de Documento:</label>
                              <select
                                value={item.tipoDoc}
                                onChange={(e) => {
                                  const val = e.target.value as 'ficha_tecnica' | 'ficha_seguridad';
                                  
                                  // Re-calcular si ya existe en BD
                                  let yaExisteEnBd = false;
                                  if (item.productoAsociado) {
                                    const urlExistente = val === 'ficha_tecnica' ? item.productoAsociado.ficha_tecnica_url : item.productoAsociado.ficha_seguridad_url;
                                    yaExisteEnBd = !!urlExistente;
                                  }

                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? { 
                                    ...x, 
                                    tipoDoc: val,
                                    yaExisteEnBd,
                                    errorMsg: yaExisteEnBd ? 'Este PDF ya está registrado para este producto en la base de datos de Supabase.' : undefined,
                                    estado: 'pre_analisis' // Resetear a pre-analisis
                                  } : x));
                                }}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: 'white',
                                  color: '#1e293b',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  outline: 'none'
                                }}
                              >
                                <option value="ficha_tecnica">📄 Ficha Técnica (TDS)</option>
                                <option value="ficha_seguridad">🛡️ Hoja de Seguridad (MSDS)</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Banner explicativo de error o duplicado */}
                        {item.estado === 'error' && item.errorMsg && (
                          <div style={{
                            background: item.yaExisteEnBd ? '#fffbeb' : '#fef2f2',
                            border: `1px solid ${item.yaExisteEnBd ? '#fde68a' : '#fca5a5'}`,
                            padding: '10px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: item.yaExisteEnBd ? '#78350f' : '#991b1b',
                            marginTop: '-4px'
                          }}>
                            <strong>{item.yaExisteEnBd ? 'Aviso: ' : 'Error de procesamiento: '}</strong>
                            {item.errorMsg}
                          </div>
                        )}

                        {/* Fila inferior: datos sugeridos para revisión */}
                        {item.estado === 'completado' && item.propuesta && (
                          <div style={{background:'#f8fafc', padding:'12px', borderRadius:'8px', border:'1px solid #e2e8f0', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'12px'}}>
                            
                            <div style={{gridColumn:'1 / -1', borderBottom:'1px solid #e2e8f0', paddingBottom:'6px', marginBottom:'4px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                              <span style={{fontSize:'12px', fontWeight:700, color:'#334155'}}>🔍 Comparación e Información Sugerida por la IA:</span>
                              <div style={{display:'flex', gap:'8px'}}>
                                <button
                                  type="button"
                                  onClick={() => aplicarPropuestaWeb(item)}
                                  style={{padding:'4px 10px', background:'#16a34a', color:'white', border:'none', borderRadius:'4px', fontSize:'11px', fontWeight:700, cursor:'pointer'}}
                                >
                                  💾 Confirmar y Guardar en Supabase
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setColaMigracion(prev => prev.filter(x => x.id !== item.id))}
                                  style={{padding:'4px 10px', background:'#e2e8f0', color:'#475569', border:'none', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer'}}
                                >
                                  Descartar
                                </button>
                              </div>
                            </div>

                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Nombre extraído:</strong>
                              <input
                                type="text"
                                value={item.propuesta.nombre || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, nombre: val }
                                  } : x));
                                }}
                                style={editableInputStyle}
                              />
                            </div>
                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Rendimiento:</strong>
                              <div style={{display:'flex', alignItems:'center', gap:'6px', height:'28px'}}>
                                <input
                                  type="checkbox"
                                  checked={!!item.propuesta.tieneRendimiento}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                      ...x,
                                      propuesta: { ...x.propuesta, tieneRendimiento: val, rendimiento: val ? (x.propuesta.rendimiento || '') : null }
                                    } : x));
                                  }}
                                  id={`tiene_rend_${item.id}`}
                                />
                                <label htmlFor={`tiene_rend_${item.id}`} style={{fontSize:'11px', color:'#475569', cursor:'pointer'}}>¿Tiene rendimiento?</label>
                              </div>
                              {item.propuesta.tieneRendimiento && (
                                <input
                                  type="text"
                                  placeholder="Ej. 3.5"
                                  value={item.propuesta.rendimiento || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                      ...x,
                                      propuesta: { ...x.propuesta, rendimiento: val }
                                    } : x));
                                  }}
                                  style={editableInputStyle}
                                />
                              )}
                            </div>
                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Espesor sugerido:</strong>
                              <input
                                type="text"
                                placeholder="Ej. 4 a 6 mils"
                                value={item.propuesta.espesorRecomendado || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, espesorRecomendado: val }
                                  } : x));
                                }}
                                style={editableInputStyle}
                              />
                            </div>
                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Manos/Capas:</strong>
                              <input
                                type="text"
                                placeholder="Ej. 1 a 2 manos"
                                value={item.propuesta.manosRecomendadas || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, manosRecomendadas: val }
                                  } : x));
                                }}
                                style={editableInputStyle}
                              />
                            </div>
                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Densidad:</strong>
                              <input
                                type="text"
                                placeholder="Ej. 1.25 g/cm³"
                                value={item.propuesta.densidadRecomendada || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, densidadRecomendada: val }
                                  } : x));
                                }}
                                style={editableInputStyle}
                              />
                            </div>
                            <div style={{fontSize:'12px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Mezcla:</strong>
                              <input
                                type="text"
                                placeholder="Ej. 4:1 (A:B)"
                                value={item.propuesta.proporcionesMezcla || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, proporcionesMezcla: val }
                                  } : x));
                                }}
                                style={editableInputStyle}
                              />
                            </div>
                            <div style={{fontSize:'12px', gridColumn:'1 / -1', display:'flex', flexDirection:'column', gap:'4px'}}>
                              <strong style={{color:'#475569'}}>Descripción / Nota:</strong>
                              <textarea
                                placeholder="Breve descripción del producto..."
                                value={item.propuesta.nota || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                    ...x,
                                    propuesta: { ...x.propuesta, nota: val }
                                  } : x));
                                }}
                                style={editableTextareaStyle}
                                rows={2}
                              />
                            </div>
                            <div style={{fontSize:'12px', gridColumn:'1 / -1', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', background:'white', padding:'12px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                              <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                <strong style={{color:'#166534', fontSize:'11px'}}>✅ Pros:</strong>
                                <input
                                  type="text"
                                  value={item.propuesta.pros || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                      ...x,
                                      propuesta: { ...x.propuesta, pros: val }
                                    } : x));
                                  }}
                                  style={editableInputStyle}
                                  placeholder="Ventajas..."
                                />
                              </div>
                              <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                <strong style={{color:'#9a3412', fontSize:'11px'}}>⚠️ Contras:</strong>
                                <input
                                  type="text"
                                  value={item.propuesta.cons || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                      ...x,
                                      propuesta: { ...x.propuesta, cons: val }
                                    } : x));
                                  }}
                                  style={editableInputStyle}
                                  placeholder="Limitaciones..."
                                />
                              </div>
                              <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                <strong style={{color:'#991b1b', fontSize:'11px'}}>🚫 Cuidado con:</strong>
                                <input
                                  type="text"
                                  value={item.propuesta.cuidadoCon || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setColaMigracion(prev => prev.map(x => x.id === item.id ? {
                                      ...x,
                                      propuesta: { ...x.propuesta, cuidadoCon: val }
                                    } : x));
                                  }}
                                  style={editableInputStyle}
                                  placeholder="Precauciones..."
                                />
                              </div>
                            </div>

                          </div>
                        )}
                        
                        {/* Enlace de previsualización de PDF subido */}
                        {item.pdfUrl && (
                          <div style={{fontSize:'11px', display:'flex', gap:'8px'}}>
                            <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer" style={{color:'#0284c7', textDecoration:'none', fontWeight:600}}>
                              📄 Ver PDF cargado en Supabase Storage →
                            </a>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}} />

        <footer style={{marginTop:'32px', padding:'24px 0 12px', borderTop:'1px solid #e2e8f0', textAlign:'center', fontSize:'12px', color:'#64748b', lineHeight:'1.6'}}>
          <p style={{margin:0, fontWeight:700, color:'#475569'}}>⚠️ Nota Importante sobre el Tipo de Cambio:</p>
          <p style={{margin:'4px 0 0'}}>El valor del dólar es el aproximado y el único oficial es el del Diario Oficial de la Federación (DOF).</p>
          <p style={{margin:'4px 0 0', color:'#d97706', fontWeight:600}}>Se sugiere confirmar de manera manual antes de pasarlo así.</p>
        </footer>

      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  minHeight: '34px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '38px',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  boxSizing: 'border-box',
  background: 'white'
}


const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#374151',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#374151',
  transition: 'background 0.15s'
}

const editableInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '12px',
  color: '#1e293b',
  background: 'white',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit'
}

const editableTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '12px',
  color: '#1e293b',
  background: 'white',
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit',
  minHeight: '42px',
  resize: 'vertical'
}

function SystemProductListSummary({ sysId, productosDisponibles }: { sysId: string; productosDisponibles: any[] }) {
  const [rels, setRels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSistemaProductosSupabase(sysId).then(data => {
      setRels(data)
      setLoading(false)
    })
  }, [sysId])

  if (loading) return <span style={{color: '#94a3b8'}}>Cargando...</span>
  if (rels.length === 0) return <span style={{color: '#94a3b8'}}>Sin productos asignados</span>

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
      {rels.map(r => {
        const prod = productosDisponibles.find(p => p.id === r.producto_id)
        return (
          <div key={r.id} style={{fontSize: '12px'}}>
            <span style={{fontWeight: 600, color: '#334155'}}>{prod ? prod.nombre : 'Producto desconocido'}</span>
            <span style={{color: '#64748b'}}> (Dosificación: {r.consumo_por_m2} {prod?.unidad || 'L'}/m² · Capa {r.orden})</span>
          </div>
        )
      })}
    </div>
  )
}
