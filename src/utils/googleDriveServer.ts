import { createServerFn } from '@tanstack/react-start'

export interface DriveFileItem {
  id: string
  name: string
  mimeType: string
  subfolderPath: string
  webViewLink: string
  webContentLink?: string
  tipoDoc: 'ficha_tecnica' | 'ficha_seguridad'
}

export interface DriveFolderParseResult {
  folderId: string
  files: DriveFileItem[]
  totalSubfolders: number
  warnings: string[]
}

export function extractDriveFolderId(inputUrl: string): string {
  if (!inputUrl) return ''
  const trimmed = inputUrl.trim()
  
  // Match folder pattern in Google Drive URLs
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return folderMatch[1]

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParamMatch) return idParamMatch[1]

  // If user pasted a raw ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed
  }

  return ''
}

export function determinarTipoDoc(filename: string): 'ficha_tecnica' | 'ficha_seguridad' {
  const fname = filename.toLowerCase()
  if (fname.includes("msds") || fname.includes("sds") || fname.includes("seguridad") || fname.includes("safety")) {
    return 'ficha_seguridad'
  }
  return 'ficha_tecnica'
}

/**
 * Server function para listar recursivamente archivos dentro de una carpeta de Google Drive.
 */
export const parseGoogleDriveFolder = createServerFn({ method: 'POST' })
  .validator((data: { driveUrl: string }) => data)
  .handler(async ({ data }): Promise<DriveFolderParseResult> => {
    const folderId = extractDriveFolderId(data.driveUrl)
    if (!folderId) {
      throw new Error('No se pudo extraer un ID válido de carpeta de Google Drive. Verifica el enlace proporcionado.')
    }

    const apiKey =
      (process.env.VITE_GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).VITE_GOOGLE_DRIVE_API_KEY ||
      (process.env.GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).GOOGLE_DRIVE_API_KEY ||
      ''

    const filesFound: DriveFileItem[] = []
    const warnings: string[] = []
    let totalSubfolders = 0

    if (apiKey) {
      // 1. Uso de Google Drive API v3 si la API Key está disponible
      async function listFolderRecursive(currentFolderId: string, currentPath: string = '') {
        const query = encodeURIComponent(`'${currentFolderId}' in parents and trashed = false`)
        const fields = encodeURIComponent('files(id, name, mimeType, webViewLink, webContentLink)')
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000&key=${apiKey}`

        const res = await fetch(url)
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Google Drive API error: ${res.status} - ${errText}`)
        }

        const resData = await res.json()
        const items = resData.files || []

        for (const item of items) {
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            totalSubfolders++
            const nextPath = currentPath ? `${currentPath} / ${item.name}` : item.name
            await listFolderRecursive(item.id, nextPath)
          } else {
            const fname = item.name.toLowerCase()
            const isPdf = item.mimeType === 'application/pdf' || fname.endsWith('.pdf')
            const isDocx = item.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fname.endsWith('.docx') || fname.endsWith('.doc')
            const isGDoc = item.mimeType === 'application/vnd.google-apps.document'

            if (isPdf || isDocx || isGDoc) {
              filesFound.push({
                id: item.id,
                name: item.name,
                mimeType: item.mimeType,
                subfolderPath: currentPath || 'Carpeta Raíz',
                webViewLink: item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`,
                webContentLink: item.webContentLink,
                tipoDoc: determinarTipoDoc(item.name)
              })
            }
          }
        }
      }

      try {
        await listFolderRecursive(folderId)
      } catch (err: any) {
        throw new Error(`Error al explorar carpeta en Google Drive API: ${err.message || err}`)
      }

    } else {
      // 2. Fallback público mediante lectura web si no hay API Key configurada
      try {
        const publicUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`
        const res = await fetch(publicUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} al acceder a la carpeta de Google Drive. Asegúrate de que la carpeta esté compartida con "Cualquier persona con el enlace".`)
        }

        const html = await res.text()
        
        // Extraer los IDs de archivos y nombres desde el HTML embebido de Google Drive
        const fileRegex = /\/file\/d\/([a-zA-Z0-9_-]+)\/view[^\"]*\"[^>]*>([^<]+)/g
        let match: RegExpExecArray | null

        const seenIds = new Set<string>()

        while ((match = fileRegex.exec(html)) !== null) {
          const fId = match[1]
          const fName = match[2].trim()

          if (!seenIds.has(fId) && fName) {
            seenIds.add(fId)
            const fnameLower = fName.toLowerCase()
            if (fnameLower.endsWith('.pdf') || fnameLower.endsWith('.docx') || fnameLower.endsWith('.doc')) {
              filesFound.push({
                id: fId,
                name: fName,
                mimeType: fnameLower.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                subfolderPath: 'Carpeta Compartida',
                webViewLink: `https://drive.google.com/file/d/${fId}/view`,
                webContentLink: `https://drive.google.com/uc?export=download&id=${fId}`,
                tipoDoc: determinarTipoDoc(fName)
              })
            }
          }
        }

        if (filesFound.length === 0) {
          warnings.push("No se encontraron archivos PDF o Word con la vista pública. Para escanear subcarpetas complejas de Drive, se sugiere configurar GOOGLE_DRIVE_API_KEY o compartir la carpeta públicamente.")
        }
      } catch (err: any) {
        throw new Error(`No se pudo leer la carpeta de Google Drive. Verifica que la carpeta esté compartida como pública ("Cualquier persona con el enlace"). Detalle: ${err.message || err}`)
      }
    }

    return {
      folderId,
      files: filesFound,
      totalSubfolders,
      warnings
    }
  })

/**
 * Server function para descargar el contenido binario/base64 de un archivo en Google Drive.
 */
export const fetchDriveFileBase64 = createServerFn({ method: 'POST' })
  .validator((data: { fileId: string; mimeType: string }) => data)
  .handler(async ({ data }): Promise<{ base64Data: string; mimeType: string }> => {
    const apiKey =
      (process.env.VITE_GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).VITE_GOOGLE_DRIVE_API_KEY ||
      (process.env.GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).GOOGLE_DRIVE_API_KEY ||
      ''

    let downloadUrl = ''

    if (data.mimeType === 'application/vnd.google-apps.document') {
      // Exportar Google Docs como PDF
      if (apiKey) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${data.fileId}/export?mimeType=application/pdf&key=${apiKey}`
      } else {
        downloadUrl = `https://docs.google.com/document/d/${data.fileId}/export?format=pdf`
      }
    } else {
      if (apiKey) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${data.fileId}?alt=media&key=${apiKey}`
      } else {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${data.fileId}`
      }
    }

    const res = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    if (!res.ok) {
      // Try direct link fallback
      const altUrl = `https://drive.google.com/uc?export=download&confirm=no_antivirus&id=${data.fileId}`
      const altRes = await fetch(altUrl)
      if (!altRes.ok) {
        throw new Error(`Error al descargar el archivo de Drive (HTTP ${res.status}). Asegúrate de que el archivo esté compartido públicamente.`)
      }
      const arrayBuffer = await altRes.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return {
        base64Data: base64,
        mimeType: 'application/pdf'
      }
    }

    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return {
      base64Data: base64,
      mimeType: data.mimeType.includes('word') || data.mimeType.includes('officedocument') ? 'application/pdf' : 'application/pdf'
    }
  })
