import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { PRODUCTOS, type Producto } from '../data/productos'
import { fetchProductosSupabase, fetchSistemasSupabase, fetchSistemaProductosSupabase, type Sistema } from '../supabase'
import { generarPDF } from '../utils/generarPDF'

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

  let cantidad: number
  if (producto.tieneRendimiento && producto.rendimiento) {
    cantidad = metros / producto.rendimiento
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

export default function Cotizador() {
  const [productosDisponibles, setProductosDisponibles] = useState<Producto[]>(PRODUCTOS)
  const [tipoCambio, setTipoCambio] = useState(17.5)
  const [dofFecha, setDofFecha] = useState('')
  const [dofCargando, setDofCargando] = useState(true)
  const [esMinorista, setEsMinorista] = useState(true)
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(5)
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto>(PRODUCTOS[0])
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

  const metrosNum = parseFloat(metros) || 0
  const cantidadManualNum = parseFloat(cantidadManual) || 1

  const productoSeleccionadoConRendimientoDinamico = useMemo(() => {
    const densidadNum = parseFloat(productoSeleccionado.densidadRecomendada || '0')
    const espesorNum = parseFloat(espesorMm || '0')

    let p = { ...productoSeleccionado }
    if (productoSeleccionado.tieneRendimiento && densidadNum > 0 && espesorNum > 0) {
      p.rendimiento = productoSeleccionado.cantRef / (espesorNum * densidadNum)
    }
    return p
  }, [productoSeleccionado, espesorMm])

  useEffect(() => {
    async function loadDatabase() {
      const dbProducts = await fetchProductosSupabase()
      if (dbProducts && dbProducts.length > 0) {
        setProductosDisponibles(dbProducts)
        const first = dbProducts[0]
        setProductoSeleccionado(first)
        if (first.kitInfo && (first.kitInfo.startsWith('[') || first.kitInfo.startsWith('{'))) {
          try {
            let list: any[] = []
            if (first.kitInfo.startsWith('{')) {
              list = JSON.parse(first.kitInfo).presentaciones || []
            } else {
              list = JSON.parse(first.kitInfo) || []
            }
            if (list && list.length > 0) {
              setPresentacionSeleccionada(list[0])
            }
          } catch (e) {}
        }
      }
      const dbSistemas = await fetchSistemasSupabase()
      setSistemasDisponibles(dbSistemas)
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
    if (!busqueda) return productosDisponibles
    const q = busqueda.toLowerCase()
    return productosDisponibles.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.nota.toLowerCase().includes(q)
    )
  }, [busqueda, productosDisponibles])

  const preview = useMemo(() => {
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
      const dens = parseFloat(linea.producto.densidadRecomendada || '0')
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
              <Link to="/admin" className="ml-4 px-3 py-1.5 bg-blue-800 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition">
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
        <div className="buca-card print:hidden">
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
                    <span className="truncate text-gray-800 font-medium">{productoSeleccionado.nombre}</span>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {productoSeleccionado.nota && (
                    <p className="text-xs text-gray-400 mt-1">{productoSeleccionado.nota}</p>
                  )}
                  {(productoSeleccionado.ficha_tecnica_url || productoSeleccionado.ficha_seguridad_url) && (
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
                      <div className="p-2 border-b">
                        <input
                          autoFocus
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                          placeholder="Buscar producto..."
                          value={busqueda}
                          onChange={e => setBusqueda(e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <ul className="max-h-64 overflow-y-auto">
                        {productosFiltrados.map(p => (
                          <li
                            key={p.nombre}
                            className={`px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${
                              p.nombre === productoSeleccionado.nombre ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
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

                {/* Input m² o cantidad */}
                <div>
                  {productoSeleccionadoConRendimientoDinamico.tieneRendimiento ? (
                    <>
                      <label className="buca-label">Metros cuadrados (m²)</label>
                      <div className="relative">
                        <input
                          type="number"
                          className="buca-input pr-12"
                          placeholder="0"
                          min="0"
                          value={metros}
                          onChange={e => setMetros(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">m²</span>
                      </div>

                      {/* Espesor requerido para morteros/productos con densidad */}
                      {productoSeleccionadoConRendimientoDinamico.densidadRecomendada && (
                        <div className="mt-3">
                          <label className="buca-label" style={{color: '#1d4ed8', fontWeight: 700}}>Espesor requerido (mm)</label>
                          <div className="relative">
                            <input
                              type="number"
                              className="buca-input pr-12"
                              placeholder="Ej. 6"
                              min="0.1"
                              step="0.5"
                              value={espesorMm}
                              onChange={e => setEspesorMm(e.target.value)}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">mm</span>
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
                          className="buca-input pr-16"
                          placeholder={String(productoSeleccionadoConRendimientoDinamico.cantRef)}
                          min="0"
                          step="0.5"
                          value={cantidadManual}
                          onChange={e => setCantidadManual(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{productoSeleccionadoConRendimientoDinamico.unidad}</span>
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
              </div>

              {/* Preview resultado */}
              {preview && (
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

              <div className="mt-4 flex justify-end">
                <button
                  onClick={agregarProducto}
                  disabled={!preview || (productoSeleccionado.tieneRendimiento && metrosNum <= 0)}
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
                      className="buca-input pr-12"
                      placeholder="0"
                      min="0"
                      value={sistemaMetros}
                      onChange={e => setSistemaMetros(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">m²</span>
                  </div>
                </div>
              </div>

              {/* Vista previa de componentes del sistema */}
              {sistemaSeleccionado && (
                <div className="mt-4 bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-3">
                    Desglose de Componentes del Sistema ({sistemaMetros ? `${sistemaMetros} m²` : '0 m²'})
                  </h3>
                  {loadingSistemaRels ? (
                    <p className="text-xs text-purple-600 animate-pulse">Cargando componentes...</p>
                  ) : sistemaRels.length === 0 ? (
                    <p className="text-xs text-purple-600 italic">Este sistema no tiene componentes registrados en la base de datos.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {sistemaRels.map(rel => {
                        const quantity = (parseFloat(sistemaMetros) || 0) * rel.consumo_por_m2
                        const isAccesorio = rel.producto.unidad.toLowerCase().includes('pza') || rel.producto.unidad.toLowerCase().includes('pieza')
                        const finalQty = isAccesorio ? quantity : quantity * (estadoPiso === 'liso' ? 1.05 : estadoPiso === 'rugoso' ? 1.15 : estadoPiso === 'estandar' ? 1.10 : 1)
                        return (
                          <div key={rel.id} className="flex justify-between items-center text-xs text-purple-900 border-b border-purple-100 pb-1.5 last:border-0 last:pb-0">
                            <div>
                              <span className="font-semibold text-purple-950">{rel.producto.nombre}</span>
                              <span className="text-purple-600"> (Consumo: {rel.consumo_por_m2} {rel.producto.unidad}/m² · Capa {rel.orden})</span>
                            </div>
                            <span className="font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full">
                              {finalQty.toFixed(2)} {rel.producto.unidad}
                            </span>
                          </div>
                        )
                      })}
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
                            {formatNum(l.metros)} m² (Rendimiento: {l.producto.rendimiento} m²/{l.producto.unidad}
                            {l.producto.densidadRecomendada ? ` · Densidad recomendada: ${l.producto.densidadRecomendada}` : ''})
                          </div>
                        )}
                        {!l.producto.tieneRendimiento && l.producto.densidadRecomendada && (
                          <div className="text-xs text-blue-400 mt-0.5">
                            Densidad recomendada: {l.producto.densidadRecomendada}
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
                        {l.producto.densidadRecomendada || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-700 font-medium tabular-nums">
                        {formatNum(l.cantidad)} {l.producto.unidad}
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
    </div>
  )
}
