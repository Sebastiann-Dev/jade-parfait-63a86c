import { createClient } from '@supabase/supabase-js';
import { Producto } from './data/productos';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://flefgvaddvviayctxoou.supabase.co';
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_i1JKutd_pGnC2wGz49d8xQ_WDjy_FMs';


export const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchProductosSupabase(includeDrafts = false): Promise<(Producto & { id: string, estado?: string, motivo_incompleto?: string, updated_at?: string })[]> {
  try {
    let query = supabase.from('productos').select('*');
    if (!includeDrafts) {
      query = query.or('estado.eq.completo,estado.is.null');
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching products from Supabase (¿Configuraste tus credenciales?):", error);
    return []; // Fallback empty if not configured
  }
}

function sanitizeProductoPayload(payload: any) {
  const clean = { ...payload }
  delete clean.cotizacion_referencia_s3key
  delete clean.cotizacion_referencia_url
  delete clean.id
  return clean
}

export async function saveProductoSupabase(producto: Omit<Producto, 'id'> & { estado?: string; motivo_incompleto?: string }) {
  try {
    const cleanPayload = sanitizeProductoPayload(producto)
    const { data, error } = await supabase
      .from('productos')
      .insert([cleanPayload])
      .select();

    if (error) throw error;
    return data[0]?.id;
  } catch (error) {
    console.error("Error saving product:", error);
    throw error;
  }
}

export async function updateProductoSupabase(
  id: string,
  data: Partial<Producto> & { estado?: string; motivo_incompleto?: string },
  expectedUpdatedAt?: string
) {
  try {
    const cleanPayload = sanitizeProductoPayload(data)
    let query = supabase
      .from('productos')
      .update({
        ...cleanPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (expectedUpdatedAt) {
      query = query.eq('updated_at', expectedUpdatedAt);
    }

    const { data: updatedData, error } = await query.select();

    if (error) throw error;

    // Si esperábamos un timestamp específico y no se actualizó nada, hay conflicto de concurrencia
    if (expectedUpdatedAt && (!updatedData || updatedData.length === 0)) {
      throw new Error("CONCURRENCY_ERROR");
    }
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
}

export async function deleteProductoSupabase(id: string) {
  try {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error("Error deleting product:", error);
    throw error;
  }
}

export async function registrarLogActividad(
  usuario: string,
  accion: 'CREAR' | 'EDITAR' | 'ELIMINAR',
  productoId: string | null,
  detalles: any
): Promise<void> {
  try {
    const { error } = await supabase
      .from('logs_actividad')
      .insert([{
        usuario_email: usuario || 'admin_anonimo',
        accion,
        producto_id: productoId,
        detalles
      }]);
    if (error) throw error;
  } catch (error) {
    console.error("Error logging activity to Supabase:", error);
  }
}

export interface Sistema {
  id: string;
  nombre: string;
  descripcion?: string;
  created_at?: string;
}

export interface SistemaProducto {
  id: string;
  sistema_id: string;
  producto_id: string;
  consumo_por_m2: number;
  orden: number;
  created_at?: string;
}

export async function fetchSistemasSupabase(): Promise<Sistema[]> {
  try {
    const { data, error } = await supabase
      .from('sistemas')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching systems from Supabase:", error);
    return [];
  }
}

export async function fetchSistemaProductosSupabase(sistemaId: string): Promise<SistemaProducto[]> {
  try {
    const { data, error } = await supabase
      .from('sistema_productos')
      .select('*')
      .eq('sistema_id', sistemaId)
      .order('orden', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching system products from Supabase:", error);
    return [];
  }
}

export async function saveSistemaSupabase(
  nombre: string,
  descripcion: string,
  productos: Omit<SistemaProducto, 'id' | 'sistema_id'>[]
): Promise<string> {
  try {
    const { data: sistemaData, error: sistemaError } = await supabase
      .from('sistemas')
      .insert([{ nombre, descripcion }])
      .select();

    if (sistemaError) throw sistemaError;
    const sistemaId = sistemaData[0]?.id;
    if (!sistemaId) throw new Error("Could not retrieve inserted system ID");

    if (productos.length > 0) {
      const relationPayload = productos.map(p => ({
        sistema_id: sistemaId,
        producto_id: p.producto_id,
        consumo_por_m2: p.consumo_por_m2,
        orden: p.orden
      }));

      const { error: relationError } = await supabase
        .from('sistema_productos')
        .insert(relationPayload);

      if (relationError) throw relationError;
    }
    return sistemaId;
  } catch (error) {
    console.error("Error saving system:", error);
    throw error;
  }
}

export async function updateSistemaSupabase(
  id: string,
  nombre: string,
  descripcion: string,
  productos: Omit<SistemaProducto, 'id' | 'sistema_id'>[]
): Promise<void> {
  try {
    const { error: sistemaError } = await supabase
      .from('sistemas')
      .update({ nombre, descripcion })
      .eq('id', id);

    if (sistemaError) throw sistemaError;

    const { error: deleteError } = await supabase
      .from('sistema_productos')
      .delete()
      .eq('sistema_id', id);

    if (deleteError) throw deleteError;

    if (productos.length > 0) {
      const relationPayload = productos.map(p => ({
        sistema_id: id,
        producto_id: p.producto_id,
        consumo_por_m2: p.consumo_por_m2,
        orden: p.orden
      }));

      const { error: relationError } = await supabase
        .from('sistema_productos')
        .insert(relationPayload);

      if (relationError) throw relationError;
    }
  } catch (error) {
    console.error("Error updating system:", error);
    throw error;
  }
}

export async function deleteSistemaSupabase(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('sistemas')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error("Error deleting system:", error);
    throw error;
  }
}

// ─── Supabase Storage — Almacenamiento de Documentos ─────────────────────────
// Todos los archivos (PDFs y fotos) se guardan en el bucket 'product-docs' de
// Supabase Storage. El flujo es:
//   1. uploadDocToS3()      → sube el archivo a Supabase Storage y retorna el path relativo
//   2. El path relativo (key) se guarda en Supabase (nunca la URL completa)
//   3. requestDownloadUrl() → convierte el path en URL pública de Supabase Storage
//
// Nota: Los nombres de las funciones conservan la nomenclatura original ('s3') 
// para compatibilidad. La migración real a AWS S3 se realizará en una fase futura.

export type DocTipo = 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia' | 'foto_superficie'

/**
 * Solicita al servidor una Presigned URL de subida para S3.
 * @returns { uploadUrl: string, s3Key: string }
 *          - uploadUrl: URL de PUT para subir el archivo directamente a S3
 *          - s3Key:     Ruta en S3 — este valor se guarda en Supabase
 */
export async function requestUploadUrl(
  productoId: string,
  tipo: DocTipo,
  contentType = 'application/pdf'
): Promise<{ uploadUrl: string; s3Key: string }> {
  // Retorna stubs ya que subiremos directamente con uploadDocToS3
  return { uploadUrl: '', s3Key: '' }
}

/**
 * @deprecated No es necesario para Supabase Storage.
 */
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  // Stub sin operación
}

/**
 * Obtiene la URL pública del documento guardado en Supabase Storage.
 * Mantenemos el nombre 'requestDownloadUrl' para compatibilidad con el resto del código.
 */
export async function requestDownloadUrl(s3Key: string): Promise<string> {
  if (!s3Key) return ''
  // Si ya es una URL pública completa (legada), retornarla tal cual
  if (s3Key.startsWith('http://') || s3Key.startsWith('https://')) {
    return s3Key
  }
  const { data } = supabase.storage.from('product-docs').getPublicUrl(s3Key)
  return data.publicUrl
}

/**
 * Sube el archivo directamente al bucket de Supabase Storage 'product-docs'.
 * Retorna la ruta relativa (key) del archivo para guardarla en la base de datos.
 */
export async function uploadDocToS3(
  productoId: string,
  tipo: DocTipo,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop() || 'pdf'
  const timestamp = Date.now()
  const path = `${productoId}/${timestamp}_${tipo}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('product-docs')
    .upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/pdf'
    })

  if (uploadError) throw uploadError
  return path
}

// ─── LEGACY: Supabase Storage (deprecado — solo para compatibilidad durante migración) ───
/**
 * @deprecated Usar uploadDocToS3() en su lugar.
 * Mantenido para que los productos con URLs de Supabase Storage sigan funcionando
 * hasta que sean re-subidos con la nueva arquitectura S3.
 */
export async function uploadPdfProducto(
  productoId: string,
  tipo: 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia',
  file: File
): Promise<string> {
  console.warn(
    '[DEPRECATED] uploadPdfProducto() usa Supabase Storage. ' +
    'Migrar a uploadDocToS3() para subidas nuevas.'
  )
  const ext = file.name.split('.').pop() || 'pdf'
  const path = `${productoId}/${tipo}.${ext}`
  await supabase.storage.from('product-docs').remove([path])
  const { error: uploadError } = await supabase.storage
    .from('product-docs')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from('product-docs').getPublicUrl(path)
  return data.publicUrl
}

/**
 * Elimina un documento de Supabase Storage.
 * Intenta eliminar variantes con extensión .pdf y .PDF.
 */
export async function deletePdfProducto(
  productoId: string,
  tipo: 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia'
): Promise<void> {
  const paths = [`${productoId}/${tipo}.pdf`, `${productoId}/${tipo}.PDF`]
  await supabase.storage.from('product-docs').remove(paths)
}


export interface Prospecto {
  id: string;
  codigo_seguimiento: string;
  cliente_nombre: string;
  proyecto_nombre: string;
  telefono?: string;
  email?: string;
  respuestas: Record<string, any>;
  recomendaciones: any[];
  campos_vendedor: Record<string, any>;
  estado: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchProspectosSupabase(): Promise<Prospecto[]> {
  try {
    const { data, error } = await supabase
      .from('prospectos_diagnostico')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching prospects from Supabase:", error);
    return [];
  }
}

export async function fetchProspectoByCodigoSupabase(codigo: string): Promise<Prospecto | null> {
  try {
    const { data, error } = await supabase
      .from('prospectos_diagnostico')
      .select('*')
      .eq('codigo_seguimiento', codigo.toUpperCase().trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching prospect by code from Supabase:", error);
    return null;
  }
}

export async function saveProspectoSupabase(
  prospecto: Omit<Prospecto, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('prospectos_diagnostico')
      .insert([prospecto])
      .select();
    if (error) throw error;
    const insertedId = data[0]?.id;
    if (!insertedId) throw new Error("Could not retrieve inserted prospect ID");
    return insertedId;
  } catch (error) {
    console.error("Error saving prospect:", error);
    throw error;
  }
}

export async function updateProspectoSupabase(
  id: string,
  data: Partial<Omit<Prospecto, 'id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  try {
    const { error } = await supabase
      .from('prospectos_diagnostico')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    console.error("Error updating prospect:", error);
    throw error;
  }
}

/**
 * Genera un código de seguimiento estandarizado e inteligente.
 * Estructura: BUCA-[AÑO][MES]-[SUP]-[NECS]-[TRAF]-[ZONA]-[SEQ]-[CLIENTE]
 * Ejemplo: BUCA-2606-CF-EQ-HV-INT-001-JON
 */
export async function generarCodigoSeguimiento(params: {
  clienteNombre: string;
  sabeLoQueBusca: string;
  queRecubrir?: string;
  ubicacion?: string;
  traficosSeleccionados?: string[];
  quimicos?: string;
  recomendadosSys?: any[];
  recomendadosProds?: any[];
}): Promise<string> {
  const date = new Date()
  const yy = String(date.getFullYear()).substring(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const period = `${yy}${mm}`

  // 1. Superficie (SUP)
  let sup = 'XX'
  if (params.sabeLoQueBusca === 'no' && params.queRecubrir) {
    const q = params.queRecubrir
    if (q === 'concrete_floor') sup = 'CF'
    else if (q === 'asphalt_concrete') sup = 'AC'
    else if (q === 'metal_steel') sup = 'MT'
    else if (q === 'walls_ceilings') sup = 'MR'
    else if (q === 'tanks_cisterns') sup = 'TQ'
    else if (q === 'wood') sup = 'WD'
  }

  // 2. Necesidad/Familia (NECS)
  let necs = 'AS'
  if (params.sabeLoQueBusca === 'no') {
    const items = [
      ...(params.recomendadosSys || []).map(s => s.nombre || ''),
      ...(params.recomendadosProds || []).map(p => p.nombre || '')
    ].map(n => n.toLowerCase())

    const hasMatch = (keywords: string[]) =>
      items.some(item => keywords.some(kw => item.includes(kw)))

    if (hasMatch(['crete', 'quimico', 'química', 'severe', 'mor'])) {
      necs = 'EQ' // Epóxico Químico / Altas cargas
    } else if (hasMatch(['thane', 'uv', 'poliuretano'])) {
      necs = 'PU' // Poliuretano UV
    } else if (hasMatch(['autonivelante', 'nivel'])) {
      necs = 'NV' // Autonivelante
    } else if (hasMatch(['epox', 'epóx'])) {
      necs = 'PX' // Epóxico Estándar
    } else if (hasMatch(['imper', 'elast'])) {
      necs = 'IM' // Impermeabilizante
    } else if (hasMatch(['anti', 'primer', 'anticorrosivo'])) {
      necs = 'PR' // Anticorrosivo / Primer
    }
  }

  // 3. Tráfico (TRAF)
  let traf = 'NA'
  if (params.sabeLoQueBusca === 'no' && params.traficosSeleccionados && params.traficosSeleccionados.length > 0) {
    const t = params.traficosSeleccionados
    if (t.includes('severe')) traf = 'IN'
    else if (t.includes('heavy')) traf = 'HV'
    else if (t.includes('moderate') || t.includes('light')) traf = 'LD'
  }

  // 4. Ubicación (ZONA)
  let zona = 'INT'
  if (params.sabeLoQueBusca === 'no' && params.ubicacion) {
    const u = params.ubicacion
    if (u === 'exterior') zona = 'EXT'
    else if (u === 'both') zona = 'AMB'
  }

  // 5. Secuencial del mes (SEQ)
  let seqStr = ''
  try {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)

    const { count, error } = await supabase
      .from('prospectos_diagnostico')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())

    if (error) throw error
    const nextSeq = (count || 0) + 1
    seqStr = String(nextSeq).padStart(3, '0')
  } catch (e) {
    console.error("Error getting monthly sequence, falling back to random numbers:", e)
    seqStr = String(Math.floor(100 + Math.random() * 900))
  }

  // 6. Abreviatura de Cliente (CLIENTE)
  let cli = 'XXX'
  if (params.clienteNombre) {
    const cleaned = params.clienteNombre
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '')
    if (cleaned.length > 0) {
      cli = cleaned.substring(0, 3).padEnd(3, 'X')
    }
  }

  return `BUCA-${period}-${sup}-${necs}-${traf}-${zona}-${seqStr}-${cli}`
}


// ─── Cotizaciones — Persistencia Completa ─────────────────────────────────────

export interface ItemCotizacion {
  producto_id?: string;
  producto_nombre_original: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  moneda: string;
  total: number;
  metros_cuadrados?: number;
}

export interface CotizacionCompleta {
  id?: string;
  cliente: string;
  proyecto: string;
  fecha: string;
  area_total_m2?: number;
  monto_total: number;
  vendedor_email?: string;
  prospecto_codigo?: string;
  estado_cotizacion: string;
  notas?: string;
  tipo_cambio?: number;
  es_minorista?: boolean;
  descuento_porcentaje?: number;
  estado_piso?: string;
  pdf_storage_key?: string;
  archivo_url?: string;
  created_at?: string;
  updated_at?: string;
  items?: ItemCotizacion[];
}

/**
 * Guarda una cotización completa (cabecera + líneas de producto) en Supabase.
 * Retorna el ID UUID de la cotización creada.
 */
export async function saveCotizacionSupabase(
  cotizacion: Omit<CotizacionCompleta, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  try {
    const { items, ...cabecera } = cotizacion

    const { data, error } = await supabase
      .from('cotizaciones_historicas')
      .insert([{
        cliente:              cabecera.cliente,
        proyecto:             cabecera.proyecto,
        fecha:                cabecera.fecha,
        area_total_m2:        cabecera.area_total_m2 ?? null,
        monto_total:          cabecera.monto_total,
        vendedor_email:       cabecera.vendedor_email ?? null,
        prospecto_codigo:     cabecera.prospecto_codigo ?? null,
        estado_cotizacion:    cabecera.estado_cotizacion,
        notas:                cabecera.notas ?? null,
        tipo_cambio:          cabecera.tipo_cambio ?? null,
        es_minorista:         cabecera.es_minorista ?? true,
        descuento_porcentaje: cabecera.descuento_porcentaje ?? 0,
        estado_piso:          cabecera.estado_piso ?? 'ninguno',
        pdf_storage_key:      cabecera.pdf_storage_key ?? null,
        archivo_url:          cabecera.archivo_url ?? null,
      }])
      .select('id')

    if (error) throw error
    const cotizacionId: string = data[0]?.id
    if (!cotizacionId) throw new Error('No se recibió el ID de la cotización creada')

    if (items && items.length > 0) {
      const payload = items.map(item => ({
        cotizacion_id:            cotizacionId,
        producto_id:              item.producto_id ?? null,
        producto_nombre_original: item.producto_nombre_original,
        cantidad:                 item.cantidad,
        unidad:                   item.unidad,
        precio_unitario:          item.precio_unitario,
        moneda:                   item.moneda,
        total:                    item.total,
        metros_cuadrados:         item.metros_cuadrados ?? null,
      }))

      const { error: itemsError } = await supabase
        .from('items_cotizacion_historica')
        .insert(payload)

      if (itemsError) throw itemsError
    }

    return cotizacionId
  } catch (error) {
    console.error('Error guardando cotización:', error)
    throw error
  }
}

/**
 * Obtiene todas las cotizaciones guardadas para listado en Admin.
 */
export async function fetchCotizacionesSupabase(): Promise<CotizacionCompleta[]> {
  try {
    const { data, error } = await supabase
      .from('cotizaciones_historicas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching cotizaciones:', error)
    return []
  }
}

/**
 * Obtiene los items de una cotización específica.
 */
export async function fetchItemsCotizacionSupabase(cotizacionId: string): Promise<ItemCotizacion[]> {
  try {
    const { data, error } = await supabase
      .from('items_cotizacion_historica')
      .select('*')
      .eq('cotizacion_id', cotizacionId)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching items cotización:', error)
    return []
  }
}

/**
 * Actualiza el estado de una cotización (ej: 'Enviada', 'Aceptada', 'Rechazada').
 */
export async function updateEstadoCotizacionSupabase(
  id: string,
  estado: string,
  extras?: { pdf_storage_key?: string; archivo_url?: string; notas?: string }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cotizaciones_historicas')
      .update({
        estado_cotizacion: estado,
        updated_at: new Date().toISOString(),
        ...extras
      })
      .eq('id', id)

    if (error) throw error
  } catch (error) {
    console.error('Error actualizando estado de cotización:', error)
    throw error
  }
}
