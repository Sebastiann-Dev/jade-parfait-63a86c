import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { PRODUCTOS, type Producto } from '../data/productos'
import { fetchProductosSupabase, fetchSistemasSupabase, fetchSistemaProductosSupabase, type Sistema } from '../supabase'
import { DiagramaCapas } from './DiagramaCapas'
import { ChatAsistente } from './ChatAsistente'
import { ResumenCotizacion, type LineaProducto } from './ResumenCotizacion'
import { formatMXN, formatNum, getMermaFactor, type EstadoPiso } from '../utils/format'

function calcularLinea(
  producto: Producto,
  metros: number,
  cantidadManual: number,
  esMinorista: boolean,
  tipoCambio: number,
  descuentoPorcentaje: number,
  presentacionSeleccionada?: any,
  estadoPiso: EstadoPiso = 'ninguno'
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
    cantidad = cantidad * getMermaFactor(estadoPiso)
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

// formatMXN y formatNum importados desde '../utils/format'

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

  const [estadoPiso, setEstadoPiso] = useState<EstadoPiso>('ninguno')
  const [espesorMm, setEspesorMm] = useState<string>('')

  // Systems state variables
  const [sistemasDisponibles, setSistemasDisponibles] = useState<Sistema[]>([])
  const [cotizarTipo, setCotizarTipo] = useState<'producto' | 'sistema'>('producto')
  const [sistemaSeleccionado, setSistemaSeleccionado] = useState<Sistema | null>(null)
  const [sistemaMetros, setSistemaMetros] = useState<string>('')
  const [sistemaRels, setSistemaRels] = useState<{ id: string; producto: Producto; consumo_por_m2: number; orden: number }[]>([])
  const [loadingSistemaRels, setLoadingSistemaRels] = useState(false)

  // Systems visualization layer state
  const [capaActivaIndex, setCapaActivaIndex] = useState<number | null>(null)
  const [desgloseTab, setDesgloseTab] = useState<'consumos' | 'capas'>('consumos')

  // Group adjacent Part A and Part B products of the same material into a single visual layer
  const groupedCapas = useMemo(() => {
    const sortedRels = [...sistemaRels].sort((a, b) => a.orden - b.orden);
    const result: any[] = [];
    
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

  function agregarProducto() {
    if (!preview) return
    if (productoSeleccionadoConRendimientoDinamico.tieneRendimiento && metrosNum <= 0) return

    const linea: LineaProducto = {
      id: crypto.randomUUID(),
      producto: productoSeleccionadoConRendimientoDinamico,
      metros: metrosNum,
      cantidad: preview.cantidad,
      precioUnitario: preview.precioUnitario,
      totalMXN: preview.totalMXN,
      esMinorista,
      presentacion: presentacionSeleccionada
    }
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
        cantidad = cantidad * getMermaFactor(estadoPiso)
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
              🧪 Catalog
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
                        <DiagramaCapas
                          groupedCapas={groupedCapas}
                          capaActivaIndex={capaActivaIndex}
                          onToggleLayer={(orden) => setCapaActivaIndex(capaActivaIndex === orden ? null : orden)}
                          metros={parseFloat(sistemaMetros) || 0}
                          estadoPiso={estadoPiso}
                        />
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

        {/* Resumen de Cotización (Tabla de partidas, totales, y exportación a PDF) */}
        <ResumenCotizacion
          lineas={lineas}
          setLineas={setLineas}
          clienteNombre={clienteNombre}
          proyectoNombre={proyectoNombre}
          notasProyecto={notasProyecto}
          fechaHoy={fechaHoy}
          tipoCambio={tipoCambio}
          esMinorista={esMinorista}
          descuentoPorcentaje={descuentoPorcentaje}
          estadoPiso={estadoPiso}
          eliminarLinea={eliminarLinea}
          editarLinea={editarLinea}
        />

        {/* Footer legend */}
        <footer className="mt-8 py-6 border-t border-gray-200 text-center text-xs text-gray-500 space-y-1 print:hidden">
          <p className="font-semibold text-gray-700">⚠️ Nota Importante sobre el Tipo de Cambio:</p>
          <p>El valor del dólar es el aproximado y el único oficial es el del Diario Oficial de la Federación (DOF).</p>
          <p className="text-amber-600 font-semibold">Se sugiere confirmar de manera manual antes de pasarlo así.</p>
        </footer>
      </main>

      {/* Floating Chat Assistant Component */}
      <ChatAsistente
        productosDisponibles={productosDisponibles}
        productoSeleccionado={productoSeleccionado}
        sistemaSeleccionado={sistemaSeleccionado}
        sistemaRels={sistemaRels}
        sistemasDisponibles={sistemasDisponibles}
        cotizarTipo={cotizarTipo}
      />
    </div>
  )
}
