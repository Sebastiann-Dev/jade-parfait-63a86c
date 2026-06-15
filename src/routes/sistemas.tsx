import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import {
  fetchSistemasSupabase,
  fetchSistemaProductosSupabase,
  fetchProductosSupabase,
  type Sistema
} from '../supabase'
import { type Producto } from '../data/productos'

export const Route = createFileRoute('/sistemas')({
  component: SistemasCatalogPage,
})

interface SystemWithDetails extends Sistema {
  rels: {
    id: string;
    producto: Producto;
    consumo_por_m2: number;
    orden: number;
  }[];
  groupedCapas: {
    id: string;
    baseName: string;
    orden: number;
    partA: { id: string; producto: Producto; consumo_por_m2: number; orden: number };
    partB?: { id: string; producto: Producto; consumo_por_m2: number; orden: number };
    isGrouped: boolean;
  }[];
}

function SistemasCatalogPage() {
  const [sistemas, setSistemas] = useState<SystemWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLayers, setExpandedLayers] = useState<Record<string, number | null>>({})

  useEffect(() => {
    async function loadCatalogData() {
      try {
        setLoading(true)
        const allProducts = await fetchProductosSupabase(true)
        const allSystems = await fetchSistemasSupabase()

        const detailedSystems = await Promise.all(
          allSystems.map(async (sys) => {
            const rels = await fetchSistemaProductosSupabase(sys.id)
            const resolvedRels = rels
              .map((r) => {
                const p = allProducts.find((prod) => prod.id === r.producto_id)
                return {
                  id: r.id,
                  producto: p!,
                  consumo_por_m2: Number(r.consumo_por_m2),
                  orden: r.orden
                }
              })
              .filter((r) => r.producto !== undefined)
              .sort((a, b) => a.orden - b.orden)

            // Apply Part A and Part B unifier grouping logic
            const groupedCapas: SystemWithDetails['groupedCapas'] = []
            let i = 0;
            while (i < resolvedRels.length) {
              const current = resolvedRels[i];
              const currentName = current.producto.nombre;
              const partAMatch = currentName.match(/^(.*?)\s*[-–(]?\s*(?:Pte|Parte|Part)\s*A\s*\)?$/i);

              if (partAMatch) {
                const baseName = partAMatch[1].trim();
                if (i + 1 < resolvedRels.length) {
                  const next = resolvedRels[i + 1];
                  const nextName = next.producto.nombre;
                  const partBMatch = nextName.match(/^(.*?)\s*[-–(]?\s*(?:Pte|Parte|Part)\s*B\s*\)?$/i);

                  if (partBMatch && partBMatch[1].trim().toLowerCase() === baseName.toLowerCase()) {
                    groupedCapas.push({
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

              groupedCapas.push({
                id: current.id,
                baseName: currentName,
                orden: current.orden,
                partA: current,
                isGrouped: false
              });
              i += 1;
            }

            return {
              ...sys,
              rels: resolvedRels,
              groupedCapas
            }
          })
        )

        setSistemas(detailedSystems)
      } catch (error) {
        console.error("Error loading catalog data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadCatalogData()
  }, [])

  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  const handleToggleLayer = (systemId: string, layerOrden: number) => {
    setExpandedLayers((prev) => ({
      ...prev,
      [systemId]: prev[systemId] === layerOrden ? null : layerOrden
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="buca-header shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="buca-logo-mark">
              <span>B</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">BUCA Recubrimientos</h1>
              <p className="text-blue-200 text-xs">Catálogo de Sistemas Multicapa</p>
            </div>
          </div>
          <div className="text-right flex items-center gap-2">
            <div className="text-right hidden sm:block mr-2">
              <p className="text-blue-200 text-xs">Monterrey, N.L. · México</p>
              <p className="text-blue-100 text-xs">{fechaHoy}</p>
            </div>
            <Link
              to="/admin"
              search={{ tab: 'sistemas' }}
              className="px-3 py-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded-xl transition shadow-sm flex items-center gap-1.5"
            >
              ⚙️ Admin
            </Link>
            <Link
              to="/"
              className="px-3 py-2 border border-blue-400/30 text-white hover:bg-white/10 text-xs font-semibold rounded-xl transition shadow-sm"
            >
              ← Volver al Cotizador
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Sistemas Multicapa Disponibles</h2>
            <p className="text-sm text-gray-500 mt-1">Explora la composición técnica, las fichas y el orden de aplicación de los sistemas de recubrimientos industriales.</p>
          </div>
          <div className="flex items-center gap-2 self-start shrink-0">
            <Link
              to="/admin"
              search={{ tab: 'sistemas', action: 'new' }}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-full transition shadow-sm flex items-center gap-1 uppercase tracking-wider text-center"
            >
              + Nuevo Sistema
            </Link>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full uppercase tracking-wider">
              {sistemas.length} {sistemas.length === 1 ? 'Sistema Registrado' : 'Sistemas Registrados'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-purple-600 font-semibold animate-pulse text-sm">Cargando catálogo técnico de sistemas...</p>
          </div>
        ) : sistemas.length === 0 ? (
          <div className="buca-card py-16 text-center text-gray-400">
            <div className="text-5xl mb-4">🧪</div>
            <h3 className="font-bold text-gray-700 text-base">No hay sistemas registrados</h3>
            <p className="text-xs text-gray-400 mt-1">Crea sistemas en el Panel de Administración para que aparezcan aquí.</p>
            <div className="mt-5">
              <Link to="/admin" className="buca-btn-primary text-xs">
                Ir a Panel de Administración
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {sistemas.map((sys) => {
              const activeLayer = expandedLayers[sys.id] ?? null

              return (
                <div key={sys.id} className="buca-card grid grid-cols-1 lg:grid-cols-12 gap-8 items-start hover:shadow-md transition-shadow duration-200">
                  {/* Info Column */}
                  <div className="lg:col-span-5 space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 leading-snug">{sys.nombre}</h3>
                      <p className="text-xs text-gray-500 mt-1">ID: {sys.id}</p>
                    </div>
                    
                    <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                      {sys.descripcion || 'Sin descripción técnica registrada en la base de datos.'}
                    </p>

                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lista de Materiales Incorporados:</h4>
                      <ul className="space-y-1.5">
                        {sys.rels.map((r, idx) => (
                          <li key={r.id} className="flex justify-between items-center text-xs text-gray-700 font-medium">
                            <span className="truncate max-w-[250px]">{idx + 1}. {r.producto.nombre}</span>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md shrink-0 font-bold font-mono">
                              {r.consumo_por_m2} {r.producto.unidad}/m²
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2">
                      <Link
                        to={`/?sistemaId=${sys.id}`}
                        className="w-full buca-btn-primary block text-center text-xs py-3 rounded-xl font-bold shadow-md cursor-pointer select-none transition"
                      >
                        📊 Cotizar este Sistema
                      </Link>
                    </div>
                  </div>

                  {/* Stacking diagram Column */}
                  <div className="lg:col-span-7 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
                      <span>🔬</span> Esquema Técnico de Capas (Haz clic para ver detalles)
                    </h4>

                    <div className="flex flex-col gap-2 max-w-md mx-auto">
                      {/* Diagram layers in reverse order (Top layer first) */}
                      {[...sys.groupedCapas].sort((a, b) => b.orden - a.orden).map((capa, idx) => {
                        const isExpanded = activeLayer === capa.orden;
                        const isFirst = capa.orden === 0;
                        const isLast = capa.orden === sys.groupedCapas[sys.groupedCapas.length - 1].orden;

                        // Color scheme based on layer type
                        let blockColor = "from-purple-500 to-indigo-500 border-purple-600 shadow-purple-100";
                        if (isFirst) blockColor = "from-blue-500 to-cyan-500 border-blue-600 shadow-blue-100";
                        else if (isLast) blockColor = "from-violet-600 to-fuchsia-600 border-violet-700 shadow-violet-100";

                        // Justifications and mix instructions
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
                              onClick={() => handleToggleLayer(sys.id, capa.orden)}
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

                              {/* Thickness and Dose indicator */}
                              <div className="flex items-center gap-2 text-[10px] font-semibold opacity-90 shrink-0">
                                <span>→ Espesor: {capa.partA.producto.espesorRecomendado || (capa.partB && capa.partB.producto.espesorRecomendado) || 'N/A'}</span>
                                <span className="text-white/40">|</span>
                                <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold text-[9px]">
                                  {capa.isGrouped && capa.partB
                                    ? `${capa.partA.consumo_por_m2} + ${capa.partB.consumo_por_m2} ${capa.partA.producto.unidad}/m²`
                                    : `${capa.partA.consumo_por_m2} ${capa.partA.producto.unidad}/m²`
                                  }
                                </span>
                              </div>
                            </div>

                            {/* Details accordion */}
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

                                {/* Detailed Breakdown (2-Column comparative or 1-Column) */}
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
                                             <span className="font-semibold text-gray-500">Dosificación:</span><br />
                                             <span className="text-gray-700 font-medium">{capa.partA.consumo_por_m2} {capa.partA.producto.unidad}/m²</span>
                                           </div>
                                           <div>
                                             <span className="font-semibold text-gray-500">Unidad:</span><br />
                                             <span className="text-purple-800 font-bold">{capa.partA.producto.unidad}</span>
                                           </div>
                                           <div className="col-span-2 border-t border-purple-50 pt-1.5">
                                             <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                             <span className="text-gray-700 font-medium">
                                               {capa.partA.producto.tieneRendimiento && capa.partA.producto.rendimiento 
                                                 ? `${capa.partA.producto.rendimiento} m²/unidad` 
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
                                             <span className="font-semibold text-gray-500">Dosificación:</span><br />
                                             <span className="text-gray-700 font-medium">{capa.partB.consumo_por_m2} {capa.partB.producto.unidad}/m²</span>
                                           </div>
                                           <div>
                                             <span className="font-semibold text-gray-500">Unidad:</span><br />
                                             <span className="text-purple-800 font-bold">{capa.partB.producto.unidad}</span>
                                           </div>
                                           <div className="col-span-2 border-t border-purple-50 pt-1.5">
                                             <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                             <span className="text-gray-700 font-medium">
                                               {capa.partB.producto.tieneRendimiento && capa.partB.producto.rendimiento 
                                                 ? `${capa.partB.producto.rendimiento} m²/unidad` 
                                                 : 'Cálculo dinámico/manual'}
                                             </span>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                ) : (
                                  /* 1-Column simple layout */
                                  <div className="grid grid-cols-2 gap-3 bg-white border border-purple-100 rounded-lg p-2.5 text-[11px] leading-relaxed">
                                    <div>
                                      <span className="font-semibold text-gray-500">Rendimiento Ficha:</span><br />
                                      <span className="text-gray-700 font-medium">
                                        {capa.partA.producto.tieneRendimiento && capa.partA.producto.rendimiento 
                                          ? `${capa.partA.producto.rendimiento} m²/${capa.partA.producto.unidad}` 
                                          : 'Cálculo dinámico/manual'}
                                      </span>
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

                                {/* Justificación */}
                                <div>
                                  <h5 className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                                    <span>💡</span> ¿Por qué esta posición en el sistema?
                                  </h5>
                                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                    {justificationText}
                                  </p>
                                </div>

                                {/* Aplicación */}
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
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 bg-gray-900 text-center text-xs text-gray-400 border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-4">
          <p className="font-semibold text-gray-300">BUCA Recubrimientos · Monterrey, N.L., México</p>
          <p className="mt-1 text-gray-500">Catálogo técnico de sistemas multicapa. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}
