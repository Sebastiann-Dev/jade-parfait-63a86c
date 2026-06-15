import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  fetchSistemasSupabase,
  fetchSistemaProductosSupabase,
  fetchProductosSupabase,
  type Sistema
} from '../supabase'
import { type Producto } from '../data/productos'
import { DiagramaCapas } from '../components/DiagramaCapas'

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
                  <div className="lg:col-span-7 space-y-4">
                    <DiagramaCapas
                      groupedCapas={sys.groupedCapas as any}
                      capaActivaIndex={activeLayer}
                      onToggleLayer={(orden) => handleToggleLayer(sys.id, orden)}
                    />
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
