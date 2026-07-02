/**
 * Gestión centralizada de claves Gemini API
 * Las claves están ofuscadas con XOR+Base64 para reducir exposición accidental.
 * NOTA: La ofuscación no es cifrado real — no almacenar datos ultra-sensibles aquí.
 *       El modelo de seguridad asume que las claves son de cuota limitada y rotables.
 */

function decryptApiKey(encryptedStr: string): string {
  try {
    const encryptedBytes = atob(encryptedStr)
    const xorKey = 'antigravity'
    const decryptedChars: string[] = []
    for (let i = 0; i < encryptedBytes.length; i++) {
      const byte = encryptedBytes.charCodeAt(i)
      const keyChar = xorKey.charCodeAt(i % xorKey.length)
      decryptedChars.push(String.fromCharCode(byte ^ keyChar))
    }
    return decryptedChars.join('').split('').reverse().join('')
  } catch (e) {
    console.error('Error decrypting API Key', e)
    return ''
  }
}

const OBFUSCATED_KEYS = [
  '', // Clave Principal
  '', // Respaldo 1
  '', // Respaldo 2
  '', // Respaldo 3
]

/** Array de claves Gemini desofuscadas y listas para usar */
export const GEMINI_KEYS: string[] = OBFUSCATED_KEYS.map(decryptApiKey).filter(Boolean)

/** Devuelve una representación parcialmente enmascarada de la clave (para UI de debug) */
export function getMaskedKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return '••••••••'
  return `${key.substring(0, 7)}••••••••••••${key.substring(key.length - 4)}`
}
