import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { fetchProductosSupabase, saveProductoSupabase, deleteProductoSupabase, updateProductoSupabase } from '../supabase'
import { Producto } from '../data/productos'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

const DEFAULT_PRODUCTO: Omit<Producto, 'id'> & { cantRef: number | string; precio: number | string; rendimiento: number | string } = {
  nombre: '',
  cantRef: '',
  unidad: 'L',
  moneda: 'MXN',
  precio: '',
  tieneRendimiento: false,
  nota: '',
  rendimiento: '',
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
  const [formData, setFormData] = useState<any>(DEFAULT_PRODUCTO)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'ok'|'error'} | null>(null)

  async function loadProductos() {
    setLoading(true)
    const data = await fetchProductosSupabase()
    setProductos(data)
    setLoading(false)
  }

  useEffect(() => {
    loadProductos()
  }, [])

  function showMsg(texto: string, tipo: 'ok'|'error') {
    setMensaje({texto, tipo})
    setTimeout(() => setMensaje(null), 4000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...formData,
        cantRef: formData.cantRef === '' ? null : Number(formData.cantRef),
        precio: formData.precio === '' ? null : Number(formData.precio),
        rendimiento: formData.rendimiento === '' ? null : Number(formData.rendimiento),
      }
      if (editingId) {
        await updateProductoSupabase(editingId, payload)
        showMsg('✅ Producto actualizado con éxito', 'ok')
      } else {
        await saveProductoSupabase(payload)
        showMsg('✅ Producto guardado en la base de datos', 'ok')
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(DEFAULT_PRODUCTO)
      loadProductos()
    } catch (error) {
      showMsg('❌ Error al guardar. Verifica tu conexión con Supabase.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setFormData(DEFAULT_PRODUCTO)
  }

  function handleEdit(p: Producto & {id: string}) {
    setFormData({
      nombre: p.nombre,
      cantRef: p.cantRef ?? '',
      unidad: p.unidad,
      moneda: p.moneda,
      precio: p.precio ?? '',
      tieneRendimiento: p.tieneRendimiento,
      nota: p.nota || '',
      rendimiento: p.rendimiento ?? '',
      espesorRecomendado: p.espesorRecomendado || '',
      manosRecomendadas: p.manosRecomendadas || '',
      pros: p.pros || '',
      cons: p.cons || '',
      cuidadoCon: p.cuidadoCon || ''
    })
    setEditingId(p.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, nombre: string) {
    if (confirm(`¿Seguro que deseas eliminar "${nombre}"?`)) {
      await deleteProductoSupabase(id)
      showMsg('🗑️ Producto eliminado', 'ok')
      loadProductos()
    }
  }

  return (
    <div style={{minHeight:'100vh', background:'#f8fafc', padding:'24px', fontFamily:'sans-serif'}}>
      <div style={{maxWidth:'1100px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'20px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'white', padding:'16px 24px', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
          <div>
            <h1 style={{margin:0, fontSize:'20px', fontWeight:700, color:'#1e293b'}}>Panel de Administración — BUCA</h1>
            <p style={{margin:'4px 0 0', fontSize:'13px', color:'#64748b'}}>
              {loading ? 'Cargando...' : `${productos.length} productos en la base de datos`}
            </p>
          </div>
          <div style={{display:'flex', gap:'12px'}}>
            <button
              onClick={() => showForm ? handleCancel() : setShowForm(true)}
              style={{padding:'8px 16px', background: showForm ? '#ef4444' : '#2563eb', color:'white', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:600, cursor:'pointer'}}
            >
              {showForm ? '✕ Cancelar' : '+ Nuevo Producto'}
            </button>
            <Link to="/" style={{padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', color:'#374151', textDecoration:'none', background:'white'}}>
              ← Ir al Cotizador
            </Link>
          </div>
        </div>

        {/* Mensaje de estado */}
        {mensaje && (
          <div style={{padding:'12px 20px', borderRadius:'8px', background: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', fontWeight:600, fontSize:'14px'}}>
            {mensaje.texto}
          </div>
        )}

        {/* Formulario */}
        {showForm && (
          <div style={{background:'white', padding:'24px', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', border:'1px solid #bfdbfe'}}>
            <h2 style={{margin:'0 0 16px', fontSize:'17px', fontWeight:700, color:'#1e40af'}}>
              {editingId ? '✏️ Editar Producto' : '➕ Agregar Nuevo Producto'}
            </h2>

            {/* Selector de producto existente */}
            <div style={{background:'#eff6ff', padding:'16px', borderRadius:'8px', marginBottom:'20px', border:'1px solid #bfdbfe'}}>
              <label style={{display:'block', fontSize:'13px', fontWeight:700, color:'#1d4ed8', marginBottom:'8px'}}>
                ¿Quieres editar un producto existente? Selecciónalo aquí:
              </label>
              <select
                style={{width:'100%', padding:'8px', border:'1px solid #93c5fd', borderRadius:'6px', fontSize:'13px', background:'white'}}
                value={editingId || ''}
                onChange={(e) => {
                  const p = productos.find(prod => prod.id === e.target.value)
                  if (p) {
                    handleEdit(p)
                  } else {
                    setEditingId(null)
                    setFormData(DEFAULT_PRODUCTO)
                  }
                }}
              >
                <option value="">-- Crear Nuevo Producto --</option>
                {productos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <form onSubmit={handleSubmit} style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px'}}>

              <div>
                <label style={labelStyle}>Nombre del Producto *</label>
                <input required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputStyle} placeholder="Ej. BucaTrafic" />
              </div>

              <div>
                <label style={labelStyle}>Unidad</label>
                <select value={formData.unidad} onChange={e => setFormData({...formData, unidad: e.target.value})} style={inputStyle}>
                  <option value="L">L (Litros)</option>
                  <option value="Gal">Gal (Galones)</option>
                  <option value="Kg">Kg (Kilogramos)</option>
                  <option value="Cubeta">Cubeta</option>
                  <option value="Saco">Saco</option>
                  <option value="Kit">Kit</option>
                  <option value="Pieza">Pieza</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Moneda</label>
                <select value={formData.moneda} onChange={e => setFormData({...formData, moneda: e.target.value as 'MXN'|'USD'})} style={inputStyle}>
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Precio Unitario *</label>
                <input type="number" step="0.01" required value={formData.precio} onChange={e => setFormData({...formData, precio: e.target.value})} style={inputStyle} placeholder="0.00" />
              </div>

              <div>
                <label style={labelStyle}>Cantidad de Referencia (tamaño del envase)</label>
                <input type="number" step="0.1" required value={formData.cantRef} onChange={e => setFormData({...formData, cantRef: e.target.value})} style={inputStyle} placeholder="Ej. 19 (litros)" />
              </div>

              <div>
                <label style={labelStyle}>Descripción / Nota</label>
                <input value={formData.nota} onChange={e => setFormData({...formData, nota: e.target.value})} style={inputStyle} placeholder="Ej. Tráfico vehicular" />
              </div>

              {/* Rendimiento */}
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'14px', fontWeight:500}}>
                  <input type="checkbox" checked={formData.tieneRendimiento} onChange={e => setFormData({...formData, tieneRendimiento: e.target.checked})} />
                  ¿Este producto se calcula por metros cuadrados (rendimiento)?
                </label>
              </div>

              {formData.tieneRendimiento && (
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Rendimiento (m² por {formData.unidad})</label>
                  <input type="number" step="0.1" value={formData.rendimiento} onChange={e => setFormData({...formData, rendimiento: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} placeholder="Ej. 5" />
                </div>
              )}

              {/* Especificaciones técnicas */}
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Espesor Recomendado</label>
                  <input placeholder="Ej. 4 a 6 milésimas" value={formData.espesorRecomendado || ''} onChange={e => setFormData({...formData, espesorRecomendado: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                </div>
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Manos / Pasadas Recomendadas</label>
                  <input placeholder="Ej. 1 a 2 manos" value={formData.manosRecomendadas || ''} onChange={e => setFormData({...formData, manosRecomendadas: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                </div>
              </div>

              {/* Pros / Cons */}
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px'}}>
                <div>
                  <label style={{...labelStyle, color:'#166534'}}>✅ Pros (Ventajas)</label>
                  <input placeholder="Ej. Secado rápido" value={formData.pros || ''} onChange={e => setFormData({...formData, pros: e.target.value})} style={{...inputStyle, borderColor:'#86efac', background:'#f0fdf4'}} />
                </div>
                <div>
                  <label style={{...labelStyle, color:'#9a3412'}}>⚠️ Cons (Limitantes)</label>
                  <input placeholder="Ej. Sensible a humedad" value={formData.cons || ''} onChange={e => setFormData({...formData, cons: e.target.value})} style={{...inputStyle, borderColor:'#fdba74', background:'#fff7ed'}} />
                </div>
                <div>
                  <label style={{...labelStyle, color:'#991b1b'}}>🚫 Cuidado con</label>
                  <input placeholder="Ej. No usar en asfalto" value={formData.cuidadoCon || ''} onChange={e => setFormData({...formData, cuidadoCon: e.target.value})} style={{...inputStyle, borderColor:'#fca5a5', background:'#fef2f2'}} />
                </div>
              </div>

              <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end', paddingTop:'8px'}}>
                <button type="submit" disabled={saving} style={{padding:'10px 28px', background: saving ? '#94a3b8' : '#2563eb', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer'}}>
                  {saving ? 'Guardando...' : (editingId ? '💾 Guardar Cambios' : '💾 Guardar Producto')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de productos */}
        <div style={{background:'white', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'}}>
          {loading ? (
            <div style={{padding:'60px', textAlign:'center', color:'#64748b'}}>Conectando con Supabase...</div>
          ) : productos.length === 0 ? (
            <div style={{padding:'60px', textAlign:'center'}}>
              <div style={{fontSize:'48px', marginBottom:'12px'}}>📦</div>
              <h3 style={{color:'#1e293b', margin:'0 0 8px'}}>No hay productos aún</h3>
              <p style={{color:'#64748b', fontSize:'14px'}}>La migración debería haber creado los productos automáticamente. Verifica que la integración de Supabase con GitHub esté activa.</p>
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                <thead>
                  <tr style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
                    <th style={thStyle}>Producto</th>
                    <th style={thStyle}>Precio</th>
                    <th style={thStyle}>Unidad</th>
                    <th style={thStyle}>Rendimiento</th>
                    <th style={thStyle}>Nota</th>
                    <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                      <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>{p.nombre}</td>
                      <td style={tdStyle}>
                        <span style={{fontWeight:700, color: p.moneda === 'USD' ? '#0369a1' : '#166534'}}>
                          ${p.precio}
                        </span>
                        <span style={{color:'#94a3b8', fontSize:'11px', marginLeft:'4px'}}>{p.moneda}</span>
                      </td>
                      <td style={tdStyle}>{p.unidad}</td>
                      <td style={tdStyle}>
                        {p.tieneRendimiento ? `${p.rendimiento} m²/${p.unidad}` : <span style={{color:'#cbd5e1'}}>—</span>}
                      </td>
                      <td style={{...tdStyle, color:'#64748b', maxWidth:'200px'}}>{p.nota}</td>
                      <td style={{...tdStyle, textAlign:'right', whiteSpace:'nowrap'}}>
                        <button
                          onClick={() => handleEdit(p)}
                          style={{padding:'4px 12px', background:'#dbeafe', color:'#1d4ed8', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer', marginRight:'8px'}}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.nombre)}
                          style={{padding:'4px 12px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer'}}
                        >
                          🗑️ Eliminar
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  boxSizing: 'border-box',
  background: 'white'
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#374151',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#374151',
  transition: 'background 0.15s'
}
