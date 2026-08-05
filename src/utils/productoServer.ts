import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'

// Nota: La tabla 'productos' tiene RLS desactivado en Supabase,
// por lo que la anon key tiene permisos completos para INSERT/UPDATE/DELETE.
// NO se necesita service_role key.
const supabaseUrl = 'https://flefgvaddvviayctxoou.supabase.co';
const supabaseAnonKey = 'sb_publishable_i1JKutd_pGnC2wGz49d8xQ_WDjy_FMs';

function sanitizePayload(payload: any) {
  const clean = { ...payload };
  if (clean.ficha_tecnica_s3key !== undefined) {
    if (clean.ficha_tecnica_s3key) {
      clean.ficha_tecnica_url = clean.ficha_tecnica_s3key;
    }
    delete clean.ficha_tecnica_s3key;
  }
  if (clean.ficha_seguridad_s3key !== undefined) {
    if (clean.ficha_seguridad_s3key) {
      clean.ficha_seguridad_url = clean.ficha_seguridad_s3key;
    }
    delete clean.ficha_seguridad_s3key;
  }
  delete clean.cotizacion_referencia_s3key;
  delete clean.cotizacion_referencia_url;
  delete clean.id;
  return clean;
}

/**
 * Server function para insertar productos en Supabase.
 * Usa anon key porque la tabla productos tiene RLS desactivado.
 */
export const saveProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const rawData = data?.data || data || {};
    const cleanPayload = sanitizePayload(rawData);

    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { data: inserted, error } = await client
      .from('productos')
      .insert([cleanPayload])
      .select();

    if (error) {
      console.error("[saveProductoServer] Error:", error);
      throw new Error(error.message || "Error al insertar producto en Supabase.");
    }

    return { id: inserted[0]?.id };
  });

/**
 * Server function para actualizar productos en Supabase.
 * Usa anon key porque la tabla productos tiene RLS desactivado.
 */
export const updateProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const rawData = data?.data || data || {};
    const { id, data: updateData, expectedUpdatedAt } = rawData;

    if (!id) {
      throw new Error("Se requiere el ID del producto para actualizar.");
    }

    const cleanPayload = sanitizePayload(updateData || rawData);
    const client = createClient(supabaseUrl, supabaseAnonKey);

    let query = client
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

    if (error) {
      console.error("[updateProductoServer] Error:", error);
      throw new Error(error.message || "Error al actualizar producto en Supabase.");
    }

    if (expectedUpdatedAt && (!updatedData || updatedData.length === 0)) {
      throw new Error("CONCURRENCY_ERROR");
    }

    return { success: true };
  });

/**
 * Server function para eliminar productos en Supabase.
 * Usa anon key porque la tabla productos tiene RLS desactivado.
 */
export const deleteProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const rawData = data?.data || data || {};
    const id = rawData.id || rawData;

    if (!id) {
      throw new Error("Se requiere el ID del producto para eliminar.");
    }

    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await client
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("[deleteProductoServer] Error:", error);
      throw new Error(error.message || "Error al eliminar producto en Supabase.");
    }

    return { success: true };
  });
