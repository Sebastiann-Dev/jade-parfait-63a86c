import React, { useState, useRef, useEffect, useMemo } from 'react'
import { type Producto } from '../data/productos'
import { fetchSistemaProductosSupabase, type Sistema } from '../supabase'
import { callGeminiServer } from '../utils/geminiServer'

function parseMarkdown(text: string) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match;

  const parseBold = (str: string, segmentKeyPrefix: string) => {
    const boldParts: React.ReactNode[] = [];
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let boldLastIdx = 0;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(str)) !== null) {
      const normalText = str.substring(boldLastIdx, boldMatch.index);
      if (normalText) {
        boldParts.push(normalText);
      }
      boldParts.push(<strong key={`${segmentKeyPrefix}-bold-${boldMatch.index}`} className="font-bold text-gray-950">{boldMatch[1]}</strong>);
      boldLastIdx = boldRegex.lastIndex;
    }
    const remainingText = str.substring(boldLastIdx);
    if (remainingText) {
      boldParts.push(remainingText);
    }
    return boldParts;
  };

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(...parseBold(textBefore, `pre-${match.index}`));
    }
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-0.5 mx-0.5"
      >
        {linkText}
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter) {
    parts.push(...parseBold(textAfter, 'post'));
  }

  return parts;
}

function renderParsedMessage(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const parsedLine = parseMarkdown(line);
    return (
      <div key={idx} className={idx > 0 ? "mt-1" : ""}>
        {parsedLine}
      </div>
    );
  });
}

function detectProductsInMessage(msgText: string, catalog: Producto[]) {
  if (!msgText || !catalog || catalog.length === 0) return [];
  const detected: Producto[] = [];
  const textLower = msgText.toLowerCase();
  
  catalog.forEach(p => {
    if (!p.nombre) return;
    const nameLower = p.nombre.toLowerCase();
    
    // Ignore short words to avoid false positive triggers (unless exact boundaries match)
    if (nameLower.length < 4) {
      const escapedName = p.nombre.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedName}\\b`, 'i');
      if (regex.test(msgText) && (p.ficha_tecnica_url || p.ficha_seguridad_url)) {
        if (!detected.some(d => d.id === p.id)) {
          detected.push(p);
        }
      }
    } else {
      if (textLower.includes(nameLower) && (p.ficha_tecnica_url || p.ficha_seguridad_url)) {
        if (!detected.some(d => d.id === p.id)) {
          detected.push(p);
        }
      }
    }
  });
  return detected;
}

interface ChatAsistenteProps {
  productosDisponibles: Producto[]
  productoSeleccionado: Producto | null
  sistemaSeleccionado: Sistema | null
  sistemaRels: { id: string; producto: Producto; consumo_por_m2: number; orden: number }[]
  sistemasDisponibles: Sistema[]
  cotizarTipo: 'producto' | 'sistema'
}

export const ChatAsistente: React.FC<ChatAsistenteProps> = ({
  productosDisponibles,
  productoSeleccionado,
  sistemaSeleccionado,
  sistemaRels,
  sistemasDisponibles,
  cotizarTipo
}) => {
  const [chatAbierto, setChatAbierto] = useState(false)
  const [chatMensaje, setChatMensaje] = useState('')
  const [chatHistorial, setChatHistorial] = useState<{ remitente: 'user' | 'ia'; texto: string; hora: string }[]>([])
  const [chatCargando, setChatCargando] = useState(false)
  const [chatActiveKeyIndex, setChatActiveKeyIndex] = useState(0)
  const [mostrarClipMenu, setMostrarClipMenu] = useState(false)
  const [clipMenuTab, setClipMenuTab] = useState<'productos' | 'sistemas'>('productos')
  const [citadosProductos, setCitadosProductos] = useState<Producto[]>([])
  const [citadoSistema, setCitadoSistema] = useState<Sistema | null>(null)

  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const lastCitedSystemId = useRef<string | null>(null)

  // Auto-scroll chat window when new messages arrive
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistorial, chatAbierto])

  // Automatically cite system and its products when a system is selected and we are in system quotation mode
  useEffect(() => {
    if (cotizarTipo === 'sistema' && sistemaSeleccionado && sistemaRels.length > 0) {
      if (lastCitedSystemId.current !== sistemaSeleccionado.id) {
        setCitadoSistema(sistemaSeleccionado)
        const systemProds = sistemaRels.map(r => r.producto).filter(Boolean)
        setCitadosProductos(prev => {
          const merged = [...prev]
          systemProds.forEach(sp => {
            if (!merged.some(p => p.nombre === sp.nombre)) {
              merged.push(sp)
            }
          })
          return merged
        })
        lastCitedSystemId.current = sistemaSeleccionado.id
      }
    } else if (cotizarTipo === 'producto') {
      // Clear cited systems if switching back to individual product mode
      setCitadoSistema(null)
      setCitadosProductos([])
      lastCitedSystemId.current = null
    }
  }, [sistemaSeleccionado, sistemaRels, cotizarTipo])

  const enviarMensajeChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const texto = chatMensaje.trim();
    if (!texto || chatCargando) return;

    const horaActual = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const nuevoHistorial = [...chatHistorial, { remitente: 'user' as const, texto, hora: horaActual }];
    setChatHistorial(nuevoHistorial);
    setChatMensaje('');
    setChatCargando(true);

    try {
      const contextPrompt = `Eres el Asistente Técnico experto de BUCA MX. Tu objetivo es ayudar a los vendedores a resolver dudas sobre fichas técnicas, realizar conversiones (como mils a micras, litros a galones) y hacer cálculos de consumo de material.

INFORMACIÓN DEL CATÁLOGO DE PRODUCTOS:
Puedes buscar y leer entre los siguientes productos registrados en BUCA Recubrimientos. Si el usuario te pregunta por alguno de ellos o te cita uno de ellos, usa estas especificaciones técnicas:
${productosDisponibles.map(p => `
* Nombre: ${p.nombre}
  - Descripción: ${p.nota || 'No disponible'}
  - Unidad: ${p.unidad}
  - Moneda: ${p.moneda}
  - Precio unitario: $${p.precio}
  - Rendimiento: ${p.tieneRendimiento && p.rendimiento ? `${p.rendimiento} m²/${p.unidad}` : 'No aplica o requiere cálculo dinámico'}
  - Espesor recomendado: ${p.espesorRecomendado || 'No especificado'}
  - Manos recomendadas: ${p.manosRecomendadas || 'No especificado'}
  - Densidad: ${p.densidadRecomendada || 'No especificado'}
  - Proporción de mezcla: ${p.proporcionesMezcla || 'No aplica'}
  - Ventajas: ${p.pros || 'No especificados'}
  - Limitantes: ${p.cons || 'No especificadas'}
  - Precauciones: ${p.cuidadoCon || 'No especificadas'}
  - Ficha Técnica (TDS) URL: ${p.ficha_tecnica_url || 'No disponible'}
  - Ficha de Seguridad (SDS) URL: ${p.ficha_seguridad_url || 'No disponible'}`).join('\n')}

INFORMACIÓN DE SELECCIÓN Y CITACIÓN DE PRODUCTOS EN TIEMPO REAL:
- Producto SELECCIONADO en el cotizador principal: ${productoSeleccionado ? productoSeleccionado.nombre : 'Ninguno'}
- Productos CITADOS individualmente en el chat: ${citadosProductos.length > 0 ? citadosProductos.map(p => p.nombre).join(', ') : 'Ninguno'}
- Sistema Multicapa CITADO en el chat: ${citadoSistema ? citadoSistema.nombre : 'Ninguno'}
${citadoSistema && sistemaRels.length > 0 ? `
Componentes del Sistema Multicapa Citado (orden de aplicación desde la base hacia arriba):
${[...sistemaRels].sort((a, b) => a.orden - b.orden).map(rel => {
  let rol = 'Cuerpo / Capa Intermedia';
  if (rel.orden === 0) rol = 'Primario / Anclaje';
  else if (rel.orden === sistemaRels.length - 1) rol = 'Sello / Acabado Final';
  
  let instructions = 'Aplicar uniformemente según ficha técnica.';
  if (rel.orden === 0) instructions = 'Asegurar que el sustrato esté limpio y seco. Mezclar componentes A y B por 3 minutos. Aplicar con rodillo o jalador de goma.';
  else if (rel.producto.nombre.toLowerCase().includes('autonivelante') || rel.producto.nombre.toLowerCase().includes('bucacrete')) {
    instructions = 'Verter la mezcla homogénea directamente sobre el piso. Extender rápidamente a la altura deseada con rastrillo de nivel o llana dentada. Pasar inmediatamente rodillo de picos metálicos (spike roller) de forma cruzada para liberar burbujas de aire.';
  } else if (rel.producto.nombre.toLowerCase().includes('saco') || rel.producto.nombre.toLowerCase().includes('arena')) {
    instructions = 'Espolvorear de manera uniforme a saturación sobre la capa base húmeda anterior. Permitir curado y retirar el exceso de arena barriendo antes de aplicar el sello.';
  }
  
  return `- Capa ${rel.orden + 1}: ${rel.producto.nombre} (${rel.producto.unidad})
    * Papel/Rol: ${rol}
    * Consumo: ${rel.consumo_por_m2} ${rel.producto.unidad}/m²
    * Espesor: ${rel.producto.espesorRecomendado || 'N/A'}
    * Ficha Técnica (TDS) URL: ${rel.producto.ficha_tecnica_url || 'No disponible'}
    * Ficha de Seguridad (SDS) URL: ${rel.producto.ficha_seguridad_url || 'No disponible'}
    * Instrucciones de aplicación: ${instructions}`;
}).join('\n')}
` : ''}

REGLAS CRÍTICAS DE COMPORTAMIENTO:
1. Sé conciso y técnico. Tus respuestas deben ser rápidas y al grano, ideales para un vendedor en medio de una llamada comercial.
2. Tú TIENES acceso completo a todo el catálogo de productos detallado arriba. Por lo tanto, eres capaz de responder dudas, ventajas, limitantes, rendimientos y conversiones de cualquier producto directamente, incluso si no está seleccionado en el cotizador ni citado por el clip.
3. Si el usuario selecciona o cita un sistema multicapa, y te hace una consulta general de inicio, saludo o confirmación, NUNCA listes todas sus especificaciones técnicas de golpe. Limítate a confirmar amablemente que tienes leída la estructura del sistema (ej: "Entendido, tengo cargada la estructura del sistema [Nombre].") y pregúntale qué desea hacer (ej: si desea calcular el consumo de material para cierta área, ver los pasos de aplicación o detallar alguna capa en particular).
4. NUNCA digas al usuario que no hay ningún producto seleccionado o que debe seleccionar/citar un producto de la lista para que puedas acceder a su ficha técnica. Si el usuario te saluda ("hola") o te hace una pregunta sin haber seleccionado o citado un producto, dale una bienvenida cordial, infórmale que tienes acceso completo a todas las fichas técnicas del catálogo y que puedes responder cualquier duda sobre ellos, y pregúntale sobre qué producto o cálculo desea consultar hoy.
5. Si el usuario selecciona un producto en la cotización principal o lo cita mediante el botón de clip, y te hace una pregunta general de inicio, saludo o confirmación (ej: "listo", "ya", "que tal ahora", "hola", etc.), NUNCA debes recitar ni listar todas sus especificaciones técnicas de golpe. Limítate únicamente a confirmar amablemente que ya lo tienes leído (ej: "Entendido, ya tengo la información de [Producto].") y haz una PREGUNTA explícita sobre qué desea hacer el usuario con él (ej: "¿Quieres que calculemos el consumo para un área, o prefieres revisar su rendimiento o mezcla?").
6. Si el usuario te hace preguntas sobre cualquier producto en el catálogo (incluso si no está seleccionado ni citado), búscalo en la sección "INFORMACIÓN DEL CATÁLOGO DE PRODUCTOS" arriba, léelo y responde detalladamente.
7. Si el usuario te pregunta por consumos para un área específica (ej. "tengo 150 m2"), calcula el volumen necesario de forma precisa dividiendo el área entre el rendimiento del producto (Área / Rendimiento) si tiene rendimiento.
8. NUNCA inventes especificaciones técnicas. Si un valor es "No especificado" o no existe en el catálogo, dile amablemente que no está registrado y sugíerele verificar la ficha física o soporte.
9. Puedes hacer conversiones matemáticas estándar (ej: 1 galón = 3.785 L, 1 mil = 25.4 micras).
10. Siempre que respondas sobre un producto o sistema, o cuando un producto esté citado/seleccionado en el chat, si en su información del catálogo tiene disponible una Ficha Técnica (TDS) o Ficha de Seguridad (SDS) con una URL válida, debes anexar/citar obligatoriamente dichos enlaces al final de tu respuesta en formato Markdown para que el usuario pueda descargarlos directamente (ej. "[📄 Descargar Ficha Técnica (TDS)](URL_AQUÍ)" o "[🛡️ Descargar Ficha de Seguridad (SDS)](URL_AQUÍ)"). Si no tiene URL disponible, indícalo brevemente.`;

      const formattedContents = [
        ...nuevoHistorial.map(h => ({
          role: h.remitente === 'user' ? 'user' : 'model',
          parts: [{ text: h.texto }]
        }))
      ];

      const res = await callGeminiServer({
        data: {
          contents: formattedContents,
          systemInstruction: {
            parts: [{ text: contextPrompt }]
          }
        }
      });

      const textResponse = res.text;
      if (!textResponse) {
        throw new Error('No se recibió respuesta en texto.');
      }

      const horaResponse = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      setChatHistorial(prev => [...prev, { remitente: 'ia', texto: textResponse, hora: horaResponse }]);
    } catch (err: any) {
      console.error("Error completo de Gemini:", err);
      const horaError = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      setChatHistorial(prev => [...prev, { 
        remitente: 'ia', 
        texto: `❌ Error al conectar con el Asistente Técnico: ${err.message || 'Error de procesamiento en el servidor.'}`, 
        hora: horaError 
      }]);
    } finally {
      setChatCargando(false);
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!chatAbierto && (
        <div className="fixed bottom-6 right-6 z-50 print:hidden">
          <button
            onClick={() => setChatAbierto(true)}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 font-semibold text-sm cursor-pointer select-none"
          >
            <span className="text-base">💬</span>
            <span>Asistente Técnico</span>
          </button>
        </div>
      )}

      {/* Chat Window Panel */}
      {chatAbierto && (
        <div className="fixed bottom-20 right-6 w-[340px] max-w-[calc(100vw-2rem)] h-[480px] bg-white border border-gray-150 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 print:hidden">
          {/* Header */}
          <div
            onClick={() => setChatAbierto(false)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center shadow-md cursor-pointer select-none"
            title="Minimizar asistente"
          >
            <div>
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <span>🤖</span> Asistente Técnico BUCA
              </h3>
            </div>
            <button
              type="button"
              className="text-white/80 hover:text-white font-bold text-xl leading-none animate-fade-in pointer-events-none"
            >
              ×
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/50">
            {chatHistorial.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
                <div className="text-3xl">👋</div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">¡Hola! Soy tu Asistente Técnico BUCA.</p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-[220px] mx-auto">
                    Pregúntame sobre fichas técnicas, consumos de m², proporciones o conversiones de unidades.
                  </p>
                </div>
                {/* Suggestions */}
                <div className="w-full space-y-1.5 pt-2">
                  {(citadoSistema || citadosProductos.length > 0 || productoSeleccionado) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const p = citadosProductos[0] || productoSeleccionado;
                          if (p) setChatMensaje(`¿Cuál es el rendimiento de ${p.nombre}?`);
                        }}
                        className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                      >
                        📊 ¿Cuál es su rendimiento?
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const p = citadosProductos[0] || productoSeleccionado;
                          if (p) setChatMensaje(`Tengo un área de 100 m², ¿cuánto necesito comprar de ${p.nombre}?`);
                        }}
                        className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                      >
                        📐 Calcular consumo para 100 m²
                      </button>
                      {((citadosProductos[0] || productoSeleccionado)?.proporcionesMezcla) && (
                        <button
                          type="button"
                          onClick={() => {
                            const p = citadosProductos[0] || productoSeleccionado;
                            if (p) setChatMensaje(`¿Cuál es la proporción de mezcla recomendada para ${p.nombre}?`);
                          }}
                          className="w-full text-[10px] text-left text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-100 rounded-lg p-2 transition font-medium cursor-pointer"
                        >
                          🧪 ¿Cuál es la proporción de mezcla?
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-semibold italic bg-amber-50 border border-amber-100 rounded-lg p-2">
                      💡 Selecciona un producto en el cotizador o usa el clip para citar uno y desbloquear preguntas contextuales.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setChatMensaje("¿Cómo convierto micras a mils?");
                    }}
                    className="w-full text-[10px] text-left text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg p-2 transition font-medium cursor-pointer"
                  >
                    🔄 ¿Cómo convierto micras a mils?
                  </button>
                </div>
              </div>
            ) : (
              chatHistorial.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.remitente === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      msg.remitente === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                        : 'bg-white border border-gray-150 text-gray-800 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {msg.remitente === 'ia' ? renderParsedMessage(msg.texto) : msg.texto}

                    {/* Detected PDFs widget */}
                    {msg.remitente === 'ia' && (() => {
                      const detectedProds = detectProductsInMessage(msg.texto, productosDisponibles);
                      if (detectedProds.length === 0) return null;
                      return (
                        <div className="mt-2 pt-2 border-t border-gray-100 w-full flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">📄 Documentos:</span>
                          <div className="flex flex-col gap-1">
                            {detectedProds.map(p => (
                              <div key={p.id} className="flex justify-between items-center bg-gray-50 border border-gray-150 rounded px-1.5 py-0.5">
                                <span className="font-semibold text-[9px] text-gray-600 truncate max-w-[120px]">{p.nombre}</span>
                                <div className="flex gap-1 shrink-0">
                                  {p.ficha_tecnica_url && (
                                    <a
                                      href={p.ficha_tecnica_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition"
                                    >
                                      TDS
                                    </a>
                                  )}
                                  {p.ficha_seguridad_url && (
                                    <a
                                      href={p.ficha_seguridad_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition"
                                    >
                                      SDS
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1 px-1.5 select-none">
                    {msg.hora}
                  </span>
                </div>
              ))
            )}
            
            {/* Blinking loader */}
            {chatCargando && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-150 text-gray-400 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Dynamic Citation Badges */}
          {(citadoSistema || citadosProductos.length > 0) && (
            <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100 flex flex-wrap gap-1.5 items-center justify-between text-[11px] text-blue-700 animate-fade-in shrink-0">
              <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                {citadoSistema && (
                  <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold max-w-full">
                    <span className="shrink-0">🧪 Sistema:</span> <strong className="truncate">{citadoSistema.nombre}</strong>
                    <button
                      type="button"
                      onClick={() => setCitadoSistema(null)}
                      className="text-purple-500 hover:text-purple-700 font-bold ml-1 text-sm leading-none shrink-0"
                      title="Quitar sistema"
                    >
                      ×
                    </button>
                  </span>
                )}
                {citadosProductos.map((p, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium max-w-full">
                    <span className="shrink-0">📎</span> <span className="truncate">{p.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setCitadosProductos(prev => prev.filter(item => item.nombre !== p.nombre))}
                      className="text-blue-500 hover:text-blue-700 font-bold ml-1 text-sm leading-none shrink-0"
                      title="Quitar producto"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCitadoSistema(null);
                  setCitadosProductos([]);
                }}
                className="text-blue-600 hover:text-red-500 text-[10px] font-bold shrink-0 ml-2 border-l pl-2 border-gray-200"
                title="Limpiar citaciones"
              >
                Limpiar
              </button>
            </div>
          )}

          {/* Paperclip product list dropdown (absolute positioned) */}
          {mostrarClipMenu && (
            <div className="absolute left-3 right-3 max-h-48 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col animate-fade-in" style={{ bottom: (citadoSistema || citadosProductos.length > 0) ? '92px' : '57px' }}>
              <div className="p-2 border-b bg-gray-50 flex justify-between items-center shrink-0">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClipMenuTab('productos')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                      clipMenuTab === 'productos' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    📦 Productos
                  </button>
                  <button
                    type="button"
                    onClick={() => setClipMenuTab('sistemas')}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                      clipMenuTab === 'sistemas' 
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    🧪 Sistemas
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={() => setMostrarClipMenu(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
              <ul className="overflow-y-auto divide-y divide-gray-100 flex-1">
                {clipMenuTab === 'productos' ? (
                  productosDisponibles.filter(p => p.estado !== 'borrador').map((p, idx) => {
                    const isCited = citadosProductos.some(item => item.nombre === p.nombre);
                    return (
                      <li 
                        key={p.id || `${p.nombre}-${idx}`}
                        onClick={() => {
                          if (isCited) {
                            setCitadosProductos(prev => prev.filter(item => item.nombre !== p.nombre));
                          } else {
                            setCitadosProductos(prev => [...prev, p]);
                          }
                        }}
                        className={`px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer text-gray-700 font-medium truncate flex items-center justify-between gap-1.5 ${
                          isCited ? 'bg-blue-50 text-blue-700 font-bold' : ''
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>📎</span> {p.nombre}
                        </span>
                        {isCited && <span className="text-blue-600 font-bold">✓</span>}
                      </li>
                    );
                  })
                ) : (
                  sistemasDisponibles.map((sys, idx) => {
                    const isCited = citadoSistema?.nombre === sys.nombre;
                    return (
                      <li 
                        key={sys.id || `${sys.nombre}-${idx}`}
                        onClick={() => {
                          if (isCited) {
                            setCitadoSistema(null);
                          } else {
                            setCitadoSistema(sys);
                            // Also cite its products if loaded
                            fetchSistemaProductosSupabase(sys.id).then(rels => {
                              const resolvedProds = rels.map(r => productosDisponibles.find(prod => prod.id === r.producto_id)).filter(Boolean) as Producto[];
                              setCitadosProductos(prev => {
                                const merged = [...prev];
                                resolvedProds.forEach(sp => {
                                  if (!merged.some(p => p.nombre === sp.nombre)) {
                                    merged.push(sp);
                                  }
                                });
                                return merged;
                              });
                            });
                          }
                          setMostrarClipMenu(false);
                        }}
                        className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer text-gray-700 font-medium truncate flex items-center justify-between gap-1.5 ${
                          isCited ? 'bg-purple-50 text-purple-700 font-bold' : ''
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>🧪</span> {sys.nombre}
                        </span>
                        {isCited && <span className="text-purple-600 font-bold">✓</span>}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}

          {/* Footer Input */}
          <form
            onSubmit={enviarMensajeChat}
            className="p-3 bg-white border-t border-gray-150 flex gap-2 items-center shrink-0"
          >
            {/* Paperclip Button */}
            <button
              type="button"
              onClick={() => setMostrarClipMenu(!mostrarClipMenu)}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center border shrink-0 ${
                mostrarClipMenu 
                  ? 'bg-blue-50 border-blue-200 text-blue-600' 
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Citar producto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <input
              type="text"
              className="flex-1 text-xs px-3.5 py-2 border border-gray-200 rounded-xl outline-none focus:border-blue-400 bg-gray-50/50"
              placeholder="Haz tu pregunta..."
              value={chatMensaje}
              onChange={e => setChatMensaje(e.target.value)}
              disabled={chatCargando}
            />

            <button
              type="submit"
              disabled={chatCargando || !chatMensaje.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
            >
              <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
