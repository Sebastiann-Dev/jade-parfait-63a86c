import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { PRODUCTOS, type Producto } from '../data/productos'
import { fetchProductosSupabase, fetchSistemasSupabase, fetchSistemaProductosSupabase, type Sistema } from '../supabase'
import { generarPDF } from '../utils/generarPDF'

// Helper to decrypt preconfigured Gemini API keys
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
  "MCYrCwEAKw4fMjAiBAAbOBgiDzY2NREDBwIqOgcEMAQ/JzlEAD0VA0IoMTVXICZRBTNPJyg=", // Clave de Respaldo 1 (Ofuscada)
  "IDorCwgQOSAwJiArMUMTVQpMHRwONBMBLF1TIhsXUR5BBy1MOg0mFgMGODNXICZRBTNPJyg=", // Clave de Respaldo 2 (Ofuscada)
  "MAkHAxM2KkUuPigHKAM9MRw7QwI4CFAAWR8QLQMPRAcsGDYHEw8IAzMwPzJXICZRBTNPJyg="  // Clave de Respaldo 3 (Ofuscada)
];

const PRECONFIGURED_KEYS = OBFUSCATED_KEYS.map(decryptApiKey).filter(Boolean);


interface LineaProducto {
  id: string
  producto: Producto
  metros: number
  cantidad: number
  precioUnitario: number
  totalMXN: number
  esMinorista: boolean
  presentacion?: any
}

function calcularLinea(
  producto: Producto,
  metros: number,
  cantidadManual: number,
  esMinorista: boolean,
  tipoCambio: number,
  descuentoPorcentaje: number,
  presentacionSeleccionada?: any,
  estadoPiso: 'liso' | 'estandar' | 'rugoso' | 'ninguno' = 'ninguno'
): { cantidad: number; precioUnitario: number; totalMXN: number } {
  const descuento = esMinorista ? 1 : (1 - descuentoPorcentaje / 100)
  const dens = producto.densidad_conversion || 1.0

  let cantidad: number
  if (producto.tieneRendimiento && producto.rendimiento) {
    if (producto.unidad.toLowerCase() === 'kg') {
      // Rendimiento en m²/L convertido a m²/kg usando la densidad
      const rendimientoKg = producto.rendimiento / dens
      cantidad = metros / rendimientoKg
    } else {
      cantidad = metros / producto.rendimiento
    }
  } else {
    cantidad = cantidadManual
  }

  // Apply waste factor (Mermas) only to non-accessories
  const esAccesorio = producto.unidad.toLowerCase().includes('pza') || producto.unidad.toLowerCase().includes('pieza');
  if (!esAccesorio) {
    const factorMerma = estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1.00;
    cantidad = cantidad * factorMerma;
  }

  let precioBase = 0
  let moneda = producto.moneda
  let precio = producto.precio

  if (presentacionSeleccionada) {
    precio = presentacionSeleccionada.precio
    moneda = presentacionSeleccionada.moneda
  }

  if (moneda === 'USD') {
    precioBase = precio * tipoCambio
  } else {
    precioBase = precio
  }

  const precioUnitario = precioBase * descuento
  const totalMXN = cantidad * precioUnitario

  return { cantidad, precioUnitario, totalMXN }
}

function formatMXN(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
}

function formatNum(value: number, decimals = 2) {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

async function testKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: "Responde unicamente con un punto: ." }] }]
      })
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return { success: false, error: errJson.error?.message || `HTTP ${response.status}` };
    }
    const resJson = await response.json();
    const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    const isOk = !!textResponse && textResponse.trim().includes('.');
    return { success: isOk, error: isOk ? undefined : 'Respuesta no contiene un punto' };
  } catch (e: any) {
    return { success: false, error: e.message || 'Error de conexión' };
  }
}

export default function Cotizador() {
  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>(PRODUCTOS)
  const [tipoCambio, setTipoCambio] = useState(17.5)
  const [dofFecha, setDofFecha] = useState('')
  const [dofCargando, setDofCargando] = useState(true)
  const [esMinorista, setEsMinorista] = useState(true)
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(5)
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [presentacionSeleccionada, setPresentacionSeleccionada] = useState<any>(null)
  const [metros, setMetros] = useState<string>('')
  const [cantidadManual, setCantidadManual] = useState<string>('1')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarLista, setMostrarLista] = useState(false)
  const [lineas, setLineas] = useState<LineaProducto[]>([])
  const [clienteNombre, setClienteNombre] = useState('')
  const [proyectoNombre, setProyectoNombre] = useState('')
  const [notasProyecto, setNotasProyecto] = useState('')
  const busquedaRef = useRef<HTMLDivElement>(null)

  const [estadoPiso, setEstadoPiso] = useState<'liso' | 'estandar' | 'rugoso' | 'ninguno'>('ninguno')
  const [espesorMm, setEspesorMm] = useState<string>('')

  // Systems state variables
  const [sistemasDisponibles, setSistemasDisponibles] = useState<Sistema[]>([])
  const [cotizarTipo, setCotizarTipo] = useState<'producto' | 'sistema'>('producto')
  const [sistemaSeleccionado, setSistemaSeleccionado] = useState<Sistema | null>(null)
  const [sistemaMetros, setSistemaMetros] = useState<string>('')
  const [sistemaRels, setSistemaRels] = useState<{ id: string; producto: Producto; consumo_por_m2: number; orden: number }[]>([])
  const [loadingSistemaRels, setLoadingSistemaRels] = useState(false)

  // Chat Assistant States
  const [chatAbierto, setChatAbierto] = useState(false)
  const [chatMensaje, setChatMensaje] = useState('')
  const [chatHistorial, setChatHistorial] = useState<{ remitente: 'user' | 'ia'; texto: string; hora: string }[]>([])
  const [chatCargando, setChatCargando] = useState(false)
  const [chatActiveKeyIndex, setChatActiveKeyIndex] = useState(0)
  const [mostrarClipMenu, setMostrarClipMenu] = useState(false)
  const [clipMenuTab, setClipMenuTab] = useState<'productos' | 'sistemas'>('productos')
  const [citadosProductos, setCitadosProductos] = useState<Producto[]>([])
  const [citadoSistema, setCitadoSistema] = useState<Sistema | null>(null)
  
  // Systems visualization layer state
  const [capaActivaIndex, setCapaActivaIndex] = useState<number | null>(null)
  const [desgloseTab, setDesgloseTab] = useState<'consumos' | 'capas'>('consumos')

  // Group adjacent Part A and Part B products of the same material into a single visual layer
  const groupedCapas = useMemo(() => {
    const sortedRels = [...sistemaRels].sort((a, b) => a.orden - b.orden);
    const result: {
      id: string;
      baseName: string;
      orden: number;
      partA: typeof sortedRels[0];
      partB?: typeof sortedRels[0];
      isGrouped: boolean;
    }[] = [];
    
    let i = 0;
    while (i < sortedRels.length) {
      const current = sortedRels[i];
      const currentName = current.producto.nombre;
      const partAMatch = currentName.match(/^(.*?)\s*[-–(]?\s*(?:Pte|Parte|Part)\s*A\s*\)?$/i);
      
      if (partAMatch) {
        const baseName = partAMatch[1].trim();
        if (i + 1 < sortedRels.length) {
          const next = sortedRels[i+1];
          const nextName = next.producto.nombre;
          const partBMatch = nextName.match(/^(.*?)\s*[-–(]?\s*(?:Pte|Parte|Part)\s*B\s*\)?$/i);
          
          if (partBMatch && partBMatch[1].trim().toLowerCase() === baseName.toLowerCase()) {
            result.push({
              id: `${current.id}_grouped_${next.id}`,
              baseName,
              orden: current.orden,
              partA: current,
              partB: next,
              isGrouped: true
            });
            i += 2;
            continue;
          }
        }
      }
      
      result.push({
        id: current.id,
        baseName: currentName,
        orden: current.orden,
        partA: current,
        isGrouped: false
      });
      i += 1;
    }
    return result;
  }, [sistemaRels]);
  
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat window when new messages arrive
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistorial, chatAbierto])

  // Click outside and Escape handler to close the product search list
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (busquedaRef.current && !busquedaRef.current.contains(event.target as Node)) {
        setMostrarLista(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMostrarLista(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const enviarMensajeChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const texto = chatMensaje.trim();
    if (!texto || chatCargando) return;

    const horaActual = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const nuevoHistorial = [...chatHistorial, { remitente: 'user' as const, texto, hora: horaActual }];
    setChatHistorial(nuevoHistorial);
    setChatMensaje('');
    setChatCargando(true);

    try {
      const contextPrompt = `Eres el Asistente Técnico experto de BUCA MX. Tu objetivo es ayudar a los vendedores a resolver dudas sobre fichas técnicas, realizar conversiones (como mils a micras, litros a galones) y hacer cálculos de consumo de material.

INFORMACIÓN DEL CATÁLOGO DE PRODUCTOS:
Puedes buscar y leer entre los siguientes productos registrados en BUCA Recubrimientos. Si el usuario te pregunta por alguno de ellos o te cita uno de ellos, usa estas especificaciones técnicas:
${productosDisponibles.map(p => `
* Nombre: ${p.nombre}
  - Descripción: ${p.nota || 'No disponible'}
  - Unidad: ${p.unidad}
  - Moneda: ${p.moneda}
  - Precio unitario: $${p.precio}
  - Rendimiento: ${p.tieneRendimiento && p.rendimiento ? `${p.rendimiento} m²/${p.unidad}` : 'No aplica o requiere cálculo dinámico'}
  - Espesor recomendado: ${p.espesorRecomendado || 'No especificado'}
  - Manos recomendadas: ${p.manosRecomendadas || 'No especificado'}
  - Densidad: ${p.densidadRecomendada || 'No especificado'}
  - Proporción de mezcla: ${p.proporcionesMezcla || 'No aplica'}
  - Ventajas: ${p.pros || 'No especificados'}
  - Limitantes: ${p.cons || 'No especificadas'}
  - Precauciones: ${p.cuidadoCon || 'No especificadas'}`).join('\n')}

INFORMACIÓN DE SELECCIÓN Y CITACIÓN DE PRODUCTOS EN TIEMPO REAL:
- Producto SELECCIONADO en el cotizador principal: ${productoSeleccionado ? productoSeleccionado.nombre : 'Ninguno'}
- Productos CITADOS individualmente en el chat: ${citadosProductos.length > 0 ? citadosProductos.map(p => p.nombre).join(', ') : 'Ninguno'}
- Sistema Multicapa CITADO en el chat: ${citadoSistema ? citadoSistema.nombre : 'Ninguno'}
${citadoSistema && sistemaRels.length > 0 ? `
Componentes del Sistema Multicapa Citado (orden de aplicación desde la base hacia arriba):
${[...sistemaRels].sort((a, b) => a.orden - b.orden).map(rel => {
  let rol = 'Cuerpo / Capa Intermedia';
  if (rel.orden === 0) rol = 'Primario / Anclaje';
  else if (rel.orden === sistemaRels.length - 1) rol = 'Sello / Acabado Final';
  
  let instructions = 'Aplicar uniformemente según ficha técnica.';
  if (rel.orden === 0) instructions = 'Asegurar que el sustrato esté limpio y seco. Mezclar componentes A y B por 3 minutos. Aplicar con rodillo o jalador de goma.';
  else if (rel.producto.nombre.toLowerCase().includes('autonivelante') || rel.producto.nombre.toLowerCase().includes('bucacrete')) {
    instructions = 'Verter la mezcla homogénea directamente sobre el piso. Extender rápidamente a la altura deseada con rastrillo de nivel o llana dentada. Pasar inmediatamente rodillo de picos metálicos (spike roller) de forma cruzada para liberar burbujas de aire.';
  } else if (rel.producto.nombre.toLowerCase().includes('saco') || rel.producto.nombre.toLowerCase().includes('arena')) {
    instructions = 'Espolvorear de manera uniforme a saturación sobre la capa base húmeda anterior. Permitir curado y retirar el exceso de arena barriendo antes de aplicar el sello.';
  }
  
  return `- Capa ${rel.orden + 1}: ${rel.producto.nombre} (${rel.producto.unidad})
    * Papel/Rol: ${rol}
    * Consumo: ${rel.consumo_por_m2} ${rel.producto.unidad}/m²
    * Espesor: ${rel.producto.espesorRecomendado || 'N/A'}
    * Instrucciones de aplicación: ${instructions}`;
}).join('\n')}
` : ''}

REGLAS CRÍTICAS DE COMPORTAMIENTO:
1. Sé conciso y técnico. Tus respuestas deben ser rápidas y al grano, ideales para un vendedor en medio de una llamada comercial.
2. Tú TIENES acceso completo a todo el catálogo de productos detallado arriba. Por lo tanto, eres capaz de responder dudas, ventajas, limitantes, rendimientos y conversiones de cualquier producto directamente, incluso si no está seleccionado en el cotizador ni citado por el clip.
3. Si el usuario selecciona o cita un sistema multicapa, y te hace una consulta general de inicio, saludo o confirmación, NUNCA listes todas sus especificaciones técnicas de golpe. Limítate a confirmar amablemente que tienes leída la estructura del sistema (ej: "Entendido, tengo cargada la estructura del sistema [Nombre].") y pregúntale qué desea hacer (ej: si desea calcular el consumo de material para cierta área, ver los pasos de aplicación o detallar alguna capa en particular).
4. NUNCA digas al usuario que no hay ningún producto seleccionado o que debe seleccionar/citar un producto de la lista para que puedas acceder a su ficha técnica. Si el usuario te saluda ("hola") o te hace una pregunta sin haber seleccionado o citado un producto, dale una bienvenida cordial, infórmale que tienes acceso completo a todas las fichas técnicas del catálogo y que puedes responder cualquier duda sobre ellos, y pregúntale sobre qué producto o cálculo desea consultar hoy.
5. Si el usuario selecciona un producto en la cotización principal o lo cita mediante el botón de clip, y te hace una pregunta general de inicio, saludo o confirmación (ej: "listo", "ya", "que tal ahora", "hola", etc.), NUNCA debes recitar ni listar todas sus especificaciones técnicas de golpe. Limítate únicamente a confirmar amablemente que ya lo tienes leído (ej: "Entendido, ya tengo la información de [Producto].") y haz una PREGUNTA explícita sobre qué desea hacer el usuario con él (ej: "¿Quieres que calculemos el consumo para un área, o prefieres revisar su rendimiento o mezcla?").
6. Si el usuario te hace preguntas sobre cualquier producto en el catálogo (incluso si no está seleccionado ni citado), búscalo en la sección "INFORMACIÓN DEL CATÁLOGO DE PRODUCTOS" arriba, léelo y responde detalladamente.
7. Si el usuario te pregunta por consumos para un área específica (ej. "tengo 150 m2"), calcula el volumen necesario de forma precisa dividiendo el área entre el rendimiento del producto (Área / Rendimiento) si tiene rendimiento.
8. NUNCA inventes especificaciones técnicas. Si un valor es "No especificado" o no existe en el catálogo, dile amablemente que no está registrado y sugíerele verificar la ficha física o soporte.
9. Puedes hacer conversiones matemáticas estándar (ej: 1 galón = 3.785 L, 1 mil = 25.4 micras).`;

      const formattedContents = [
        ...nuevoHistorial.map(h => ({
          role: h.remitente === 'user' ? 'user' : 'model',
          parts: [{ text: h.texto }]
        }))
      ];

      let success = false;
      let lastErrorMsg = 'Todas las llaves están saturadas o inactivas.';
      let activeKey: string | null = null;
      let activeKeyIndex = chatActiveKeyIndex;
      const checkTrace: string[] = [];

      // Sistema por capas (pre-flight check): verificar con una consulta barata "." si la key está activa
      for (let i = 0; i < PRECONFIGURED_KEYS.length; i++) {
        const targetIndex = (chatActiveKeyIndex + i) % PRECONFIGURED_KEYS.length;
        const currentKey = PRECONFIGURED_KEYS[targetIndex];
        console.log(`[Chat Fallback] Probando Key ${targetIndex} con consulta de prueba "."`);
        
        const testResult = await testKey(currentKey);
        checkTrace.push(`Llave ${targetIndex + 1}: ${testResult.success ? '🟢' : `❌ (${testResult.error || 'Inactiva'})`}`);
        
        if (testResult.success) {
          activeKey = currentKey;
          activeKeyIndex = targetIndex;
          console.log(`[Chat Fallback] Key ${targetIndex} activa y seleccionada.`);
          break;
        } else {
          console.warn(`[Chat Fallback] Key ${targetIndex} reportó error o límite de cuota: ${testResult.error}`);
        }
      }

      if (!activeKey) {
        throw new Error(`Todas las API Keys de Gemini han alcanzado su límite de cuota (RPM/RPD). [Diagnóstico: ${checkTrace.join(' · ')}]. Por favor, intenta de nuevo en un minuto.`);
      }

      // Procedemos a hacer la consulta real usando la key que pasó la verificación
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: formattedContents,
          systemInstruction: {
            parts: [{ text: contextPrompt }]
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const resJson = await response.json();
      const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('No se recibió respuesta en texto.');
      }

      setChatActiveKeyIndex(activeKeyIndex);
      const horaResponse = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      setChatHistorial(prev => [...prev, { remitente: 'ia', texto: textResponse, hora: horaResponse }]);
      success = true;
    } catch (err: any) {
      console.error("Error completo de Gemini:", err);
      const horaError = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      setChatHistorial(prev => [...prev, { 
        remitente: 'ia', 
        texto: `❌ Error al conectar con el Asistente Técnico: ${err.message || 'Todas las API Keys de Gemini han alcanzado su límite de cuota.'}`, 
        hora: horaError 
      }]);
    } finally {
      setChatCargando(false);
    }
  };

  const metrosNum = parseFloat(metros) || 0
  const cantidadManualNum = parseFloat(cantidadManual) || 1

  const productoSeleccionadoConRendimientoDinamico = useMemo(() => {
    if (!productoSeleccionado) return null
    const densidadNum = productoSeleccionado.densidad_conversion || parseFloat(productoSeleccionado.densidadRecomendada || '0')
    const espesorNum = parseFloat(espesorMm || '0')

    let p = { ...productoSeleccionado }
    if (productoSeleccionado.tieneRendimiento && densidadNum > 0 && espesorNum > 0) {
      p.rendimiento = productoSeleccionado.cantRef / (espesorNum * densidadNum)
    }
    return p
  }, [productoSeleccionado, espesorMm])


  useEffect(() => {
    async function loadDatabase() {
      const dbProducts = await fetchProductosSupabase(true)
      if (dbProducts && dbProducts.length > 0) {
        setProductosDisponibles(dbProducts)
      }
      const dbSistemas = await fetchSistemasSupabase()
      setSistemasDisponibles(dbSistemas)
      
      const params = new URLSearchParams(window.location.search)
      const targetSysId = params.get('sistemaId')
      if (targetSysId && dbSistemas && dbSistemas.length > 0) {
        const found = dbSistemas.find(s => s.id === targetSysId)
        if (found) {
          setSistemaSeleccionado(found)
          setCotizarTipo('sistema')
          setTimeout(() => {
            const el = document.getElementById('seccion-sistema-multicapa')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }, 300)
          return
        }
      }
      
      if (dbSistemas && dbSistemas.length > 0) {
        setSistemaSeleccionado(dbSistemas[0])
      }
    }
    loadDatabase()
  }, [])

  useEffect(() => {
    if (!sistemaSeleccionado) {
      setSistemaRels([])
      return
    }
    setLoadingSistemaRels(true)
    fetchSistemaProductosSupabase(sistemaSeleccionado.id).then(rels => {
      const resolved = rels.map(r => {
        const p = productosDisponibles.find(prod => prod.id === r.producto_id)
        return {
          id: r.id,
          producto: p,
          consumo_por_m2: Number(r.consumo_por_m2),
          orden: r.orden
        }
      }).filter(item => item.producto !== undefined) as { id: string; producto: Producto; consumo_por_m2: number; orden: number }[]
      setSistemaRels(resolved)
      setLoadingSistemaRels(false)
    })
  }, [sistemaSeleccionado, productosDisponibles])

  // Automatically cite system and its products when a system is selected in the cotizador
  useEffect(() => {
    if (sistemaSeleccionado && sistemaRels.length > 0) {
      setCitadoSistema(sistemaSeleccionado)
      const systemProds = sistemaRels.map(r => r.producto).filter(Boolean)
      setCitadosProductos(prev => {
        const merged = [...prev]
        systemProds.forEach(sp => {
          if (!merged.some(p => p.nombre === sp.nombre)) {
            merged.push(sp)
          }
        })
        return merged
      })
    }
  }, [sistemaSeleccionado, sistemaRels])

  useEffect(() => {
    async function fetchExchangeRate() {
      setDofCargando(true)
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
            setDofFecha(new Date().toLocaleDateString('es-MX'))
            setDofCargando(false)
            return
          }
        } catch (e) {
          console.warn(`Failed to fetch exchange rate from ${url}:`, e)
        }
      }
      setDofCargando(false)
    }
    fetchExchangeRate()
  }, [])

  const productosFiltrados = useMemo(() => {
    const publicProducts = productosDisponibles.filter(p => p.estado !== 'borrador')
    if (!busqueda) return publicProducts
    const q = busqueda.toLowerCase()
    return publicProducts.filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.nota ? p.nota.toLowerCase().includes(q) : false)
    )
  }, [busqueda, productosDisponibles])

  const preview = useMemo(() => {
    if (!productoSeleccionadoConRendimientoDinamico) return null
    if (metrosNum <= 0 && !productoSeleccionadoConRendimientoDinamico.tieneRendimiento && cantidadManualNum <= 0) return null
    return calcularLinea(productoSeleccionadoConRendimientoDinamico, metrosNum, cantidadManualNum, esMinorista, tipoCambio, descuentoPorcentaje, presentacionSeleccionada, estadoPiso)
  }, [productoSeleccionadoConRendimientoDinamico, metrosNum, cantidadManualNum, esMinorista, tipoCambio, descuentoPorcentaje, presentacionSeleccionada, estadoPiso])

  const totalProyecto = lineas.reduce((sum, l) => sum + l.totalMXN, 0)

  function agregarProducto() {
    if (!preview) return
    if (productoSeleccionadoConRendimientoDinamico.tieneRendimiento && metrosNum <= 0) return

    const linea: LineaProducto = {
      id: crypto.randomUUID(),
      producto: productoSeleccionadoConRendimientoDinamico,
      metros: metrosNum,
      shadow: false, // dummy/unused key for safety
      cantidad: preview.cantidad,
      precioUnitario: preview.precioUnitario,
      totalMXN: preview.totalMXN,
      esMinorista,
      presentacion: presentacionSeleccionada
    } as any
    setLineas(prev => [...prev, linea])
    setMetros('')
    setCantidadManual('1')
    setEspesorMm('')
  }

  function agregarSistema() {
    if (!sistemaSeleccionado || sistemaRels.length === 0) return
    const metrosArea = parseFloat(sistemaMetros) || 0
    if (metrosArea <= 0) return

    const nuevasLineas = sistemaRels.map(rel => {
      let cantidad = metrosArea * rel.consumo_por_m2
      const esAccesorio = rel.producto.unidad.toLowerCase().includes('pza') || rel.producto.unidad.toLowerCase().includes('pieza')
      if (!esAccesorio) {
        const factorMerma = estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1.00;
        cantidad = cantidad * factorMerma;
      }

      let precioBase = 0
      let moneda = rel.producto.moneda
      let precio = rel.producto.precio

      if (moneda === 'USD') {
        precioBase = precio * tipoCambio
      } else {
        precioBase = precio
      }

      const descuento = esMinorista ? 1 : (1 - descuentoPorcentaje / 100)
      const precioUnitario = precioBase * descuento
      const totalMXN = cantidad * precioUnitario

      const linea: LineaProducto = {
        id: crypto.randomUUID(),
        producto: rel.producto,
        metros: metrosArea,
        cantidad,
        precioUnitario,
        totalMXN,
        esMinorista
      }
      return linea
    })

    setLineas(prev => [...prev, ...nuevasLineas])
    setSistemaMetros('')
  }

  function eliminarLinea(id: string) {
    setLineas(prev => prev.filter(l => l.id !== id))
  }

  function editarLinea(linea: LineaProducto) {
    seleccionarProducto(linea.producto)
    if (linea.producto.tieneRendimiento) {
      setMetros(String(linea.metros))
      const dens = linea.producto.densidad_conversion || parseFloat(linea.producto.densidadRecomendada || '0')
      if (linea.producto.rendimiento && dens > 0) {
        const calcEspesor = linea.producto.cantRef / (linea.producto.rendimiento * dens)
        setEspesorMm(String(Math.round(calcEspesor * 10) / 10))
      }
    } else {
      setCantidadManual(String(linea.cantidad))
    }
    setPresentacionSeleccionada(linea.presentacion || null)
    eliminarLinea(linea.id)
  }

  function seleccionarProducto(p: Producto) {
    setProductoSeleccionado(p)
    setBusqueda('')
    setMostrarLista(false)
    setCantidadManual(String(p.cantRef))

    if (p.kitInfo && (p.kitInfo.startsWith('[') || p.kitInfo.startsWith('{'))) {
      try {
        let list: any[] = []
        if (p.kitInfo.startsWith('{')) {
          list = JSON.parse(p.kitInfo).presentaciones || []
        } else {
          list = JSON.parse(p.kitInfo) || []
        }
        if (list && list.length > 0) {
          setPresentacionSeleccionada(list[0])
          return
        }
      } catch (e) {}
    }
    setPresentacionSeleccionada(null)
  }

  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  const tienePresentacionesKit = useMemo(() => {
    if (!productoSeleccionado || !productoSeleccionado.kitInfo) return false
    return productoSeleccionado.kitInfo.startsWith('[') || productoSeleccionado.kitInfo.startsWith('{')
  }, [productoSeleccionado])

  const listaPresentacionesKit = useMemo(() => {
    if (!tienePresentacionesKit) return []
    try {
      const kitInfoStr = productoSeleccionado.kitInfo || ''
      if (kitInfoStr.startsWith('{')) {
        return JSON.parse(kitInfoStr).presentaciones || []
      } else if (kitInfoStr.startsWith('[')) {
        return JSON.parse(kitInfoStr) || []
      }
    } catch {
      return []
    }
    return []
  }, [tienePresentacionesKit, productoSeleccionado])

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <header className="buca-header print:shadow-none">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="buca-logo-mark">
              <span>B</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-xl leading-tight">BUCA Recubrimientos</h1>
              <p className="text-blue-200 text-xs">Cotizador Comercial Interno</p>
            </div>
          </div>
            <div className="text-right hidden sm:flex items-center gap-4">
              <div className="text-right">
                <p className="text-blue-200 text-xs">Monterrey, N.L. · México</p>
                <p className="text-blue-100 text-xs">{fechaHoy}</p>
              </div>
              <Link to="/sistemas" className="ml-4 px-3 py-1.5 bg-purple-700 text-white text-xs font-medium rounded-lg hover:bg-purple-600 transition">
                🧪 Sistemas Multicapa
              </Link>
              <Link to="/admin" className="ml-2 px-3 py-1.5 bg-blue-800 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition">
                ⚙️ Admin
              </Link>
            </div>
          </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Config bar */}
        <div className="buca-card print:hidden">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Configuración de cotización</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Cliente / Proyecto */}
            <div>
              <label className="buca-label">Cliente</label>
              <input
                className="buca-input"
                placeholder="Nombre del cliente"
                value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)}
              />
            </div>
            <div>
              <label className="buca-label">Proyecto / Obra</label>
              <input
                className="buca-input"
                placeholder="Descripción del proyecto"
                value={proyectoNombre}
                onChange={e => setProyectoNombre(e.target.value)}
              />
            </div>
            {/* Notas del proyecto */}
            <div className="sm:col-span-3">
              <label className="buca-label">Notas / Análisis de discrepancia de costo</label>
              <input
                className="buca-input"
                placeholder="Ej. Este proyecto tiene un costo mayor por requerir reparación previa..."
                value={notasProyecto}
                onChange={e => setNotasProyecto(e.target.value)}
              />
            </div>
            {/* Tipo de cambio */}
            <div>
              <label className="buca-label">Tipo de cambio USD → MXN</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input
                  type="number"
                  className="buca-input"
                  style={{ paddingLeft: '32px' }}
                  value={tipoCambio}
                  step="0.01"
                  min="1"
                  onChange={e => setTipoCambio(parseFloat(e.target.value) || 17.5)}
                />
              </div>
              <p className="text-[10px] mt-1 pl-1 font-medium" style={{color: dofCargando ? '#f59e0b' : (dofFecha ? '#16a34a' : '#dc2626')}}>
                {dofCargando
                  ? '⏳ Consultando tipo de cambio...'
                  : dofFecha
                    ? `✅ Tipo de cambio oficial · ${dofFecha}`
                    : '⚠️ No se pudo obtener tipo de cambio — valor manual'}
              </p>
            </div>
          </div>

          {/* Tipo de cliente toggle y Mermas */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-600">Tipo de cliente:</span>
              <div className="buca-toggle-group">
                <button
                  className={`buca-toggle-btn ${esMinorista ? 'active' : ''}`}
                  onClick={() => setEsMinorista(true)}
                >
                  Minorista
                </button>
                <div className={`flex items-center buca-toggle-btn ${!esMinorista ? 'active' : ''}`}>
                  <button
                    onClick={() => setEsMinorista(false)}
                    className="mr-2"
                  >
                    Mayorista / Descuento
                  </button>
                  {!esMinorista && (
                    <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-lg px-2 py-0.5">
                      <span className="text-xs text-green-700 font-medium">−</span>
                      <input
                        type="number"
                        className="w-8 bg-transparent text-xs text-green-700 font-bold outline-none text-center"
                        value={descuentoPorcentaje}
                        onChange={e => setDescuentoPorcentaje(parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-xs text-green-700 font-medium">%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Estado del piso (Mermas):</span>
              <select
                className="w-48 text-xs font-semibold px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-blue-400"
                value={estadoPiso}
                onChange={e => setEstadoPiso(e.target.value as any)}
              >
                <option value="ninguno">Sin merma (0%)</option>
                <option value="liso">Piso Liso (+5% merma)</option>
                <option value="estandar">Piso Estándar (+10% merma)</option>
                <option value="rugoso">Piso Rugoso (+15% merma)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Print-only header info */}
        <div className="hidden print:block border-b pb-3 mb-4">
          {clienteNombre && <p><span className="font-semibold">Cliente:</span> {clienteNombre}</p>}
          {proyectoNombre && <p><span className="font-semibold">Proyecto:</span> {proyectoNombre}</p>}
          {notasProyecto && <p><span className="font-semibold">Notas:</span> {notasProyecto}</p>}
          <p><span className="font-semibold">Tipo de cliente:</span> {esMinorista ? 'Minorista' : `Mayorista (−${descuentoPorcentaje}%)`}</p>
          <p><span className="font-semibold">Estado del piso:</span> {estadoPiso === 'liso' ? 'Liso (+5% merma)' : estadoPiso === 'rugoso' ? 'Rugoso (+15% merma)' : estadoPiso === 'estandar' ? 'Estándar (+10% merma)' : 'Sin merma (0%)'}</p>
          <p><span className="font-semibold">Tipo de cambio:</span> ${tipoCambio} MXN/USD</p>
          <p><span className="font-semibold">Fecha:</span> {fechaHoy}</p>
        </div>

        {/* Selector de producto / sistema */}
        <div id="seccion-sistema-multicapa" className="buca-card print:hidden">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Agregar Concepto a Cotización
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCotizarTipo('producto')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                  cotizarTipo === 'producto' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                📦 Producto Individual
              </button>
              <button
                type="button"
                onClick={() => setCotizarTipo('sistema')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                  cotizarTipo === 'sistema' 
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                🧪 Sistema Multicapa
              </button>
            </div>
          </div>

          {cotizarTipo === 'producto' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Buscador de producto */}
                <div ref={busquedaRef} className="relative">
                  <label className="buca-label">Producto</label>
                  <div
                    className="buca-input flex items-center justify-between cursor-pointer select-none gap-2"
                    onClick={() => setMostrarLista(!mostrarLista)}
                  >
                    <span className={`truncate font-medium ${productoSeleccionado ? 'text-gray-800' : 'text-gray-400'}`}>
                      {productoSeleccionado ? productoSeleccionado.nombre : 'Seleccionar un producto...'}
                    </span>
                    <div className="flex items-center gap-1">
                      {productoSeleccionado && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductoSeleccionado(null);
                            setPresentacionSeleccionada(null);
                            setMetros('');
                            setCantidadManual('1');
                            setEspesorMm('');
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors animate-fade-in"
                          title="Limpiar selección"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {productoSeleccionado && productoSeleccionado.nota && (
                    <p className="text-xs text-gray-400 mt-1">{productoSeleccionado.nota}</p>
                  )}
                  {productoSeleccionado && (productoSeleccionado.ficha_tecnica_url || productoSeleccionado.ficha_seguridad_url) && (
                    <div className="mt-1.5 flex gap-2">
                      {productoSeleccionado.ficha_tecnica_url && (
                        <a
                          href={productoSeleccionado.ficha_tecnica_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Ficha Técnica"
                        >
                          📄 TDS (Ficha Técnica)
                        </a>
                      )}
                      {productoSeleccionado.ficha_seguridad_url && (
                        <a
                          href={productoSeleccionado.ficha_seguridad_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          title="Hoja de Seguridad"
                        >
                          🛡️ SDS (Ficha de Seguridad)
                        </a>
                      )}
                    </div>
                  )}

                  {mostrarLista && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                      <div className="p-2 border-b flex gap-2 items-center">
                        <input
                          autoFocus
                          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                          placeholder="Buscar producto..."
                          value={busqueda}
                          onChange={e => setBusqueda(e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMostrarLista(false);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 font-bold text-lg leading-none select-none outline-none"
                          title="Cerrar"
                        >
                          ×
                        </button>
                      </div>
                      <ul className="max-h-64 overflow-y-auto">
                        {productosFiltrados.map((p, idx) => (
                          <li
                            key={p.id || `${p.nombre}-${idx}`}
                            className={`px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${
                              productoSeleccionado && (p.id ? p.id === productoSeleccionado.id : p.nombre === productoSeleccionado.nombre) ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                            }`}
                            onClick={() => seleccionarProducto(p)}
                          >
                            <div className="text-sm font-medium">{p.nombre}</div>
                            <div className="text-xs text-gray-400 flex gap-2 mt-0.5">
                              <span>{p.nota}</span>
                              <span className="font-semibold text-green-700">
                                {p.moneda === 'USD' ? `MXN ≈$${(p.precio * tipoCambio).toFixed(2)}` : `MXN $${p.precio.toFixed(2)}`}
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="font-semibold text-blue-600">
                                {p.moneda === 'USD' ? `USD ≈$${p.precio.toFixed(2)}` : `USD ≈$${(p.precio / tipoCambio).toFixed(2)}`}
                              </span>
                              <span className="text-gray-300">/ {p.unidad}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Placeholder o Especificaciones */}
                {productoSeleccionadoConRendimientoDinamico ? (
                  <>
                    {/* Input m² o cantidad */}
                    <div>
                      {productoSeleccionadoConRendimientoDinamico.tieneRendimiento ? (
                        <>
                          <label className="buca-label">Metros cuadrados (m²)</label>
                          <div className="relative">
                            <input
                              type="number"
                              className="buca-input"
                              style={{paddingRight: '56px'}}
                              placeholder="0"
                              min="0"
                              value={metros}
                              onChange={e => setMetros(e.target.value)}
                            />
                            <span className="absolute top-1/2 -translate-y-1/2 text-gray-400 text-sm" style={{right: '26px'}}>m²</span>
                          </div>

                          {/* Espesor requerido para morteros/productos con densidad */}
                          {productoSeleccionadoConRendimientoDinamico.densidadRecomendada && (
                            <div className="mt-3">
                              <label className="buca-label" style={{color: '#1d4ed8', fontWeight: 700}}>Espesor requerido (mm)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  className="buca-input"
                                  style={{paddingRight: '56px'}}
                                  placeholder="Ej. 6"
                                  min="0.1"
                                  step="0.5"
                                  value={espesorMm}
                                  onChange={e => setEspesorMm(e.target.value)}
                                />
                                <span className="absolute top-1/2 -translate-y-1/2 text-gray-400 text-sm" style={{right: '26px'}}>mm</span>
                              </div>
                            </div>
                          )}

                          {productoSeleccionadoConRendimientoDinamico.rendimiento && (
                            <p className="text-xs text-gray-400 mt-1 font-medium">
                              Rendimiento aprox: {productoSeleccionadoConRendimientoDinamico.rendimiento.toFixed(2)} m²/{productoSeleccionadoConRendimientoDinamico.unidad}
                              {productoSeleccionadoConRendimientoDinamico.densidadRecomendada ? ` a una densidad de ${productoSeleccionadoConRendimientoDinamico.densidadRecomendada}` : ''}
                            </p>
                          )}
                          {productoSeleccionadoConRendimientoDinamico.unidad.toLowerCase().includes('saco') && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              (El sistema calculará cuántos sacos de {productoSeleccionadoConRendimientoDinamico.cantRef} kg se necesitan)
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="buca-label">
                            {productoSeleccionadoConRendimientoDinamico.unidad.toLowerCase().includes('saco') ? '¿Cuántos sacos?' : `Cantidad (${productoSeleccionadoConRendimientoDinamico.unidad})`}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              className="buca-input"
                              style={{paddingRight: '72px'}}
                              placeholder={String(productoSeleccionadoConRendimientoDinamico.cantRef)}
                              min="0"
                              step="0.5"
                              value={cantidadManual}
                              onChange={e => setCantidadManual(e.target.value)}
                            />
                            <span className="absolute top-1/2 -translate-y-1/2 text-gray-400 text-sm" style={{right: '26px'}}>{productoSeleccionadoConRendimientoDinamico.unidad}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {productoSeleccionadoConRendimientoDinamico.unidad.toLowerCase().includes('saco')
                              ? `Se vende por sacos de ${productoSeleccionadoConRendimientoDinamico.cantRef} kg`
                              : 'Sin rendimiento por m² — ingresa la cantidad directamente'}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Selector de presentación de kit si tiene */}
                    {tienePresentacionesKit && (
                      <div className="sm:col-span-2">
                        <label className="buca-label" style={{color: '#7c3aed', fontWeight: 700}}>Presentación del Kit</label>
                        <select
                          className="buca-input"
                          style={{borderColor: '#c4b5fd', background: '#f5f3ff'}}
                          value={presentacionSeleccionada ? JSON.stringify(presentacionSeleccionada) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val) {
                              setPresentacionSeleccionada(JSON.parse(val))
                            } else {
                              setPresentacionSeleccionada(null)
                            }
                          }}
                        >
                          {listaPresentacionesKit.map((pres: any, idx: number) => {
                            const partsStr = pres.partes && pres.partes.length > 0
                              ? ` (${pres.partes.map((p: any, i: number) => `${p}L Parte ${String.fromCharCode(65 + i)}`).join(' + ')})`
                              : ''
                            return (
                              <option key={idx} value={JSON.stringify(pres)}>
                                {pres.nombre}{partsStr} — {pres.moneda} {pres.moneda === 'USD' ? '≈$' : '$'}{pres.precio} (equiv. MXN ${(pres.moneda === 'USD' ? pres.precio * tipoCambio : pres.precio).toFixed(2)})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sm:col-span-2 border border-dashed border-gray-300 bg-gray-50 rounded-xl p-6 text-center text-gray-400 flex flex-col items-center justify-center min-h-[120px]">
                    <div className="text-2xl mb-1">👈</div>
                    <p className="text-xs font-semibold">Busca y selecciona un producto a la izquierda para configurar su cotización.</p>
                  </div>
                )}
              </div>

              {/* Preview resultado */}
              {preview && productoSeleccionado && (
                <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Cantidad</p>
                      <p className="text-2xl font-bold text-blue-900">{formatNum(preview.cantidad)}</p>
                      <p className="text-xs text-blue-500">{productoSeleccionado.unidad}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Precio unitario</p>
                      <p className="text-2xl font-bold text-blue-900">{formatMXN(preview.precioUnitario)}</p>
                      <p className="text-xs text-blue-400 font-medium">
                        USD ≈${(preview.precioUnitario / tipoCambio).toFixed(2)} · MXN/{productoSeleccionado.unidad}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Total</p>
                      <p className="text-2xl font-bold text-blue-900">{formatMXN(preview.totalMXN)}</p>
                      <p className="text-xs text-blue-400 font-medium">USD ≈${(preview.totalMXN / tipoCambio).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProductoSeleccionado(null)
                    setPresentacionSeleccionada(null)
                    setMetros('')
                    setCantidadManual('1')
                    setEspesorMm('')
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={agregarProducto}
                  disabled={!preview || !productoSeleccionado || (productoSeleccionado.tieneRendimiento && metrosNum <= 0)}
                  className="buca-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Agregar a cotización
                </button>
              </div>
            </>
          ) : (
            <>
              {/* UI de Cotización por Sistemas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="buca-label">Seleccionar Sistema Multicapa</label>
                  {sistemasDisponibles.length === 0 ? (
                    <div className="buca-input text-gray-400 bg-gray-50 flex items-center">
                      No hay sistemas creados en la base de datos
                    </div>
                  ) : (
                    <select
                      value={sistemaSeleccionado ? JSON.stringify(sistemaSeleccionado) : ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val) setSistemaSeleccionado(JSON.parse(val))
                      }}
                      className="buca-input"
                    >
                      {sistemasDisponibles.map(sys => (
                        <option key={sys.id} value={JSON.stringify(sys)}>
                          {sys.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                  {sistemaSeleccionado?.descripcion && (
                    <p className="text-xs text-purple-600 mt-1.5 font-medium">📝 {sistemaSeleccionado.descripcion}</p>
                  )}
                </div>

                <div>
                  <label className="buca-label">Área total a cubrir (m²)</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="buca-input"
                      style={{paddingRight: '56px'}}
                      placeholder="0"
                      min="0"
                      value={sistemaMetros}
                      onChange={e => setSistemaMetros(e.target.value)}
                    />
                    <span className="absolute top-1/2 -translate-y-1/2 text-gray-400 text-sm" style={{right: '26px'}}>m²</span>
                  </div>
                </div>
              </div>

              {/* Vista previa de componentes del sistema */}
              {sistemaSeleccionado && (
                <div className="mt-4 bg-purple-50/50 border border-purple-100 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-purple-100 pb-2.5">
                    <h3 className="text-xs font-bold text-purple-800 uppercase tracking-wide">
                      Desglose de Componentes del Sistema ({sistemaMetros ? `${sistemaMetros} m²` : '0 m²'})
                    </h3>
                    <span className="text-[10px] text-purple-500 bg-purple-100/50 px-2 py-0.5 rounded-full font-bold">
                      {sistemaRels.length} Capas
                    </span>
                  </div>

                  {/* Tabs de navegación para el desglose */}
                  <div className="flex bg-purple-100/40 p-1 rounded-xl border border-purple-100/50 gap-1">
                    <button
                      type="button"
                      onClick={() => setDesgloseTab('consumos')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${
                        desgloseTab === 'consumos'
                          ? 'bg-white text-purple-900 shadow-sm border border-purple-100'
                          : 'text-purple-600 hover:text-purple-800 hover:bg-white/30'
                      }`}
                    >
                      <span>📋</span> Consumos y Cantidades
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesgloseTab('capas')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${
                        desgloseTab === 'capas'
                          ? 'bg-white text-purple-900 shadow-sm border border-purple-100'
                          : 'text-purple-600 hover:text-purple-800 hover:bg-white/30'
                      }`}
                    >
                      <span>🔬</span> Estructura y Capas
                    </button>
                  </div>

                  {loadingSistemaRels ? (
                    <p className="text-xs text-purple-600 animate-pulse">Cargando componentes del sistema...</p>
                  ) : sistemaRels.length === 0 ? (
                    <p className="text-xs text-purple-600 italic">Este sistema no tiene componentes registrados en la base de datos.</p>
                  ) : (
                    <div className="space-y-4">
                      {desgloseTab === 'capas' ? (
                        /* Diagrama Visual de Capas Apiladas */
                        <div className="bg-white border border-gray-150 rounded-xl p-4 shadow-sm">
                          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1">
                            <span>📊</span> Esquema Técnico de Capas (Haz clic para ver detalles)
                          </h4>
                          
                          <div className="flex flex-col gap-2 max-w-lg mx-auto">
                            {/* Stacking rendering in reverse order (Capa superior primero) */}
                             {[...groupedCapas].sort((a, b) => b.orden - a.orden).map((capa, idx) => {
                              const isExpanded = capaActivaIndex === capa.orden;
                              const isFirst = capa.orden === 0;
                              const isLast = capa.orden === groupedCapas[groupedCapas.length - 1].orden;
                              
                              // Color scheme based on layer type
                              let blockColor = "from-purple-500 to-indigo-500 border-purple-600 shadow-purple-100";
                              if (isFirst) blockColor = "from-blue-500 to-cyan-500 border-blue-600 shadow-blue-100";
                              else if (isLast) blockColor = "from-violet-600 to-fuchsia-600 border-violet-700 shadow-violet-100";
                              
                              // Quantities calculations
                              const qtyA = (parseFloat(sistemaMetros) || 0) * capa.partA.consumo_por_m2;
                              const isAAccesorio = capa.partA.producto.unidad.toLowerCase().includes('pza') || capa.partA.producto.unidad.toLowerCase().includes('pieza');
                              const finalQtyA = isAAccesorio ? qtyA : qtyA * (estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1);

                              const qtyB = capa.partB ? (parseFloat(sistemaMetros) || 0) * capa.partB.consumo_por_m2 : 0;
                              const finalQtyB = capa.partB 
                                ? (capa.partB.producto.unidad.toLowerCase().includes('pza') || capa.partB.producto.unidad.toLowerCase().includes('pieza') 
                                    ? qtyB 
                                    : qtyB * (estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1))
                                : 0;
                              
                              // Dynamic Justifications and Mix instructions
                              const functionText = isFirst 
                                ? "Primario / Anclaje: Sellador inicial que penetra los poros del concreto preparado, garantizando una adherencia perfecta para las capas del cuerpo del sistema y previniendo burbujas."
                                : isLast
                                  ? "Sello / Acabado Final: Capa protectora resistente que provee la dureza final ante el tráfico, impermeabilidad, resistencia a químicos, agentes UV y acabado estético."
                                  : "Cuerpo / Capa Intermedia: Aporta el espesor mecánico requerido, absorbe impactos, autonivela las imperfecciones del suelo y refuerza la estructura.";

                              const justificationText = isFirst
                                ? "Se coloca en la base (en contacto directo con el concreto) porque actúa como el puente de adherencia principal. Al penetrar el sustrato poroso de concreto preparado, evita que los recubrimientos posteriores se desprendan o se delaminen por tensiones mecánicas y previene que el aire atrapado en los poros ascienda creando burbujas (ojos de pescado)."
                                : isLast
                                  ? "Se posiciona en la capa superior externa para servir de barrera protectora de todo el sistema. Debe recibir directamente la abrasión por tráfico (peatonal o montacargas), resistir derrames químicos, bloquear la radiación UV (evitando amarillamiento) y proporcionar el acabado de color o brillo especificado por el cliente."
                                  : "Se sitúa en la parte intermedia para conformar el núcleo de soporte. Al combinarse con cargas de arena de sílice o autonivelantes, proporciona el espesor necesario para soportar cargas pesadas de impacto, amortigua las vibraciones mecánicas y disipa las tensiones entre el acabado y la base de concreto.";

                              const mixInstruction = capa.isGrouped
                                ? "Mezclar mecánicamente la Parte A por 2 minutos para homogeneizar. Incorporar la Parte B respetando la proporción y continuar mezclando con taladro a bajas revoluciones (300-400 RPM) durante 3 minutos adicionales para evitar la inclusión de aire. Verter de inmediato y extender con llana o jalador según el espesor requerido. Respete los tiempos de vida útil de la mezcla (pot life)."
                                : (capa.partA.producto.nombre.toLowerCase().includes('autonivelante') || capa.partA.producto.nombre.toLowerCase().includes('bucacrete')
                                  ? "Verter la mezcla homogénea directamente sobre el sustrato. Extender rápidamente a la altura deseada con rastrillo de nivel o llana dentada. Pasar inmediatamente rodillo de picos metálicos (spike roller) de forma cruzada para liberar burbujas de aire."
                                  : capa.partA.producto.nombre.toLowerCase().includes('saco') || capa.partA.producto.nombre.toLowerCase().includes('arena')
                                    ? "Espolvorear de manera uniforme a saturación sobre la capa base húmeda anterior. Permitir curado y retirar el exceso de arena barriendo antes de aplicar el sello."
                                    : "Aplicar con rodillo de felpa, jalador de llana lisa o jalador dentado en pasadas cruzadas. Mantener control estricto del espesor y respetar el tiempo de secado al tacto antes de sellar.");

                              return (
                                <div key={capa.id} className="w-full">
                                  {/* Layer Block */}
                                  <div 
                                    onClick={() => setCapaActivaIndex(isExpanded ? null : capa.orden)}
                                    className={`relative flex items-center justify-between px-4 py-2.5 bg-gradient-to-r ${blockColor} border text-white rounded-lg shadow-sm cursor-pointer select-none transition-all duration-200 hover:brightness-110 hover:scale-[1.01] active:scale-[0.99]`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold shrink-0">
                                        {idx + 1}
                                      </span>
                                      <span className="font-bold text-xs truncate">{capa.baseName}</span>
                                      {capa.isGrouped && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white border border-white/10 shadow-sm shrink-0">🧪 2-Ptes</span>
                                      )}
                                    </div>
                                    
                                    {/* Arrow indicator and thickness */}
                                    <div className="flex items-center gap-2 text-[10px] font-semibold opacity-90 shrink-0">
                                      <span>→ Espesor: {capa.partA.producto.espesorRecomendado || (capa.partB && capa.partB.producto.espesorRecomendado) || 'N/A'}</span>
                                      <span className="text-white/40">|</span>
                                      <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold text-[9px]">
                                        {capa.isGrouped && capa.partB
                                          ? `${finalQtyA.toFixed(1)} + ${finalQtyB.toFixed(1)} ${capa.partA.producto.unidad}`
                                          : finalQtyA > 0 ? `${finalQtyA.toFixed(2)} ${capa.partA.producto.unidad}` : `${capa.partA.consumo_por_m2} ${capa.partA.producto.unidad}/m²`
                                        }
                                      </span>
                                    </div>
                                  </div>

                                  {/* Tree Decomposition (Details accordion below the block) */}
                                  {isExpanded && (
                                    <div className="relative mt-2 ml-4 pl-4 border-l-2 border-dashed border-purple-300 py-3 space-y-3 animate-fade-in text-gray-700 bg-purple-50/30 rounded-r-lg">
                                      {/* Connector node circle */}
                                      <div className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-purple-400" />
                                      
                                      {/* Attached PDFs (Moved to top, unifies A and B PDFs) */}
                                      {(capa.partA.producto.ficha_tecnica_url || capa.partA.producto.ficha_seguridad_url || (capa.partB && (capa.partB.producto.ficha_tecnica_url || capa.partB.producto.ficha_seguridad_url))) && (
                                        <div className="flex flex-wrap gap-2 mb-1">
                                          {capa.partA.producto.ficha_tecnica_url && (
                                            <a
                                              href={capa.partA.producto.ficha_tecnica_url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all shadow-sm shrink-0"
                                            >
                                              📄 {capa.isGrouped ? 'Ficha Técnica A (TDS)' : 'Ficha Técnica (TDS)'}
                                            </a>
                                          )}
                                          {capa.partA.producto.ficha_seguridad_url && (
                                            <a
                                              href={capa.partA.producto.ficha_seguridad_url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 transition-all shadow-sm shrink-0"
                                            >
                                              🛡️ {capa.isGrouped ? 'Ficha Seguridad A (SDS)' : 'Ficha de Seguridad (SDS)'}
                                            </a>
                                          )}
                                          {capa.isGrouped && capa.partB && (
                                            <>
                                              {capa.partB.producto.ficha_tecnica_url && (
                                                <a
                                                  href={capa.partB.producto.ficha_tecnica_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all shadow-sm shrink-0"
                                                >
                                                  📄 Ficha Técnica B (TDS)
                                                </a>
                                              )}
                                              {capa.partB.producto.ficha_seguridad_url && (
                                                <a
                                                  href={capa.partB.producto.ficha_seguridad_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 transition-all shadow-sm shrink-0"
                                                >
                                                  🛡️ Ficha Seguridad B (SDS)
                                                </a>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      )}

                                      {/* Detailed Breakdown */}
                                      {capa.isGrouped && capa.partB ? (
                                        /* 2-Column comparative layout for Part A and Part B */
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div className="bg-white border border-purple-100 rounded-xl p-3.5 shadow-sm space-y-2">
                                            <div className="flex justify-between items-center border-b border-purple-50 pb-2">
                                              <span className="font-bold text-xs text-purple-950 truncate max-w-[170px]">{capa.partA.producto.nombre}</span>
                                              <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">Parte A</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                                              <div>
                                                <span className="font-semibold text-gray-500">Consumo Base:</span><br />
                                                <span className="text-gray-700 font-medium">{capa.partA.consumo_por_m2} {capa.partA.producto.unidad}/m²</span>
                                              </div>
                                              <div>
                                                <span className="font-semibold text-gray-500">Cantidad Total:</span><br />
                                                <span className="text-purple-800 font-bold">{finalQtyA.toFixed(2)} {capa.partA.producto.unidad}</span>
                                              </div>
                                              <div className="col-span-2 border-t border-purple-50 pt-1.5">
                                                <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                                <span className="text-gray-700 font-medium">
                                                  {capa.partA.producto.tieneRendimiento && capa.partA.producto.rendimiento 
                                                    ? `${capa.partA.producto.rendimiento} m²/${capa.partA.producto.unidad}` 
                                                    : 'Cálculo dinámico/manual'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="bg-white border border-purple-100 rounded-xl p-3.5 shadow-sm space-y-2">
                                            <div className="flex justify-between items-center border-b border-purple-50 pb-2">
                                              <span className="font-bold text-xs text-purple-950 truncate max-w-[170px]">{capa.partB.producto.nombre}</span>
                                              <span className="text-[9px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Parte B</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                                              <div>
                                                <span className="font-semibold text-gray-500">Consumo Base:</span><br />
                                                <span className="text-gray-700 font-medium">{capa.partB.consumo_por_m2} {capa.partB.producto.unidad}/m²</span>
                                              </div>
                                              <div>
                                                <span className="font-semibold text-gray-500">Cantidad Total:</span><br />
                                                <span className="text-purple-800 font-bold">{finalQtyB.toFixed(2)} {capa.partB.producto.unidad}</span>
                                              </div>
                                              <div className="col-span-2 border-t border-purple-50 pt-1.5">
                                                <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                                <span className="text-gray-700 font-medium">
                                                  {capa.partB.producto.tieneRendimiento && capa.partB.producto.rendimiento 
                                                    ? `${capa.partB.producto.rendimiento} m²/${capa.partB.producto.unidad}` 
                                                    : 'Cálculo dinámico/manual'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* 1-Column simple layout for single components */
                                        <div className="grid grid-cols-2 gap-3 bg-white border border-purple-100 rounded-lg p-2.5 text-[11px] leading-relaxed">
                                          <div>
                                            <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                            <span className="text-gray-700 font-medium">{capa.partA.producto.tieneRendimiento && capa.partA.producto.rendimiento ? `${capa.partA.producto.rendimiento} m²/${capa.partA.producto.unidad}` : 'Cálculo dinámico/manual'}</span>
                                          </div>
                                          <div>
                                            <span className="font-semibold text-gray-500">Proporciones Mezcla:</span><br />
                                            <span className="text-gray-700 font-medium">{capa.partA.producto.proporcionesMezcla || 'Monocomponente (No aplica)'}</span>
                                          </div>
                                          <div className="col-span-2">
                                            <span className="font-semibold text-gray-500">Ventajas Clave:</span><br />
                                            <span className="text-green-700 font-bold">{capa.partA.producto.pros || 'Alta durabilidad, óptimo anclaje'}</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Función de la capa */}
                                      <div>
                                        <h5 className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                                          <span>📝</span> Función de la Capa
                                        </h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                          {functionText}
                                        </p>
                                      </div>

                                      {/* Justificación de la posición en el sistema */}
                                      <div>
                                        <h5 className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                                          <span>💡</span> ¿Por qué esta posición en el sistema?
                                        </h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                          {justificationText}
                                        </p>
                                      </div>

                                      {/* Método de mezcla / Aplicación */}
                                      <div>
                                        <h5 className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                                          <span>🛠️</span> Método de Aplicación
                                        </h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                          {mixInstruction}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Prepared Concrete Substrate (Base) */}
                            <div className="relative flex items-center justify-between px-4 py-2 bg-slate-100 border border-slate-300 text-slate-500 rounded-lg shadow-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  🧱
                                </span>
                                <span className="font-bold text-xs truncate">Concreto / Sustrato Preparado</span>
                              </div>
                              <span className="text-[9px] font-semibold italic text-slate-400">Base rígida del sistema</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Text details for quantities */
                        <div className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm divide-y divide-purple-100/50 space-y-3">
                          {sistemaRels.map(rel => {
                            const quantity = (parseFloat(sistemaMetros) || 0) * rel.consumo_por_m2;
                            const isAccesorio = rel.producto.unidad.toLowerCase().includes('pza') || rel.producto.unidad.toLowerCase().includes('pieza');
                            const finalQty = isAccesorio ? quantity : quantity * (estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1);
                            return (
                              <div key={rel.id} className="flex justify-between items-center text-xs text-purple-900 border-b border-purple-100 pb-1.5 last:border-0 last:pb-0">
                                <div>
                                  <span className="font-semibold text-purple-950">{rel.producto.nombre}</span>
                                  <span className="text-purple-600"> (Consumo: {rel.consumo_por_m2} {rel.producto.unidad}/m² · Capa {rel.orden + 1})</span>
                                </div>
                                <span className="font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full">
                                  {finalQty.toFixed(2)} {rel.producto.unidad}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={agregarSistema}
                  disabled={!sistemaSeleccionado || sistemaRels.length === 0 || !sistemaMetros || parseFloat(sistemaMetros) <= 0}
                  className="px-6 py-2.5 text-xs font-bold rounded-lg border transition bg-purple-600 text-white border-purple-600 hover:bg-purple-700 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                >
                  ➕ Agregar Sistema a Cotización
                </button>
              </div>
            </>
          )}
        </div>

        {/* Tabla de cotización */}
        {lineas.length > 0 && (
          <div className="buca-card">
            <div className="flex items-center justify-between mb-4 print:hidden">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Cotización del proyecto</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setLineas([])}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Limpiar todo
                </button>
                <button
                  onClick={() => window.print()}
                  className="buca-btn-secondary text-sm"
                >
                  🖨️ Imprimir
                </button>
                <button
                  onClick={() => generarPDF({
                    clienteNombre,
                    proyectoNombre,
                    notasProyecto,
                    fechaHoy,
                    tipoCambio,
                    esMinorista,
                    descuentoPorcentaje,
                    estadoPiso,
                    lineas,
                    totalProyecto
                  })}
                  className="buca-btn-primary text-sm"
                >
                  📄 Exportar PDF
                </button>
              </div>
            </div>

            {/* Print header */}
            <div className="hidden print:flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-700 text-lg">Cotización de productos</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Producto</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Densidad</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Cantidad</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">P. Unitario</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Total MXN</th>
                    <th className="w-8 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-2">
                        <div className="font-medium text-gray-800">
                          {l.producto.nombre}
                          {l.presentacion && (
                            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded uppercase tracking-wide">
                              {l.presentacion.nombre}
                              {l.presentacion.partes && l.presentacion.partes.length > 0 && (
                                <span className="lowercase text-[9px] font-medium text-purple-600 ml-1">
                                  ({l.presentacion.partes.map((p: any, i: number) => `${p}L Pte ${String.fromCharCode(65 + i)}`).join('+')})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{l.producto.nota}</div>
                        {l.producto.tieneRendimiento && l.metros > 0 && (
                          <div className="text-xs text-blue-400 mt-0.5">
                            {formatNum(l.metros)} m² (Rendimiento: {(() => {
                              const dens = l.producto.densidad_conversion || 1.0;
                              if (l.producto.unidad.toLowerCase() === 'kg' && dens !== 1.0) {
                                return `${l.producto.rendimiento} m²/L (${formatNum(l.producto.rendimiento / dens)} m²/kg)`;
                              }
                              return `${l.producto.rendimiento} m²/${l.producto.unidad}`;
                            })()}
                            {l.producto.densidadRecomendada ? ` · Densidad: ${l.producto.densidadRecomendada}` : ''})
                          </div>
                        )}
                        {!l.producto.tieneRendimiento && l.producto.densidadRecomendada && (
                          <div className="text-xs text-blue-400 mt-0.5">
                            Densidad: {l.producto.densidadRecomendada}
                          </div>
                        )}
                        {(l.producto.pros || l.producto.cons || l.producto.cuidadoCon) && (
                          <div className="mt-2 text-[11px] leading-tight flex flex-col gap-0.5">
                            {l.producto.pros && <p><span className="font-semibold text-green-600">Pros:</span> <span className="text-gray-500">{l.producto.pros}</span></p>}
                            {l.producto.cons && <p><span className="font-semibold text-orange-600">Cons:</span> <span className="text-gray-500">{l.producto.cons}</span></p>}
                            {l.producto.cuidadoCon && <p><span className="font-semibold text-red-600">Cuidado con:</span> <span className="text-gray-500">{l.producto.cuidadoCon}</span></p>}
                          </div>
                        )}
                        {(l.producto.ficha_tecnica_url || l.producto.ficha_seguridad_url) && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {l.producto.ficha_tecnica_url && (
                              <a
                                href={l.producto.ficha_tecnica_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors print:hidden"
                                title="Ficha Técnica"
                              >
                                📄 TDS
                              </a>
                            )}
                            {l.producto.ficha_seguridad_url && (
                              <a
                                href={l.producto.ficha_seguridad_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors print:hidden"
                                title="Hoja de Seguridad"
                              >
                                🛡️ SDS
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-500 font-medium">
                        {l.producto.densidadRecomendada 
                          ? `${l.producto.densidadRecomendada} (${l.producto.densidad_conversion || 1.0} kg/L)`
                          : `${l.producto.densidad_conversion || 1.0} kg/L`}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700 font-medium tabular-nums">
                        {(() => {
                          const dens = l.producto.densidad_conversion || 1.0;
                          const uni = l.producto.unidad.toLowerCase();
                          if (dens > 0 && dens !== 1.0) {
                            if (uni === 'kg') {
                              return `${formatNum(l.cantidad)} kg (${formatNum(l.cantidad / dens)} L)`;
                            } else if (uni === 'l' || uni === 'litro' || uni === 'litros') {
                              return `${formatNum(l.cantidad)} L (${formatNum(l.cantidad * dens)} kg)`;
                            }
                          }
                          return `${formatNum(l.cantidad)} ${l.producto.unidad}`;
                        })()}
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums">
                        <div className="font-semibold text-gray-800">{formatMXN(l.precioUnitario)}</div>
                        <div className="text-xs text-blue-400 font-medium">USD ≈${(l.precioUnitario / tipoCambio).toFixed(2)}</div>
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums">
                        <div className="font-semibold text-gray-800">{formatMXN(l.totalMXN)}</div>
                        <div className="text-xs text-blue-400 font-medium">USD ≈${(l.totalMXN / tipoCambio).toFixed(2)}</div>
                      </td>
                      <td className="py-3 px-2 print:hidden flex gap-2 justify-end">
                        <button
                          onClick={() => editarLinea(l)}
                          className="text-gray-400 hover:text-blue-500 transition-colors text-sm font-medium"
                          title="Editar"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => eliminarLinea(l.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors text-xl leading-none"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-blue-900">
                    <td colSpan={4} className="py-3 px-2 text-right font-bold text-gray-800 text-sm uppercase tracking-wide">
                      Total del proyecto
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-xl buca-total tabular-nums">
                      {formatMXN(totalProyecto)}
                    </td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between print:hidden">
              <p className="text-xs text-gray-400">
                {lineas.length} {lineas.length === 1 ? 'producto' : 'productos'} · {esMinorista ? 'Precio minorista' : `Precio con descuento (−${descuentoPorcentaje}%)`} · {estadoPiso === 'liso' ? 'Piso liso (+5% merma)' : estadoPiso === 'rugoso' ? 'Piso rugoso (+15% merma)' : estadoPiso === 'estandar' ? 'Piso estándar (+10% merma)' : 'Sin merma (0%)'}
              </p>
            </div>

            {/* Print footer */}
            <div className="hidden print:block mt-6 pt-4 border-t text-xs text-gray-400">
              <p>Cotización generada el {fechaHoy} · BUCA Recubrimientos · Monterrey, N.L., México</p>
              <p className="mt-1">Precios sujetos a cambio sin previo aviso. Tipo de cambio utilizado: ${tipoCambio} MXN/USD.</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {lineas.length === 0 && (
          <div className="text-center py-10 text-gray-400 print:hidden">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">Selecciona un producto y agrégalo para comenzar la cotización</p>
          </div>
        )}

        {/* Footer legend */}
        <footer className="mt-8 py-6 border-t border-gray-200 text-center text-xs text-gray-500 space-y-1 print:hidden">
          <p className="font-semibold text-gray-700">⚠️ Nota Importante sobre el Tipo de Cambio:</p>
          <p>El valor del dólar es el aproximado y el único oficial es el del Diario Oficial de la Federación (DOF).</p>
          <p className="text-amber-600 font-semibold">Se sugiere confirmar de manera manual antes de pasarlo así.</p>
        </footer>
      </main>

      {/* Floating Chat Button */}
      <div className="fixed bottom-6 right-6 z-50 print:hidden">
        <button
          onClick={() => setChatAbierto(!chatAbierto)}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 font-semibold text-sm cursor-pointer select-none"
        >
          {chatAbierto ? (
            <>
              <span className="text-base">❌</span>
              <span>Cerrar Asistente</span>
            </>
          ) : (
            <>
              <span className="text-base">💬</span>
              <span>Asistente Técnico</span>
            </>
          )}
        </button>
      </div>

      {/* Chat Window Panel */}
      {chatAbierto && (
        <div className="fixed bottom-20 right-6 w-[340px] max-w-[calc(100vw-2rem)] h-[480px] bg-white border border-gray-150 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 print:hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center shadow-md">
            <div>
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <span>🤖</span> Asistente Técnico BUCA
              </h3>
              <p className="text-[10px] text-blue-100 font-medium truncate max-w-[240px]">
                {citadoSistema 
                  ? `Sistema: ${citadoSistema.nombre}`
                  : citadosProductos.length > 0 
                    ? `Citando: ${citadosProductos.length} prod.`
                    : productoSeleccionado 
                      ? `Activo: ${productoSeleccionado.nombre}`
                      : 'Sin selección'}
              </p>
            </div>
            <button
              onClick={() => setChatAbierto(false)}
              className="text-white/80 hover:text-white font-bold text-xl leading-none cursor-pointer animate-fade-in"
            >
              ×
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/50">
            {chatHistorial.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
                <div className="text-3xl">👋</div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">¡Hola! Soy tu Asistente Técnico BUCA.</p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-[220px] mx-auto">
                    Pregúntame sobre fichas técnicas, consumos de m², proporciones o conversiones de unidades.
                  </p>
                </div>
                {/* Suggestions */}
                <div className="w-full space-y-1.5 pt-2">
                  {(citadoSistema || citadosProductos.length > 0 || productoSeleccionado) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const p = citadosProductos[0] || productoSeleccionado;
                          if (p) setChatMensaje(`¿Cuál es el rendimiento de ${p.nombre}?`);
                        }}
                        className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                      >
                        📊 ¿Cuál es su rendimiento?
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const p = citadosProductos[0] || productoSeleccionado;
                          if (p) setChatMensaje(`Tengo un área de 100 m², ¿cuánto necesito comprar de ${p.nombre}?`);
                        }}
                        className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                      >
                        📐 Calcular consumo para 100 m²
                      </button>
                      {((citadosProductos[0] || productoSeleccionado)?.proporcionesMezcla) && (
                        <button
                          type="button"
                          onClick={() => {
                            const p = citadosProductos[0] || productoSeleccionado;
                            if (p) setChatMensaje(`¿Cuál es la proporción de mezcla recomendada para ${p.nombre}?`);
                          }}
                          className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                        >
                          🧪 ¿Cuál es la proporción de mezcla?
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-semibold italic bg-amber-50 border border-amber-100 rounded-lg p-2">
                      💡 Selecciona un producto en el cotizador o usa el clip para citar uno y desbloquear preguntas contextuales.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setChatMensaje("¿Cómo convierto micras a mils?");
                    }}
                    className="w-full text-[10px] text-left text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg p-2 transition font-medium cursor-pointer"
                  >
                    🔄 ¿Cómo convierto micras a mils?
                  </button>
                </div>
              </div>
            ) : (
              chatHistorial.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.remitente === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      msg.remitente === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                        : 'bg-white border border-gray-150 text-gray-800 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {msg.texto}
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1 px-1.5 select-none">
                    {msg.hora}
                  </span>
                </div>
              ))
            )}
            
            {/* Blinking loader */}
            {chatCargando && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-150 text-gray-400 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Dynamic Citation Badges */}
          {(citadoSistema || citadosProductos.length > 0) && (
            <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100 flex flex-wrap gap-1.5 items-center justify-between text-[11px] text-blue-700 animate-fade-in shrink-0">
              <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                {citadoSistema && (
                  <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold max-w-full">
                    <span className="shrink-0">🧪 Sistema:</span> <strong className="truncate">{citadoSistema.nombre}</strong>
                    <button
                      type="button"
                      onClick={() => setCitadoSistema(null)}
                      className="text-purple-500 hover:text-purple-700 font-bold ml-1 text-sm leading-none shrink-0"
                      title="Quitar sistema"
                    >
                      ×
                    </button>
                  </span>
                )}
                {citadosProductos.map((p, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium max-w-full">
                    <span className="shrink-0">📎</span> <span className="truncate">{p.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setCitadosProductos(prev => prev.filter(item => item.nombre !== p.nombre))}
                      className="text-blue-500 hover:text-blue-700 font-bold ml-1 text-sm leading-none shrink-0"
                      title="Quitar producto"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCitadoSistema(null);
                  setCitadosProductos([]);
                }}
                className="text-blue-600 hover:text-red-500 text-[10px] font-bold shrink-0 ml-2 border-l pl-2 border-gray-200"
                title="Limpiar citaciones"
              >
                Limpiar
              </button>
            </div>
          )}

          {/* Paperclip product list dropdown (absolute positioned) */}
          {mostrarClipMenu && (
            <div className="absolute left-3 right-3 max-h-48 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col animate-fade-in" style={{ bottom: (citadoSistema || citadosProductos.length > 0) ? '92px' : '57px' }}>
              <div className="p-2 border-b bg-gray-50 flex justify-between items-center shrink-0">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClipMenuTab('productos')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                      clipMenuTab === 'productos' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    📦 Productos
                  </button>
                  <button
                    type="button"
                    onClick={() => setClipMenuTab('sistemas')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                      clipMenuTab === 'sistemas' 
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    🧪 Sistemas
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={() => setMostrarClipMenu(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
              <ul className="overflow-y-auto divide-y divide-gray-100 flex-1">
                {clipMenuTab === 'productos' ? (
                  productosDisponibles.filter(p => p.estado !== 'borrador').map((p, idx) => {
                    const isCited = citadosProductos.some(item => item.nombre === p.nombre);
                    return (
                      <li 
                        key={p.id || `${p.nombre}-${idx}`}
                        onClick={() => {
                          if (isCited) {
                            setCitadosProductos(prev => prev.filter(item => item.nombre !== p.nombre));
                          } else {
                            setCitadosProductos(prev => [...prev, p]);
                          }
                        }}
                        className={`px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer text-gray-700 font-medium truncate flex items-center justify-between gap-1.5 ${
                          isCited ? 'bg-blue-50 text-blue-700 font-bold' : ''
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>📎</span> {p.nombre}
                        </span>
                        {isCited && <span className="text-blue-600 font-bold">✓</span>}
                      </li>
                    );
                  })
                ) : (
                  sistemasDisponibles.map((sys, idx) => {
                    const isCited = citadoSistema?.nombre === sys.nombre;
                    return (
                      <li 
                        key={sys.id || `${sys.nombre}-${idx}`}
                        onClick={() => {
                          if (isCited) {
                            setCitadoSistema(null);
                          } else {
                            setCitadoSistema(sys);
                            // Also cite its products if loaded
                            fetchSistemaProductosSupabase(sys.id).then(rels => {
                              const resolvedProds = rels.map(r => productosDisponibles.find(prod => prod.id === r.producto_id)).filter(Boolean) as Producto[];
                              setCitadosProductos(prev => {
                                const merged = [...prev];
                                resolvedProds.forEach(sp => {
                                  if (!merged.some(p => p.nombre === sp.nombre)) {
                                    merged.push(sp);
                                  }
                                });
                                return merged;
                              });
                            });
                          }
                          setMostrarClipMenu(false);
                        }}
                        className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer text-gray-700 font-medium truncate flex items-center justify-between gap-1.5 ${
                          isCited ? 'bg-purple-50 text-purple-700 font-bold' : ''
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>🧪</span> {sys.nombre}
                        </span>
                        {isCited && <span className="text-purple-600 font-bold">✓</span>}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}

          {/* Footer Input */}
          <form
            onSubmit={enviarMensajeChat}
            className="p-3 bg-white border-t border-gray-150 flex gap-2 items-center shrink-0"
          >
            {/* Paperclip Button */}
            <button
              type="button"
              onClick={() => setMostrarClipMenu(!mostrarClipMenu)}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center border shrink-0 ${
                mostrarClipMenu 
                  ? 'bg-blue-50 border-blue-200 text-blue-600' 
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Citar producto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <input
              type="text"
              className="flex-1 text-xs px-3.5 py-2 border border-gray-200 rounded-xl outline-none focus:border-blue-400 bg-gray-50/50"
              placeholder="Haz tu pregunta..."
              value={chatMensaje}
              onChange={e => setChatMensaje(e.target.value)}
              disabled={chatCargando}
            />
            <button
              type="submit"
              disabled={chatCargando || !chatMensaje.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shadow-md shadow-blue-200"
            >
              <svg className="w-3.5 h-3.5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9-7-9-7V7" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
