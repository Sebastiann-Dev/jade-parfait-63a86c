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
  cuidadoCon: '',
  kitInfo: '',
  proporcionesMezcla: ''
}

function AdminPage() {
  const [productos, setProductos] = useState<(Producto & {id: string})[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<any>(DEFAULT_PRODUCTO)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'ok'|'error'} | null>(null)
  const [tipoCambio, setTipoCambio] = useState<number>(17.5)

  // Kit presentations state variables
  const [esKitProduct, setEsKitProduct] = useState(false)
  const [kitPresentaciones, setKitPresentaciones] = useState<any[]>([])
  const [newKitNombre, setNewKitNombre] = useState('')
  const [newKitPrecio, setNewKitPrecio] = useState('')
  const [newKitMoneda, setNewKitMoneda] = useState<'MXN'|'USD'>('MXN')

  async function loadProductos() {
    setLoading(true)
    const data = await fetchProductosSupabase()
    setProductos(data)
    setLoading(false)
  }

  useEffect(() => {
    loadProductos()
  }, [])

  useEffect(() => {
    async function fetchExchangeRate() {
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
            return
          }
        } catch (e) {
          console.warn(`Failed to fetch exchange rate from ${url}:`, e)
        }
      }
    }
    fetchExchangeRate()
  }, [])

  function showMsg(texto: string, tipo: 'ok'|'error') {
    setMensaje({texto, tipo})
    setTimeout(() => setMensaje(null), 4000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: Omit<Producto, 'id'> = {
        nombre: formData.nombre,
        cantRef: Number(formData.cantRef),
        unidad: formData.unidad,
        moneda: formData.moneda,
        precio: Number(formData.precio),
        tieneRendimiento: !!formData.tieneRendimiento,
        nota: formData.nota || '',
        rendimiento: (formData.tieneRendimiento && formData.rendimiento !== '') ? Number(formData.rendimiento) : undefined,
        espesorRecomendado: formData.espesorRecomendado || undefined,
        manosRecomendadas: formData.manosRecomendadas || undefined,
        pros: formData.pros || undefined,
        cons: formData.cons || undefined,
        cuidadoCon: formData.cuidadoCon || undefined,
        kitInfo: esKitProduct ? JSON.stringify(kitPresentaciones) : undefined,
        proporcionesMezcla: formData.proporcionesMezcla || undefined
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
      setEsKitProduct(false)
      setKitPresentaciones([])
      setNewKitNombre('')
      setNewKitPrecio('')
      setNewKitMoneda('MXN')
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
    setEsKitProduct(false)
    setKitPresentaciones([])
    setNewKitNombre('')
    setNewKitPrecio('')
    setNewKitMoneda('MXN')
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
      cuidadoCon: p.cuidadoCon || '',
      kitInfo: p.kitInfo || '',
      proporcionesMezcla: p.proporcionesMezcla || ''
    })

    let presentations: any[] = []
    let isKit = false
    if (p.kitInfo) {
      try {
        if (p.kitInfo.startsWith('[')) {
          presentations = JSON.parse(p.kitInfo)
          isKit = presentations.length > 0
        } else {
          presentations = [{ nombre: p.kitInfo, precio: p.precio || 0, moneda: p.moneda || 'MXN' }]
          isKit = true
        }
      } catch (e) {}
    }
    setEsKitProduct(isKit)
    setKitPresentaciones(presentations)
    setNewKitNombre('')
    setNewKitPrecio('')
    setNewKitMoneda('MXN')

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
              onClick={() => {
                if (showForm) {
                  handleCancel()
                } else {
                  setEditingId(null)
                  setFormData(DEFAULT_PRODUCTO)
                  setEsKitProduct(false)
                  setKitPresentaciones([])
                  setNewKitNombre('')
                  setNewKitPrecio('')
                  setNewKitMoneda('MXN')
                  setShowForm(true)
                }
              }}
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
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px'}}>
              <h2 style={{margin:0, fontSize:'17px', fontWeight:700, color:'#1e40af'}}>
                {editingId ? '✏️ Editar Producto' : '➕ Agregar Nuevo Producto'}
              </h2>
              <button
                type="button"
                onClick={handleCancel}
                style={{padding:'6px 12px', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', fontSize:'13px', fontWeight:600, cursor:'pointer'}}
              >
                ✕ Cancelar
              </button>
            </div>

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
                <option value="">-- Seleccionar producto para editar --</option>
                {productos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <form onSubmit={handleSubmit} style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px', alignItems:'start'}}>

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

              {/* Kit y Mezcla */}
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                <h3 style={{fontSize:'14px', fontWeight:700, color:'#7c3aed', marginBottom: '12px'}}>📦 Configuración de Kit y Mezcla</h3>
                
                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px', marginBottom: '12px', alignItems:'start'}}>
                  <div>
                    <label style={{...labelStyle, color:'#0369a1'}}>🧪 Proporciones de Mezcla</label>
                    <input
                      placeholder="Ej: 2:1 (Parte A : Parte B) · 3:1:0.5 si es tricomponente"
                      value={formData.proporcionesMezcla || ''}
                      onChange={e => setFormData({...formData, proporcionesMezcla: e.target.value})}
                      style={{...inputStyle, borderColor:'#7dd3fc', background:'#f0f9ff'}}
                    />
                    <span style={{fontSize:'11px', color:'#0369a1', marginTop:'3px', display:'block'}}>Para bicomponentes y tricomponentes</span>
                  </div>
                  
                  <div>
                    <label style={{...labelStyle, color:'#7c3aed'}}>¿Este producto se vende en diferentes presentaciones (Kit)?</label>
                    <div style={{display:'flex', gap:'12px', alignItems:'center', height:'38px'}}>
                      <label style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px'}}>
                        <input
                          type="checkbox"
                          checked={esKitProduct}
                          onChange={(e) => setEsKitProduct(e.target.checked)}
                        />
                        Sí, configurar presentaciones de kit
                      </label>
                    </div>
                  </div>
                </div>

                {esKitProduct && (
                  <div style={{background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:'8px', padding:'16px', marginBottom:'16px'}}>
                    <h4 style={{margin:'0 0 12px', fontSize:'13px', fontWeight:700, color:'#6d28d9'}}>Presentaciones del Kit</h4>
                    
                    {/* List of presentations table */}
                    {kitPresentaciones.length > 0 ? (
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'12px', background:'white', borderRadius:'6px', overflow:'hidden', marginBottom:'12px', border:'1px solid #e2e8f0'}}>
                        <thead>
                          <tr style={{background:'#f3f4f6', borderBottom:'1px solid #e2e8f0'}}>
                            <th style={{padding:'6px 12px', textAlign:'left'}}>Presentación / Nombre</th>
                            <th style={{padding:'6px 12px', textAlign:'left'}}>Precio</th>
                            <th style={{padding:'6px 12px', textAlign:'left'}}>Moneda</th>
                            <th style={{padding:'6px 12px', textAlign:'right'}}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kitPresentaciones.map((pres, idx) => (
                            <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                              <td style={{padding:'6px 12px', fontWeight:600}}>{pres.nombre}</td>
                              <td style={{padding:'6px 12px'}}>${pres.precio}</td>
                              <td style={{padding:'6px 12px'}}>{pres.moneda}</td>
                              <td style={{padding:'6px 12px', textAlign:'right'}}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = kitPresentaciones.filter((_, i) => i !== idx);
                                    setKitPresentaciones(updated);
                                    setFormData({...formData, kitInfo: JSON.stringify(updated)});
                                  }}
                                  style={{padding:'2px 8px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer'}}
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{padding:'12px', textAlign:'center', color:'#7c3aed', background:'white', borderRadius:'6px', border:'1px dashed #c4b5fd', marginBottom:'12px', fontSize:'12px'}}>
                        No hay presentaciones agregadas aún. Añade una abajo.
                      </div>
                    )}

                    {/* Add new presentation form */}
                    <div style={{display:'flex', gap:'8px', alignItems:'flex-end', flexWrap:'wrap'}}>
                      <div style={{flex:'2 1 180px'}}>
                        <label style={{fontSize:'11px', fontWeight:600, color:'#6d28d9', display:'block', marginBottom:'2px'}}>Nombre / Tamaño</label>
                        <input
                          type="text"
                          value={newKitNombre}
                          onChange={e => setNewKitNombre(e.target.value)}
                          placeholder="Ej. Kit 3L"
                          style={{...inputStyle, height:'32px', padding:'4px 8px', fontSize:'12px'}}
                        />
                      </div>
                      <div style={{flex:'1 1 100px'}}>
                        <label style={{fontSize:'11px', fontWeight:600, color:'#6d28d9', display:'block', marginBottom:'2px'}}>Precio</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newKitPrecio}
                          onChange={e => setNewKitPrecio(e.target.value)}
                          placeholder="0.00"
                          style={{...inputStyle, height:'32px', padding:'4px 8px', fontSize:'12px'}}
                        />
                      </div>
                      <div style={{width:'80px'}}>
                        <label style={{fontSize:'11px', fontWeight:600, color:'#6d28d9', display:'block', marginBottom:'2px'}}>Moneda</label>
                        <select
                          value={newKitMoneda}
                          onChange={e => setNewKitMoneda(e.target.value as 'MXN' | 'USD')}
                          style={{...inputStyle, height:'32px', padding:'4px 8px', fontSize:'12px'}}
                        >
                          <option value="MXN">MXN</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newKitNombre || !newKitPrecio) return;
                          const newItem = {
                            nombre: newKitNombre,
                            precio: parseFloat(newKitPrecio) || 0,
                            moneda: newKitMoneda
                          };
                          const updated = [...kitPresentaciones, newItem];
                          setKitPresentaciones(updated);
                          setFormData({...formData, kitInfo: JSON.stringify(updated)});
                          setNewKitNombre('');
                          setNewKitPrecio('');
                        }}
                        style={{height:'32px', padding:'0 16px', background:'#7c3aed', color:'white', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer'}}
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>
                )}
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
                    <th style={thStyle}>Kit</th>
                    <th style={thStyle}>Rendimiento</th>
                    <th style={thStyle}>Nota</th>
                    <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                      <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>
                        {p.nombre}
                        {p.kitInfo && p.kitInfo.startsWith('[') && (
                          <div style={{fontSize:'11px', fontWeight:400, color:'#7c3aed', marginTop:'4px'}}>
                            📦 Presentaciones: {JSON.parse(p.kitInfo).map((k: any) => `${k.nombre} (${k.moneda === 'USD' ? '≈$' : '$'}${k.precio} ${k.moneda})`).join(' · ')}
                          </div>
                        )}
                        {p.proporcionesMezcla && (
                          <div style={{fontSize:'11px', fontWeight:400, color:'#0369a1', marginTop:'2px'}}>
                            🧪 Mezcla: {p.proporcionesMezcla}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {p.moneda === 'USD' ? (
                          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                            <div>
                              <span style={{fontWeight:700, color:'#0369a1'}}>USD ≈${(Number(p.precio) || 0).toFixed(2)}</span>
                            </div>
                            <div>
                              <span style={{fontSize:'11px', color:'#166534', fontWeight:500}}>MXN ≈${( (Number(p.precio) || 0) * tipoCambio ).toFixed(2)}</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                            <div>
                              <span style={{fontWeight:700, color:'#166534'}}>MXN ${(Number(p.precio) || 0).toFixed(2)}</span>
                            </div>
                            <div>
                              <span style={{fontSize:'11px', color:'#0369a1', fontWeight:500}}>USD ≈${( (Number(p.precio) || 0) / tipoCambio ).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>{p.unidad}</td>
                      <td style={tdStyle}>
                        {p.kitInfo && p.kitInfo.startsWith('[') ? (
                          <span style={{color: '#7c3aed', fontWeight: 600}}>
                            {JSON.parse(p.kitInfo).map((k: any) => k.nombre).join(', ')}
                          </span>
                        ) : (
                          p.kitInfo || <span style={{color:'#cbd5e1'}}>—</span>
                        )}
                      </td>
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

        {/* Footer legend */}
        <footer style={{marginTop:'32px', padding:'24px 0 12px', borderTop:'1px solid #e2e8f0', textAlign:'center', fontSize:'12px', color:'#64748b', lineHeight:'1.6'}}>
          <p style={{margin:0, fontWeight:700, color:'#475569'}}>⚠️ Nota Importante sobre el Tipo de Cambio:</p>
          <p style={{margin:'4px 0 0'}}>El valor del dólar es el aproximado y el único oficial es el del Diario Oficial de la Federación (DOF).</p>
          <p style={{margin:'4px 0 0', color:'#d97706', fontWeight:600}}>Se sugiere confirmar de manera manual antes de pasarlo así.</p>
        </footer>

      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  minHeight: '34px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '4px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '38px',
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
