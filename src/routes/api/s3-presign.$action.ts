/**
 * src/routes/api/s3-presign.ts — Endpoints del servidor para generar Presigned URLs de S3
 *
 * Estos endpoints son llamados únicamente desde el panel /admin (autenticado).
 * El código de este archivo se ejecuta en el servidor (Cloudflare Workers SSR),
 * nunca en el navegador. Las credenciales de AWS jamás llegan al cliente.
 *
 * Endpoints:
 *   POST /api/s3-presign/upload   → { productoId, tipo, contentType } → { uploadUrl, s3Key }
 *   POST /api/s3-presign/download → { s3Key }                         → { downloadUrl }
 */

import { createAPIFileRoute } from '@tanstack/react-start/api'
import {
  generateUploadPresignedUrl,
  generateDownloadPresignedUrl,
  type DocTipo,
} from '../../server/s3'

// ─── POST /api/s3-presign/upload ─────────────────────────────────────────────
export const APIRoute = createAPIFileRoute('/api/s3-presign/$action')({
  POST: async ({ request, params }) => {
    try {
      const body = await request.json() as Record<string, string>
      const action = params.action

      if (action === 'upload') {
        const { productoId, tipo, contentType } = body

        if (!productoId || !tipo) {
          return new Response(
            JSON.stringify({ error: 'Se requieren productoId y tipo' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const result = await generateUploadPresignedUrl(
          productoId,
          tipo as DocTipo,
          contentType || 'application/pdf'
        )

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (action === 'download') {
        const { s3Key } = body

        if (!s3Key) {
          return new Response(
            JSON.stringify({ error: 'Se requiere s3Key' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const downloadUrl = await generateDownloadPresignedUrl(s3Key)

        return new Response(JSON.stringify({ downloadUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(
        JSON.stringify({ error: 'Acción no reconocida. Usa "upload" o "download".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    } catch (err: any) {
      console.error('[S3 Presign API Error]', err)
      return new Response(
        JSON.stringify({ error: err.message || 'Error interno del servidor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  },
})
