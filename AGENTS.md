# AGENTS.md — BUCA Cotizador

## Descripción del proyecto

Cotizador comercial interno para BUCA Recubrimientos (Monterrey, N.L., México). Aplicación web de una sola página que permite al equipo de ventas calcular materiales, precios y totales en MXN para proyectos de recubrimientos industriales.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | TanStack Start |
| Frontend | React 19, TanStack Router v1 |
| Build | Vite 7 |
| Estilos | Tailwind CSS v4 + clases custom `buca-*` |
| Lenguaje | TypeScript 5 (strict) |
| Despliegue | Netlify |

## Estructura de directorios

```
src/
├── data/
│   └── productos.ts        # Catálogo de productos con precios, rendimientos y metadatos
├── components/
│   └── Cotizador.tsx       # Componente principal — toda la lógica de UI y cálculo
├── routes/
│   ├── __root.tsx          # Shell HTML, metadatos globales (lang="es")
│   └── index.tsx           # Ruta raíz — renderiza <Cotizador />
└── styles.css              # Tailwind + clases custom prefijadas con buca-*
```

## Decisiones de diseño

- **Sin backend propio:** toda la lógica vive en el cliente. Los productos están en `productos.ts` — estructura lista para conectar a Netlify Database sin reescribir la lógica.
- **Lógica de cantidad:** si `tieneRendimiento: true` y `rendimiento` está definido → `cantidad = metros / rendimiento`. Si no → el usuario ingresa manualmente (default = `cantRef`).
- **Conversión de moneda:** productos en USD se convierten al calcular usando el tipo de cambio editable. El precio mostrado siempre es MXN.
- **Descuento mayorista:** multiplicador `0.8` (−20%) aplicado al precio unitario.
- **Print CSS:** la sección de configuración y controles se oculta en impresión con `print:hidden`. La tabla de cotización y el footer con metadatos sí se imprimen.
- **Paleta institucional:** `--buca-blue: #1B3F6E` definido como variable CSS.

## Convenciones

- Clases personalizadas usan prefijo `buca-*` en `styles.css`.
- Tipos del dominio se definen localmente donde se usan (sin carpeta `types/` separada por ahora).
- Helpers de formato: `formatMXN` y `formatNum` con locale `es-MX`.
- Rutas de archivos: TanStack Router file-based routing en `src/routes/`.

## Escalabilidad futura

- **Precios dinámicos:** crear tabla en Netlify Database + API route que reemplace la importación de `productos.ts`.
- **PDFs con branding:** Netlify Function con `@react-pdf/renderer`.
- **Historial de cotizaciones:** Netlify Identity + tabla de cotizaciones en DB.
- **Multi-asesor:** auth con roles para distinguir permisos entre asesores.
