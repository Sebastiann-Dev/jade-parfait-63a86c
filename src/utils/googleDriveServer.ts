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

export interface DriveInputTarget {
  type: 'folder' | 'file'
  id: string
  rawUrl: string
}

export function parseDriveInput(inputText: string): DriveInputTarget[] {
  const targets: DriveInputTarget[] = []
  if (!inputText) return targets

  const lines = inputText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
  const seenIds = new Set<string>()

  for (const line of lines) {
    // 1. Check if folder URL
    const folderMatch = line.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (folderMatch && !seenIds.has(folderMatch[1])) {
      seenIds.add(folderMatch[1])
      targets.push({ type: 'folder', id: folderMatch[1], rawUrl: line })
      continue
    }

    // 2. Check if file URL
    const fileMatch = line.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (fileMatch && !seenIds.has(fileMatch[1])) {
      seenIds.add(fileMatch[1])
      targets.push({ type: 'file', id: fileMatch[1], rawUrl: line })
      continue
    }

    // 3. Check id= parameter
    const idMatch = line.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (idMatch && !seenIds.has(idMatch[1])) {
      seenIds.add(idMatch[1])
      const isFolder = line.includes('folders') || line.includes('folderview')
      targets.push({ type: isFolder ? 'folder' : 'file', id: idMatch[1], rawUrl: line })
      continue
    }

    // 4. Raw Google Drive ID
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(line) && !seenIds.has(line)) {
      seenIds.add(line)
      targets.push({ type: 'file', id: line, rawUrl: line })
    }
  }

  return targets
}

export function determinarTipoDoc(filename: string): 'ficha_tecnica' | 'ficha_seguridad' {
  const fname = filename.toLowerCase()
  if (fname.includes("msds") || fname.includes("sds") || fname.includes("seguridad") || fname.includes("safety")) {
    return 'ficha_seguridad'
  }
  return 'ficha_tecnica'
}

function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Función auxiliar para escanear de forma recursiva carpetas públicas mediante embeddedfolderview
 */
async function scanPublicFolderWeb(folderId: string, currentPath: string = 'Carpeta Raíz', processedIds: Set<string>): Promise<{ files: DriveFileItem[]; subfoldersCount: number }> {
  const files: DriveFileItem[] = []
  let subfoldersCount = 0

  const folderUrlsToTry = [
    `https://drive.google.com/embeddedfolderview?id=${folderId}#list`,
    `https://drive.google.com/embeddedfolderview?id=${folderId}`,
    `https://drive.google.com/drive/folders/${folderId}`
  ]

  let html = ''
  for (const url of folderUrlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8'
        }
      })
      if (res.ok) {
        const text = await res.text()
        if (text.includes('flip-entry') || text.includes('/file/d/')) {
          html = text
          break
        }
      }
    } catch (e) {
      // Intentar la siguiente URL
    }
  }

  if (!html) return { files, subfoldersCount }

  // 1. Patrón oficial embeddedfolderview: id="entry-FILE_ID" ... <div class="flip-entry-title">FILENAME</div>
  const flipRegex = /id="entry-([a-zA-Z0-9_-]{20,50})"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g
  let match: RegExpExecArray | null

  while ((match = flipRegex.exec(html)) !== null) {
    const fId = match[1]
    const rawName = decodeHtmlEntities(match[2].trim())
    if (!processedIds.has(fId) && rawName) {
      const fnameLower = rawName.toLowerCase()
      const isDoc = fnameLower.endsWith('.pdf') || fnameLower.endsWith('.docx') || fnameLower.endsWith('.doc')

      if (isDoc) {
        processedIds.add(fId)
        files.push({
          id: fId,
          name: rawName,
          mimeType: fnameLower.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          subfolderPath: currentPath,
          webViewLink: `https://drive.google.com/file/d/${fId}/view`,
          webContentLink: `https://drive.google.com/uc?export=download&id=${fId}`,
          tipoDoc: determinarTipoDoc(rawName)
        })
      } else if (!rawName.includes('.')) {
        // Es una subcarpeta dentro del Drive
        subfoldersCount++
        processedIds.add(fId)
        const subResult = await scanPublicFolderWeb(fId, `${currentPath} / ${rawName}`, processedIds)
        files.push(...subResult.files)
        subfoldersCount += subResult.subfoldersCount
      }
    }
  }

  // 2. Patrón de respaldo por si el layout es alternativo: /file/d/ID/view
  const viewRegex = /\/file\/d\/([a-zA-Z0-9_-]{20,50})\/view[^\"]*\"[^>]*>([^<]+)/g
  while ((match = viewRegex.exec(html)) !== null) {
    const fId = match[1]
    const rawName = decodeHtmlEntities(match[2].trim())
    if (!processedIds.has(fId) && rawName) {
      const fnameLower = rawName.toLowerCase()
      if (fnameLower.endsWith('.pdf') || fnameLower.endsWith('.docx') || fnameLower.endsWith('.doc')) {
        processedIds.add(fId)
        files.push({
          id: fId,
          name: rawName,
          mimeType: fnameLower.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          subfolderPath: currentPath,
          webViewLink: `https://drive.google.com/file/d/${fId}/view`,
          webContentLink: `https://drive.google.com/uc?export=download&id=${fId}`,
          tipoDoc: determinarTipoDoc(rawName)
        })
      }
    }
  }

  return { files, subfoldersCount }
}

/**
 * Server function para procesar enlaces de Google Drive (carpetas o archivos sueltos).
 */
export const parseGoogleDriveFolder = createServerFn({ method: 'POST' })
  .validator((data: { driveUrl: string }) => data)
  .handler(async ({ data }): Promise<DriveFolderParseResult> => {
    const targets = parseDriveInput(data.driveUrl)
    if (targets.length === 0) {
      throw new Error('No se encontraron enlaces o IDs válidos de Google Drive. Verifica que pegaste un enlace correcto.')
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
    const processedIds = new Set<string>()

    for (const target of targets) {
      if (target.type === 'file') {
        if (!processedIds.has(target.id)) {
          processedIds.add(target.id)
          filesFound.push({
            id: target.id,
            name: `Ficha_Drive_${target.id.slice(0, 6)}.pdf`,
            mimeType: 'application/pdf',
            subfolderPath: 'Enlace Directo',
            webViewLink: `https://drive.google.com/file/d/${target.id}/view`,
            webContentLink: `https://drive.google.com/uc?export=download&id=${target.id}`,
            tipoDoc: 'ficha_tecnica'
          })
        }
        continue
      }

      // Es una carpeta
      const folderId = target.id

      if (apiKey) {
        // 1. Google Drive API v3 oficial (si la API Key está configurada)
        async function listFolderRecursive(currentFolderId: string, currentPath: string = '') {
          const query = encodeURIComponent(`'${currentFolderId}' in parents and trashed = false`)
          const fields = encodeURIComponent('files(id, name, mimeType, webViewLink, webContentLink)')
          const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000&key=${apiKey}`

          const res = await fetch(url)
          if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Google Drive API (HTTP ${res.status}): ${errText}`)
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

              if ((isPdf || isDocx || isGDoc) && !processedIds.has(item.id)) {
                processedIds.add(item.id)
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
          warnings.push(`Error en la API de Google Drive para la carpeta ${folderId}: ${err.message}`)
        }

      } else {
        // 2. Extracción de URLs compartidas de Google Drive mediante embeddedfolderview
        try {
          const webRes = await scanPublicFolderWeb(folderId, 'Carpeta Compartida', processedIds)
          filesFound.push(...webRes.files)
          totalSubfolders += webRes.subfoldersCount
        } catch (err: any) {
          warnings.push(`No se pudo leer la carpeta públicas de Drive: ${err.message}`)
        }

        if (filesFound.length === 0) {
          warnings.push("⚠️ Asegúrate de que la carpeta de Google Drive tenga los permisos en 'Cualquier persona con el enlace'. También puedes arrastrar los archivos PDF directamente a la zona de carga.")
        }
      }
    }

    return {
      folderId: targets[0]?.id || '',
      files: filesFound,
      totalSubfolders,
      warnings
    }
  })

/**
 * Server function para descargar el contenido binario/base64 de un archivo en Google Drive.
 * Utiliza múltiples espejos de descarga pública con reintentos para asegurar máxima disponibilidad.
 */
export const fetchDriveFileBase64 = createServerFn({ method: 'POST' })
  .validator((data: { fileId: string; mimeType: string }) => data)
  .handler(async ({ data }): Promise<{ base64Data: string; mimeType: string; actualName?: string }> => {
    const apiKey =
      (process.env.VITE_GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).VITE_GOOGLE_DRIVE_API_KEY ||
      (process.env.GOOGLE_DRIVE_API_KEY as string) ||
      (globalThis as any).GOOGLE_DRIVE_API_KEY ||
      ''

    const downloadUrls: string[] = []

    if (apiKey) {
      if (data.mimeType === 'application/vnd.google-apps.document') {
        downloadUrls.push(`https://www.googleapis.com/drive/v3/files/${data.fileId}/export?mimeType=application/pdf&key=${apiKey}`)
      } else {
        downloadUrls.push(`https://www.googleapis.com/drive/v3/files/${data.fileId}?alt=media&key=${apiKey}`)
      }
    }

    // URLs de descarga pública directa de Google Drive
    downloadUrls.push(`https://drive.usercontent.google.com/download?id=${data.fileId}&confirm=t`)
    downloadUrls.push(`https://drive.google.com/uc?export=download&confirm=t&id=${data.fileId}`)
    downloadUrls.push(`https://docs.google.com/uc?export=download&confirm=t&id=${data.fileId}`)
    downloadUrls.push(`https://drive.google.com/uc?id=${data.fileId}&export=download`)

    let lastError: any = null

    for (const url of downloadUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        })

        if (!res.ok) continue

        const contentType = res.headers.get('content-type') || ''
        
        if (contentType.includes('text/html')) {
          const htmlText = await res.text()
          const confirmMatch = htmlText.match(/href="(\/download\/[^"]+confirm=[^"]+)"/) || htmlText.match(/href="(https:\/\/drive\.usercontent\.google\.com\/[^"]+)"/)
          if (confirmMatch) {
            const confirmUrl = confirmMatch[1].startsWith('http') ? confirmMatch[1] : `https://drive.google.com${confirmMatch[1]}`
            const confirmRes = await fetch(confirmUrl)
            if (confirmRes.ok) {
              const arrayBuffer = await confirmRes.arrayBuffer()
              if (arrayBuffer.byteLength > 1000) {
                return {
                  base64Data: Buffer.from(arrayBuffer).toString('base64'),
                  mimeType: 'application/pdf'
                }
              }
            }
          }
          continue
        }

        const arrayBuffer = await res.arrayBuffer()
        if (arrayBuffer.byteLength < 500) {
          continue
        }

        return {
          base64Data: Buffer.from(arrayBuffer).toString('base64'),
          mimeType: 'application/pdf'
        }

      } catch (err: any) {
        lastError = err
      }
    }

    throw new Error(`No se pudo descargar el archivo de Google Drive (${data.fileId}). Verifica que el archivo tenga activo el permiso "Cualquier persona con el enlace puede ver".`)
  })
