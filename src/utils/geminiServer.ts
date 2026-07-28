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
 * Soporta rotación de llaves, múltiples modelos de respaldo (2.5-flash, 2.0-flash, 1.5-pro)
 * y reintento automático ante límites de cuota (HTTP 429).
 */
export const callGeminiServer = createServerFn({ method: 'POST' })
  .validator((input: any) => input)
  .handler(async ({ data }) => {
    // Resolve payload whether TanStack Start passed it wrapped as data or directly
    const rawData = (data as any)?.data || data || {};
    const payload: GeminiPayload = rawData.contents ? rawData : (rawData.data || rawData);

    if (!payload.contents) {
      throw new Error("No se recibieron datos de consulta ('contents') en el servidor.");
    }

    const gAny = globalThis as any;
    const pEnv = (typeof process !== 'undefined' ? process.env : {}) || {};
    const metaEnv = (import.meta as any).env || {};

    const rawKeys =
      (pEnv.GEMINI_API_KEY as string) ||
      (pEnv.VITE_GEMINI_API_KEY as string) ||
      (metaEnv.GEMINI_API_KEY as string) ||
      (metaEnv.VITE_GEMINI_API_KEY as string) ||
      (gAny.GEMINI_API_KEY as string) ||
      (gAny.VITE_GEMINI_API_KEY as string) ||
      (gAny.env?.GEMINI_API_KEY as string) ||
      (gAny.env?.VITE_GEMINI_API_KEY as string) ||
      '';

    const keys = rawKeys
      .split(/[,;\s]+/)
      .map(k => k.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      throw new Error('No se han configurado API Keys de Gemini en las variables de entorno del servidor (VITE_GEMINI_API_KEY).');
    }

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    let lastError: any = null;

    for (const apiKey of keys) {
      for (const modelName of modelsToTry) {
        let attempt = 0;
        const maxAttempts = 2;

        while (attempt < maxAttempts) {
          attempt++;
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: payload.contents,
                systemInstruction: payload.systemInstruction,
                generationConfig: payload.generationConfig
              })
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              const msg = errData.error?.message || `HTTP ${response.status}`;

              if (response.status === 429) {
                // Límite de cuota / peticiones por minuto alcanzado (Free tier)
                console.warn(`[Gemini Server] Cuota excedida (HTTP 429) con modelo ${modelName}. Reintentando en 3s (Intento ${attempt}/${maxAttempts})...`);
                await new Promise(r => setTimeout(r, 3000));
                continue; // Reintentar
              }

              if (response.status === 404) {
                // Modelo no disponible en esa versión de API, probar siguiente modelo
                break;
              }

              throw new Error(msg);
            }

            const resJson = await response.json();
            const textResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResponse) {
              throw new Error(`Gemini (${modelName}) retornó respuesta vacía.`);
            }

            return { text: textResponse };

          } catch (err: any) {
            lastError = err;
            if (attempt >= maxAttempts) {
              console.warn(`[Gemini Server] Falló modelo ${modelName} con llave actual: ${err.message || err}`);
            }
          }
        }
      }
    }

    const errMsg = lastError?.message || lastError || 'Error desconocido en Gemini';
    if (errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(`⚠️ Cuota de peticiones por minuto alcanzada en la cuenta gratuita de Gemini (15 peticiones/min). Espera unos segundos y haz clic en '🔄 Reintentar IA'. (${errMsg})`);
    }

    throw new Error(`Error en API de Gemini: ${errMsg}`);
  });
