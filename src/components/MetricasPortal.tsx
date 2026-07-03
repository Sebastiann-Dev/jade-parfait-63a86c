import React, { useState, useEffect, useMemo } from 'react'
import {
  fetchCotizacionesSupabase,
  fetchProspectosSupabase,
  supabase,
  type CotizacionCompleta
} from '../supabase'
import { callGeminiServer } from '../utils/geminiServer'
import { formatMXN, formatNum } from '../utils/format'
import { obtenerNombreVendedor } from './Cotizador'

interface FilaProductoMetrica {
  nombre: string
  frecuencia: number
  cantidadTotal: number
  unidad: string
  montoTotalMXN: number
}

interface FilaVendedorMetrica {
  email: string
  nombre: string
  totalCotizaciones: number
  montoCotizadoMXN: number
  totalCerrado: number
  montoCerradoMXN: number
  winRate: number
}

export const MetricasPortal: React.FC = () => {
  const [cotizaciones, setCotizaciones] = useState<CotizacionCompleta[]>([])
  const [itemsHistoricos, setItemsHistoricos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // AI Report states
  const [generandoReporte, setGenerandoReporte] = useState(false)
  const [reporteIA, setReporteIA] = useState<string | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setErrorMsg('')

      // 1. Fetch quotes
      const quotes = await fetchCotizacionesSupabase()
      setCotizaciones(quotes)

      // 2. Fetch all quote items from Supabase directly in a single query
      const { data: items, error: itemsError } = await supabase
        .from('items_cotizacion_historica')
        .select('*')

      if (itemsError) throw itemsError
      setItemsHistoricos(items || [])
    } catch (err: any) {
      console.error("Error loading metrics data:", err)
      setErrorMsg(err.message || "No se pudo conectar a la base de datos.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // --- KPI CALCULATIONS ---
  const kpis = useMemo(() => {
    const totalCount = cotizaciones.length
    if (totalCount === 0) {
      return {
        totalCotizado: 0,
        totalCerrado: 0,
        winRateMonto: 0,
        winRateCantidad: 0,
        ticketPromedio: 0,
        areaTotal: 0
      }
    }

    let totalCotizado = 0
    let totalCerrado = 0
    let cerradoCount = 0
    let areaTotal = 0

    cotizaciones.forEach(c => {
      totalCotizado += c.monto_total || 0
      areaTotal += c.area_total_m2 || 0
      if (c.estado_cotizacion === 'Cerrado' || c.estado_cotizacion === 'Aceptada') {
        totalCerrado += c.monto_total || 0
        cerradoCount++
      }
    })

    return {
      totalCotizado,
      totalCerrado,
      winRateMonto: totalCotizado > 0 ? (totalCerrado / totalCotizado) * 100 : 0,
      winRateCantidad: (cerradoCount / totalCount) * 100,
      ticketPromedio: totalCotizado / totalCount,
      areaTotal
    }
  }, [cotizaciones])

  // --- VENDORS PERFORMANCE ---
  const metricasVendedores = useMemo((): FilaVendedorMetrica[] => {
    const map = new Map<string, FilaVendedorMetrica>()

    cotizaciones.forEach(c => {
      const email = c.vendedor_email || 'sin_asignar@bucamx.com'
      const isCerrado = c.estado_cotizacion === 'Cerrado' || c.estado_cotizacion === 'Aceptada'
      const monto = c.monto_total || 0

      if (!map.has(email)) {
        map.set(email, {
          email,
          nombre: email === 'sin_asignar@bucamx.com' ? 'Sin Asignar / Web' : obtenerNombreVendedor(email),
          totalCotizaciones: 0,
          montoCotizadoMXN: 0,
          totalCerrado: 0,
          montoCerradoMXN: 0,
          winRate: 0
        })
      }

      const m = map.get(email)!
      m.totalCotizaciones++
      m.montoCotizadoMXN += monto
      if (isCerrado) {
        m.totalCerrado++
        m.montoCerradoMXN += monto
      }
    })

    const result = Array.from(map.values())
    result.forEach(m => {
      m.winRate = m.totalCotizaciones > 0 ? (m.totalCerrado / m.totalCotizaciones) * 100 : 0
    })

    return result.sort((a, b) => b.montoCerradoMXN - a.montoCerradoMXN)
  }, [cotizaciones])

  // --- TOP PRODUCTS DEMAND ---
  const metricasProductos = useMemo((): FilaProductoMetrica[] => {
    const map = new Map<string, FilaProductoMetrica>()

    itemsHistoricos.forEach(item => {
      // Clean and split the concatenated product name (which has thickness and conversion)
      const rawName = item.producto_nombre_original || 'Producto Desconocido'
      const baseName = rawName.split('|')[0].trim()
      const qty = Number(item.cantidad) || 0
      const total = Number(item.total) || 0
      const uni = item.unidad || 'L'

      if (!map.has(baseName)) {
        map.set(baseName, {
          nombre: baseName,
          frecuencia: 0,
          cantidadTotal: 0,
          unidad: uni,
          montoTotalMXN: 0
        })
      }

      const p = map.get(baseName)!
      p.frecuencia++
      p.cantidadTotal += qty
      p.montoTotalMXN += total
    })

    return Array.from(map.values()).sort((a, b) => b.montoTotalMXN - a.montoTotalMXN)
  }, [itemsHistoricos])

  // --- FLOOR CONDITIONS ---
  const metricasEstadoPiso = useMemo(() => {
    const map = new Map<string, { count: number; area: number; monto: number }>()

    cotizaciones.forEach(c => {
      const cond = c.estado_piso || 'ninguno'
      if (!map.has(cond)) {
        map.set(cond, { count: 0, area: 0, monto: 0 })
      }
      const data = map.get(cond)!
      data.count++
      data.area += c.area_total_m2 || 0
      data.monto += c.monto_total || 0
    })

    return Array.from(map.entries()).map(([cond, v]) => ({
      condición: cond === 'liso' ? 'Piso Liso (+5% merma)'
        : cond === 'estandar' ? 'Piso Estándar (+10% merma)'
        : cond === 'rugoso' ? 'Piso Rugoso (+15% merma)'
        : 'Sin merma (0%)',
      key: cond,
      ...v
    })).sort((a, b) => b.monto - a.monto)
  }, [cotizaciones])

  // --- DISCREPANCIES LOG (QUOTES WITH NOTES) ---
  const discrepanciasNotas = useMemo(() => {
    return cotizaciones
      .filter(c => c.notas && c.notas.trim().length > 3)
      .map(c => ({
        id: c.id,
        cliente: c.cliente,
        proyecto: c.proyecto,
        fecha: c.fecha,
        vendedor: c.vendedor_email ? obtenerNombreVendedor(c.vendedor_email) : 'Web/Anon',
        monto: c.monto_total,
        notas: c.notas!
      }))
      .slice(0, 10) // Limit to top 10 recent
  }, [cotizaciones])

  // --- AI GENERATE EXECUTIVE REPORT (GEMINI) ---
  const generarReporteConIA = async () => {
    setGenerandoReporte(true)
    setReporteIA(null)

    try {
      const payloadContext = {
        kpis: {
          total_cotizado_mxn: kpis.totalCotizado,
          total_ganado_mxn: kpis.totalCerrado,
          tasa_cierre_monto: kpis.winRateMonto.toFixed(1) + '%',
          tasa_cierre_cant: kpis.winRateCantidad.toFixed(1) + '%',
          ticket_promedio: kpis.ticketPromedio,
          area_total_cotizada_m2: kpis.areaTotal,
          cantidad_cotizaciones: cotizaciones.length
        },
        vendedores: metricasVendedores.map(v => ({
          nombre: v.nombre,
          cotizaciones: v.totalCotizaciones,
          cotizado_mxn: v.montoCotizadoMXN,
          ganado_mxn: v.montoCerradoMXN,
          win_rate: v.winRate.toFixed(1) + '%'
        })),
        productos_mas_cotizados: metricasProductos.slice(0, 5).map(p => ({
          nombre: p.nombre,
          frecuencia_cotizado: p.frecuencia,
          cantidad_consumida: `${p.cantidadTotal.toFixed(1)} ${p.unidad}`,
          monto_total_mxn: p.montoTotalMXN
        })),
        condiciones_piso: metricasEstadoPiso.map(p => ({
          tipo: p.condición,
          cantidad: p.count,
          monto_total: p.monto
        })),
        notas_discrepancias_recientes: discrepanciasNotas.map(n => ({
          cliente: n.cliente,
          vendedor: n.vendedor,
          notas: n.notas
        }))
      }

      const prompt = `Analiza las siguientes métricas comerciales y de cotizaciones del mes de BUCA Recubrimientos y redacta un reporte ejecutivo estructurado en español.

DATOS DEL PERIODO:
${JSON.stringify(payloadContext, null, 2)}

ESTRUCTURA REQUERIDA DEL REPORTE:
1. Resumen Ejecutivo (Una conclusión general del estado comercial actual).
2. Fortalezas Comerciales (Destaca qué asesor está vendiendo más y qué productos tienen mayor rotación).
3. Puntos Críticos y Fugas (Analiza discrepancias de costos de las notas, mermas de pisos y cotizaciones no cerradas).
4. Recomendación de Almacén/Inventario (Indica qué productos están siendo muy cotizados para alertar a stock antes de que falte).
5. Acciones Sugeridas (2 o 3 estrategias de venta/operación directas).

REGLAS DE TONO:
- Profesional, corporativo e inteligente.
- Enfocado en datos numéricos.
- Evita justificaciones vacías. Usa viñetas estructuradas.`

      const response = await callGeminiServer({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })

      if (response && response.text) {
        setReporteIA(response.text)
      } else {
        throw new Error("No se recibió texto del servidor de Gemini.")
      }
    } catch (err: any) {
      console.error(err)
      alert(`Error al generar reporte: ${err.message || err}`)
    } finally {
      setGenerandoReporte(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-blue-600 animate-pulse">
        <p className="text-sm font-semibold">Cargando métricas y análisis de cotizaciones...</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-center space-y-3">
        <p className="text-sm font-bold">Error de conexión con Supabase</p>
        <p className="text-xs text-red-500">{errorMsg}</p>
        <button onClick={loadData} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition">
          Reintentar Cargar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans text-gray-800">
      
      {/* 1. TOP CARDS (KPIS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-3 bottom-3 text-white/10 text-6xl font-extrabold select-none">MXN</div>
          <span className="text-[10px] uppercase tracking-wider text-blue-100 font-bold block">Total Cotizado</span>
          <strong className="text-xl block mt-2 font-black leading-none">{formatMXN(kpis.totalCotizado)}</strong>
          <span className="text-[10px] text-blue-100 mt-2 block font-semibold">{cotizaciones.length} cotizaciones totales</span>
        </div>

        {/* KPI 2 */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-3 bottom-3 text-white/10 text-6xl font-extrabold select-none">WON</div>
          <span className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold block">Total Cerrado / Vendido</span>
          <strong className="text-xl block mt-2 font-black leading-none">{formatMXN(kpis.totalCerrado)}</strong>
          <span className="text-[10px] text-emerald-100 mt-2 block font-semibold">Tasa Financiera: {kpis.winRateMonto.toFixed(1)}%</span>
        </div>

        {/* KPI 3 */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-3 bottom-3 text-white/10 text-5xl font-extrabold select-none">WIN</div>
          <span className="text-[10px] uppercase tracking-wider text-purple-100 font-bold block">Win Rate (Cierre Proyectos)</span>
          <strong className="text-xl block mt-2 font-black leading-none">{kpis.winRateCantidad.toFixed(1)}%</strong>
          <span className="text-[10px] text-purple-100 mt-2 block font-semibold">Ticket Prom: {formatMXN(kpis.ticketPromedio)}</span>
        </div>

        {/* KPI 4 */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-3 bottom-3 text-white/10 text-6xl font-extrabold select-none">M²</div>
          <span className="text-[10px] uppercase tracking-wider text-amber-100 font-bold block">Metraje Total Scoped</span>
          <strong className="text-xl block mt-2 font-black leading-none">{formatNum(kpis.areaTotal)} m²</strong>
          <span className="text-[10px] text-amber-100 mt-2 block font-semibold">Área promedio: {(kpis.areaTotal / (cotizaciones.length || 1)).toFixed(1)} m²/proyecto</span>
        </div>
      </div>

      {/* 2. MAIN SECTION: PERFORMANCE AND AI REPORT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle: Performance Tables */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* VENDORS TABLE */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              Desempeño Comercial por Asesor
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="pb-2 font-semibold">Asesor</th>
                    <th className="pb-2 font-semibold text-right">Cotizado</th>
                    <th className="pb-2 font-semibold text-right">Cerrado / Ganado</th>
                    <th className="pb-2 font-semibold text-center">Tasa Cierre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {metricasVendedores.map(v => (
                    <tr key={v.email} className="hover:bg-gray-50/50">
                      <td className="py-2.5">
                        <div className="font-semibold text-gray-800">{v.nombre}</div>
                        <div className="text-[10px] text-gray-400">{v.email}</div>
                      </td>
                      <td className="py-2.5 text-right font-medium text-gray-700">
                        {formatMXN(v.montoCotizadoMXN)}
                        <span className="text-[10px] text-gray-400 block font-normal">{v.totalCotizaciones} cotiz.</span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-emerald-600">
                        {formatMXN(v.montoCerradoMXN)}
                        <span className="text-[10px] text-gray-400 block font-normal">{v.totalCerrado} ganadas</span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          v.winRate > 60 ? 'bg-green-50 text-green-700' : v.winRate > 30 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {v.winRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* TOP PRODUCTS DEMAND */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              Demanda de Productos (Top de Rotación en Cotizaciones)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="pb-2 font-semibold">Producto</th>
                    <th className="pb-2 font-semibold text-center">Frecuencia</th>
                    <th className="pb-2 font-semibold text-right">Volumen Cotizado</th>
                    <th className="pb-2 font-semibold text-right">Total Cotizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {metricasProductos.slice(0, 6).map(p => (
                    <tr key={p.nombre} className="hover:bg-gray-50/50">
                      <td className="py-3">
                        <span className="font-semibold text-gray-800">{p.nombre}</span>
                      </td>
                      <td className="py-3 text-center font-bold text-blue-600">
                        {p.frecuencia} <span className="text-[10px] text-gray-400 font-normal">veces</span>
                      </td>
                      <td className="py-3 text-right font-medium text-gray-700">
                        {formatNum(p.cantidadTotal)} {p.unidad}
                      </td>
                      <td className="py-3 text-right font-bold text-gray-800">
                        {formatMXN(p.montoTotalMXN)}
                      </td>
                    </tr>
                  ))}
                  {metricasProductos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 italic">No hay partidas registradas en las cotizaciones.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Column: AI executive generator */}
        <div className="space-y-6">
          
          {/* AI REPORTER */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 rounded-3xl p-5 text-white shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest">IA Executive Analyst</h3>
                <h4 className="text-sm font-bold text-white mt-1 leading-tight">Reporte Estratégico BUCA</h4>
              </div>
              <span className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold">AI</span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Consolida el historial de cotizaciones de Supabase (win rates, volumen por producto y notas de obra) para generar un análisis ejecutivo con la API de Gemini.
            </p>

            <button
              onClick={generarReporteConIA}
              disabled={generandoReporte || cotizaciones.length === 0}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold text-xs rounded-2xl transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer select-none"
            >
              {generandoReporte ? "Analizando con Gemini..." : "Generar Reporte con IA"}
            </button>

            {reporteIA && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 animate-fade-in max-h-[380px] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Gemini 2.5 Flash</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(reporteIA)
                        .then(() => alert("Copiado al portapapeles"))
                        .catch(() => alert("No se pudo copiar automáticamente"))
                    }}
                    className="text-[10px] text-slate-400 hover:text-white transition font-semibold"
                  >
                    Copiar texto
                  </button>
                </div>
                <div className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {reporteIA}
                </div>
              </div>
            )}
          </div>

          {/* FLOOR CONDITIONS METRICS */}
          <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              Incidencia de Mermas por Estado del Piso
            </h3>
            <div className="space-y-3">
              {metricasEstadoPiso.map(p => (
                <div key={p.key} className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">{p.condición}</span>
                    <span className="text-[10px] text-gray-400">{p.count} cotizaciones · {formatNum(p.area)} m²</span>
                  </div>
                  <strong className="text-xs text-gray-900 shrink-0">{formatMXN(p.monto)}</strong>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* 3. DISCREPANCIES NOTES FEED */}
      <div className="bg-white rounded-3xl border border-gray-150 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          Análisis de Discrepancias y Ajustes de Costo Recientes
        </h3>
        <div className="divide-y divide-gray-50">
          {discrepanciasNotas.map(n => (
            <div key={n.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 first:pt-0 last:pb-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <strong className="text-xs text-gray-800">{n.cliente}</strong>
                  <span className="text-[10px] text-gray-400">· {n.fecha}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">Asesor: {n.vendedor}</span>
                </div>
                <p className="text-xs text-gray-600 italic">"{n.notas}"</p>
              </div>
              <strong className="text-xs text-gray-900 shrink-0 font-bold sm:text-right">{formatMXN(n.monto || 0)}</strong>
            </div>
          ))}
          {discrepanciasNotas.length === 0 && (
            <p className="py-4 text-center text-xs text-gray-400 italic">No hay cotizaciones con notas de discrepancia registradas.</p>
          )}
        </div>
      </div>

    </div>
  )
}
