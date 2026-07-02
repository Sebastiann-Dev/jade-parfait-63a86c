import { createServerFn } from '@tanstack/react-start'

export interface GeminiPayload {
  contents: any[]
  systemInstruction?: {
    parts: { text: string }[]
  }
  generationConfig?: {
    responseMimeType?: string
  }
}

/**
 * Server Function segura para interactuar con la API de Gemini.
 * Ejecuta el fetch únicamente en el backend (Cloudflare/Node) de forma que las llaves nunca viajan al cliente.
 */
export const callGeminiServer = createServerFn({ method: 'POST' })
  .validator((data: GeminiPayload) => data)
  .handler(async ({ data }) => {
    // Obtener las llaves configuradas en el servidor de forma segura.
    // Soporta variables locales y de Cloudflare Bindings.
    const rawKeys =
      (process.env.VITE_GEMINI_API_KEY as string) ||
      (globalThis as any).VITE_GEMINI_API_KEY ||
      (process.env.GEMINI_API_KEY as string) ||
      (globalThis as any).GEMINI_API_KEY ||
      '';

    // Soporte para múltiples llaves separadas por coma, punto y coma o espacio (rotación automática)
    const keys = rawKeys
      .split(/[,;\s]+/)
      .map(k => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      throw new Error('No se han configurado API Keys de Gemini en las variables de entorno del servidor (VITE_GEMINI_API_KEY).');
    }

    let lastError: any = null;

    // Intentamos secuencialmente con las llaves disponibles (rotación de cuota)
    for (const apiKey of keys) {
      try {
        // Usamos gemini-2.5-flash que es el modelo estándar con mejor soporte multimodal y velocidad
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: data.contents,
            systemInstruction: data.systemInstruction,
            generationConfig: data.generationConfig
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const resJson = await response.json();
        const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
          throw new Error('Gemini retornó una estructura vacía o sin texto.');
        }

        return { text: textResponse };
      } catch (err: any) {
        console.warn(`[Gemini Server Function] Error con llave de API: ${err.message || err}`);
        lastError = err;
      }
    }

    throw new Error(`Todas las llaves de Gemini en el servidor fallaron. Último error: ${lastError?.message || lastError}`);
  });
