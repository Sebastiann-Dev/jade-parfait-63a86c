# BUCA Recubrimientos — Cotizador Comercial

Herramienta interna de cotización para el equipo de ventas de BUCA Recubrimientos (Monterrey, N.L., México). Permite seleccionar productos del portafolio, ingresar el área del proyecto y obtener automáticamente cantidad de material, precio unitario y total en MXN — incluyendo soporte para precios en USD con tipo de cambio editable.

## Tecnologías

- **Framework:** TanStack Start (React 19 + Vite)
- **Base de Datos y Almacenamiento:** Supabase (PostgreSQL y Supabase Storage)
- **Inteligencia Artificial:** API de Google Gemini (`gemini-2.5-flash`) con rotación automática multiclave
- **Estilos:** Tailwind CSS v4 con clases custom
- **Contenedores (Sandbox):** Docker y Dev Containers (Codespaces)
- **Despliegue:** Cloudflare (build automático desde GitHub)

## Funcionalidades

- Selector de producto con búsqueda en tiempo real.
- Cálculo automático de cantidad según rendimiento por m² (o espesor y densidad en morteros).
- Soporte para productos sin rendimiento (cantidad manual).
- Toggle Minorista / Mayorista (descuento 5% automático).
- Tipo de cambio USD → MXN editable (default $17.50).
- Lista acumulada de productos para cotización completa de proyecto.
- Total del proyecto en MXN e impresión / exportación optimizada para PDF.
- **Panel de Administración (`/admin`):**
  - Gestión completa en tiempo real de productos y sistemas multicapa (CRUD sincronizado con Supabase).
  - Subida de fichas técnicas (TDS) y seguridad (SDS) directamente a Supabase Storage.
  - Visor de PDF integrado side-by-side con el formulario.
  - **Asistente IA (Gemini):** Lee el PDF y autocompleta el formulario de producto en segundos de forma inteligente.
  - Protección de claves API y sistema de rotación automática para tolerancia a fallos.
- **Formulario de Diagnóstico Técnico (Scoping Wizard en `/diagnostico`):**
  - Cuestionario interactivo paso a paso para el cliente final para identificar sus necesidades de recubrimiento.
  - Árbol de decisión con ramificaciones lógicas dinámicas (ej: pregunta el tipo de ruedas ante tráfico pesado, exposición UV en exteriores o frecuencia de lavado químico).
  - **Motor de Recomendación de Sistemas**: Analiza las respuestas del cliente y sugiere automáticamente productos individuales o sistemas multicapa (ej. BucaCrete, Bucathane) ideales para su obra.
  - **Filtro Anti-Spam Inteligente**: Validación estricta que bloquea dominios de correo temporales (+73,000 dominios), groserías, palabras de prueba (ej. `test`, `prueba`) y teclazos aleatorios ("keyboard mashes" como `asdfg`).
- **Portal de Prospectos para Vendedores (`/admin`):**
  - Tablero centralizado de leads para el equipo de ventas de BUCA.
  - Permite buscar, filtrar y dar seguimiento comercial a los diagnósticos realizados por los clientes.
  - Bitácora editable para asignar asesores, actualizar el estatus de la cotización (Nuevo, Contactado, Cotizado, Ganado, Perdido), registrar notas de llamadas y presupuestos aproximados.
  - **Carga Directa al Cotizador**: Botón de un solo clic que carga toda la recomendación sugerida en la calculadora principal para agilizar la cotización formal.

## Ejecutar localmente

### Opción A: Sandbox de Docker (Recomendada - Sin instalar Node.js)

Requiere tener instalado [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

La aplicación correrá en `http://localhost:3000` con Hot Module Replacement (HMR).

### Opción B: Instalación local tradicional

Requiere Node.js 18+.

```bash
npm install
npm run dev
```

La app corre en `http://localhost:3000`

