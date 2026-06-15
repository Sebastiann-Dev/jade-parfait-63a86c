import React, { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import {
  fetchProductosSupabase,
  fetchSistemasSupabase,
  fetchSistemaProductosSupabase,
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

  // Scoping Answers
  const [queRecubrir, setQueRecubrir] = useState<string>('')
  const [ubicacion, setUbicacion] = useState<string>('')
  const [objetivos, setObjetivos] = useState<string[]>([])
  const [trafico, setTrafico] = useState<string>('')
  const [quimicos, setQuimicos] = useState<string>('')
  const [areaM2, setAreaM2] = useState<number>(100)
  const [colorDeseado, setColorDeseado] = useState<string>('')
  const [colorDetalle, setColorDetalle] = useState<string>('')

  // Conditional Scoping Answers
  const [estadoConcreto, setEstadoConcreto] = useState<string>('')
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
    if (trafico === 'heavy' || trafico === 'severe') {
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
    if (paso < totalPasos - 1) {
      setPaso(paso + 1)
    } else {
      enviarDiagnostico()
    }
  }

  const handleAtras = () => {
    if (paso > 0) {
      setPaso(paso - 1)
    }
  }

  const toggleObjetivo = (obj: string) => {
    setObjetivos(prev =>
      prev.includes(obj) ? prev.filter(o => o !== obj) : [...prev, obj]
    )
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
    const esTraficoIntenso = trafico === 'heavy' || trafico === 'severe'
    const esHigiene = objetivos.includes('hygiene')
    const necesitaNivelar = estadoConcreto === 'damaged' || objetivos.includes('repair')

    // 2. Map requirements to product/system search terms
    if (esPiso) {
      if (esQuimicoIntenso || esTraficoIntenso) {
        // Recommend heavy-duty systems (polyurethane mortar / Bucacrete / Novolac)
        tagsBuscados.push('BucaCrete', 'Crete', 'Novolaca')
      } else if (esExterior) {
        // Outdoor traffic / UV
        tagsBuscados.push('BucaTrafic', 'Bucathane')
      } else if (necesitaNivelar) {
        // Self leveling or concrete repairs
        tagsBuscados.push('Autonivelante', 'Tapaporo')
      } else {
        // General indoor floors
        tagsBuscados.push('BucaPoxyMulti', 'PoxyPlus')
      }
    } else if (esMetal) {
      // Metal primer & topcoats
      tagsBuscados.push('Base Primer', 'Bucathane')
    } else if (esTanque) {
      // Tank linings (solvent-free epoxies)
      tagsBuscados.push('BucaPoxyPlus', 'Epoxico')
    } else {
      // Default
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
      // Exclude Parte B standalone products if possible to recommend the system / kit
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

    // 5. Fallback if no matching systems/products found
    if (recomendadosSys.length === 0 && sistemas.length > 0) {
      // Add first system
      recomendadosSys.push(sistemas[0])
    }
    if (recomendadosProds.length === 0 && productos.length > 0) {
      // Add BucaPoxyMulti & Bucathane as defaults
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

    const respuestas = {
      que_recubrir: queRecubrir,
      ubicacion,
      objetivos,
      trafico,
      quimicos,
      area_m2: areaM2,
      color_deseado: colorDeseado,
      color_detalle: colorDetalle,
      // Condicionales
      estado_concreto: queRecubrir === 'concrete_floor' ? estadoConcreto : undefined,
      radiacion_uv: (ubicacion === 'exterior' || ubicacion === 'both') ? radiacionUv : undefined,
      tipo_ruedas: (trafico === 'heavy' || trafico === 'severe') ? tipoRuedas : undefined,
      frecuencia_quimica: (quimicos && quimicos !== 'no') ? frecuenciaQuimica : undefined
    }

    const recomendaciones = [
      ...systems.map(s => ({ type: 'sistema', id: s.id, nombre: s.nombre })),
      ...products.map(p => ({ type: 'producto', id: p.id, nombre: p.nombre }))
    ]

    try {
      const insertedId = await saveProspectoSupabase({
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
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50/50"
                  placeholder="Ej. Distribuidora Monterrey S.A."
                  value={clienteNombre}
                  onChange={e => setClienteNombre(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre del Proyecto *</label>
                <input
                  type="text"
                  required
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50/50"
                  placeholder="Ej. Nave Industrial Apodaca"
                  value={proyectoNombre}
                  onChange={e => setProyectoNombre(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Teléfono de Contacto</label>
                <input
                  type="tel"
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50/50"
                  placeholder="Ej. 8112345678"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Correo Electrónico</label>
                <input
                  type="email"
                  className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50/50"
                  placeholder="Ej. contacto@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
        )

      case 'que_recubrir':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: 'concrete_floor', icon: '🧱', label: 'Piso de Concreto', desc: 'Naves industriales, almacenes, talleres' },
              { id: 'wall', icon: '🧱', label: 'Muro / Pared', desc: 'Áreas comerciales, laboratorios, cocinas' },
              { id: 'metal_structure', icon: '🏗️', label: 'Estructura Metálica', desc: 'Vigas, techos, herrería industrial' },
              { id: 'tank', icon: '🛢️', label: 'Tanque / Cisterna', desc: 'Almacenamiento de agua o reactivos' },
              { id: 'other', icon: '🎨', label: 'Otro', desc: 'Otras aplicaciones especiales' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setQueRecubrir(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  queRecubrir === opt.id 
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: 'aesthetic', icon: '✨', label: 'Estética y Color', desc: 'Acabado brillante, limpio, uniforme' },
              { id: 'traffic', icon: '🚚', label: 'Resistencia al Tráfico', desc: 'Soportar montacargas y vehículos' },
              { id: 'chemicals', icon: '🧪', label: 'Resistencia Química', desc: 'Derrame de ácidos, aceites, solventes' },
              { id: 'waterproofing', icon: '💧', label: 'Impermeabilización', desc: 'Evitar filtraciones y humedad' },
              { id: 'repair', icon: '🔧', label: 'Nivelación / Reparación', desc: 'Corregir grietas, baches y desniveles' },
              { id: 'hygiene', icon: '🧼', label: 'Higiene / Grado Alimenticio', desc: 'Antibacteriano, fácil de lavar' }
            ].map(opt => {
              const selected = objetivos.includes(opt.id)
              return (
                <div
                  key={opt.id}
                  onClick={() => toggleObjetivo(opt.id)}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                    selected 
                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="text-2xl block mb-2">{opt.icon}</span>
                  <span className="font-bold text-xs text-gray-800 block">{opt.label}</span>
                  <span className="text-[10px] text-gray-400 mt-1 block leading-tight">{opt.desc}</span>
                </div>
              )
            })}
          </div>
        )

      case 'trafico':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { id: 'none', icon: '🚶', label: 'Peatonal Ligero', desc: 'Oficinas, pasillos sin maquinaria' },
              { id: 'pedestrian_heavy', icon: '🚶‍♂️🚶‍♀️', label: 'Peatonal Intenso', desc: 'Tiendas comerciales, accesos comunes' },
              { id: 'light', icon: '🛒', label: 'Tránsito Ligero', desc: 'Patines hidráulicos, carritos de mano' },
              { id: 'heavy', icon: '🚜', label: 'Tránsito Pesado', desc: 'Montacargas ligeros, autos particulares' },
              { id: 'severe', icon: '🚛', label: 'Tránsito Industrial Severo', desc: 'Montacargas pesados (ruedas duras), camiones' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setTrafico(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  trafico === opt.id 
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'new', icon: '🆕', label: 'Nuevo sin pulir / Rugoso', desc: 'Liso pero absorbente, menos de 1 año' },
              { id: 'polished', icon: '💎', label: 'Pulido / Fino', desc: 'Espejo o muy liso, requiere perfilado mecánico' },
              { id: 'damaged', icon: '🏚️', label: 'Dañado / Fisurado', desc: 'Tiene baches, grietas y requiere resanador' },
              { id: 'contaminated', icon: '🧴', label: 'Contaminado con aceite o grasa', desc: 'Ha tenido derrames profundos' }
            ].map(opt => (
              <div
                key={opt.id}
                onClick={() => setEstadoConcreto(opt.id)}
                className={`p-4 border rounded-2xl cursor-pointer transition-all duration-200 select-none hover:shadow-md ${
                  estadoConcreto === opt.id 
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
                min={1}
                required
                className="w-36 text-center text-xl font-bold font-mono px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                value={areaM2}
                onChange={e => setAreaM2(Math.max(1, Number(e.target.value)))}
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
            <p className="text-sm text-gray-500 mb-2">Selecciona el tono aproximado que se requiere para el acabado del recubrimiento.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {[
                { id: 'gray', colorBg: 'bg-gray-400', label: 'Gris Industrial' },
                { id: 'red', colorBg: 'bg-red-700', label: 'Rojo Óxido' },
                { id: 'white', colorBg: 'bg-gray-100 border border-gray-200', label: 'Blanco Sanitario' },
                { id: 'clear', colorBg: 'bg-sky-50 border border-dashed border-sky-300', label: 'Transparente / Neutro' },
                { id: 'custom', colorBg: 'bg-gradient-to-tr from-yellow-400 via-green-500 to-indigo-500', label: 'Custom / RAL' }
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setColorDeseado(opt.id)}
                  className={`p-3 border rounded-2xl cursor-pointer transition-all duration-200 select-none text-center hover:shadow-md flex flex-col items-center justify-between h-28 ${
                    colorDeseado === opt.id 
                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 font-bold' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full ${opt.colorBg} shadow-inner mt-1`} />
                  <span className="text-[11px] text-gray-700 font-semibold mb-1 block leading-tight">{opt.label}</span>
                </div>
              ))}
            </div>

            {colorDeseado === 'custom' && (
              <div className="animate-fade-in pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Especifica el tono o código RAL:</label>
                <input
                  type="text"
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
    switch (pasoActual.id) {
      case 'contacto':
        return !!clienteNombre.trim() && !!proyectoNombre.trim()
      case 'que_recubrir':
        return !!queRecubrir
      case 'ubicacion':
        return !!ubicacion
      case 'objetivos':
        return objetivos.length > 0
      case 'trafico':
        return !!trafico
      case 'quimicos':
        return !!quimicos
      case 'estado_concreto':
        return !!estadoConcreto
      case 'radiacion_uv':
        return !!radiacionUv
      case 'tipo_ruedas':
        return !!tipoRuedas
      case 'frecuencia_quimica':
        return !!frecuenciaQuimica
      case 'area_m2':
        return areaM2 > 0
      case 'color':
        return !!colorDeseado && (colorDeseado !== 'custom' || !!colorDetalle.trim())
      default:
        return true
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
                  setQueRecubrir('')
                  setUbicacion('')
                  setObjetivos([])
                  setTrafico('')
                  setQuimicos('')
                  setEstadoConcreto('')
                  setRadiacionUv('')
                  setTipoRuedas('')
                  setFrecuenciaQuimica('')
                  setRecProductos([])
                  setRecSistemas([])
                  setCodigoGenerado('')
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

            {/* Navigation buttons */}
            <div className="pt-4 border-t border-gray-150 flex justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleAtras}
                disabled={paso === 0 || guardando}
                className="px-5 py-3 border border-gray-250 hover:bg-gray-50 text-gray-600 font-semibold text-xs rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none"
              >
                Atrás
              </button>

              <button
                type="button"
                onClick={handleSiguiente}
                disabled={!validarPaso() || guardando}
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
