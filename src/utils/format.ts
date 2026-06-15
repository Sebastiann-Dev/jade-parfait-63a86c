/**
 * Utilidades de formato y cálculo compartidas
 * Fuente única de verdad — no duplicar en componentes individuales
 */

/** Formatea un número como moneda MXN */
export function formatMXN(value: number): string {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
}

/** Formatea un número con decimales opcionales en locale MX */
export function formatNum(value: number, decimals = 2): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

export type EstadoPiso = 'liso' | 'estandar' | 'rugoso' | 'ninguno'

/**
 * Devuelve el factor de merma según el estado del piso.
 * liso → +5% | estandar → +10% | rugoso → +15% | ninguno → 0%
 */
export function getMermaFactor(estadoPiso: EstadoPiso): number {
  switch (estadoPiso) {
    case 'liso':     return 1.05
    case 'estandar': return 1.10
    case 'rugoso':   return 1.15
    default:         return 1.00
  }
}
