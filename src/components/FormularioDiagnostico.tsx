// BUCA Recubrimientos - Formulario de Diagnóstico
import React, { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import {
  fetchProductosSupabase,
  fetchSistemasSupabase,
  saveProspectoSupabase,
  type Prospecto,
  type Sistema
} from '../supabase'
import { type Producto } from '../data/productos'

// Generate a random tracking code like BUCA-2026-A1B2
function generarCodigoSeguimiento(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let randomPart = ''
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const year = new Date().getFullYear()
  return `BUCA-${year}-${randomPart}`
}

const FALLBACK_DOMINIOS = [
  'yopmail.com', 'mailinator.com', 'tempmail.com', '10minutemail.com',
  'guerrillamail.com', 'trashmail.com', 'getairmail.com', 'sharklasers.com',
  'dispostable.com', 'generator.email', 'maildrop.cc', 'temp-mail.org',
  'boun.cr', '33mail.com', 'mailnesia.com', 'bugmenot.com', 'mail.com',
  'throwawaymail.com', 'tempmailaddress.com', 'jetable.org'
]

const FALLBACK_PROFANIAS = [
  // Spam & Placeholder indicators
  'test', 'prueba', 'falso', 'falsa', 'dummy', 'spam', 'ninguno', 'ninguna',
  'nadie', 'vacio', 'vacío', 'inventado', 'inventada', 'cualquiera', 'asdf',
  'qwerty', 'zxcv', 'qweqwe', 'asdgasd', 'hola', 'admin', 'usuario', 'user',
  'no se', 'no sé', 'ejemplo', 'example', 'nada', 'ninguno',
  // Common insults / vulgar words in Spanish
  'puto', 'puta', 'pendejo', 'pendeja', 'mierda', 'culero', 'culera', 'cabron',
  'cabrón', 'chinga', 'verga', 'maricon', 'maricón', 'joto', 'orto', 'concha',
  'mamada', 'mamón', 'mamon', 'pito', 'pija', 'forro', 'tarado', 'estupido',
  'estúpido', 'baboso', 'pajero', 'hijo de puta', 'chinguen', 'chingas', 'mierdas'
]

const normalizarTexto = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .trim()
}

const esKeyboardMash = (texto: string): boolean => {
  const normalized = normalizarTexto(texto)
  const words = normalized.split(/[^a-z0-9ñü]/i).filter(Boolean)
  for (const word of words) {
    // If it's a long word (length >= 5) and contains no vowels
    if (word.length >= 5 && !/[aeiouy]/i.test(word)) {
      return true
    }
    // If it has 5 consecutive consonants
    if (/[bcdfghjklmnñpqrstvwxz]{5,}/i.test(word)) {
      return true
    }
  }
  return false
}

export const FormularioDiagnostico: React.FC = () => {
  const [paso, setPaso] = useState<number>(0) // 0: Contact info, 1..N: Questions, N+1: Result
  const [productos, setProductos] = useState<Producto[]>([])
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [codigoGenerado, setCodigoGenerado] = useState<string>('')
  const [errorEnvio, setErrorEnvio] = useState<string>('')

  // Contact Info
  const [clienteNombre, setClienteNombre] = useState('')
  const [proyectoNombre, setProyectoNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [telefonoError, setTelefonoError] = useState('')
  const [clienteNombreError, setClienteNombreError] = useState('')
  const [proyectoNombreError, setProyectoNombreError] = useState('')
  const [mostrarErroresContacto, setMostrarErroresContacto] = useState(false)
  const [intentoAvanzar, setIntentoAvanzar] = useState(false)

  const [spamFilters, setSpamFilters] = useState<{ disposableDomains: string[], profanities: string[] } | null>(null)

  useEffect(() => {
    // Lazy load the filters dynamically in the background
    import('../data/spamFilters.json')
      .then(data => {
        setSpamFilters(data.default)
      })
      .catch(err => {
        console.error("Failed to load spam filters:", err)
      })
  }, [])

  const esCorreoTemporal = (emailStr: string): boolean => {
    const parts = emailStr.trim().toLowerCase().split('@')
    if (parts.length !== 2) return false
    const domain = parts[1]
    const list = spamFilters ? spamFilters.disposableDomains : FALLBACK_DOMINIOS
    return list.includes(domain)
  }

  const contienePalabrasProhibidas = (texto: string): boolean => {
    const normalizedText = normalizarTexto(texto)
    const words = normalizedText.split(/[^a-z0-9ñü]/i).filter(Boolean)
    const list = spamFilters ? spamFilters.profanities : FALLBACK_PROFANIAS
    const normalizedList = list.map(normalizarTexto)
    
    for (const word of words) {
      if (normalizedList.includes(word)) {
        return true
      }
    }

    // Also check for consecutive repeated letters (e.g. "aaaa", "zzzz")
    if (/(.)\1{3,}/.test(normalizedText)) {
      return true
    }

    return false
  }

  // Scoping Answers
  const [queRecubrir, setQueRecubrir] = useState<string>('')
  const [queRecubrirDetalle, setQueRecubrirDetalle] = useState<string>('')
  
  const [ubicacion, setUbicacion] = useState<string>('')
  
  const [objetivos, setObjetivos] = useState<string[]>([])
  const [objetivoOtro, setObjetivoOtro] = useState<string>('')
  const [mostrarInputObjetivoOtro, setMostrarInputObjetivoOtro] = useState(false)
  
  const [traficosSeleccionados, setTraficosSeleccionados] = useState<string[]>([])
  const [quimicos, setQuimicos] = useState<string>('')
  const [areaM2, setAreaM2] = useState<number | ''>('')
  const [colorDeseado, setColorDeseado] = useState<string>('')
  const [colorDetalle, setColorDetalle] = useState<string>('')

  // Conditional Scoping Answers
  const [estadoConcreto, setEstadoConcreto] = useState<string>('')
  const [estadoConcretoDetalle, setEstadoConcretoDetalle] = useState<string>('')
  const [radiacionUv, setRadiacionUv] = useState<string>('')
  const [tipoRuedas, setTipoRuedas] = useState<string>('')
  const [frecuenciaQuimica, setFrecuenciaQuimica] = useState<string>('')

  // Recommendations State
  const [recSistemas, setRecSistemas] = useState<Sistema[]>([])
  const [recProductos, setRecProductos] = useState<Producto[]>([])

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoadingCatalog(true)
        const prods = await fetchProductosSupabase(false)
        const sys = await fetchSistemasSupabase()
        setProductos(prods)
        setSistemas(sys)
      } catch (e) {
        console.error("Error loading catalog for diagnostic form:", e)
      } finally {
        setLoadingCatalog(false)
      }
    }
    loadCatalog()
  }, [])

  // Build the dynamic list of questions/steps
  const obtenerPasosActivos = () => {
    const pasos = [
      { id: 'contacto', titulo: 'Información del Proyecto' },
      { id: 'que_recubrir', titulo: '¿Qué deseas recubrir?' },
      { id: 'ubicacion', titulo: '¿Dónde estará ubicado?' },
      { id: 'objetivos', titulo: '¿Cuáles son tus objetivos?' },
      { id: 'trafico', titulo: '¿Estará expuesto a tráfico?' },
      { id: 'quimicos', titulo: '¿Contacto con químicos o aceites?' }
    ]

    // Conditional: Concrete floor state
    if (queRecubrir === 'concrete_floor') {
      pasos.push({ id: 'estado_concreto', titulo: 'Estado del Concreto' })
    }

    // Conditional: UV exposure
    if (ubicacion === 'exterior' || ubicacion === 'both') {
      pasos.push({ id: 'radiacion_uv', titulo: 'Exposición Solar (UV)' })
    }

    // Conditional: Wheel type under heavy traffic
    const esTraficoIntenso = traficosSeleccionados.includes('heavy') || traficosSeleccionados.includes('severe')
    if (esTraficoIntenso) {
      pasos.push({ id: 'tipo_ruedas', titulo: 'Tipo de Tránsito y Ruedas' })
    }

    // Conditional: Chemical frequency
    if (quimicos && quimicos !== 'no') {
      pasos.push({ id: 'frecuencia_quimica', titulo: 'Frecuencia de Exposición Química' })
    }

    // Standard scoping variables
    pasos.push({ id: 'area_m2', titulo: 'Dimensión de la Obra' })
    pasos.push({ id: 'color', titulo: 'Color Solicitado' })

    return pasos
  }

  const pasosActivos = obtenerPasosActivos()
  const totalPasos = pasosActivos.length

  const handleSiguiente = () => {
    const pasoActual = pasosActivos[paso]
    if (pasoActual.id === 'contacto') {
      const cleanDigits = telefono.replace(/\D/g, '')
      const isOnlyDigits = /^[0-9\s\-()+]*$/.test(telefono)
      const esTelefonoValido = !telefono.trim() || (isOnlyDigits && cleanDigits.length === 10)
      const esEmailValido = !email.trim() || (
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim()) &&
        !email.trim().toLowerCase().endsWith('@gmail.co') &&
        !email.trim().toLowerCase().endsWith('@hotmail.co') &&
        !email.trim().toLowerCase().endsWith('@outlook.co')
      )

      let hasError = false

      // Validar Cliente Nombre
      const nombreLimpio = clienteNombre.trim()
      if (!nombreLimpio) {
        setClienteNombreError('El nombre del cliente es obligatorio.')
        hasError = true
      } else if (nombreLimpio.length < 3) {
        setClienteNombreError('El nombre del cliente debe tener al menos 3 caracteres.')
        hasError = true
      } else if (/^\d+$/.test(nombreLimpio)) {
        setClienteNombreError('El nombre del cliente no puede consistir únicamente de números.')
        hasError = true
      } else if (contienePalabrasProhibidas(nombreLimpio)) {
        setClienteNombreError('El nombre contiene palabras no permitidas o de prueba.')
        hasError = true
      } else if (esKeyboardMash(nombreLimpio)) {
        setClienteNombreError('El nombre parece ser inválido o aleatorio.')
        hasError = true
      } else {
        setClienteNombreError('')
      }

      // Validar Proyecto Nombre
      const proyectoLimpio = proyectoNombre.trim()
      if (!proyectoLimpio) {
        setProyectoNombreError('El nombre del proyecto es obligatorio.')
        hasError = true
      } else if (proyectoLimpio.length < 3) {
        setProyectoNombreError('El nombre del proyecto debe tener al menos 3 caracteres.')
        hasError = true
      } else if (/^\d+$/.test(proyectoLimpio)) {
        setProyectoNombreError('El nombre del proyecto no puede consistir únicamente de números.')
        hasError = true
      } else if (contienePalabrasProhibidas(proyectoLimpio)) {
        setProyectoNombreError('El nombre del proyecto contiene palabras no permitidas o de prueba.')
        hasError = true
      } else if (esKeyboardMash(proyectoLimpio)) {
        setProyectoNombreError('El nombre del proyecto parece ser ficticio o aleatorio.')
        hasError = true
      } else {
        setProyectoNombreError('')
      }

      if (telefono.trim() && !esTelefonoValido) {
        setTelefonoError('El teléfono debe tener exactamente 10 dígitos.')
        hasError = true
      } else {
        setTelefonoError('')
      }

      if (email.trim()) {
        if (!esEmailValido) {
          if (email.trim().toLowerCase().endsWith('@gmail.co') || email.trim().toLowerCase().endsWith('@hotmail.co') || email.trim().toLowerCase().endsWith('@outlook.co')) {
            setEmailError(`¿Quisiste decir ${email.trim().split('@')[0]}@${email.trim().split('@')[1]}m?`)
          } else {
            setEmailError('Por favor ingresa un correo electrónico válido.')
          }
          hasError = true
        } else if (esCorreoTemporal(email)) {
          setEmailError('No se permiten correos de proveedores temporales o sospechosos de spam.')
          hasError = true
        } else {
          setEmailError('')
        }
      } else {
        setEmailError('')
      }

      setMostrarErroresContacto(true)

      if (hasError) {
        return // Block navigation
      }
    }

    if (!validarPaso()) {
      setIntentoAvanzar(true)
      return // Block navigation
    }

    // Reset warnings on successful step transition
    setIntentoAvanzar(false)

    if (paso < totalPasos - 1) {
      setPaso(paso + 1)
    } else {
      enviarDiagnostico()
    }
  }

  const handleAtras = () => {
    setIntentoAvanzar(false)
    if (paso > 0) {
      setPaso(paso - 1)
    }
  }

  // --- Rule-Based Recommendation Logic Engine ---
  const calcularRecomendaciones = () => {
    const recomendadosSys: Sistema[] = []
    const recomendadosProds: Producto[] = []
    const tagsBuscados: string[] = []

    // 1. Determine requirements from answers
    const esPiso = queRecubrir === 'concrete_floor'
    const esMetal = queRecubrir === 'metal_structure'
    const esTanque = queRecubrir === 'tank'
    const esExterior = ubicacion === 'exterior' || ubicacion === 'both'
    const esQuimicoIntenso = quimicos === 'yes_heavy_acids' || frecuenciaQuimica === 'immersion'
    const esTraficoIntenso = traficosSeleccionados.includes('heavy') || traficosSeleccionados.includes('severe')
    
    const esHigiene = objetivos.some(o => 
      o.toLowerCase().includes('higiene') || 
      o.toLowerCase().includes('alimentic') || 
      o.toLowerCase().includes('clean') ||
      o.toLowerCase().includes('antibact')
    )
    const necesitaNivelar = objetivos.some(o => 
      o.toLowerCase().includes('repar') || 
      o.toLowerCase().includes('nivel') || 
      o.toLowerCase().includes('grieta')
    ) || estadoConcreto === 'damaged'

    // 2. Map requirements to product/system search terms
    if (esPiso) {
      if (esQuimicoIntenso || esTraficoIntenso) {
        tagsBuscados.push('BucaCrete', 'Crete', 'Novolaca')
      } else if (esExterior) {
        tagsBuscados.push('BucaTrafic', 'Bucathane')
      } else if (necesitaNivelar) {
        tagsBuscados.push('Autonivelante', 'Tapaporo')
      } else {
        tagsBuscados.push('BucaPoxyMulti', 'PoxyPlus')
      }
    } else if (esMetal) {
      tagsBuscados.push('Base Primer', 'Bucathane')
    } else if (esTanque) {
      tagsBuscados.push('BucaPoxyPlus', 'Epoxico')
    } else {
      tagsBuscados.push('BucaPoxyMulti', 'PoxyPlus')
    }

    if (esHigiene) {
      tagsBuscados.push('Plus Top', 'BucaPoxyPlus')
    }

    // 3. Search catalog systems
    sistemas.forEach(sys => {
      const match = tagsBuscados.some(tag => 
        sys.nombre.toLowerCase().includes(tag.toLowerCase()) || 
        (sys.descripcion && sys.descripcion.toLowerCase().includes(tag.toLowerCase()))
      )
      if (match && recomendadosSys.length < 2) {
        recomendadosSys.push(sys)
      }
    })

    // 4. Search catalog products
    productos.forEach(prod => {
      if (prod.nombre.toLowerCase().includes('parte b') || prod.nombre.toLowerCase().includes('pte b')) {
        return
      }
      const match = tagsBuscados.some(tag => 
        prod.nombre.toLowerCase().includes(tag.toLowerCase()) || 
        (prod.nota && prod.nota.toLowerCase().includes(tag.toLowerCase()))
      )
      if (match && recomendadosProds.length < 3) {
        recomendadosProds.push(prod)
      }
    })

    // 5. Fallbacks
    if (recomendadosSys.length === 0 && sistemas.length > 0) {
      recomendadosSys.push(sistemas[0])
    }
    if (recomendadosProds.length === 0 && productos.length > 0) {
      const multi = productos.find(p => p.nombre.toLowerCase().includes('multi'))
      const thane = productos.find(p => p.nombre.toLowerCase().includes('thane'))
      if (multi) recomendadosProds.push(multi)
      if (thane) recomendadosProds.push(thane)
      if (recomendadosProds.length === 0) {
        recomendadosProds.push(productos[0])
      }
    }

    return { systems: recomendadosSys, products: recomendadosProds }
  }

  const enviarDiagnostico = async () => {
    setGuardando(true)
    setErrorEnvio('')
    const codigo = generarCodigoSeguimiento()

    const { systems, products } = calcularRecomendaciones()
    setRecSistemas(systems)
    setRecProductos(products)

    const esTraficoIntenso = traficosSeleccionados.includes('heavy') || traficosSeleccionados.includes('severe')

    const respuestas = {
      que_recubrir: queRecubrir === 'other' ? `Otro: ${queRecubrirDetalle}` : queRecubrir,
      ubicacion,
      objetivos,
      trafico: traficosSeleccionados,
      quimicos,
      area_m2: areaM2 === '' ? 0 : areaM2,
      color_deseado: colorDeseado,
      color_detalle: colorDetalle,
      estado_concreto: queRecubrir === 'concrete_floor' 
        ? (estadoConcreto === 'other' ? `Otro: ${estadoConcretoDetalle}` : estadoConcreto) 
        : undefined,
      radiacion_uv: (ubicacion === 'exterior' || ubicacion === 'both') ? radiacionUv : undefined,
      tipo_ruedas: esTraficoIntenso ? tipoRuedas : undefined,
      frecuencia_quimica: (quimicos && quimicos !== 'no') ? frecuenciaQuimica : undefined
    }

    const recomendaciones = [
      ...systems.map(s => ({ type: 'sistema', id: s.id, nombre: s.nombre })),
      ...products.map(p => ({ type: 'producto', id: p.id, nombre: p.nombre }))
    ]

    try {
      await saveProspectoSupabase({
        codigo_seguimiento: codigo,
        cliente_nombre: clienteNombre,
        proyecto_nombre: proyectoNombre,
        telefono: telefono || null,
        email: email || null,
        respuestas,
        recomendaciones,
        campos_vendedor: {},
        estado: 'Nuevo'
      })

      setCodigoGenerado(codigo)
      setPaso(totalPasos) // Move to result page
    } catch (e: any) {
      console.error("Error saving project scoping diagnostic:", e)
      setErrorEnvio(e.message || 'Error al guardar el diagnóstico. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  // Render current step UI
  const renderContenidoPaso = () => {
    const pasoActual = pasosActivos[paso]

    switch (pasoActual.id) {
      case 'contacto':
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-2">Ingresa los datos generales para identificar tu cotización y dar seguimiento comercial.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre del Cliente / Empresa *</label>
                <input
                  type="text"
                  required
                  className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:ring-1 bg-gray-100 ${
                    mostrarErroresContacto && clienteNombreError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder=""
                  value={clienteNombre}
                  onChange={e => {
                    const val = e.target.value
                    setClienteNombre(val)
                    if (mostrarErroresContacto) {
                      const valTrim = val.trim()
                      if (!valTrim) {
                        setClienteNombreError('El nombre del cliente es obligatorio.')
                      } else if (valTrim.length < 3) {
                        setClienteNombreError('El nombre del cliente debe tener al menos 3 caracteres.')
                      } else if (/^\d+$/.test(valTrim)) {
                        setClienteNombreError('El nombre del cliente no puede consistir únicamente de números.')
                      } else if (contienePalabrasProhibidas(valTrim)) {
                        setClienteNombreError('El nombre contiene palabras no permitidas o de prueba.')
                      } else if (esKeyboardMash(valTrim)) {
                        setClienteNombreError('El nombre parece ser inválido o aleatorio.')
                      } else {
                        setClienteNombreError('')
                      }
                    }
                  }}
                />
                {mostrarErroresContacto && clienteNombreError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{clienteNombreError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:ring-1 bg-gray-100 ${
                    mostrarErroresContacto && proyectoNombreError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder=""
                  value={proyectoNombre}
                  onChange={e => {
                    const val = e.target.value
                    setProyectoNombre(val)
                    if (mostrarErroresContacto) {
                      const valTrim = val.trim()
                      if (!valTrim) {
                        setProyectoNombreError('El nombre del proyecto es obligatorio.')
                      } else if (valTrim.length < 3) {
                        setProyectoNombreError('El nombre del proyecto debe tener al menos 3 caracteres.')
                      } else if (/^\d+$/.test(valTrim)) {
                        setProyectoNombreError('El nombre del proyecto no puede consistir únicamente de números.')
                      } else if (contienePalabrasProhibidas(valTrim)) {
                        setProyectoNombreError('El nombre del proyecto contiene palabras no permitidas o de prueba.')
                      } else if (esKeyboardMash(valTrim)) {
                        setProyectoNombreError('El nombre del proyecto parece ser ficticio o aleatorio.')
                      } else {
                        setProyectoNombreError('')
                      }
                    }
                  }}
                />
                {mostrarErroresContacto && proyectoNombreError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{proyectoNombreError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Teléfono de Contacto</label>
                <input
                  type="tel"
                  className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:ring-1 bg-gray-100 ${
                    mostrarErroresContacto && telefonoError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder=""
                  value={telefono}
                  onChange={e => {
                    const val = e.target.value
                    setTelefono(val)
                    if (val.trim()) {
                      const cleanDigits = val.replace(/\D/g, '')
                      const isOnlyDigits = /^[0-9\s\-()+]*$/.test(val)
                      if (!isOnlyDigits) {
                        setTelefonoError('El teléfono solo debe contener números.')
                      } else if (cleanDigits.length !== 10) {
                        setTelefonoError('El teléfono debe tener exactamente 10 dígitos.')
                      } else {
                        setTelefonoError('')
                      }
                    } else {
                      setTelefonoError('')
                    }
                  }}
                />
                {mostrarErroresContacto && telefonoError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{telefonoError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Correo Electrónico</label>
                <input
                  type="email"
                  className={`w-full text-sm px-3.5 py-2.5 border rounded-xl outline-none focus:ring-1 bg-gray-100 ${
                    mostrarErroresContacto && emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder=""
                  value={email}
                  onChange={e => {
                    const val = e.target.value
                    setEmail(val)
                    if (mostrarErroresContacto) {
                      if (val.trim()) {
                        const lower = val.trim().toLowerCase()
                        const isValidRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val.trim())
                        const isTypo = lower.endsWith('@gmail.co') || lower.endsWith('@hotmail.co') || lower.endsWith('@outlook.co')
                        
                        if (isTypo) {
                          setEmailError(`¿Quisiste decir ${val.trim().split('@')[0]}@${val.trim().split('@')[1]}m?`)
                        } else if (!isValidRegex) {
                          setEmailError('Por favor ingresa un correo electrónico válido.')
                        } else {
                          setEmailError('')
                        }
                      } else {
                        setEmailError('')
                      }
                    }
                  }}
                />
                {mostrarErroresContacto && emailError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{emailError}</p>}
              </div>
            </div>
          </div>
        )

      case 'que_recubrir':
        return (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selecciona la superficie a recubrir:</label>
            <select
              className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
              value={queRecubrir}
              onChange={e => {
                setQueRecubrir(e.target.value)
                if (e.target.value !== 'other') {
                  setQueRecubrirDetalle('')
                }
              }}
            >
              <option value="">-- Seleccionar Superficie --</option>
              <option value="concrete_floor">Piso de Concreto</option>
              <option value="wall">Muro / Pared</option>
              <option value="metal_structure">Estructura Metálica / Fierro</option>
              <option value="tank">Tanque / Cisterna</option>
              <option value="wood">Madera / Triplay</option>
              <option value="other">Otra</option>
            </select>

            {queRecubrir === 'other' && (
              <div className="animate-fade-in pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Especifica la superficie a recubrir *</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-gray-50/50"
                  placeholder="Ej. Albercas, Fachadas..."
                  value={queRecubrirDetalle}
                  onChange={e => setQueRecubrirDetalle(e.target.value)}
                />
              </div>
            )}
          </div>
        )

      case 'ubicacion':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'interior', icon: '🏢', label: 'Interior', desc: 'Bajo techo, ambiente controlado' },
              { id: 'exterior', icon: '☀️', label: 'Exterior', desc: 'Exposición al sol y lluvia' },
              { id: 'both', icon: '🌓', label: 'Ambos', desc: 'Proyecto con áreas mixtas' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setUbicacion(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  ubicacion === opt.id 
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
              </div>
            ))}
          </div>
        )

      case 'objetivos':
        return (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selecciona tus objetivos principales (puedes añadir varios):</label>
            <div className="flex gap-2">
              <select
                className="flex-1 text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
                onChange={e => {
                  const val = e.target.value
                  if (val === 'other') {
                    setMostrarInputObjetivoOtro(true)
                  } else if (val && !objetivos.includes(val)) {
                    setObjetivos([...objetivos, val])
                  }
                  e.target.value = "" // Reset select option
                }}
              >
                <option value="">-- Agregar Objetivo --</option>
                <option value="Estética y color">Estética y color</option>
                <option value="Resistencia al tráfico intenso">Resistencia al tráfico intenso</option>
                <option value="Resistencia a derrame de químicos / aceites">Resistencia a derrame de químicos / aceites</option>
                <option value="Impermeabilización contra humedad/agua">Impermeabilización contra humedad/agua</option>
                <option value="Nivelación o reparación de grietas">Nivelación o reparación de grietas</option>
                <option value="Higiene / Grado alimenticio / Antibacterial">Higiene / Grado alimenticio / Antibacterial</option>
                <option value="Antiderrapante / Seguridad">Antiderrapante / Seguridad</option>
                <option value="Resistencia a la temperatura (choque térmico)">Resistencia a la temperatura (choque térmico)</option>
                <option value="Aumento de iluminación (Reflectividad de luz)">Aumento de iluminación (Reflectividad de luz)</option>
                <option value="Protección contra impacto y arrastre">Protección contra impacto y arrastre</option>
                <option value="Acabado mate antirreflejante">Acabado mate antirreflejante</option>
                <option value="Retardante de fuego / Ignífugo">Retardante de fuego / Ignífugo</option>
                <option value="Fácil limpieza y mantenimiento">Fácil limpieza y mantenimiento</option>
                <option value="Protección contra corrosión">Protección contra corrosión</option>
                <option value="other">Otra (Escribir en específico)</option>
              </select>
            </div>

            {mostrarInputObjetivoOtro && (
              <div className="flex gap-2 items-center animate-fade-in">
                <input
                  type="text"
                  className="flex-1 text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-gray-50/50"
                  placeholder="Escribe tu objetivo personalizado..."
                  value={objetivoOtro}
                  onChange={e => setObjetivoOtro(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (objetivoOtro.trim() && !objetivos.includes(objetivoOtro.trim())) {
                      setObjetivos([...objetivos, objetivoOtro.trim()])
                      setObjetivoOtro('')
                      setMostrarInputObjetivoOtro(false)
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow"
                >
                  Añadir
                </button>
              </div>
            )}

            {/* Selected tags */}
            <div className="flex flex-wrap gap-2 pt-2">
              {objetivos.length === 0 ? (
                intentoAvanzar ? (
                  <p className="text-[11px] text-amber-600 font-semibold italic bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                    💡 Por favor, agrega al menos un objetivo de la lista desplegable.
                  </p>
                ) : null
              ) : (
                objetivos.map((obj, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">
                    {obj}
                    <button
                      type="button"
                      onClick={() => setObjetivos(prev => prev.filter(o => o !== obj))}
                      className="text-blue-500 hover:text-red-500 font-bold ml-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        )

      case 'trafico':
        return (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selecciona todos los tipos de tráfico que estarán presentes (elige varios si aplica):</label>
            {[
              { id: 'none', label: 'Peatonal Ligero', desc: 'Oficinas, pasillos sin maquinaria' },
              { id: 'pedestrian_heavy', label: 'Peatonal Intenso', desc: 'Tiendas comerciales, accesos comunes' },
              { id: 'light', label: 'Tránsito Ligero', desc: 'Patines hidráulicos, carritos de mano' },
              { id: 'heavy', label: 'Tránsito Pesado', desc: 'Montacargas ligeros, autos particulares' },
              { id: 'severe', label: 'Tránsito Industrial Severo', desc: 'Montacargas pesados (ruedas rígidas de metal/nylon), camiones' }
            ].map(opt => {
              const isChecked = traficosSeleccionados.includes(opt.id)
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition select-none hover:shadow-sm ${
                    isChecked ? 'border-blue-500 bg-blue-50/20' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isChecked}
                    onChange={() => {
                      setTraficosSeleccionados(prev =>
                        prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                      )
                    }}
                  />
                  <div>
                    <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">{opt.desc}</span>
                  </div>
                </label>
              )
            })}
          </div>
        )

      case 'quimicos':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'no', icon: '🛡️', label: 'No requiere', desc: 'Solo polvo, agua y limpieza común' },
              { id: 'yes_oils', icon: '🛢️', label: 'Aceites y grasas comunes', desc: 'Talleres mecánicos, áreas de maquinado' },
              { id: 'yes_light_acids', icon: '🍋', label: 'Ácidos/Álcalis ligeros', desc: 'Procesamiento de alimentos, bebidas' },
              { id: 'yes_heavy_acids', icon: '🧪', label: 'Ácidos fuertes/Solventes', desc: 'Cuartos de reactivos, laboratorios químicos' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setQuimicos(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  quimicos === opt.id 
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
              </div>
            ))}
          </div>
        )

      case 'estado_concreto':
        return (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selecciona el estado actual del concreto:</label>
            <select
              className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
              value={estadoConcreto}
              onChange={e => {
                setEstadoConcreto(e.target.value)
                if (e.target.value !== 'other') {
                  setEstadoConcretoDetalle('')
                }
              }}
            >
              <option value="">-- Seleccionar Estado --</option>
              <option value="new">Excelente / Listo para recubrir (Nuevo o curado sin imperfecciones)</option>
              <option value="polished">Sano / Sin grietas pero pulido o liso (Requiere perfil de anclaje)</option>
              <option value="peeling">Aceptable / Desgaste leve o fisuras finas superficiales</option>
              <option value="damaged">Dañado / Con grietas activas, baches o desprendimientos</option>
              <option value="contaminated">Contaminado / Con manchas de grasa, aceite o químicos</option>
              <option value="humidity">Humedad severa / Presencia de salitre o humedad ascendente</option>
              <option value="other">Otro estado especial</option>
            </select>

            {estadoConcreto === 'other' && (
              <div className="animate-fade-in pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Especifica el estado actual *</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-gray-50/50"
                  placeholder="Ej. Concreto muy desmoronado, etc."
                  value={estadoConcretoDetalle}
                  onChange={e => setEstadoConcretoDetalle(e.target.value)}
                />
              </div>
            )}
          </div>
        )

      case 'radiacion_uv':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'yes', icon: '☀️', label: 'Sí, exposición directa constante', desc: 'Requiere recubrimiento resistente a rayos UV (Poliuretano/Bucathane)' },
              { id: 'no', icon: '⛱️', label: 'No, bajo techo o sombra parcial', desc: 'El epóxico común es viable sin amarillamiento rápido' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setRadiacionUv(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  radiacionUv === opt.id 
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
              </div>
            ))}
          </div>
        )

      case 'tipo_ruedas':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'rubber', icon: '🛞', label: 'Caucho / Neumáticas', desc: 'Montacargas comunes, vehículos de carga' },
              { id: 'polyurethane', icon: '🛞', label: 'Poliuretano rígido', desc: 'Apiladores eléctricos, patines industriales' },
              { id: 'metal_nylon', icon: '⚙️', label: 'Nylon / Metal', desc: 'Arrastre severo, alto impacto mecánico' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setTipoRuedas(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  tipoRuedas === opt.id 
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
              </div>
            ))}
          </div>
        )

      case 'frecuencia_quimica':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'occasional', icon: '💧', label: 'Derrame Ocasional', desc: 'Salpicaduras limpiadas de inmediato' },
              { id: 'daily_cleaning', icon: '🧼', label: 'Limpieza / Sanitizado diario', desc: 'Uso de agentes desinfectantes o detergentes' },
              { id: 'immersion', icon: '🏊', label: 'Inmersión o Charco continuo', desc: 'Sustancias reposando por horas o días' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setFrecuenciaQuimica(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  frecuenciaQuimica === opt.id 
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
              </div>
            ))}
          </div>
        )

      case 'area_m2':
        return (
          <div className="max-w-md mx-auto space-y-4">
            <p className="text-sm text-gray-500 text-center">Ingresa la dimensión estimada en metros cuadrados del proyecto a recubrir.</p>
            <div className="flex items-center gap-4 justify-center bg-gray-50 border border-gray-200 p-6 rounded-2xl">
              <input
                type="number"
                min={0}
                required
                className="w-36 text-center text-xl font-bold font-mono px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                value={areaM2}
                onChange={e => {
                  const val = e.target.value
                  if (val === '') {
                    setAreaM2('')
                  } else {
                    setAreaM2(Math.max(0, Number(val)))
                  }
                }}
              />
              <span className="text-lg font-bold text-gray-600">m²</span>
            </div>
            <div className="flex gap-2 justify-center">
              {[50, 100, 250, 500, 1000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAreaM2(val)}
                  className="px-3 py-1 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 transition"
                >
                  {val} m²
                </button>
              ))}
            </div>
          </div>
        )

      case 'color':
        return (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selecciona la opción de color deseada:</label>
            <select
              className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
              value={colorDeseado}
              onChange={e => {
                setColorDeseado(e.target.value)
                if (e.target.value !== 'entonacion') {
                  setColorDetalle('')
                }
              }}
            >
              <option value="">-- Seleccionar Color --</option>
              <option value="gray">Gris (Base estándar)</option>
              <option value="red">Rojo (Base estándar)</option>
              <option value="white">Blanco (Base estándar)</option>
              <option value="clear">Transparente / Neutro (Base estándar)</option>
              <option value="entonacion">Entonación (Igualación especial)</option>
            </select>

            {colorDeseado === 'entonacion' && (
              <div className="animate-fade-in pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Especifica el tono o código RAL para entonación *</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 bg-gray-50/50"
                  placeholder="Ej. RAL 5015 Azul Celeste, o Igualación especial"
                  value={colorDetalle}
                  onChange={e => setColorDetalle(e.target.value)}
                />
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // --- Validation ---
  const validarPaso = () => {
    const pasoActual = pasosActivos[paso]
    if (!pasoActual) return true
    switch (pasoActual.id) {
      case 'contacto': {
        const cleanDigits = telefono.replace(/\D/g, '')
        const isOnlyDigits = /^[0-9\s\-()+]*$/.test(telefono)
        const esTelefonoValido = !telefono.trim() || (isOnlyDigits && cleanDigits.length === 10)
        const esEmailValido = !email.trim() || (
          /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim()) &&
          !email.trim().toLowerCase().endsWith('@gmail.co') &&
          !email.trim().toLowerCase().endsWith('@hotmail.co') &&
          !email.trim().toLowerCase().endsWith('@outlook.co') &&
          !esCorreoTemporal(email)
        )

        const cLimpio = clienteNombre.trim()
        const pLimpio = proyectoNombre.trim()

        const esClienteValido = cLimpio.length >= 3 &&
          !/^\d+$/.test(cLimpio) &&
          !contienePalabrasProhibidas(cLimpio) &&
          !esKeyboardMash(cLimpio)

        const esProyectoValido = pLimpio.length >= 3 &&
          !/^\d+$/.test(pLimpio) &&
          !contienePalabrasProhibidas(pLimpio) &&
          !esKeyboardMash(pLimpio)

        return esClienteValido && esProyectoValido && esTelefonoValido && esEmailValido
      }
      case 'que_recubrir':
        return !!queRecubrir && (queRecubrir !== 'other' || !!queRecubrirDetalle.trim())
      case 'ubicacion':
        return !!ubicacion
      case 'objetivos':
        return objetivos.length > 0
      case 'trafico':
        return traficosSeleccionados.length > 0
      case 'quimicos':
        return !!quimicos
      case 'estado_concreto':
        return !!estadoConcreto && (estadoConcreto !== 'other' || !!estadoConcretoDetalle.trim())
      case 'radiacion_uv':
        return !!radiacionUv
      case 'tipo_ruedas':
        return !!tipoRuedas
      case 'frecuencia_quimica':
        return !!frecuenciaQuimica
      case 'area_m2':
        return typeof areaM2 === 'number' && areaM2 > 0
      case 'color':
        return !!colorDeseado && (colorDeseado !== 'entonacion' || !!colorDetalle.trim())
      default:
        return true
    }
  }

  const obtenerMensajeValidacion = (): string => {
    const pasoActual = pasosActivos[paso]
    if (!pasoActual) return ''
    switch (pasoActual.id) {
      case 'contacto':
        if (mostrarErroresContacto) {
          const cLimpio = clienteNombre.trim()
          if (!cLimpio) {
            return 'El nombre del cliente/empresa es obligatorio.'
          }
          if (cLimpio.length < 3) {
            return 'El nombre del cliente debe tener al menos 3 caracteres.'
          }
          if (/^\d+$/.test(cLimpio)) {
            return 'El nombre del cliente no puede consistir únicamente de números.'
          }
          if (contienePalabrasProhibidas(cLimpio)) {
            return 'El nombre del cliente contiene palabras no permitidas o de prueba.'
          }
          if (esKeyboardMash(cLimpio)) {
            return 'El nombre del cliente parece ser inválido o aleatorio.'
          }

          const pLimpio = proyectoNombre.trim()
          if (!pLimpio) {
            return 'El nombre del proyecto es obligatorio.'
          }
          if (pLimpio.length < 3) {
            return 'El nombre del proyecto debe tener al menos 3 caracteres.'
          }
          if (/^\d+$/.test(pLimpio)) {
            return 'El nombre del proyecto no puede consistir únicamente de números.'
          }
          if (contienePalabrasProhibidas(pLimpio)) {
            return 'El nombre del proyecto contiene palabras no permitidas o de prueba.'
          }
          if (esKeyboardMash(pLimpio)) {
            return 'El nombre del proyecto parece ser ficticio o aleatorio.'
          }

          if (telefono.trim()) {
            const cleanDigits = telefono.replace(/\D/g, '')
            const isOnlyDigits = /^[0-9\s\-()+]*$/.test(telefono)
            if (!isOnlyDigits || cleanDigits.length !== 10 || telefonoError) {
              return 'El teléfono debe tener exactamente 10 dígitos numéricos.'
            }
          }
          if (email.trim()) {
            const isValidRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim())
            const isTypo = email.trim().toLowerCase().endsWith('@gmail.co') || email.trim().toLowerCase().endsWith('@hotmail.co') || email.trim().toLowerCase().endsWith('@outlook.co')
            if (!isValidRegex || isTypo || emailError) {
              if (isTypo) {
                return `¿Quisiste decir ${email.trim().split('@')[0]}@${email.trim().split('@')[1]}m?`
              }
              return 'El correo electrónico no es válido (por ejemplo: .com).'
            }
            if (esCorreoTemporal(email)) {
              return 'No se permiten correos de proveedores temporales o sospechosos de spam.'
            }
          }
        }
        return ''
      case 'que_recubrir':
        if (!queRecubrir) {
          return 'Selecciona la superficie que deseas recubrir.'
        }
        if (queRecubrir === 'other' && !queRecubrirDetalle.trim()) {
          return 'Por favor especifica la superficie.'
        }
        return ''
      case 'ubicacion':
        if (!ubicacion) {
          return 'Selecciona la ubicación física del proyecto.'
        }
        return ''
      case 'objetivos':
        if (objetivos.length === 0) {
          return 'Agrega al menos un objetivo de la lista.'
        }
        return ''
      case 'trafico':
        if (traficosSeleccionados.length === 0) {
          return 'Selecciona al menos una opción de tráfico.'
        }
        return ''
      case 'quimicos':
        if (!quimicos) {
          return 'Selecciona el contacto con químicos.'
        }
        return ''
      case 'estado_concreto':
        if (!estadoConcreto) {
          return 'Selecciona el estado actual del concreto.'
        }
        if (estadoConcreto === 'other' && !estadoConcretoDetalle.trim()) {
          return 'Por favor especifica el estado del concreto.'
        }
        return ''
      case 'radiacion_uv':
        if (!radiacionUv) {
          return 'Selecciona la exposición solar.'
        }
        return ''
      case 'tipo_ruedas':
        if (!tipoRuedas) {
          return 'Selecciona el tipo de ruedas.'
        }
        return ''
      case 'frecuencia_quimica':
        if (!frecuenciaQuimica) {
          return 'Selecciona la frecuencia de exposición química.'
        }
        return ''
      case 'area_m2':
        if (areaM2 === '' || areaM2 <= 0) {
          return 'La dimensión de la obra debe ser mayor a 0 m².'
        }
        return ''
      case 'color':
        if (!colorDeseado) {
          return 'Selecciona la opción de color deseada.'
        }
        if (colorDeseado === 'entonacion' && !colorDetalle.trim()) {
          return 'Por favor especifica el tono o código RAL para entonación.'
        }
        return ''
      default:
        return ''
    }
  }

  // --- RESULT VIEW ---
  if (paso === totalPasos) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
        <header className="buca-header shadow-md">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="buca-logo-mark"><span>B</span></div>
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">BUCA Recubrimientos</h1>
                <p className="text-blue-200 text-xs">Diagnóstico Técnico Completado</p>
              </div>
            </div>
            <Link to="/" className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition">
              Ir al Cotizador
            </Link>
          </div>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-150 p-6 md:p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-3xl mx-auto">
              ✓
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">¡Diagnóstico Completado Exitosamente!</h2>
              <p className="text-sm text-gray-500">Hemos evaluado las condiciones de tu proyecto para formular la mejor recomendación técnica.</p>
            </div>

            {/* Tracking Code Badge */}
            <div className="bg-blue-50 border border-blue-150 rounded-2xl p-4 max-w-sm mx-auto">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">Código de Seguimiento del Cliente</span>
              <strong className="text-2xl font-mono text-blue-700 tracking-wider block mt-1">{codigoGenerado}</strong>
              <p className="text-[10px] text-blue-600 mt-2">Comparte este código con tu asesor comercial de BUCA para cargar tu cotización al instante.</p>
            </div>

            {/* Recommendation block */}
            <div className="border-t border-gray-150 pt-6 text-left space-y-6">
              <h3 className="text-base font-bold text-gray-800">🛠️ Sistemas y Productos Recomendados:</h3>
              
              {recSistemas.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-purple-600 uppercase tracking-wider">Sistemas Multicapa Recomendados:</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {recSistemas.map(sys => (
                      <div key={sys.id} className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h5 className="font-bold text-sm text-purple-900">{sys.nombre}</h5>
                          <p className="text-xs text-gray-600 mt-1">{sys.descripcion || 'Estructura multicapa de alta resistencia diseñada para las condiciones especificadas.'}</p>
                        </div>
                        <div className="shrink-0 flex gap-2">
                          <Link
                            to={`/?sistemaId=${sys.id}&cliente=${encodeURIComponent(clienteNombre)}&proyecto=${encodeURIComponent(proyectoNombre)}`}
                            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
                          >
                            Cotizar Sistema
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recProductos.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Productos Individuales Recomendados:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recProductos.map(p => (
                      <div key={p.id} className="p-4 bg-blue-50/40 border border-blue-100 rounded-2xl flex flex-col justify-between h-full">
                        <div>
                          <h5 className="font-bold text-sm text-blue-900">{p.nombre}</h5>
                          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{p.nota}</p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-gray-600 font-mono">${p.precio} {p.moneda}</span>
                          <Link
                            to={`/?productoNombre=${encodeURIComponent(p.nombre)}&cliente=${encodeURIComponent(clienteNombre)}&proyecto=${encodeURIComponent(proyectoNombre)}`}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition"
                          >
                            Cotizar
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/"
                className="px-5 py-3 border border-gray-250 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl transition shadow-sm text-center"
              >
                ← Volver al Cotizador Principal
              </Link>
              <button
                type="button"
                onClick={() => {
                  setPaso(0)
                  setClienteNombre('')
                  setProyectoNombre('')
                  setTelefono('')
                  setEmail('')
                  setClienteNombreError('')
                  setProyectoNombreError('')
                  setQueRecubrir('')
                  setQueRecubrirDetalle('')
                  setUbicacion('')
                  setObjetivos([])
                  setObjetivoOtro('')
                  setMostrarInputObjetivoOtro(false)
                  setTraficosSeleccionados([])
                  setQuimicos('')
                  setEstadoConcreto('')
                  setEstadoConcretoDetalle('')
                  setRadiacionUv('')
                  setTipoRuedas('')
                  setFrecuenciaQuimica('')
                  setAreaM2('')
                  setColorDeseado('')
                  setColorDetalle('')
                  setRecProductos([])
                  setRecSistemas([])
                  setCodigoGenerado('')
                  setMostrarErroresContacto(false)
                }}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-sm text-center"
              >
                Realizar Nuevo Diagnóstico
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // --- WIZARD FORM VIEW ---
  const pasoActual = pasosActivos[paso]
  const porcentajeProgreso = Math.round((paso / totalPasos) * 100)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="buca-header shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="buca-logo-mark"><span>B</span></div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">BUCA Recubrimientos</h1>
              <p className="text-blue-200 text-xs">Formulario de Scoping y Necesidades</p>
            </div>
          </div>
          <Link to="/" className="px-3 py-2 border border-blue-400/30 text-white hover:bg-white/10 text-xs font-semibold rounded-xl transition shadow-sm">
            ← Volver al Cotizador
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex items-center justify-center">
        {loadingCatalog ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-blue-600 font-semibold animate-pulse text-sm">Cargando base de datos técnica...</p>
          </div>
        ) : (
          <div className="bg-white w-full rounded-3xl border border-gray-150 p-6 md:p-8 shadow-2xl flex flex-col space-y-6">
            
            {/* Progress indicator */}
            <div className="space-y-2 shrink-0">
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <span>Paso {paso + 1} de {totalPasos}</span>
                <span>{porcentajeProgreso}% Completado</span>
              </div>
              <div className="w-full h-1.5 bg-gray-150 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 rounded-full" 
                  style={{ width: `${porcentajeProgreso}%` }} 
                />
              </div>
            </div>

            {/* Error Message if submit fails */}
            {errorEnvio && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-semibold">
                ⚠️ {errorEnvio}
              </div>
            )}

            {/* Question title */}
            <div className="space-y-1.5 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-blue-500">✦</span>
                {pasoActual.titulo}
              </h2>
            </div>

            {/* Question UI body */}
            <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[420px] py-1">
              {renderContenidoPaso()}
            </div>

            {/* Validation warning */}
            {((intentoAvanzar || (pasoActual.id === 'contacto' && mostrarErroresContacto)) && obtenerMensajeValidacion()) ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in shrink-0">
                <span>⚠️</span>
                <span>{obtenerMensajeValidacion()}</span>
              </div>
            ) : null}

            {/* Navigation buttons */}
            <div className="pt-4 border-t border-gray-150 flex justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleAtras}
                disabled={paso === 0 || guardando}
                className="px-5 py-3 border border-gray-255 hover:bg-gray-50 text-gray-600 font-semibold text-xs rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
              >
                Atrás
              </button>

              <button
                type="button"
                onClick={handleSiguiente}
                disabled={guardando}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none transform active:scale-95"
              >
                {guardando ? 'Guardando...' : (paso === totalPasos - 1 ? 'Finalizar y Ver Recomendación' : 'Siguiente')}
              </button>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
