import React, { useState, useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  fetchProspectosSupabase,
  updateProspectoSupabase,
  fetchProductosSupabase,
  requestDownloadUrl,
  supabase,
  type Prospecto
} from '../supabase'
import { type Producto } from '../data/productos'

const obtenerNombreDesdeEmail = (email?: string): string => {
  if (!email) return ''
  if (email === 'sebastian.grajales.rmzz@gmail.com') return 'Sebastian Grajales'
  const parts = email.split('@')
  if (parts.length === 2 && parts[1] === 'bucamx.com') {
    return parts[0]
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
}

const sinEmojis = (texto: string): string => {
  if (!texto) return ''
  return texto.replace(/[\u2600-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF]/g, '').trim()
}


export const LeadPortal: React.FC = () => {
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [prospectoSeleccionado, setProspectoSeleccionado] = useState<Prospecto | null>(null)
  
  // Editable fields for vendor details
  const [estadoLead, setEstadoLead] = useState('')
  const [vendedorAsignado, setVendedorAsignado] = useState('')
  const [notasSeguimiento, setNotasSeguimiento] = useState('')

  // Vendor profiles, additional products, and historical logs
  const [todosProductos, setTodosProductos] = useState<Producto[]>([])
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [productosAdicionales, setProductosAdicionales] = useState<string[]>([])
  const [mostrarBitacora, setMostrarBitacora] = useState<boolean>(false)
  const [nuevoVendedorNombre, setNuevoVendedorNombre] = useState<string>('')
  const [mostrarNuevoVendedorInput, setMostrarNuevoVendedorInput] = useState<boolean>(false)
  
  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState(false)
  const [mensajeEdicion, setMensajeEdicion] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const [fotoSuperficieUrl, setFotoSuperficieUrl] = useState<string>('')

  const vendedoresExistentes = useMemo(() => {
    const set = new Set<string>()
    set.add('Sebastian Grajales')
    set.add('Ventas BUCA 1')
    set.add('Ventas BUCA 2')
    
    prospectos.forEach(p => {
      const v = p.campos_vendedor?.vendedor
      if (v && v.trim()) {
        set.add(v.trim())
      }
    })
    
    if (currentUserEmail) {
      set.add(obtenerNombreDesdeEmail(currentUserEmail))
    }
    
    return Array.from(set).sort()
  }, [prospectos, currentUserEmail])

  const loadProspects = async () => {
    try {
      setLoading(true)
      const data = await fetchProspectosSupabase()
      setProspectos(data)
    } catch (e) {
      console.error("Error loading prospects in lead portal:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProspects()
    fetchProductosSupabase(false).then(setTodosProductos).catch(console.error)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setCurrentUserEmail(user.email)
      }
    })
  }, [])

  const selectProspecto = (p: Prospecto) => {
    setProspectoSeleccionado(p)
    setEstadoLead(p.estado)
    setVendedorAsignado(p.campos_vendedor?.vendedor || '')
    setNotasSeguimiento(p.campos_vendedor?.notas || '')
    setProductosAdicionales(p.campos_vendedor?.productos_adicionales || [])
    setMostrarNuevoVendedorInput(false)
    setNuevoVendedorNombre('')
    setMensajeEdicion(null)

    // Fetch surface photo URL from S3 if it exists
    setFotoSuperficieUrl('')
    if (p.respuestas?.foto_superficie_s3key) {
      requestDownloadUrl(p.respuestas.foto_superficie_s3key)
        .then(setFotoSuperficieUrl)
        .catch(err => console.error("Error getting surface photo download URL:", err))
    }
  }

  const guardarSeguimiento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prospectoSeleccionado) return

    setGuardandoSeguimiento(true)
    setMensajeEdicion(null)

    const finalVendedor = vendedorAsignado === 'new_vendedor'
      ? nuevoVendedorNombre.trim()
      : vendedorAsignado.trim()

    const historialExistente = Array.isArray(prospectoSeleccionado.campos_vendedor?.historial_notas)
      ? prospectoSeleccionado.campos_vendedor.historial_notas
      : []

    let updatedHistorial = [...historialExistente]
    const noteTextClean = notasSeguimiento.trim()
    if (noteTextClean) {
      const ultimaNota = historialExistente[historialExistente.length - 1]
      if (!ultimaNota || ultimaNota.nota !== noteTextClean) {
        updatedHistorial.push({
          fecha: new Date().toISOString(),
          vendedor: finalVendedor || 'Sistema',
          nota: noteTextClean
        })
      }
    }

    const updatedCamposVendedor = {
      ...prospectoSeleccionado.campos_vendedor,
      vendedor: finalVendedor,
      notas: noteTextClean,
      historial_notas: updatedHistorial,
      productos_adicionales: productosAdicionales
    }

    try {
      await updateProspectoSupabase(prospectoSeleccionado.id, {
        estado: estadoLead,
        campos_vendedor: updatedCamposVendedor
      })

      // Update local state list
      setProspectos(prev =>
        prev.map(item =>
          item.id === prospectoSeleccionado.id
            ? { ...item, estado: estadoLead, campos_vendedor: updatedCamposVendedor }
            : item
        )
      )

      // Update selected object state
      setProspectoSeleccionado(prev =>
        prev
          ? { ...prev, estado: estadoLead, campos_vendedor: updatedCamposVendedor }
          : null
      )

      setMensajeEdicion({ texto: 'Seguimiento guardado correctamente.', tipo: 'ok' })
    } catch (error: any) {
      console.error("Error updating prospect follow-up details:", error)
      setMensajeEdicion({ texto: 'Error al guardar cambios en base de datos.', tipo: 'error' })
    } finally {
      setGuardandoSeguimiento(false)
    }
  }

  // Helper to translate questions and answer codes into friendly Spanish text
  const traducirRespuestas = (respuestas: Record<string, any>) => {
    const traducciones: { label: string; value: string }[] = []

    const dictUbicacion: Record<string, string> = { interior: 'Interior', exterior: 'Exterior', both: 'Ambos (Interior y Exterior)' }
    const dictSuperficie: Record<string, string> = { concrete_floor: 'Piso de Concreto', wall: 'Muro / Pared', metal_structure: 'Estructura Metálica / Fierro', tank: 'Tanque / Cisterna', wood: 'Madera / Triplay', other: 'Otro' }
    const dictTrafico: Record<string, string> = { none: 'Peatonal Ligero', pedestrian_heavy: 'Peatonal Intenso', light: 'Tránsito Ligero', heavy: 'Tránsito Pesado', severe: 'Tránsito Industrial Severo' }
    const dictQuimicos: Record<string, string> = { no: 'Sin contacto', yes_oils: 'Aceites y grasas comunes', yes_light_acids: 'Ácidos/Álcalis ligeros', yes_heavy_acids: 'Ácidos fuertes/Solventes' }
    const dictEstadoConcreto: Record<string, string> = { new: 'Excelente / Listo para recubrir (Nuevo o curado sin imperfecciones)', polished: 'Sano / Sin grietas pero pulido o liso (Requiere perfil de anclaje)', peeling: 'Aceptable / Desgaste leve o fisuras finas superficiales', damaged: 'Dañado / Con grietas activas, baches o desprendimientos', contaminated: 'Contaminado / Con manchas de grasa, aceite o químicos', humidity: 'Humedad severa / Presencia de salitre o humedad ascendente', other: 'Otro estado especial' }
    const dictUv: Record<string, string> = { yes: 'Sí, exposición directa', no: 'No, bajo sombra/techado' }
    const dictRuedas: Record<string, string> = { rubber: 'Caucho / Neumáticos', polyurethane: 'Poliuretano rígido', metal_nylon: 'Nylon / Metal' }
    const dictFrecuencia: Record<string, string> = { occasional: 'Ocasional / Salpicadura', daily_cleaning: 'Limpieza / Sanitizado diario', immersion: 'Inmersión / Charco continuo' }
    const dictColor: Record<string, string> = { gray: 'Gris (Base estándar)', red: 'Rojo (Base estándar)', white: 'Blanco (Base estándar)', clear: 'Transparente / Neutro', entonacion: 'Entonación' }

    if (respuestas.sabe_lo_que_busca) {
      traducciones.push({
        label: '¿Sabe lo que busca?',
        value: respuestas.sabe_lo_que_busca === 'si' ? 'Sí, ya sabe lo que busca' : 'No, requiere asesoría'
      })
    }
    if (respuestas.sabe_lo_que_busca_detalle) {
      traducciones.push({
        label: 'Detalle de lo que busca',
        value: respuestas.sabe_lo_que_busca_detalle
      })
    }
    if (respuestas.que_recubrir) {
      traducciones.push({ label: 'Superficie a recubrir', value: dictSuperficie[respuestas.que_recubrir] || respuestas.que_recubrir })
    }
    if (respuestas.ubicacion) {
      traducciones.push({ label: 'Ubicación física', value: dictUbicacion[respuestas.ubicacion] || respuestas.ubicacion })
    }
    if (respuestas.objetivos && Array.isArray(respuestas.objetivos)) {
      traducciones.push({ label: 'Objetivos del proyecto', value: respuestas.objetivos.join(', ') })
    }
    if (respuestas.trafico) {
      const traficoVal = Array.isArray(respuestas.trafico)
        ? respuestas.trafico.map((t: string) => dictTrafico[t] || t).join(', ')
        : (dictTrafico[respuestas.trafico] || respuestas.trafico)
      traducciones.push({ label: 'Nivel de Tráfico', value: traficoVal })
    }
    if (respuestas.quimicos) {
      traducciones.push({ label: 'Contacto con Químicos', value: dictQuimicos[respuestas.quimicos] || respuestas.quimicos })
    }
    if (respuestas.estado_concreto) {
      traducciones.push({ label: 'Estado del Concreto', value: dictEstadoConcreto[respuestas.estado_concreto] || respuestas.estado_concreto })
    }
    if (respuestas.radiacion_uv) {
      traducciones.push({ label: 'Exposición Solar (UV)', value: dictUv[respuestas.radiacion_uv] || respuestas.radiacion_uv })
    }
    if (respuestas.tipo_ruedas) {
      traducciones.push({ label: 'Tipo de Ruedas', value: dictRuedas[respuestas.tipo_ruedas] || respuestas.tipo_ruedas })
    }
    if (respuestas.frecuencia_quimica) {
      traducciones.push({ label: 'Frecuencia Química', value: dictFrecuencia[respuestas.frecuencia_quimica] || respuestas.frecuencia_quimica })
    }
    if (respuestas.area_m2) {
      traducciones.push({ label: 'Área del proyecto', value: `${respuestas.area_m2} m²` })
    }
    if (respuestas.color_deseado) {
      const colorText = respuestas.color_deseado === 'entonacion' && respuestas.color_detalle 
        ? `Entonación (${respuestas.color_detalle})` 
        : (dictColor[respuestas.color_deseado] || respuestas.color_deseado)
      traducciones.push({ label: 'Color solicitado', value: colorText })
    }

    return traducciones
  }

  // Filter prospects list
  const prospectosFiltrados = prospectos.filter(p => {
    const cumpleBusqueda =
      p.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.proyecto_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo_seguimiento.toLowerCase().includes(busqueda.toLowerCase())
    
    const cumpleEstado = filtroEstado === 'Todos' || p.estado === filtroEstado
    return cumpleBusqueda && cumpleEstado
  })

  // Format date helper
  const formatearFecha = (fechaStr?: string) => {
    if (!fechaStr) return ''
    return new Date(fechaStr).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* List Column */}
      <div className={`space-y-4 ${prospectoSeleccionado ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
        
        {/* Filters bar */}
        <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
              </svg>
            </span>
            <input
              type="text"
              className="w-full text-xs pl-9 pr-3.5 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-blue-400 bg-gray-50/50"
              placeholder="Buscar cliente, proyecto o código..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto self-stretch sm:self-auto justify-end">
            <select
              className="text-xs px-3 py-2 border border-gray-200 rounded-xl bg-white outline-none focus:border-blue-400 font-medium cursor-pointer"
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
            >
              <option value="Todos">Todos los Estados</option>
              <option value="Nuevo">Nuevo</option>
              <option value="Contactado">Contactado</option>
              <option value="Cotizado">Cotizado</option>
              <option value="Cerrado Ganado">Cerrado Ganado</option>
              <option value="Cerrado Perdido">Cerrado Perdido</option>
            </select>

            <button
              onClick={loadProspects}
              className="p-2 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600 transition shrink-0"
              title="Recargar lista"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 text-gray-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        {/* Leads Grid/Table */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4 bg-white border border-gray-150 rounded-2xl">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-blue-600 font-semibold animate-pulse text-xs">Cargando prospectos...</p>
          </div>
        ) : prospectosFiltrados.length === 0 ? (
          <div className="bg-white border border-gray-150 rounded-2xl py-16 text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-10 h-10 text-gray-300 mx-auto mb-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
            </svg>
            <h4 className="font-bold text-gray-700 text-sm">No se encontraron prospectos</h4>
            <p className="text-xs text-gray-400 mt-1">Intenta ajustando los criterios de búsqueda o filtros.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3">Código / Cliente</th>
                    <th className="px-4 py-3">Proyecto / Área</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {prospectosFiltrados.map(p => {
                    const isSelected = prospectoSeleccionado?.id === p.id
                    
                    const badgeStyles: Record<string, string> = {
                      'Nuevo': 'bg-blue-100 text-blue-800',
                      'Contactado': 'bg-yellow-100 text-yellow-800',
                      'Cotizado': 'bg-purple-100 text-purple-800',
                      'Cerrado Ganado': 'bg-green-100 text-green-800',
                      'Cerrado Perdido': 'bg-red-100 text-red-800'
                    }
                    
                    return (
                      <tr
                        key={p.id}
                        onClick={() => selectProspecto(p)}
                        className={`hover:bg-blue-50/20 cursor-pointer transition ${
                          isSelected ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 space-y-1">
                          <span className="font-mono font-bold text-blue-600 block">{p.codigo_seguimiento}</span>
                          <span className="font-semibold text-gray-800 block truncate max-w-[160px]">{p.cliente_nombre}</span>
                        </td>
                        <td className="px-4 py-3.5 space-y-1">
                          <span className="font-medium text-gray-700 block truncate max-w-[180px]">{p.proyecto_nombre}</span>
                          <span className="text-gray-400 block">{p.respuestas?.area_m2 || 'N/A'} m²</span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                          {formatearFecha(p.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                            badgeStyles[p.estado] || 'bg-gray-100 text-gray-600'
                          }`}>
                            {p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border border-blue-200 rounded-lg text-blue-600 font-semibold hover:bg-blue-50"
                          >
                            Ver Ficha
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Details / Edit Column */}
      {prospectoSeleccionado && (
        <div className="lg:col-span-5 bg-white border border-gray-150 rounded-3xl p-5 shadow-lg space-y-5 animate-fade-in sticky top-4">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ficha de Prospecto</span>
              <h3 className="font-bold text-base text-gray-900 mt-0.5">{prospectoSeleccionado.codigo_seguimiento}</h3>
            </div>
            <button
              onClick={() => setProspectoSeleccionado(null)}
              className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none"
              title="Cerrar detalles"
            >
              ×
            </button>
          </div>

          {/* Client summary */}
          <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100">
            <p><strong className="text-gray-700">Cliente:</strong> {prospectoSeleccionado.cliente_nombre}</p>
            <p><strong className="text-gray-700">Proyecto:</strong> {prospectoSeleccionado.proyecto_nombre}</p>
            {prospectoSeleccionado.telefono && <p><strong className="text-gray-700">Teléfono:</strong> <a href={`tel:${prospectoSeleccionado.telefono}`} className="text-blue-600 hover:underline">{prospectoSeleccionado.telefono}</a></p>}
            {prospectoSeleccionado.email && <p><strong className="text-gray-700">Email:</strong> <a href={`mailto:${prospectoSeleccionado.email}`} className="text-blue-600 hover:underline">{prospectoSeleccionado.email}</a></p>}
            <p><strong className="text-gray-700">Registrado:</strong> {formatearFecha(prospectoSeleccionado.created_at)}</p>
          </div>

          {/* Diagnostic Tab */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b pb-1">Respuestas del Diagnóstico:</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
              {traducirRespuestas(prospectoSeleccionado.respuestas).map((r, idx) => (
                <div key={idx} className="flex justify-between items-start gap-3 py-1">
                  <span className="text-gray-500 font-medium">{r.label}:</span>
                  <span className="text-gray-800 font-bold text-right">{r.value}</span>
                </div>
              ))}
            </div>
            {prospectoSeleccionado.respuestas?.foto_superficie_s3key && (
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Foto de Superficie:</span>
                {fotoSuperficieUrl ? (
                  <div className="relative group overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 max-h-48 flex items-center justify-center">
                    <img 
                      src={fotoSuperficieUrl} 
                      alt="Superficie del proyecto" 
                      className="object-cover w-full h-full max-h-48 cursor-zoom-in hover:scale-105 transition duration-300"
                      onClick={() => window.open(fotoSuperficieUrl, '_blank')}
                      title="Haz clic para ver en tamaño completo"
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 animate-pulse">Obteniendo enlace de la imagen...</p>
                )}
              </div>
            )}
          </div>

          {/* Recommendation block */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b pb-1">Sistemas/Productos Sugeridos:</h4>
            <div className="flex flex-col gap-1.5">
              {prospectoSeleccionado.recomendaciones.map((rec, idx) => (
                <div key={idx} className="px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <span className="truncate flex items-center gap-1.5">
                    <strong className="text-blue-900 truncate">{sinEmojis(rec.nombre)}</strong>
                  </span>
                  
                  {/* Load in Cotizador direct link */}
                  <Link
                    to={rec.type === 'sistema' 
                      ? `/?sistemaId=${rec.id}&cliente=${encodeURIComponent(prospectoSeleccionado.cliente_nombre)}&proyecto=${encodeURIComponent(prospectoSeleccionado.proyecto_nombre)}`
                      : `/?productoNombre=${encodeURIComponent(rec.nombre)}&cliente=${encodeURIComponent(prospectoSeleccionado.cliente_nombre)}&proyecto=${encodeURIComponent(prospectoSeleccionado.proyecto_nombre)}`
                    }
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-lg transition shrink-0"
                  >
                    Cotizar
                  </Link>
                </div>
              ))}
            </div>

            {/* Custom seller added products */}
            <div className="mt-3 pt-3 border-t border-gray-150 space-y-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Productos Adicionales del Vendedor (Guardados):</span>
              {productosAdicionales.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {productosAdicionales.map((pName, index) => (
                    <span key={index} className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded-lg text-[10px] font-semibold">
                      {sinEmojis(pName)}
                      <button
                        type="button"
                        onClick={() => setProductosAdicionales(prev => prev.filter(x => x !== pName))}
                        className="text-yellow-600 hover:text-red-600 font-bold ml-1 text-xs"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <select
                onChange={e => {
                  const pName = e.target.value
                  if (pName && !productosAdicionales.includes(pName)) {
                    setProductosAdicionales([...productosAdicionales, pName])
                  }
                  e.target.value = "" // Reset select value
                }}
                className="w-full text-xs px-2.5 py-2 border border-gray-250 rounded-xl bg-white outline-none focus:border-blue-400 cursor-pointer"
              >
                <option value="">+ Añadir producto necesario...</option>
                {todosProductos.map(p => (
                  <option key={p.id} value={p.nombre}>{sinEmojis(p.nombre)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Follow-up editor Form */}
          <form onSubmit={guardarSeguimiento} className="space-y-4 border-t border-gray-150 pt-4">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Bitácora de Vendedor:</h4>
            
            {mensajeEdicion && (
              <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                mensajeEdicion.tipo === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {mensajeEdicion.texto}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Estatus del Lead</label>
              <select
                className="w-full text-xs px-2.5 py-2 border border-gray-250 rounded-xl bg-white outline-none focus:border-blue-400 cursor-pointer"
                value={estadoLead}
                onChange={e => setEstadoLead(e.target.value)}
              >
                <option value="Nuevo">Nuevo</option>
                <option value="Contactado">Contactado</option>
                <option value="Cotizado">Cotizado</option>
                <option value="Cerrado Ganado">Cerrado Ganado</option>
                <option value="Cerrado Perdido">Cerrado Perdido</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Vendedor Asignado</label>
              <select
                className="w-full text-xs px-2.5 py-2 border border-gray-250 rounded-xl bg-white outline-none focus:border-blue-400 cursor-pointer mb-2"
                value={vendedorAsignado}
                onChange={e => {
                  const val = e.target.value
                  setVendedorAsignado(val)
                  if (val === 'new_vendedor') {
                    setMostrarNuevoVendedorInput(true)
                  } else {
                    setMostrarNuevoVendedorInput(false)
                  }
                }}
              >
                <option value="">-- Seleccionar Vendedor --</option>
                {currentUserEmail && (
                  <option value={obtenerNombreDesdeEmail(currentUserEmail)}>
                    Mi Perfil ({obtenerNombreDesdeEmail(currentUserEmail)})
                  </option>
                )}
                {vendedoresExistentes.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
                <option value="new_vendedor">+ Registrar nuevo vendedor...</option>
              </select>

              {mostrarNuevoVendedorInput && (
                <input
                  type="text"
                  required
                  className="w-full text-xs px-2.5 py-2 border border-blue-300 rounded-xl outline-none focus:border-blue-500 bg-white placeholder-gray-400 animate-fade-in"
                  placeholder="Nombre completo del nuevo asesor"
                  value={nuevoVendedorNombre}
                  onChange={e => setNuevoVendedorNombre(e.target.value)}
                />
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notas de Seguimiento</label>
                <button
                  type="button"
                  onClick={() => setMostrarBitacora(true)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                >
                  Ver bitácora de mensajes ({
                    Array.isArray(prospectoSeleccionado.campos_vendedor?.historial_notas)
                      ? prospectoSeleccionado.campos_vendedor.historial_notas.length
                      : 0
                  })
                </button>
              </div>
              <textarea
                rows={3}
                className="w-full text-xs px-2.5 py-2 border border-gray-250 rounded-xl outline-none focus:border-blue-400 bg-white resize-none"
                placeholder="Escribe comentarios sobre las llamadas o el seguimiento..."
                value={notasSeguimiento}
                onChange={e => setNotasSeguimiento(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={guardandoSeguimiento}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-40"
            >
              {guardandoSeguimiento ? 'Guardando...' : 'Guardar Ficha de Seguimiento'}
            </button>
          </form>
        </div>
      )}

      {/* Historical logs modal */}
      {mostrarBitacora && prospectoSeleccionado && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.25s ease' }}>
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-bold text-sm text-gray-800">Bitácora de Notas y Seguimiento</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{prospectoSeleccionado.cliente_nombre} — {prospectoSeleccionado.proyecto_nombre}</p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarBitacora(false)}
                className="w-7 h-7 bg-white hover:bg-gray-150 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition shadow-sm border border-gray-100 font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {Array.isArray(prospectoSeleccionado.campos_vendedor?.historial_notas) &&
              prospectoSeleccionado.campos_vendedor.historial_notas.length > 0 ? (
                [...prospectoSeleccionado.campos_vendedor.historial_notas]
                  .reverse() // Display newest first
                  .map((hn: any, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-[10px] text-gray-400 font-semibold">
                        <span>Asesor: <strong className="text-gray-700">{hn.vendedor}</strong></span>
                        <span>{formatearFecha(hn.fecha)}</span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-line font-medium leading-relaxed bg-white p-2.5 rounded-xl border border-gray-100/50">
                        {hn.nota}
                      </p>
                    </div>
                  ))
              ) : (
                <div className="text-center py-10 text-gray-400 text-xs">
                  No hay notas previas registradas en el historial de este prospecto.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                type="button"
                onClick={() => setMostrarBitacora(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
