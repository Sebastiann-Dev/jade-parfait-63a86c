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
 */
export const saveProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    // data es el objeto { data: producto } enviado desde supabase.ts
    // extraemos el producto del campo 'data'
    const producto = (data as any)?.data ?? data ?? {};
    const cleanPayload = sanitizePayload(producto);

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
 */
export const updateProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    // data es el objeto { data: { id, data: updateData, expectedUpdatedAt } }
    // enviado desde supabase.ts como: updateProductoServer({ data: { id, data, expectedUpdatedAt } })
    const wrapper = (data as any)?.data ?? data ?? {};
    const id: string = wrapper.id;
    const updateData = wrapper.data;
    const expectedUpdatedAt: string | undefined = wrapper.expectedUpdatedAt;

    if (!id) {
      console.error("[updateProductoServer] Wrapper recibido:", JSON.stringify(wrapper));
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
 */
export const deleteProductoServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    // data es el objeto { data: { id } } enviado desde supabase.ts
    const wrapper = (data as any)?.data ?? data ?? {};
    const id: string = wrapper.id ?? wrapper;

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
