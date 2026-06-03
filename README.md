# BUCA Recubrimientos — Cotizador Comercial

Herramienta interna de cotización para el equipo de ventas de BUCA Recubrimientos (Monterrey, N.L., México). Permite seleccionar productos del portafolio, ingresar el área del proyecto y obtener automáticamente cantidad de material, precio unitario y total en MXN — incluyendo soporte para precios en USD con tipo de cambio editable.

## Tecnologías

- **Framework:** TanStack Start (React 19 + Vite)
- **Estilos:** Tailwind CSS v4 con clases custom
- **Despliegue:** Netlify (build automático desde GitHub)

## Funcionalidades

- Selector de producto con búsqueda en tiempo real
- Cálculo automático de cantidad según rendimiento por m²
- Soporte para productos sin rendimiento (cantidad manual)
- Toggle Minorista / Mayorista (descuento 20% automático)
- Tipo de cambio USD → MXN editable (default $17.50)
- Lista acumulada de productos para cotización completa de proyecto
- Total del proyecto en MXN
- Impresión / exportación de cotización (optimizada para impresora y PDF)
- Responsive — funciona en celular y escritorio

## Ejecutar localmente

```bash
npm install
npm run dev
```

La app corre en `http://localhost:3000`
