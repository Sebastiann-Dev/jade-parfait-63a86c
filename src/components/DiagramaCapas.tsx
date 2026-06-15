// Trigger build: Clean concrete details bullet points layout
import React from 'react'
import { type Producto } from '../data/productos'
import { formatNum, getMermaFactor, type EstadoPiso } from '../utils/format'

export interface CapaGrouped {
  id: string
  baseName: string
  orden: number
  partA: {
    id: string
    producto: Producto
    consumo_por_m2: number
    orden: number
  }
  partB?: {
    id: string
    producto: Producto
    consumo_por_m2: number
    orden: number
  }
  isGrouped: boolean
}

interface DiagramaCapasProps {
  groupedCapas: CapaGrouped[]
  capaActivaIndex: number | null
  onToggleLayer: (orden: number) => void
  metros?: number
  estadoPiso?: EstadoPiso
}

// formatNum importado desde '../utils/format'

export const DiagramaCapas: React.FC<DiagramaCapasProps> = ({
  groupedCapas,
  capaActivaIndex,
  onToggleLayer,
  metros = 0,
  estadoPiso = 'ninguno'
}) => {
  return (
    <div className="bg-white border border-gray-150 rounded-xl p-4 shadow-sm">
      <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1">
        <span>📊</span> Esquema Técnico de Capas (Haz clic para ver detalles)
      </h4>

      <div className="flex flex-col gap-2 max-w-lg mx-auto">
        {/* Stacking rendering in reverse order (Capa superior primero) */}
        {[...groupedCapas].sort((a, b) => b.orden - a.orden).map((capa, idx) => {
          const isExpanded = capaActivaIndex === capa.orden
          const isFirst = capa.orden === 0
          const isLast = capa.orden === groupedCapas[groupedCapas.length - 1].orden

          // Color scheme based on layer type
          let blockColor = "from-purple-500 to-indigo-500 border-purple-600 shadow-purple-100"
          if (isFirst) blockColor = "from-blue-500 to-cyan-500 border-blue-600 shadow-blue-100"
          else if (isLast) blockColor = "from-violet-600 to-fuchsia-600 border-violet-700 shadow-violet-100"

          // Quantities calculations if metros > 0
          const qtyA = metros * capa.partA.consumo_por_m2
          const isAAccesorio = capa.partA.producto.unidad.toLowerCase().includes('pza') || capa.partA.producto.unidad.toLowerCase().includes('pieza')
          const finalQtyA = isAAccesorio ? qtyA : qtyA * getMermaFactor(estadoPiso)

          const qtyB = capa.partB ? metros * capa.partB.consumo_por_m2 : 0
          const finalQtyB = capa.partB
            ? (capa.partB.producto.unidad.toLowerCase().includes('pza') || capa.partB.producto.unidad.toLowerCase().includes('pieza')
                ? qtyB
                : qtyB * getMermaFactor(estadoPiso))
            : 0

          // Dynamic Justifications and Mix instructions
          const functionText = isFirst
            ? "Primario / Anclaje: Sellador inicial que penetra los poros del concreto preparado, garantizando una adherencia perfecta para las capas del cuerpo del sistema y previniendo burbujas."
            : isLast
              ? "Sello / Acabado Final: Capa protectora resistente que provee la dureza final ante el tráfico, impermeabilidad, resistencia a químicos, agentes UV y acabado estético."
              : "Cuerpo / Capa Intermedia: Aporta el espesor mecánico requerido, absorbe impactos, autonivela las imperfecciones del suelo y refuerza la estructura."

          const justificationText = isFirst
            ? "Se coloca en la base (en contacto directo con el concreto) porque actúa como el puente de adherencia principal. Al penetrar el sustrato poroso de concreto preparado, evita que los recubrimientos posteriores se desprendan o se delaminen por tensiones mecánicas y previene que el aire atrapado en los poros ascienda creando burbujas (ojos de pescado)."
            : isLast
              ? "Se posiciona en la capa superior externa para servir de barrera protectora de todo el sistema. Debe recibir directamente la abrasión por tráfico (peatonal o montacargas), resistir derrames químicos, bloquear la radiación UV (evitando amarillamiento) y proporcionar el acabado de color o brillo especificado por el cliente."
              : "Se sitúa en la parte intermedia para conformar el núcleo de soporte. Al combinarse con cargas de arena de sílice o autonivelantes, proporciona el espesor necesario para soportar cargas pesadas de impacto, amortigua las vibraciones mecánicas y disipa las tensiones entre el acabado y la base de concreto."

          const mixInstruction = capa.isGrouped
            ? "Mezclar mecánicamente la Parte A por 2 minutos para homogeneizar. Incorporar la Parte B respetando la proporción y continuar mezclando con taladro a bajas revoluciones (300-400 RPM) durante 3 minutos adicionales para evitar la inclusión de aire. Verter de inmediato y extender con llana o jalador según el espesor requerido. Respete los tiempos de vida útil de la mezcla (pot life)."
            : (capa.partA.producto.nombre.toLowerCase().includes('autonivelante') || capa.partA.producto.nombre.toLowerCase().includes('bucacrete')
              ? "Verter la mezcla homogénea directamente sobre el sustrato. Extender rápidamente a la altura deseada con rastrillo de nivel o llana dentada. Pasar inmediatamente rodillo de picos metálicos (spike roller) de forma cruzada para liberar burbujas de aire."
              : capa.partA.producto.nombre.toLowerCase().includes('saco') || capa.partA.producto.nombre.toLowerCase().includes('arena')
                ? "Espolvorear de manera uniforme a saturación sobre la capa base húmeda anterior. Permitir curado y retirar el exceso de arena barriendo antes de aplicar el sello."
                : "Aplicar con rodillo de felpa, jalador de llana lisa o jalador dentado en pasadas cruzadas. Mantener control estricto del espesor y respetar el tiempo de secado al tacto antes de sellar.")

          return (
            <div key={capa.id} className="w-full">
              {/* Layer Block */}
              <div
                onClick={() => onToggleLayer(capa.orden)}
                className={`relative flex items-center justify-between px-4 py-2.5 bg-gradient-to-r ${blockColor} border text-white rounded-lg shadow-sm cursor-pointer select-none transition-all duration-200 hover:brightness-110 hover:scale-[1.01] active:scale-[0.99]`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-xs truncate">{capa.baseName}</span>
                  {capa.isGrouped && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white border border-white/10 shadow-sm shrink-0">2-Ptes</span>
                  )}
                </div>

                {/* Arrow indicator and thickness */}
                <div className="flex items-center gap-2 text-[10px] font-semibold opacity-90 shrink-0">
                  <span>→ Espesor: {capa.partA.producto.espesorRecomendado || (capa.partB && capa.partB.producto.espesorRecomendado) || 'N/A'}</span>
                  <span className="text-white/40">|</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold text-[9px]">
                    {capa.isGrouped && capa.partB
                      ? (metros > 0
                          ? `${finalQtyA.toFixed(1)} + ${finalQtyB.toFixed(1)} ${capa.partA.producto.unidad}`
                          : `${capa.partA.consumo_por_m2} + ${capa.partB.consumo_por_m2} ${capa.partA.producto.unidad}/m²`)
                      : (metros > 0
                          ? `${finalQtyA.toFixed(2)} ${capa.partA.producto.unidad}`
                          : `${capa.partA.consumo_por_m2} ${capa.partA.producto.unidad}/m²`)
                    }
                  </span>
                </div>
              </div>

              {/* Tree Decomposition (Details accordion below the block) */}
              {isExpanded && (
                <div className="relative mt-2 ml-4 pl-4 border-l-2 border-dashed border-purple-300 py-3 space-y-3 animate-fade-in text-gray-700 bg-purple-50/30 rounded-r-lg">
                  {/* Connector node circle */}
                  <div className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-purple-400" />

                  {/* Attached PDFs (Moved to top, only for non-grouped layers) */}
                  {!capa.isGrouped && (capa.partA.producto.ficha_tecnica_url || capa.partA.producto.ficha_seguridad_url) && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {capa.partA.producto.ficha_tecnica_url && (
                        <a
                          href={capa.partA.producto.ficha_tecnica_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all shadow-sm shrink-0"
                        >
                          📄 Ficha Técnica (TDS)
                        </a>
                      )}
                      {capa.partA.producto.ficha_seguridad_url && (
                        <a
                          href={capa.partA.producto.ficha_seguridad_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 transition-all shadow-sm shrink-0"
                        >
                          🛡️ Ficha de Seguridad (SDS)
                        </a>
                      )}
                    </div>
                  )}

                  {/* Detailed Breakdown */}
                  {capa.isGrouped && capa.partB ? (
                    /* 2-Column layout with separate grids for buttons and cards */
                    <div className="space-y-3">
                      {/* Centered PDF buttons above columns */}
                      {(capa.partA.producto.ficha_tecnica_url || (capa.partB && capa.partB.producto.ficha_tecnica_url) || capa.partA.producto.ficha_seguridad_url || capa.partB.producto.ficha_seguridad_url) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Left column: TDS Ficha Técnica */}
                          <div className="flex justify-center items-center">
                            {(capa.partA.producto.ficha_tecnica_url || (capa.partB && capa.partB.producto.ficha_tecnica_url)) && (
                              <a
                                href={capa.partA.producto.ficha_tecnica_url || (capa.partB && capa.partB.producto.ficha_tecnica_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-all shadow-sm shrink-0"
                              >
                                📄 Ficha Técnica (TDS)
                              </a>
                            )}
                          </div>

                          {/* Right column: SDS Hojas de Seguridad (stacked vertically to guarantee centering) */}
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            {capa.partA.producto.ficha_seguridad_url && (
                              <a
                                href={capa.partA.producto.ficha_seguridad_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 transition-all shadow-sm shrink-0"
                              >
                                🛡️ Ficha Seguridad A (SDS)
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
                          </div>
                        </div>
                      )}

                      {/* Comparative cards grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Column 1: Parte A */}
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
                            {metros > 0 && (
                              <div>
                                <span className="font-semibold text-gray-500">Cantidad Total:</span><br />
                                <span className="text-purple-800 font-bold">{finalQtyA.toFixed(2)} {capa.partA.producto.unidad}</span>
                              </div>
                            )}
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

                        {/* Column 2: Parte B */}
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
                            {metros > 0 && (
                              <div>
                                <span className="font-semibold text-gray-500">Cantidad Total:</span><br />
                                <span className="text-purple-800 font-bold">{finalQtyB.toFixed(2)} {capa.partB.producto.unidad}</span>
                              </div>
                            )}
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
          )
        })}

        {/* Prepared Concrete Substrate (Base) */}
        <div className="w-full">
          <div
            onClick={() => onToggleLayer(-1)}
            className={`relative flex items-center justify-between px-4 py-2.5 bg-slate-100 border border-slate-300 text-slate-500 rounded-lg shadow-sm cursor-pointer select-none transition-all duration-200 hover:bg-slate-200 active:scale-[0.99]`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0 text-slate-600 border border-slate-300/50">
                0
              </span>
              <span className="font-bold text-xs truncate">Concreto / Sustrato Preparado</span>
            </div>
            <span className="text-[9px] font-semibold italic text-slate-400">Base rígida del sistema</span>
          </div>

          {capaActivaIndex === -1 && (
            <div className="relative mt-2 ml-4 pl-4 border-l-2 border-dashed border-slate-300 py-3 space-y-2 animate-fade-in text-gray-700 bg-slate-50 rounded-r-lg text-left">
              {/* Connector node circle */}
              <div className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-slate-400" />
              
              <div className="text-xs text-gray-600 leading-relaxed">
                <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider mb-2">Requisitos y Preparación del Concreto:</p>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li><strong>Estado del Sustrato:</strong> Concreto estructural sano con resistencia mínima de <strong>f'c = 250 kg/cm²</strong> y un curado mínimo de <strong>28 días</strong>. Debe ser una superficie firme y libre de movimientos.</li>
                  <li><strong>Humedad Interna:</strong> Máxima del <strong>4%</strong> (de lo contrario, requiere la aplicación de una barrera de vapor epóxica).</li>
                  <li><strong>Limpieza:</strong> Libre de agentes contaminantes como grasas, aceites, desmoldantes, membranas de curado o lechada superficial.</li>
                  <li><strong>Preparación Mecánica:</strong> Requiere desbaste diamantado, granallado o escarificado para abrir el poro y generar un perfil de anclaje de <strong>CSP 2 a CSP 5</strong> según el espesor del sistema.</li>
                  <li><strong>Reparaciones Previas:</strong> Fisuras, grietas u oquedades deben sellarse y nivelarse con mortero epóxico de alta resistencia antes de colocar el primario.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
