import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://flefgvaddvviayctxoou.supabase.co';
const supabaseAnonKey = 'sb_publishable_i1JKutd_pGnC2wGz49d8xQ_WDjy_FMs';

function sanitizePayload(payload: any) {
  if (!payload || typeof payload !== 'object') return {};
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
 * Llamada como: saveProductoServer(producto)
 * En el handler, data = producto directamente.
 */
export const saveProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const cleanPayload = sanitizePayload(data);

    console.log('[saveProductoServer] payload keys:', Object.keys(cleanPayload));

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
 * Llamada como: updateProductoServer({ id, updateData, expectedUpdatedAt })
 * En el handler, data = { id, updateData, expectedUpdatedAt }
 */
export const updateProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const d = data as any;
    const id: string = d?.id;
    const updateData = d?.updateData;
    const expectedUpdatedAt: string | undefined = d?.expectedUpdatedAt;

    console.log('[updateProductoServer] id:', id, '| keys:', updateData ? Object.keys(updateData) : 'none');

    if (!id) {
      console.error("[updateProductoServer] data recibido:", JSON.stringify(d));
      throw new Error("Se requiere el ID del producto para actualizar.");
    }

    const cleanPayload = sanitizePayload(updateData);
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
 * Llamada como: deleteProductoServer({ id })
 * En el handler, data = { id }
 */
export const deleteProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    const d = data as any;
    const id: string = d?.id;

    console.log('[deleteProductoServer] id:', id);

    if (!id || typeof id !== 'string') {
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
