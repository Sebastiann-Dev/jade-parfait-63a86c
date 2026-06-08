export interface Producto {
  nombre: string
  cantRef: number
  unidad: string
  moneda: 'MXN' | 'USD'
  precio: number
  tieneRendimiento: boolean
  nota: string
  // rendimiento m²/unidad — only when tieneRendimiento is true
  rendimiento?: number
  espesorRecomendado?: string
  manosRecomendadas?: string
  pros?: string
  cons?: string
  cuidadoCon?: string
  // Kit: presentación/versiones disponibles del producto como kit
  kitInfo?: string
  // Mezcla: proporciones para productos bicomponentes o tricomponentes
  proporcionesMezcla?: string
  // Densidad recomendada (morteros)
  densidadRecomendada?: string
  // Bitácora / Notas internas
  bitacora?: string
  // Documentación técnica
  ficha_tecnica_url?: string
  ficha_seguridad_url?: string
  // Estado de publicación y auditoría
  estado?: string
  motivo_incompleto?: string
  updated_at?: string
}

// rendimiento: cuántos m² cubre una unidad de la cant_ref
// Se calcula según especificaciones de producto. Cuando no se especifica se usa
// un valor razonable basado en aplicaciones estándar industriales.
export const PRODUCTOS: Producto[] = [
  {
    nombre: 'BucaTrafic',
    cantRef: 38,
    unidad: 'L',
    moneda: 'USD',
    precio: 10.40,
    tieneRendimiento: true,
    nota: 'Tráfico vehicular',
    rendimiento: 5, // ~5 m² por L (2 manos)
  },
  {
    nombre: 'BucaReflex',
    cantRef: 240,
    unidad: 'L',
    moneda: 'USD',
    precio: 3.10,
    tieneRendimiento: true,
    nota: 'Acabado brillante / reflectivo',
    rendimiento: 8,
  },
  {
    nombre: 'BucaPoxyMulti',
    cantRef: 57,
    unidad: 'L',
    moneda: 'MXN',
    precio: 196,
    tieneRendimiento: true,
    nota: 'Epóxico multiusos — primario y capa intermedia',
    rendimiento: 6,
  },
  {
    nombre: 'PoxyParte B',
    cantRef: 28.5,
    unidad: 'L',
    moneda: 'MXN',
    precio: 230,
    tieneRendimiento: false,
    nota: 'Parte B — proporción 2:1 con PoxyMulti',
  },
  {
    nombre: 'BucaPoxyPlus Top — Pte A',
    cantRef: 1,
    unidad: 'L',
    moneda: 'MXN',
    precio: 300,
    tieneRendimiento: true,
    nota: 'Parte A — acabado final epóxico',
    rendimiento: 6,
  },
  {
    nombre: 'BucaPoxyPlus Top — Pte B',
    cantRef: 1,
    unidad: 'L',
    moneda: 'MXN',
    precio: 357,
    tieneRendimiento: false,
    nota: 'Parte B — proporción 2:1 con Pte A',
  },
  {
    nombre: 'Tapaporo Parte A',
    cantRef: 19,
    unidad: 'L',
    moneda: 'USD',
    precio: 247,
    tieneRendimiento: true,
    nota: 'Cubeta 19 L — tapaporo para mortero',
    rendimiento: 10,
  },
  {
    nombre: 'Tapaporo Parte B',
    cantRef: 9.5,
    unidad: 'L',
    moneda: 'USD',
    precio: 142,
    tieneRendimiento: false,
    nota: 'Cubeta 9.5 L — Parte B',
  },
  {
    nombre: 'Saco MX-35',
    cantRef: 25,
    unidad: 'saco',
    moneda: 'MXN',
    precio: 230,
    tieneRendimiento: false,
    nota: 'Arena para mortero MX-35',
  },
  {
    nombre: 'Kit BucaCrete HL',
    cantRef: 3,
    unidad: 'kit',
    moneda: 'MXN',
    precio: 1900,
    tieneRendimiento: true,
    nota: '⚠️ Vida de mezcla 15-20 min',
    rendimiento: 4,
  },
  {
    nombre: 'Bucathane HC Top',
    cantRef: 8,
    unidad: 'L',
    moneda: 'MXN',
    precio: 443,
    tieneRendimiento: true,
    nota: '2 manos recomendadas — resistencia UV +4 años',
    rendimiento: 4,
  },
  {
    nombre: 'BucaAqua',
    cantRef: 4,
    unidad: 'L',
    moneda: 'MXN',
    precio: 165,
    tieneRendimiento: true,
    nota: 'Impermeabilizante',
    rendimiento: 2,
  },
  {
    nombre: 'Base Primer — Parte A',
    cantRef: 8,
    unidad: 'L',
    moneda: 'MXN',
    precio: 1360,
    tieneRendimiento: true,
    nota: 'Anticorrosivo epóxico para metal',
    rendimiento: 8,
  },
  {
    nombre: 'Base Primer — Parte B',
    cantRef: 2,
    unidad: 'L',
    moneda: 'MXN',
    precio: 460,
    tieneRendimiento: false,
    nota: 'Parte B — proporción 4:1 con Pte A',
  },
  {
    nombre: 'Cinta Azul 2"',
    cantRef: 1,
    unidad: 'pza',
    moneda: 'MXN',
    precio: 160,
    tieneRendimiento: false,
    nota: 'Accesorio',
  },
  {
    nombre: 'Llana Lisa Redonda',
    cantRef: 1,
    unidad: 'pza',
    moneda: 'MXN',
    precio: 450,
    tieneRendimiento: false,
    nota: 'Accesorio',
  },
]
