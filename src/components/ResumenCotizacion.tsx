import React, { useMemo, useState } from 'react'
import { type Producto } from '../data/productos'
import { generarPDF } from '../utils/generarPDF'
import { formatMXN, formatNum, type EstadoPiso } from '../utils/format'
import { saveCotizacionSupabase, type ItemCotizacion } from '../supabase'

export interface LineaProducto {
  id: string
  producto: Producto
  metros: number
  cantidad: number
  precioUnitario: number
  totalMXN: number
  esMinorista: boolean
  presentacion?: any
}

interface ResumenCotizacionProps {
  lineas: LineaProducto[]
  setLineas: React.Dispatch<React.SetStateAction<LineaProducto[]>>
  clienteNombre: string
  proyectoNombre: string
  notasProyecto: string
  fechaHoy: string
  tipoCambio: number
  esMinorista: boolean
  descuentoPorcentaje: number
  estadoPiso: EstadoPiso
  eliminarLinea: (id: string) => void
  editarLinea: (linea: LineaProducto) => void
  prospectoCodigo?: string   // vinculación opcional con diagnóstico
  vendedorEmail?: string     // para identificar al vendedor
}

// formatMXN y formatNum importados desde '../utils/format'

export const ResumenCotizacion: React.FC<ResumenCotizacionProps> = ({
  lineas,
  setLineas,
  clienteNombre,
  proyectoNombre,
  notasProyecto,
  fechaHoy,
  tipoCambio,
  esMinorista,
  descuentoPorcentaje,
  estadoPiso,
  eliminarLinea,
  editarLinea,
  prospectoCodigo,
  vendedorEmail,
}) => {
  const totalProyecto = useMemo(() => {
    return lineas.reduce((sum, l) => sum + l.totalMXN, 0)
  }, [lineas])

  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const [cotizacionId, setCotizacionId] = useState<string | null>(null)

  async function handleGuardarCotizacion() {
    if (lineas.length === 0) return
    setGuardando(true)
    setMensajeGuardado(null)
    try {
      const areaTotal = lineas.reduce((sum, l) => sum + (l.metros || 0), 0)

      // Convertir lineas a items del formato de Supabase
      const items: ItemCotizacion[] = lineas.map(l => {
        const dens = l.producto.densidad_conversion || 1.0
        const uni = l.producto.unidad.toLowerCase()
        let conversionStr = ''
        if (dens > 0 && dens !== 1.0) {
          if (uni === 'kg') {
            conversionStr = ` | ${(l.cantidad / dens).toFixed(1)} L`
          } else if (uni === 'l' || uni === 'litro' || uni === 'litros') {
            conversionStr = ` | ${(l.cantidad * dens).toFixed(1)} kg`
          }
        }
        const espesorStr = l.espesor ? ` | Espesor: ${l.espesor} mm` : ''

        return {
          producto_id:             (l.producto as any).id ?? undefined,
          producto_nombre_original: `${l.producto.nombre}${espesorStr}${conversionStr}`,
          cantidad:                l.cantidad,
          unidad:                  l.producto.unidad,
          precio_unitario:         l.precioUnitario,
          moneda:                  l.producto.moneda || 'MXN',
          total:                   l.totalMXN,
          metros_cuadrados:        l.metros || undefined,
        }
      })

      // Parsear fecha del formato "DD de MMMM de YYYY" → "YYYY-MM-DD"
      const hoy = new Date()
      const fechaISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

      const id = await saveCotizacionSupabase({
        cliente:              clienteNombre || 'Sin nombre',
        proyecto:             proyectoNombre || 'Sin proyecto',
        fecha:                fechaISO,
        area_total_m2:        areaTotal > 0 ? areaTotal : undefined,
        monto_total:          totalProyecto,
        vendedor_email:       vendedorEmail || undefined,
        prospecto_codigo:     prospectoCodigo || undefined,
        estado_cotizacion:    'Borrador',
        notas:                notasProyecto || undefined,
        tipo_cambio:          tipoCambio,
        es_minorista:         esMinorista,
        descuento_porcentaje: descuentoPorcentaje,
        estado_piso:          estadoPiso,
        items,
      })

      setCotizacionId(id)
      setMensajeGuardado({ texto: `Cotización guardada correctamente${prospectoCodigo ? ` · Vinculada a ${prospectoCodigo}` : ''}`, tipo: 'ok' })
    } catch (err: any) {
      console.error(err)
      setMensajeGuardado({ texto: `Error al guardar: ${err.message || 'intenta de nuevo'}`, tipo: 'error' })
    } finally {
      setGuardando(false)
    }
  }

  if (lineas.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 print:hidden">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm">Selecciona un producto y agrégalo para comenzar la cotización</p>
      </div>
    )
  }

  return (
    <div className="buca-card">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Cotización del proyecto</h2>
        <div className="flex gap-2 flex-wrap justify-end">
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
              totalProyecto,
              vendedorEmail
            })}
            className="buca-btn-secondary text-sm"
          >
            📄 Exportar PDF
          </button>
          <button
            id="btn-guardar-cotizacion"
            onClick={handleGuardarCotizacion}
            disabled={guardando}
            className="buca-btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: cotizacionId ? '#16a34a' : undefined }}
          >
            {guardando ? '⏳ Guardando...' : cotizacionId ? '✅ Guardada' : '💾 Guardar Cotización'}
          </button>
        </div>
      </div>

      {/* Feedback de guardado */}
      {mensajeGuardado && (
        <div
          className="mb-4 px-4 py-2 rounded-lg text-sm font-medium print:hidden"
          style={{
            background: mensajeGuardado.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            color: mensajeGuardado.tipo === 'ok' ? '#15803d' : '#dc2626',
            border: `1px solid ${mensajeGuardado.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`
          }}
        >
          {mensajeGuardado.texto}
        </div>
      )}

      {/* Vinculación activa con prospecto */}
      {prospectoCodigo && (
        <div className="mb-3 px-3 py-1.5 rounded-lg text-xs font-medium print:hidden"
          style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
          Vinculando con prospecto: <span className="font-mono font-bold">{prospectoCodigo}</span>
        </div>
      )}

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
                  {l.espesor && (
                    <div className="text-xs font-semibold text-blue-600 mt-0.5">
                      📐 Espesor: {l.espesor} mm
                    </div>
                  )}
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
  )
}
