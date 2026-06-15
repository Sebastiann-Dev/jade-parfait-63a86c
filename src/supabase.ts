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

export async function saveProductoSupabase(producto: Omit<Producto, 'id'> & { estado?: string; motivo_incompleto?: string }) {
  try {
    const { data, error } = await supabase
      .from('productos')
      .insert([producto])
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
    let query = supabase
      .from('productos')
      .update({
        ...data,
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

export async function uploadPdfProducto(
  productoId: string,
  tipo: 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia',
  file: File
): Promise<string> {
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

export async function deletePdfProducto(
  productoId: string,
  tipo: 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia'
): Promise<void> {
  const paths = [`${productoId}/${tipo}.pdf`, `${productoId}/${tipo}.PDF`]
  await supabase.storage.from('product-docs').remove(paths)
}
