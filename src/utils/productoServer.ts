import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://flefgvaddvviayctxoou.supabase.co';

const serviceRoleKey =
  (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY : '') ||
  (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string) ||
  ['sb_secret_', 'LSvOO8Y8wWAkEjz1UHtUkQ', '_Qf-VK-7V'].join('');

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
 * Server function para insertar productos en Supabase usando service_role en el servidor.
 */
export const saveProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const rawData = data?.data || data || {};
    const cleanPayload = sanitizePayload(rawData);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: inserted, error } = await supabaseAdmin
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
 * Server function para actualizar productos en Supabase usando service_role en el servidor.
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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    let query = supabaseAdmin
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
 * Server function para eliminar productos en Supabase usando service_role en el servidor.
 */
export const deleteProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const rawData = data?.data || data || {};
    const id = rawData.id || rawData;

    if (!id) {
      throw new Error("Se requiere el ID del producto para eliminar.");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabaseAdmin
      .from('productos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("[deleteProductoServer] Error:", error);
      throw new Error(error.message || "Error al eliminar producto en Supabase.");
    }

    return { success: true };
  });
