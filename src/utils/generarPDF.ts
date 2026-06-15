import type { LineaProducto } from '../components/ResumenCotizacion'
import { formatMXN, formatNum, type EstadoPiso } from './format'

interface CotizacionData {
  clienteNombre: string
  proyectoNombre: string
  notasProyecto: string
  fechaHoy: string
  tipoCambio: number
  esMinorista: boolean
  descuentoPorcentaje: number
  estadoPiso: EstadoPiso
  lineas: LineaProducto[]
  totalProyecto: number
}

// formatMXN y formatNum importados desde './format'

export function generarPDF(data: CotizacionData) {
  const {
    clienteNombre, proyectoNombre, notasProyecto, fechaHoy,
    tipoCambio, esMinorista, descuentoPorcentaje, estadoPiso,
    lineas, totalProyecto
  } = data

  const mermaLabel = estadoPiso === 'liso' ? 'Piso liso (+5% merma)'
    : estadoPiso === 'rugoso' ? 'Piso rugoso (+15% merma)'
    : estadoPiso === 'estandar' ? 'Piso estándar (+10% merma)'
    : 'Sin merma (0%)'

  const precioLabel = esMinorista
    ? 'Precio público / minorista'
    : `Precio mayorista con ${descuentoPorcentaje}% de descuento`

  const rowsHTML = lineas.map((l, idx) => {
    const docLinks = [
      l.producto.ficha_tecnica_url
        ? `<a href="${l.producto.ficha_tecnica_url}" style="color:#2563eb;text-decoration:none;margin-right:6px;">📄 TDS</a>`
        : '',
      l.producto.ficha_seguridad_url
        ? `<a href="${l.producto.ficha_seguridad_url}" style="color:#b45309;text-decoration:none;">🛡️ SDS</a>`
        : ''
    ].join('')

    return `
      <tr style="background:${idx % 2 === 0 ? '#f8fafc' : 'white'}; border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px 12px; font-size:13px; color:#1e293b;">
          <strong>${l.producto.nombre}</strong>
          ${l.producto.nota ? `<br><span style="font-size:11px;color:#64748b;">${l.producto.nota}</span>` : ''}
          ${l.producto.densidad_conversion && l.producto.densidad_conversion !== 1.0 ? `<br><span style="font-size:10px;color:#059669;font-weight:500;">⚖️ Densidad de conversión: ${l.producto.densidad_conversion} kg/L</span>` : ''}
          ${docLinks ? `<br><span style="font-size:11px;margin-top:2px;display:inline-block;">${docLinks}</span>` : ''}
        </td>
        <td style="padding:10px 12px; text-align:right; font-size:13px; color:#374151;">
          ${(() => {
            const dens = l.producto.densidad_conversion || 1.0;
            const uni = l.producto.unidad.toLowerCase();
            if (dens > 0 && dens !== 1.0) {
              if (uni === 'kg') {
                return `${formatNum(l.cantidad)} kg<br><span style="font-size:11px;color:#64748b;">(${formatNum(l.cantidad / dens)} L)</span>`;
              } else if (uni === 'l' || uni === 'litro' || uni === 'litros') {
                return `${formatNum(l.cantidad)} L<br><span style="font-size:11px;color:#64748b;">(${formatNum(l.cantidad * dens)} kg)</span>`;
              }
            }
            return `${formatNum(l.cantidad)} ${l.producto.unidad}`;
          })()}
          ${l.producto.tieneRendimiento && l.metros > 0 ? `<br><span style="font-size:11px;color:#3b82f6;">${formatNum(l.metros)} m²</span>` : ''}
        </td>
        <td style="padding:10px 12px; text-align:right; font-size:13px; color:#374151;">
          ${formatMXN(l.precioUnitario)}
        </td>
        <td style="padding:10px 12px; text-align:right; font-size:14px; font-weight:700; color:#1e293b;">
          ${formatMXN(l.totalMXN)}
        </td>
      </tr>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cotización BUCA — ${clienteNombre || 'Cliente'} — ${fechaHoy}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1e293b;
      background: white;
      padding: 0;
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 48px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1e3a8a;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .logo-mark {
      width: 44px; height: 44px;
      background: #1e3a8a;
      color: white;
      font-size: 20px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px;
      margin-bottom: 6px;
    }
    .company-name { font-size: 18px; font-weight: 800; color: #1e3a8a; }
    .company-sub { font-size: 12px; color: #64748b; }
    .quote-title { text-align: right; }
    .quote-title h2 { font-size: 22px; font-weight: 800; color: #1e3a8a; }
    .quote-title p { font-size: 12px; color: #64748b; margin-top: 4px; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 28px;
      background: #f8fafc;
      border-radius: 10px;
      padding: 18px 20px;
      border: 1px solid #e2e8f0;
    }
    .info-item label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; }
    .info-item span { font-size: 14px; font-weight: 600; color: #1e293b; }
    .info-full { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #1e3a8a; }
    thead th {
      padding: 11px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    thead th:not(:first-child) { text-align: right; }
    tfoot tr { border-top: 2px solid #1e3a8a; }
    tfoot td { padding: 14px 12px; }
    .total-label { text-align: right; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
    .total-value { text-align: right; font-size: 22px; font-weight: 900; color: #1e3a8a; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 6px;
      margin-top: 6px;
    }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badges { margin-bottom: 24px; }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
    }
    @media print {
      .page { padding: 20px 28px; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo-mark">B</div>
      <div class="company-name">BUCA Recubrimientos</div>
      <div class="company-sub">Monterrey, N.L. · México</div>
    </div>
    <div class="quote-title">
      <h2>COTIZACIÓN</h2>
      <p>Fecha: ${fechaHoy}</p>
      <p>Tipo de cambio: $${tipoCambio} MXN/USD</p>
    </div>
  </div>

  <!-- Info del proyecto -->
  <div class="info-grid">
    <div class="info-item">
      <label>Cliente</label>
      <span>${clienteNombre || '—'}</span>
    </div>
    <div class="info-item">
      <label>Proyecto / Obra</label>
      <span>${proyectoNombre || '—'}</span>
    </div>
    ${notasProyecto ? `
    <div class="info-item info-full">
      <label>Notas</label>
      <span>${notasProyecto}</span>
    </div>` : ''}
  </div>

  <!-- Badges de configuración -->
  <div class="badges">
    <span class="badge badge-blue">${precioLabel}</span>
    <span class="badge badge-blue">${mermaLabel}</span>
  </div>

  <!-- Tabla de productos -->
  <table>
    <thead>
      <tr>
        <th style="width:45%">Producto</th>
        <th>Cantidad</th>
        <th>Precio unitario</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="total-label">Total del Proyecto</td>
        <td class="total-value">${formatMXN(totalProyecto)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div>
      <p>Precios sujetos a cambio sin previo aviso.</p>
      <p>Vigencia de cotización: 30 días a partir de la fecha de emisión.</p>
    </div>
    <div style="text-align:right;">
      <p>BUCA Recubrimientos</p>
      <p>Monterrey, N.L., México</p>
    </div>
  </div>
</div>
<script>
  // Auto-trigger print dialog when opened as a PDF export
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    alert('Permite las ventanas emergentes en este sitio para exportar el PDF.')
  }
  // Clean up blob URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
