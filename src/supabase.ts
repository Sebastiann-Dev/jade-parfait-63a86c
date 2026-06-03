import { createClient } from '@supabase/supabase-js';
import { Producto } from './data/productos';

const supabaseUrl = 'https://flefgvaddvviayctxoou.supabase.co';
const supabaseKey = 'sb_publishable_Fo02EzvNfNgQqcUkwLu6mQ_D4JqCodp';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchProductosSupabase(): Promise<(Producto & { id: string })[]> {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*');
      
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error("Error fetching products from Supabase (¿Configuraste tus credenciales?):", error);
    return []; // Fallback empty if not configured
  }
}

export async function saveProductoSupabase(producto: Omit<Producto, 'id'>) {
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

export async function updateProductoSupabase(id: string, data: Partial<Producto>) {
  try {
    const { error } = await supabase
      .from('productos')
      .update(data)
      .eq('id', id);
      
    if (error) throw error;
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
