import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { 
  fetchProductosSupabase, 
  saveProductoSupabase, 
  deleteProductoSupabase, 
  updateProductoSupabase, 
  supabase,
  fetchSistemasSupabase,
  fetchSistemaProductosSupabase,
  saveSistemaSupabase,
  updateSistemaSupabase,
  deleteSistemaSupabase,
  type Sistema,
  type SistemaProducto
} from '../supabase'
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
  proporcionesMezcla: '',
  densidadRecomendada: '',
  bitacora: '',
  ficha_tecnica_url: '',
  ficha_seguridad_url: ''
}

function parseKitInfo(kitInfoStr?: string): { numPartes: number; presentaciones: any[] } {
  if (!kitInfoStr) return { numPartes: 2, presentaciones: [] }
  try {
    if (kitInfoStr.startsWith('{')) {
      const parsed = JSON.parse(kitInfoStr)
      return {
        numPartes: parsed.numPartes || 2,
        presentaciones: parsed.presentaciones || []
      }
    } else if (kitInfoStr.startsWith('[')) {
      const list = JSON.parse(kitInfoStr)
      return {
        numPartes: 2,
        presentaciones: list || []
      }
    }
  } catch (e) {
    console.error("Error parsing kitInfo:", e)
  }
  return { numPartes: 2, presentaciones: [] }
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

  // Auth state variables
  const [user, setUser] = useState<any>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authIsSignUp, setAuthIsSignUp] = useState(false)

  // Kit presentations state variables
  const [esKitProduct, setEsKitProduct] = useState(false)
  const [kitPresentaciones, setKitPresentaciones] = useState<any[]>([])
  const [newKitNombre, setNewKitNombre] = useState('')
  const [newKitPrecio, setNewKitPrecio] = useState('')
  const [newKitMoneda, setNewKitMoneda] = useState<'MXN'|'USD'>('MXN')
  const [numPartesKit, setNumPartesKit] = useState<number>(2)
  const [partesLtrs, setPartesLtrs] = useState<string[]>(['', '', '', ''])
  const [numPresentacionesKit, setNumPresentacionesKit] = useState<number>(1)

  // Automatically adjust and size kit presentations array based on selections
  useEffect(() => {
    if (!esKitProduct) return
    setKitPresentaciones(prev => {
      let updated = [...prev]
      // 1. Adjust number of presentations
      if (updated.length < numPresentacionesKit) {
        const padding = Array.from({ length: numPresentacionesKit - updated.length }).map(() => ({
          nombre: '',
          precio: '',
          moneda: 'MXN',
          partes: Array(numPartesKit).fill('')
        }))
        updated = [...updated, ...padding]
      } else if (updated.length > numPresentacionesKit) {
        updated = updated.slice(0, numPresentacionesKit)
      }

      // 2. Adjust number of parts for each presentation
      updated = updated.map(pres => {
        const currentPartes = pres.partes || []
        let newPartes = [...currentPartes]
        if (newPartes.length < numPartesKit) {
          const padLen = numPartesKit - newPartes.length
          newPartes = [...newPartes, ...Array(padLen).fill('')]
        } else if (newPartes.length > numPartesKit) {
          newPartes = newPartes.slice(0, numPartesKit)
        }
        return { ...pres, partes: newPartes }
      })

      return updated
    })
  }, [numPresentacionesKit, numPartesKit, esKitProduct])

  function updatePresentacion(idx: number, field: string, value: any) {
    setKitPresentaciones(prev => {
      const updated = [...prev]
      if (!updated[idx]) {
        updated[idx] = { nombre: '', precio: '', moneda: 'MXN', partes: Array(numPartesKit).fill('') }
      }
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  function updateParte(idx: number, partIdx: number, value: any) {
    setKitPresentaciones(prev => {
      const updated = [...prev]
      if (!updated[idx]) {
        updated[idx] = { nombre: '', precio: '', moneda: 'MXN', partes: Array(numPartesKit).fill('') }
      }
      const newPartes = [...(updated[idx].partes || [])]
      newPartes[partIdx] = value
      updated[idx] = { ...updated[idx], partes: newPartes }
      return updated
    })
  }

  async function loadProductos() {
    setLoading(true)
    const data = await fetchProductosSupabase()
    setProductos(data)
    setLoading(false)
  }

  // Systems state variables
  const [currentTab, setCurrentTab] = useState<'productos' | 'sistemas'>('productos')
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loadingSistemas, setLoadingSistemas] = useState(false)
  const [showSistemaForm, setShowSistemaForm] = useState(false)
  const [editingSistemaId, setEditingSistemaId] = useState<string | null>(null)
  
  const DEFAULT_SISTEMA = {
    nombre: '',
    descripcion: '',
    productos: [] as { producto_id: string; consumo_por_m2: string; orden: string }[]
  }
  const [sistemaFormData, setSistemaFormData] = useState(DEFAULT_SISTEMA)

  async function loadSistemas() {
    setLoadingSistemas(true)
    const data = await fetchSistemasSupabase()
    setSistemas(data)
    setLoadingSistemas(false)
  }

  async function handleSistemaSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sistemaFormData.nombre.trim()) {
      showMsg('❌ El nombre del sistema es obligatorio', 'error')
      return
    }
    const validProds = sistemaFormData.productos
      .filter(p => p.producto_id && parseFloat(p.consumo_por_m2) > 0)
      .map(p => ({
        producto_id: p.producto_id,
        consumo_por_m2: parseFloat(p.consumo_por_m2) || 0,
        orden: parseInt(p.orden) || 0
      }))

    setSaving(true)
    try {
      if (editingSistemaId) {
        await updateSistemaSupabase(editingSistemaId, sistemaFormData.nombre, sistemaFormData.descripcion, validProds)
        showMsg('✅ Sistema actualizado con éxito', 'ok')
      } else {
        await saveSistemaSupabase(sistemaFormData.nombre, sistemaFormData.descripcion, validProds)
        showMsg('✅ Sistema guardado con éxito', 'ok')
      }
      setShowSistemaForm(false)
      setEditingSistemaId(null)
      setSistemaFormData(DEFAULT_SISTEMA)
      loadSistemas()
    } catch (err) {
      showMsg('❌ Error al guardar el sistema', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSistemaEdit(sys: Sistema) {
    setSaving(true)
    try {
      const rels = await fetchSistemaProductosSupabase(sys.id)
      setSistemaFormData({
        nombre: sys.nombre,
        descripcion: sys.descripcion || '',
        productos: rels.map(r => ({
          producto_id: r.producto_id,
          consumo_por_m2: String(r.consumo_por_m2),
          orden: String(r.orden)
        }))
      })
      setEditingSistemaId(sys.id)
      setShowSistemaForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      showMsg('❌ Error al cargar los detalles del sistema', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSistemaDelete(id: string, nombre: string) {
    if (confirm(`¿Seguro que deseas eliminar el sistema "${nombre}"?`)) {
      setLoadingSistemas(true)
      try {
        await deleteSistemaSupabase(id)
        showMsg('🗑️ Sistema eliminado', 'ok')
        loadSistemas()
      } catch (err) {
        showMsg('❌ Error al eliminar el sistema', 'error')
      } finally {
        setLoadingSistemas(false)
      }
    }
  }

  function handleSistemaCancel() {
    setShowSistemaForm(false)
    setEditingSistemaId(null)
    setSistemaFormData(DEFAULT_SISTEMA)
  }

  function agregarProductoAlSistema() {
    setSistemaFormData(prev => ({
      ...prev,
      productos: [
        ...prev.productos,
        {
          producto_id: productos[0]?.id || '',
          consumo_por_m2: '0.1',
          orden: String(prev.productos.length + 1)
        }
      ]
    }))
  }

  function eliminarProductoDelSistema(idx: number) {
    setSistemaFormData(prev => ({
      ...prev,
      productos: prev.productos.filter((_, i) => i !== idx)
    }))
  }

  function actualizarProductoEnSistema(idx: number, field: string, value: string) {
    setSistemaFormData(prev => {
      const updated = [...prev.productos]
      updated[idx] = { ...updated[idx], [field]: value }
      return { ...prev, productos: updated }
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadProductos()
      loadSistemas()
    }
  }, [user])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      if (authIsSignUp) {
        if (!authEmail.endsWith('@bucamx.com')) {
          throw new Error('El correo debe terminar en @bucamx.com')
        }
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        })
        if (error) throw error
        
        if (data?.session) {
          showMsg('✅ Registro e inicio de sesión exitoso.', 'ok')
        } else {
          showMsg('✅ Cuenta registrada exitosamente.', 'ok')
          setAuthIsSignUp(false)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setAuthError(err.message || 'Credenciales incorrectas. Intenta de nuevo.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
  }

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
        kitInfo: esKitProduct ? (() => {
          const validPresentaciones = kitPresentaciones
            .filter(pres => pres && pres.nombre && pres.precio !== '')
            .map(pres => ({
              nombre: pres.nombre,
              precio: parseFloat(pres.precio) || 0,
              moneda: pres.moneda || 'MXN',
              partes: (pres.partes || []).map((val: any) => parseFloat(val) || 0)
            }))
          return validPresentaciones.length > 0
            ? JSON.stringify({ numPartes: numPartesKit, presentaciones: validPresentaciones })
            : undefined
        })() : undefined,
        proporcionesMezcla: formData.proporcionesMezcla || undefined,
        densidadRecomendada: formData.densidadRecomendada || undefined,
        bitacora: formData.bitacora || undefined,
        ficha_tecnica_url: formData.ficha_tecnica_url || undefined,
        ficha_seguridad_url: formData.ficha_seguridad_url || undefined
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
      setNumPartesKit(2)
      setPartesLtrs(['', '', '', ''])
      setNumPresentacionesKit(1)
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
    setNumPartesKit(2)
    setPartesLtrs(['', '', '', ''])
    setNumPresentacionesKit(1)
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
      proporcionesMezcla: p.proporcionesMezcla || '',
      densidadRecomendada: p.densidadRecomendada || '',
      bitacora: p.bitacora || '',
      ficha_tecnica_url: p.ficha_tecnica_url || '',
      ficha_seguridad_url: p.ficha_seguridad_url || ''
    })

    const parsed = parseKitInfo(p.kitInfo)
    setEsKitProduct(parsed.presentaciones.length > 0)
    setNumPartesKit(parsed.numPartes)
    setNumPresentacionesKit(parsed.presentaciones.length || 1)
    setKitPresentaciones(parsed.presentaciones)
    setNewKitNombre('')
    setNewKitPrecio('')
    setNewKitMoneda('MXN')
    setPartesLtrs(['', '', '', ''])

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

  if (!user) {
    return (
      <div style={{minHeight:'100vh', background:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:'sans-serif'}}>
        <div style={{maxWidth:'400px', width:'100%', background:'white', padding:'32px', borderRadius:'16px', boxShadow:'0 10px 25px -5px rgba(37, 99, 235, 0.1), 0 8px 10px -6px rgba(37, 99, 235, 0.1)', border:'1px solid #bfdbfe', margin:'auto'}}>
          <div style={{textAlign:'center', marginBottom:'24px'}}>
            <div style={{width:'48px', height:'48px', background:'#2563eb', color:'white', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'12px', fontSize:'20px', fontWeight:800, margin:'0 auto 12px'}}>🔐</div>
            <h1 style={{margin:0, fontSize:'20px', fontWeight:700, color:'#1e293b'}}>Panel de Administración</h1>
            <p style={{margin:'4px 0 0', fontSize:'13px', color:'#64748b'}}>Acceso exclusivo para personal autorizado</p>
          </div>

          {authError && (
            <div style={{background:'#fee2e2', color:'#991b1b', padding:'10px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, marginBottom:'16px'}}>
              ⚠️ {authError}
            </div>
          )}

          {mensaje && (
            <div style={{background:'#dcfce7', color:'#166534', padding:'10px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, marginBottom:'16px'}}>
              {mensaje.texto}
            </div>
          )}

          <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:'16px'}}>
            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:600, color:'#374151', marginBottom:'6px'}}>Correo Electrónico *</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder=""
                style={{width:'100%', height:'38px', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box'}}
              />
            </div>

            <div>
              <label style={{display:'block', fontSize:'12px', fontWeight:600, color:'#374151', marginBottom:'6px'}}>Contraseña *</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                style={{width:'100%', height:'38px', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box'}}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              style={{width:'100%', height:'40px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s'}}
            >
              {authLoading ? 'Procesando...' : (authIsSignUp ? 'Registrarse' : 'Iniciar Sesión')}
            </button>
          </form>

          <div style={{marginTop:'20px', textAlign:'center', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
            <button
              onClick={() => {
                setAuthIsSignUp(!authIsSignUp)
                setAuthError('')
              }}
              style={{background:'none', border:'none', color:'#2563eb', fontSize:'13px', fontWeight:600, cursor:'pointer'}}
            >
              {authIsSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
          </div>

          <div style={{marginTop:'12px', textAlign:'center'}}>
            <Link to="/" style={{fontSize:'12px', color:'#64748b', textDecoration:'none'}}>
              ← Volver al cotizador público
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh', background:'#f8fafc', padding:'24px', fontFamily:'sans-serif'}}>
      <div style={{maxWidth:'1100px', margin:'0 auto'}}>
        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'white', padding:'16px 24px', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'}}>
          <div>
            <h1 style={{margin:0, fontSize:'20px', fontWeight:700, color:'#1e293b'}}>Panel de Administración — BUCA</h1>
            <p style={{margin:'4px 0 0', fontSize:'13px', color:'#64748b'}}>
              {currentTab === 'productos' 
                ? (loading ? 'Cargando productos...' : `${productos.length} productos en la base de datos`)
                : (loadingSistemas ? 'Cargando sistemas...' : `${sistemas.length} sistemas en la base de datos`)}
            </p>
          </div>
          <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
            {currentTab === 'productos' ? (
              <button
                disabled={showForm}
                onClick={() => {
                  if (!showForm) {
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
                style={{
                  padding: '8px 16px',
                  background: showForm ? '#cbd5e1' : '#2563eb',
                  color: showForm ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: showForm ? 'not-allowed' : 'pointer',
                  opacity: showForm ? 0.7 : 1
                }}
              >
                + Nuevo Producto
              </button>
            ) : (
              <button
                disabled={showSistemaForm}
                onClick={() => {
                  if (!showSistemaForm) {
                    setEditingSistemaId(null)
                    setSistemaFormData(DEFAULT_SISTEMA)
                    setShowSistemaForm(true)
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: showSistemaForm ? '#cbd5e1' : '#7c3aed',
                  color: showSistemaForm ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: showSistemaForm ? 'not-allowed' : 'pointer',
                  opacity: showSistemaForm ? 0.7 : 1
                }}
              >
                + Nuevo Sistema
              </button>
            )}
            <Link to="/" style={{padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', color:'#374151', textDecoration:'none', background:'white'}}>
              ← Ir al Cotizador
            </Link>
            <button
              onClick={handleLogout}
              style={{padding:'8px 16px', background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'8px', fontSize:'14px', color:'#dc2626', fontWeight:600, cursor:'pointer'}}
            >
              🚪 Salir
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{display:'flex', gap:'12px', borderBottom:'1px solid #e2e8f0', paddingBottom:'8px', marginTop:'4px'}}>
          <button
            onClick={() => setCurrentTab('productos')}
            style={{
              padding: '8px 16px',
              background: currentTab === 'productos' ? '#2563eb' : 'transparent',
              color: currentTab === 'productos' ? 'white' : '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📦 Productos ({productos.length})
          </button>
          <button
            onClick={() => {
              setCurrentTab('sistemas');
              loadSistemas();
            }}
            style={{
              padding: '8px 16px',
              background: currentTab === 'sistemas' ? '#7c3aed' : 'transparent',
              color: currentTab === 'sistemas' ? 'white' : '#475569',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🧪 Sistemas Multicapa ({sistemas.length})
          </button>
        </div>

        {/* Mensaje de estado */}
        {mensaje && (
          <div style={{padding:'12px 20px', borderRadius:'8px', background: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', fontWeight:600, fontSize:'14px'}}>
            {mensaje.texto}
          </div>
        )}

        {/* Formulario */}
        {currentTab === 'productos' && showForm && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(37, 99, 235, 0.15), 0 10px 10px -5px rgba(37, 99, 235, 0.1)',
            border: '2px solid #3b82f6',
            transition: 'all 0.3s ease'
          }}>
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

              <div style={{gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px'}}>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <input value={formData.nota} onChange={e => setFormData({...formData, nota: e.target.value})} style={inputStyle} placeholder="Ej. Tráfico vehicular" />
                </div>
                <div>
                  <label style={labelStyle}>Bitácora</label>
                  <textarea
                    rows={3}
                    value={formData.bitacora || ''}
                    onChange={e => setFormData({...formData, bitacora: e.target.value})}
                    style={{
                      ...inputStyle,
                      height: 'auto',
                      minHeight: '80px',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                    placeholder="Notas internas, registro de cambios, etc."
                  />
                </div>
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
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px'}}>
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Espesor Recomendado</label>
                  <input placeholder="Ej. 4 a 6 milésimas" value={formData.espesorRecomendado || ''} onChange={e => setFormData({...formData, espesorRecomendado: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                </div>
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Manos / Pasadas Recomendadas</label>
                  <input placeholder="Ej. 1 a 2 manos" value={formData.manosRecomendadas || ''} onChange={e => setFormData({...formData, manosRecomendadas: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                </div>
                <div>
                  <label style={{...labelStyle, color:'#1d4ed8'}}>Densidad Recomendada</label>
                  <input placeholder="Ej. 1.8 kg/L" value={formData.densidadRecomendada || ''} onChange={e => setFormData({...formData, densidadRecomendada: e.target.value})} style={{...inputStyle, borderColor:'#93c5fd', background:'#eff6ff'}} />
                </div>
              </div>

              {/* Documentación técnica */}
              <div style={{gridColumn:'1 / -1', borderTop:'1px solid #f1f5f9', paddingTop:'16px'}}>
                <h3 style={{fontSize:'14px', fontWeight:700, color:'#0369a1', marginBottom:'12px'}}>📄 Documentación Técnica (PDFs)</h3>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
                  <div>
                    <label style={{...labelStyle, color:'#0369a1'}}>Ficha Técnica (TDS) — URL</label>
                    <input
                      type="url"
                      placeholder="https://...supabase.co/.../BucaTrafic-TDS.pdf"
                      value={formData.ficha_tecnica_url || ''}
                      onChange={e => setFormData({...formData, ficha_tecnica_url: e.target.value})}
                      style={{...inputStyle, borderColor:'#7dd3fc', background:'#f0f9ff'}}
                    />
                    {formData.ficha_tecnica_url && (
                      <a href={formData.ficha_tecnica_url} target="_blank" rel="noreferrer"
                        style={{fontSize:'11px', color:'#0369a1', display:'inline-block', marginTop:'4px'}}>
                        📄 Verificar enlace →
                      </a>
                    )}
                  </div>
                  <div>
                    <label style={{...labelStyle, color:'#0369a1'}}>Hoja de Seguridad (SDS) — URL</label>
                    <input
                      type="url"
                      placeholder="https://...supabase.co/.../BucaTrafic-SDS.pdf"
                      value={formData.ficha_seguridad_url || ''}
                      onChange={e => setFormData({...formData, ficha_seguridad_url: e.target.value})}
                      style={{...inputStyle, borderColor:'#7dd3fc', background:'#f0f9ff'}}
                    />
                    {formData.ficha_seguridad_url && (
                      <a href={formData.ficha_seguridad_url} target="_blank" rel="noreferrer"
                        style={{fontSize:'11px', color:'#0369a1', display:'inline-block', marginTop:'4px'}}>
                        🛡️ Verificar enlace →
                      </a>
                    )}
                  </div>
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
                    
                    {/* Choose how many parts and presentations */}
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px', background:'white', padding:'12px', borderRadius:'6px', border:'1px solid #e2e8f0'}}>
                      <div>
                        <label style={{fontSize:'12px', fontWeight:700, color:'#6d28d9', display:'block', marginBottom:'6px'}}>
                          ¿Cuántas partes tiene el kit?
                        </label>
                        <select
                          value={numPartesKit}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 2
                            setNumPartesKit(val)
                          }}
                          style={{...inputStyle, height:'34px', padding:'4px 8px'}}
                        >
                          <option value="1">1 Parte (Monocomponente)</option>
                          <option value="2">2 Partes (Bicomponente)</option>
                          <option value="3">3 Partes (Tricomponente)</option>
                          <option value="4">4 Partes (Tetracomponente)</option>
                        </select>
                      </div>
                      
                      <div>
                        <label style={{fontSize:'12px', fontWeight:700, color:'#6d28d9', display:'block', marginBottom:'6px'}}>
                          ¿Cuántas presentaciones de kit hay?
                        </label>
                        <select
                          value={numPresentacionesKit}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 1
                            setNumPresentacionesKit(val)
                          }}
                          style={{...inputStyle, height:'34px', padding:'4px 8px'}}
                        >
                          {[1, 2, 3, 4, 5, 6].map(n => (
                            <option key={n} value={n}>{n} {n === 1 ? 'Presentación' : 'Presentaciones'}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Dynamic list of presentations fields */}
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      {Array.from({ length: numPresentacionesKit }).map((_, idx) => (
                        <div key={idx} style={{background:'white', padding:'16px', borderRadius:'8px', border:'1px solid #e2e8f0', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'}}>
                          <h5 style={{margin:'0 0 12px', fontSize:'13px', fontWeight:700, color:'#475569'}}>
                            Presentación #{idx + 1}
                          </h5>
                          
                          <div style={{display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end'}}>
                            <div style={{flex:'2 1 200px'}}>
                              <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                Nombre / Tamaño (ej. Kit 3L)
                              </label>
                              <input
                                type="text"
                                value={kitPresentaciones[idx]?.nombre || ''}
                                onChange={e => updatePresentacion(idx, 'nombre', e.target.value)}
                                placeholder="Ej. Kit 3L"
                                style={inputStyle}
                              />
                            </div>
                            
                            <div style={{flex:'1 1 120px'}}>
                              <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                Precio
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={kitPresentaciones[idx]?.precio ?? ''}
                                onChange={e => updatePresentacion(idx, 'precio', e.target.value)}
                                placeholder="0.00"
                                style={inputStyle}
                              />
                            </div>
                            
                            <div style={{width:'100px'}}>
                              <label style={{fontSize:'11px', fontWeight:600, color:'#64748b', display:'block', marginBottom:'4px'}}>
                                Moneda
                              </label>
                              <select
                                value={kitPresentaciones[idx]?.moneda || 'MXN'}
                                onChange={e => updatePresentacion(idx, 'moneda', e.target.value)}
                                style={inputStyle}
                              >
                                <option value="MXN">MXN</option>
                                <option value="USD">USD</option>
                              </select>
                            </div>
                          </div>

                          {/* Volumes per part */}
                          <div style={{marginTop:'12px', borderTop:'1px dashed #f1f5f9', paddingTop:'12px'}}>
                            <label style={{fontSize:'11px', fontWeight:700, color:'#0369a1', display:'block', marginBottom:'6px'}}>
                              Volumen por cada Parte (Litros):
                            </label>
                            <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                              {Array.from({ length: numPartesKit }).map((_, partIdx) => (
                                <div key={partIdx} style={{flex:'1 1 80px'}}>
                                  <label style={{fontSize:'10px', fontWeight:600, color:'#0284c7', display:'block', marginBottom:'2px'}}>
                                    Parte {String.fromCharCode(65 + partIdx)} (L)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={kitPresentaciones[idx]?.partes?.[partIdx] ?? ''}
                                    onChange={e => updateParte(idx, partIdx, e.target.value)}
                                    placeholder="0.00"
                                    style={{...inputStyle, height:'32px', padding:'4px 8px', fontSize:'12px'}}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
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
        {currentTab === 'productos' && !showForm && (
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
                      <th style={thStyle}>Densidad</th>
                      <th style={thStyle}>Nota</th>
                      <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map(p => (
                      <tr key={p.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                        <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>
                          {p.nombre}
                          {p.kitInfo && (p.kitInfo.startsWith('[') || p.kitInfo.startsWith('{')) && (() => {
                            const parsed = parseKitInfo(p.kitInfo)
                            return (
                              <div style={{fontSize:'11px', fontWeight:400, color:'#7c3aed', marginTop:'4px'}}>
                                📦 Presentaciones: {parsed.presentaciones.map((k: any) => {
                                  const partsStr = k.partes && k.partes.length > 0 ? ` [${k.partes.join('+')}L]` : ''
                                  return `${k.nombre}${partsStr} (${k.moneda === 'USD' ? '≈$' : '$'}${k.precio} ${k.moneda})`
                                }).join(' · ')}
                              </div>
                            )
                          })()}
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
                          {p.kitInfo && (p.kitInfo.startsWith('[') || p.kitInfo.startsWith('{')) ? (() => {
                            const parsed = parseKitInfo(p.kitInfo)
                            return (
                              <span style={{color: '#7c3aed', fontWeight: 600}}>
                                {parsed.presentaciones.map((k: any) => {
                                  const partsStr = k.partes && k.partes.length > 0 ? ` (${k.partes.join('+')}L)` : ''
                                  return `${k.nombre}${partsStr}`
                                }).join(', ')}
                              </span>
                            )
                          })() : (
                            p.kitInfo || <span style={{color:'#cbd5e1'}}>—</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {p.tieneRendimiento ? `${p.rendimiento} m²/${p.unidad}` : <span style={{color:'#cbd5e1'}}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          {p.densidadRecomendada || <span style={{color:'#cbd5e1'}}>—</span>}
                        </td>
                        <td style={{...tdStyle, color:'#64748b', maxWidth:'200px'}}>
                          <div>{p.nota}</div>
                          {p.bitacora && (
                            <div style={{fontSize:'11px', color:'#7c3aed', marginTop:'4px', fontWeight:500}}>
                              📓 Bitácora: {p.bitacora}
                            </div>
                          )}
                        </td>
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
        )}

        {/* Formulario de Sistemas */}
        {currentTab === 'sistemas' && showSistemaForm && (
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(124, 58, 237, 0.15), 0 10px 10px -5px rgba(124, 58, 237, 0.1)',
            border: '2px solid #a78bfa',
            marginBottom: '20px'
          }}>
            <h2 style={{marginTop: 0, fontSize: '18px', fontWeight: 700, color: '#6d28d9', borderBottom: '1px solid #f3e8ff', paddingBottom: '12px', marginBottom: '16px'}}>
              {editingSistemaId ? '📝 Editar Sistema Multicapa' : '🧪 Crear Nuevo Sistema Multicapa'}
            </h2>
            
            <form onSubmit={handleSistemaSubmit} style={{display:'grid', gridTemplateColumns:'1fr', gap:'16px'}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:'16px'}}>
                <div>
                  <label style={labelStyle}>Nombre del Sistema *</label>
                  <input
                    required
                    placeholder="Ej. Sistema Autonivelante 3mm"
                    value={sistemaFormData.nombre}
                    onChange={e => setSistemaFormData({...sistemaFormData, nombre: e.target.value})}
                    style={{...inputStyle, borderColor: '#c4b5fd', background: '#fcfaff'}}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Descripción del Sistema</label>
                  <input
                    placeholder="Ej. Recomendado para tráfico pesado y choque térmico ligero..."
                    value={sistemaFormData.descripcion}
                    onChange={e => setSistemaFormData({...sistemaFormData, descripcion: e.target.value})}
                    style={{...inputStyle, borderColor: '#c4b5fd', background: '#fcfaff'}}
                  />
                </div>
              </div>

              <div style={{borderTop: '1px solid #f3e8ff', paddingTop: '16px', marginTop: '8px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <h3 style={{margin: 0, fontSize: '14px', fontWeight: 700, color: '#6d28d9'}}>
                    Componentes / Capas del Sistema
                  </h3>
                  <button
                    type="button"
                    onClick={agregarProductoAlSistema}
                    style={{padding: '6px 12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'}}
                  >
                    ➕ Añadir Producto/Capa
                  </button>
                </div>

                {sistemaFormData.productos.length === 0 ? (
                  <div style={{padding: '24px', textAlign: 'center', background: '#faf5ff', borderRadius: '8px', border: '1px dashed #d8b4fe', color: '#6b21a8', fontSize: '13px'}}>
                    No hay productos agregados a este sistema. Añade al menos uno para poder guardarlo.
                  </div>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    {sistemaFormData.productos.map((prodRow, idx) => (
                      <div key={idx} style={{display: 'flex', gap: '12px', alignItems: 'center', background: '#fdfbfd', padding: '10px', borderRadius: '8px', border: '1px solid #f3e8ff'}}>
                        
                        <div style={{flex: '2 1 200px'}}>
                          <label style={{fontSize: '11px', fontWeight: 600, color: '#6b21a8', display: 'block', marginBottom: '4px'}}>
                            Producto
                          </label>
                          <select
                            value={prodRow.producto_id}
                            onChange={e => actualizarProductoEnSistema(idx, 'producto_id', e.target.value)}
                            style={{...inputStyle, height: '34px', padding: '4px 8px'}}
                          >
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.nombre} ({p.unidad})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{width: '120px'}}>
                          <label style={{fontSize: '11px', fontWeight: 600, color: '#6b21a8', display: 'block', marginBottom: '4px'}}>
                            Consumo por m²
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={prodRow.consumo_por_m2}
                            onChange={e => actualizarProductoEnSistema(idx, 'consumo_por_m2', e.target.value)}
                            placeholder="0.25"
                            style={{...inputStyle, height: '34px', padding: '4px 8px'}}
                          />
                        </div>

                        <div style={{width: '80px'}}>
                          <label style={{fontSize: '11px', fontWeight: 600, color: '#6b21a8', display: 'block', marginBottom: '4px'}}>
                            Orden Capa
                          </label>
                          <input
                            type="number"
                            value={prodRow.orden}
                            onChange={e => actualizarProductoEnSistema(idx, 'orden', e.target.value)}
                            placeholder="1"
                            style={{...inputStyle, height: '34px', padding: '4px 8px'}}
                          />
                        </div>

                        <div style={{paddingTop: '20px'}}>
                          <button
                            type="button"
                            onClick={() => eliminarProductoDelSistema(idx)}
                            style={{padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600}}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f3e8ff', paddingTop: '16px', marginTop: '8px'}}>
                <button
                  type="button"
                  onClick={handleSistemaCancel}
                  style={{padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'}}
                >
                  ✕ Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || sistemaFormData.productos.length === 0}
                  style={{
                    padding: '10px 24px',
                    background: (saving || sistemaFormData.productos.length === 0) ? '#cbd5e1' : '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: (saving || sistemaFormData.productos.length === 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Guardando...' : '💾 Guardar Sistema'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de Sistemas */}
        {!showSistemaForm && currentTab === 'sistemas' && (
          <div style={{background:'white', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'}}>
            {loadingSistemas ? (
              <div style={{padding:'60px', textAlign:'center', color:'#64748b'}}>Cargando sistemas...</div>
            ) : sistemas.length === 0 ? (
              <div style={{padding:'60px', textAlign:'center'}}>
                <div style={{fontSize:'48px', marginBottom:'12px'}}>🧪</div>
                <h3 style={{color:'#1e293b', margin:'0 0 8px'}}>No hay sistemas multicapa aún</h3>
                <p style={{color:'#64748b', fontSize:'14px'}}>Crea uno nuevo presionando el botón "+ Nuevo Sistema".</p>
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                  <thead>
                    <tr style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
                      <th style={thStyle}>Nombre del Sistema</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={thStyle}>Productos Vinculados (Dosificación)</th>
                      <th style={{...thStyle, textAlign:'right'}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sistemas.map(sys => (
                      <tr key={sys.id} style={{borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background='white')}>
                        <td style={{...tdStyle, fontWeight:600, color:'#1e293b'}}>{sys.nombre}</td>
                        <td style={{...tdStyle, color:'#64748b'}}>{sys.descripcion || 'Sin descripción'}</td>
                        <td style={tdStyle}>
                          <SystemProductListSummary sysId={sys.id} productosDisponibles={productos} />
                        </td>
                        <td style={{...tdStyle, textAlign:'right', whiteSpace:'nowrap'}}>
                          <button
                            onClick={() => handleSistemaEdit(sys)}
                            style={{padding:'4px 12px', background:'#f5f3ff', color:'#7c3aed', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer', marginRight:'8px'}}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleSistemaDelete(sys.id, sys.nombre)}
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
        )}

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

function SystemProductListSummary({ sysId, productosDisponibles }: { sysId: string; productosDisponibles: any[] }) {
  const [rels, setRels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSistemaProductosSupabase(sysId).then(data => {
      setRels(data)
      setLoading(false)
    })
  }, [sysId])

  if (loading) return <span style={{color: '#94a3b8'}}>Cargando...</span>
  if (rels.length === 0) return <span style={{color: '#94a3b8'}}>Sin productos asignados</span>

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
      {rels.map(r => {
        const prod = productosDisponibles.find(p => p.id === r.producto_id)
        return (
          <div key={r.id} style={{fontSize: '12px'}}>
            <span style={{fontWeight: 600, color: '#334155'}}>{prod ? prod.nombre : 'Producto desconocido'}</span>
            <span style={{color: '#64748b'}}> (Dosificación: {r.consumo_por_m2} {prod?.unidad || 'L'}/m² · Capa {r.orden})</span>
          </div>
        )
      })}
    </div>
  )
}
