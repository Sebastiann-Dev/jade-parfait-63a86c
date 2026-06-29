/**
 * src/server/s3.ts — Módulo del servidor para AWS S3
 *
 * IMPORTANTE: Este módulo se ejecuta ÚNICAMENTE en el servidor (TanStack Start
 * Server Functions). Nunca será incluido en el bundle del navegador.
 *
 * Las credenciales de AWS se leen de variables de entorno del servidor (process.env),
 * no de variables de Vite (import.meta.env), por lo que NUNCA se exponen al cliente.
 *
 * Arquitectura de documentos:
 *   Upload: Navegador → pide Presigned PUT URL al servidor → sube directamente a S3
 *   Download: Navegador → pide Presigned GET URL al servidor → descarga directamente de S3
 *   DB: Supabase solo almacena el S3 Key (ruta relativa), nunca la URL pública.
 *
 * Formato de S3 Key:
 *   productos/{timestamp}_{productoId}_{tipo}.pdf
 *   Ejemplo: productos/1751200000123_abc123_ficha_tecnica.pdf
 *
 *   El timestamp permite:
 *   - Ordenar cronológicamente sin consultar la DB.
 *   - Detectar y limpiar archivos huérfanos o viejos mediante S3 Lifecycle Policies.
 *   - Manejar tamaños grandes al poder aplicar reglas de archivado automático a Glacier.
 *
 * Extensibilidad futura:
 *   Este módulo puede reutilizarse para cualquier otro tipo de archivo:
 *   - Fotos de obra subidas por clientes en el Scoping Wizard.
 *   - PDFs de cotizaciones formales generados por el servidor.
 *   - Reportes de exportación del portal de prospectos.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ─── Cliente S3 (singleton) ───────────────────────────────────────────────────
// Credenciales leídas de variables de entorno del servidor. No usar VITE_ prefix.
function getS3Client(): S3Client {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Faltan variables de entorno de AWS S3. ' +
      'Configura AWS_REGION, AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en tu .env.local'
    )
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET
  if (!bucket) {
    throw new Error('Falta la variable de entorno AWS_S3_BUCKET en tu .env.local')
  }
  return bucket
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type DocTipo = 'ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia'

export interface PresignedUploadResult {
  /** URL firmada de PUT para subir el archivo directamente a S3 desde el navegador */
  uploadUrl: string
  /** Clave única del objeto en S3. Guardar este valor en Supabase, no la URL. */
  s3Key: string
}

// ─── Generación de S3 Key con timestamp ──────────────────────────────────────
/**
 * Genera una clave única de S3 con timestamp para un documento de producto.
 * Formato: productos/{timestamp}_{productoId}_{tipo}.pdf
 */
export function buildS3Key(productoId: string, tipo: DocTipo, extension = 'pdf'): string {
  const timestamp = Date.now()
  return `productos/${timestamp}_${productoId}_${tipo}.${extension}`
}

// ─── Presigned URL para SUBIDA (PUT) ─────────────────────────────────────────
/**
 * Genera una URL firmada para que el navegador suba un archivo directamente a S3
 * mediante una petición HTTP PUT. El archivo NUNCA pasa por nuestro servidor.
 *
 * @param productoId   - ID del producto al que pertenece el documento
 * @param tipo         - Tipo de documento ('ficha_tecnica' | 'ficha_seguridad' | 'cotizacion_referencia')
 * @param contentType  - MIME type del archivo (ej: 'application/pdf')
 * @param expiresIn    - Segundos de validez de la URL (default: 300 = 5 minutos)
 * @returns            - { uploadUrl, s3Key } — guardar s3Key en Supabase
 */
export async function generateUploadPresignedUrl(
  productoId: string,
  tipo: DocTipo,
  contentType = 'application/pdf',
  expiresIn = 300
): Promise<PresignedUploadResult> {
  const s3 = getS3Client()
  const bucket = getBucket()
  const s3Key = buildS3Key(productoId, tipo)

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
    // Metadatos adicionales para gestión futura
    Metadata: {
      productoId,
      tipo,
      uploadedAt: new Date().toISOString(),
    },
  })

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn })
  return { uploadUrl, s3Key }
}

// ─── Presigned URL para DESCARGA (GET) ───────────────────────────────────────
/**
 * Genera una URL firmada temporal para descargar un archivo de S3.
 * El enlace expira automáticamente — el archivo es privado y no indexable.
 *
 * @param s3Key     - Clave del objeto en S3 (guardada en Supabase)
 * @param expiresIn - Segundos de validez (default: 900 = 15 minutos)
 * @returns         - URL de descarga temporal
 */
export async function generateDownloadPresignedUrl(
  s3Key: string,
  expiresIn = 900
): Promise<string> {
  const s3 = getS3Client()
  const bucket = getBucket()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    // ResponseContentDisposition asegura que el PDF se abra en el navegador (no se descargue)
    ResponseContentDisposition: 'inline',
    ResponseContentType: 'application/pdf',
  })

  return getSignedUrl(s3, command, { expiresIn })
}

// ─── Eliminación de objeto ────────────────────────────────────────────────────
/**
 * Elimina un objeto de S3. Llamar al borrar un producto o reemplazar un documento.
 * Es seguro llamar con una clave que no existe (S3 no lanza error en ese caso).
 *
 * @param s3Key - Clave del objeto a eliminar
 */
export async function deleteS3Object(s3Key: string): Promise<void> {
  if (!s3Key) return

  const s3 = getS3Client()
  const bucket = getBucket()

  const command = new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
  await s3.send(command)
}
