import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { fetchProductosSupabase, saveProductoSupabase, deleteProductoSupabase } from '../supabase'
import { Producto } from '../data/productos'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

const DEFAULT_PRODUCTO: Omit<Producto, 'id'> = {
  nombre: '',
  cantRef: 1,
  unidad: 'L',
  moneda: 'MXN',
  precio: 0,
  tieneRendimiento: false,
  nota: '',
  rendimiento: 0,
  espesorRecomendado: '',
  manosRecomendadas: '',
  pros: '',
  cons: '',
  cuidadoCon: ''
}

function AdminPage() {
  const [productos, setProductos] = useState<(Producto & {id: string})[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<Omit<Producto, 'id'>>(DEFAULT_PRODUCTO)

  async function loadProductos() {
    setLoading(true)
    const data = await fetchProductosSupabase()
    setProductos(data)
    setLoading(false)
  }

  useEffect(() => {
    loadProductos()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await saveProductoSupabase(formData)
      alert("Producto guardado con éxito en Supabase!")
      setShowForm(false)
      setFormData(DEFAULT_PRODUCTO)
      loadProductos()
    } catch (error) {
      alert("Error al guardar. Asegúrate de haber configurado tu URL y Key en src/supabase.ts")
    }
  }

  async function handleDelete(id: string) {
    if (confirm("¿Seguro que deseas eliminar este producto?")) {
      await deleteProductoSupabase(id)
      loadProductos()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Panel de Administración - BUCA</h1>
            <p className="text-sm text-gray-500">Gestiona tu catálogo de productos técnicos</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowForm(!showForm)} 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              {showForm ? 'Cancelar' : '+ Nuevo Producto'}
            </button>
            <Link to="/" className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Ir al Cotizador
            </Link>
          </div>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
            <h2 className="text-lg font-semibold mb-4 text-blue-900">Agregar Nuevo Producto</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Nombre del Producto</label><input required value={formData.nombre} onChange={e=>setFormData({...formData, nombre: e.target.value})} className="w-full p-2 border rounded text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Unidad (ej. L, saco, kit)</label><input required value={formData.unidad} onChange={e=>setFormData({...formData, unidad: e.target.value})} className="w-full p-2 border rounded text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Moneda</label>
                <select value={formData.moneda} onChange={e=>setFormData({...formData, moneda: e.target.value as 'MXN'|'USD'})} className="w-full p-2 border rounded text-sm">
                  <option value="MXN">MXN</option><option value="USD">USD</option>
                </select>
              </div>
              
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Precio Unitario</label><input type="number" step="0.01" required value={formData.precio} onChange={e=>setFormData({...formData, precio: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de Referencia (Cubeta de cuántos L?)</label><input type="number" step="0.1" required value={formData.cantRef} onChange={e=>setFormData({...formData, cantRef: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Descripción Breve / Nota</label><input value={formData.nota} onChange={e=>setFormData({...formData, nota: e.target.value})} className="w-full p-2 border rounded text-sm" /></div>
              
              <div className="col-span-full border-t pt-4 mt-2">
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={formData.tieneRendimiento} onChange={e=>setFormData({...formData, tieneRendimiento: e.target.checked})} />
                  <span className="font-medium text-sm">¿Este producto se calcula por metros cuadrados (rendimiento)?</span>
                </label>
              </div>

              {formData.tieneRendimiento && (
                <>
                  <div><label className="block text-xs font-medium text-blue-700 mb-1">Rendimiento (m² por {formData.unidad})</label><input type="number" step="0.1" value={formData.rendimiento || ''} onChange={e=>setFormData({...formData, rendimiento: parseFloat(e.target.value)})} className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50" /></div>
                  <div><label className="block text-xs font-medium text-blue-700 mb-1">Espesor Recomendado</label><input placeholder="Ej. 4 a 6 milésimas" value={formData.espesorRecomendado || ''} onChange={e=>setFormData({...formData, espesorRecomendado: e.target.value})} className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50" /></div>
                  <div><label className="block text-xs font-medium text-blue-700 mb-1">Pasadas Recomendadas</label><input placeholder="Ej. 1 a 2 manos" value={formData.manosRecomendadas || ''} onChange={e=>setFormData({...formData, manosRecomendadas: e.target.value})} className="w-full p-2 border border-blue-200 rounded text-sm bg-blue-50" /></div>
                </>
              )}

              <div className="col-span-full border-t pt-4 mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-green-700 mb-1">Pros (Ventajas)</label><input placeholder="Ej. Secado súper rápido" value={formData.pros || ''} onChange={e=>setFormData({...formData, pros: e.target.value})} className="w-full p-2 border border-green-200 rounded text-sm bg-green-50" /></div>
                <div><label className="block text-xs font-bold text-orange-700 mb-1">Cons (Limitantes)</label><input placeholder="Ej. Sensible a la humedad" value={formData.cons || ''} onChange={e=>setFormData({...formData, cons: e.target.value})} className="w-full p-2 border border-orange-200 rounded text-sm bg-orange-50" /></div>
                <div><label className="block text-xs font-bold text-red-700 mb-1">Cuidado con (Advertencias)</label><input placeholder="Ej. No usar en asfalto" value={formData.cuidadoCon || ''} onChange={e=>setFormData({...formData, cuidadoCon: e.target.value})} className="w-full p-2 border border-red-200 rounded text-sm bg-red-50" /></div>
              </div>

              <div className="col-span-full flex justify-end mt-4">
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Guardar Producto</button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de productos */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-500">Conectando con Supabase...</div>
          ) : productos.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Supabase no configurado o base vacía</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                No pudimos cargar productos. Por favor asegúrate de haber pegado tus credenciales en <code>src/supabase.ts</code>.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">Producto</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Precio</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Rendimiento</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {productos.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.nombre}</div>
                        <div className="text-xs text-gray-400">{p.nota}</div>
                      </td>
                      <td className="px-4 py-3">${p.precio} {p.moneda} / {p.unidad}</td>
                      <td className="px-4 py-3">
                        {p.tieneRendimiento ? `${p.rendimiento} m²` : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700 font-medium text-xs">
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
