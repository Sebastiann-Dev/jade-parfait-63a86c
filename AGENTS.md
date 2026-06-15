# AGENTS.md — BUCA Cotizador

## Descripción del proyecto

Cotizador comercial interno para BUCA Recubrimientos (Monterrey, N.L., México). Aplicación web de una sola página que permite al equipo de ventas calcular materiales, precios y totales en MXN para proyectos de recubrimientos industriales.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | TanStack Start |
| Frontend | React 19, TanStack Router v1 |
| Base de Datos | Supabase (PostgreSQL) |
| Almacenamiento | Supabase Storage (bucket `product-docs`) |
| IA | API de Google Gemini (`gemini-2.5-flash`) con rotación multiclave |
| Sandbox | Docker y Dev Containers (Codespaces) |
| Build | Vite 7 |
| Estilos | Tailwind CSS v4 + clases custom `buca-*` |
| Lenguaje | TypeScript 5 (strict) |
| Despliegue | Cloudflare |

## Estructura de directorios

```
src/
├── data/
│   └── productos.ts        # Catálogo local de respaldo y tipos
├── components/
│   └── Cotizador.tsx       # Lógica de UI del cotizador público y descarga de fichas
├── routes/
│   ├── __root.tsx          # Shell HTML, metadatos globales (lang="es")
│   ├── index.tsx           # Ruta raíz — renderiza <Cotizador />
│   └── admin.tsx           # Panel de administración, visor PDF side-by-side e IA
├── supabase.ts             # Cliente e integración de CRUD y Storage con Supabase
└── styles.css              # Tailwind + clases custom prefijadas con buca-*
docker-compose.yml          # Orquestador del sandbox local con recarga HMR
Dockerfile                  # Definición del entorno Node 20 en contenedor
.dockerignore               # Optimización de contexto de Docker
.devcontainer/
└── devcontainer.json       # Integración con GitHub Codespaces y VS Code Containers
```

## Decisiones de diseño

- **Integración con Supabase:** Gestión de base de datos relacional PostgreSQL para productos y almacenamiento cloud público de PDFs (fichas técnicas y de seguridad).
- **Asistente IA Ofuscado y Tolerante a Fallos:** Extracción inteligente de información técnica en formato JSON a partir del PDF activo. La API key se almacena de forma encriptada mediante cifrado XOR en el cliente, y el sistema rota automáticamente entre múltiples claves configuradas si detecta errores de límite de cuota (HTTP 429), sin pérdida de progreso en el análisis.
- **Cálculo de Consumo Sugerido:** Cálculo automático de consumo en base al rendimiento o espesor y densidad extraídos de las fichas del producto.
- **Entorno Estandarizado (Sandbox):** Uso de contenedores Docker para garantizar que cualquier miembro del equipo o desarrollador pueda ejecutar y modificar la aplicación de forma idéntica, independientemente de sus dependencias locales.
- **Print CSS:** La sección de configuración y controles se oculta en impresión con `print:hidden`. La tabla de cotización y el footer con metadatos sí se imprimen.
- **Paleta institucional:** `--buca-blue: #1B3F6E` definido como variable CSS.

## Convenciones

- Clases personalizadas usan prefijo `buca-*` en `styles.css`.
- Tipos del dominio se definen localmente donde se usan (sin carpeta `types/` separada por ahora).
- Helpers de formato: `formatMXN` y `formatNum` con locale `es-MX`.
- Rutas de archivos: TanStack Router file-based routing en `src/routes/`.

## Escalabilidad futura

- **Historial de cotizaciones:** Guardar las cotizaciones creadas en Supabase asociando un identificador de cliente.
- **Autenticación completa:** Supabase Auth para restringir la sección `/admin` a administradores validados.
- **PDFs de cotización personalizados:** Implementación de generación de PDF con branding de la empresa usando librerías del servidor o cliente.
