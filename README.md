# BUCA Recubrimientos — Cotizador Comercial

Herramienta interna de cotización para el equipo de ventas de BUCA Recubrimientos (Monterrey, N.L., México). Permite seleccionar productos del portafolio, ingresar el área del proyecto y obtener automáticamente cantidad de material, precio unitario y total en MXN — incluyendo soporte para precios en USD con tipo de cambio editable.

## Tecnologías

- **Framework:** TanStack Start (React 19 + Vite)
- **Base de Datos:** Supabase (PostgreSQL)
- **Almacenamiento de Documentos:** AWS S3 (o compatible) con subida directa del cliente mediante Presigned URLs
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
  - **Almacenamiento de Documentos con AWS S3 y Presigned URLs**: Los PDFs (fichas técnicas TDS, hojas de seguridad SDS, cotizaciones de referencia) se almacenan de forma segura en AWS S3. El archivo nunca pasa por los servidores — el navegador sube directamente a S3 usando una URL firmada de `PUT` (Presigned Upload URL) generada por el servidor. Para descargar, el servidor genera una URL firmada de `GET` que expira en 15 minutos. En la base de datos de Supabase solo se guarda la clave S3 (ruta relativa) con timestamp, nunca la URL pública.
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

## Panel de Administración (`/admin`)

El panel de administración es el centro de control técnico y comercial de BUCA. Está protegido por autenticación y estructurado en pestañas especializadas:

### 1. Gestión del Catálogo (Productos y Sistemas)
* **CRUD de Productos**: Permite añadir, editar y dar de baja productos individuales. Se definen precios base (en MXN o USD), unidad de medida (lote, cubeta, galón, tambor, Kg), rendimiento teórico y campos de conversión.
* **Constructor de Sistemas Multicapa**: Los sistemas representan soluciones listas para cotizar (ej. Sistema Epóxico 100% Sólidos). Permite configurar cada capa (Primer, Intermedio, Top Coat), asignar los productos correspondientes, establecer espesores sugeridos y calcular rendimientos automáticos combinados.

### 2. Visor e Inteligencia Artificial (Carga Automática de Fichas Técnicas)
* **Gestor de Fichas (TDS/SDS)**: Permite subir fichas técnicas (TDS), hojas de seguridad (SDS) y cotizaciones de referencia en PDF directamente a un bucket seguro de **AWS S3** mediante URLs de subida firmadas (`PUT` presigned URLs), manteniendo los archivos privados y previniendo transferencias innecesarias por el servidor principal.
* **Asistente de Carga por IA**: Incorpora la API de **Google Gemini 2.5 Flash** para automatizar el alta de productos. El administrador sube un PDF y el asistente extrae, interpreta y pre-llena automáticamente el formulario (nombre, descripción, densidades, rendimientos y precauciones), reduciendo el tiempo de carga a solo segundos.
* **Visor Side-by-Side**: Muestra el documento PDF en paralelo al formulario para que el administrador pueda validar y ajustar los datos extraídos por la IA antes de guardar. Para archivos en S3, genera una URL temporal firmada (`GET` presigned URL) con expiración de 15 minutos.

### 3. Portal de Prospectos y Seguimiento Comercial
* **Bandeja de Entrada de Leads**: Almacena las respuestas de los clientes del *Scoping Wizard* y las clasifica.
* **Seguimiento Comercial**: Permite asignar un asesor de ventas, registrar notas de llamadas, estimar el presupuesto de la obra y cambiar el estatus del prospecto (Nuevo, Contactado, Cotizado, Ganado, Perdido).
* **Cotizador Instantáneo**: Con un solo clic, el vendedor puede cargar los datos del prospecto y la recomendación técnica directamente en la calculadora de presupuestos para generar la propuesta formal.

### 4. Gestión de Claves y Rotación de API de IA
* **Control de Claves Gemini**: Permite al administrador registrar, validar y administrar múltiples API Keys de Gemini.
* **Rotación Automática**: El sistema alterna inteligentemente entre las claves registradas en caso de alcanzar el límite de cuotas de la API o detectar fallos, garantizando la continuidad del servicio del asistente de IA.

---

## Creación de Cuentas de Administrador
Para dar de alta cuentas de vendedor o administrador en Supabase que puedan acceder a `/admin`, puedes utilizar el script automatizado provisto en el repositorio:

```bash
# Ejecutar el script indicando el correo oficial y la contraseña deseada
python crear_admin.py correo@bucamx.com contraseña
```
*Nota: Este script utiliza el `service_role` de Supabase para crear y confirmar la cuenta automáticamente sin necesidad de esperar verificación por correo.*

---

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

---

## 🔄 Flujo de Trabajo en Git y Despliegue

Para mantener la estabilidad de la aplicación y evitar caídas accidentales en producción (`main`), el desarrollo del proyecto se rige bajo una estructura organizada de ramas:

### 1. Modelo de Ramas Principal
*   **`main` (Producción)**: Hospeda el código estable que utilizan los usuarios finales de BUCA. Se actualiza integrando los cambios aprobados desde `staging`.
*   **`staging` (Pre-producción / QA)**: Entorno espejo para pruebas finales y control de calidad. Recibe integraciones desde `dev` para validación grupal.
*   **`dev` (Desarrollo Activo)**: Rama de integración diaria. Sincroniza las características desarrolladas por el equipo.
*   **`feature/*` y `fix/*`**: Ramas temporales creadas para implementar nuevas funcionalidades o solucionar bugs específicos.

### 2. Flujo de Trabajo Estándar
1.  **Issue**: Toda tarea inicia con un reporte de Issue en GitHub.
2.  **Rama Local**: Se crea una rama temporal desde `dev` con el nombre `feature/issue-<num>-desc` o `fix/issue-<num>-desc`.
3.  **Integración Continua**: Al completar el desarrollo, se abre un Pull Request (PR) hacia `dev` para revisión de código.
4.  **Promoción de Entornos**: Sincronizaciones periódicas de `dev` a `staging` para pruebas de QA, y posteriormente de `staging` a `main` para lanzamiento final.

### 3. Excepciones y Commits Directos (AI Assistant / Hotfixes)
Aunque el flujo basado en Pull Requests es la norma general para el desarrollo de software, **se permite realizar commits y pushes directos a las ramas principales (`main`, `staging` o `dev`)** desde el asistente de IA (Antigravity) o por desarrolladores autorizados en los siguientes casos de excepción:
*   **Actualizaciones de Documentación**: Modificaciones rápidas del archivo `README.md`, guías de migración o políticas de desarrollo (como este documento).
*   **Hotfixes Críticos**: Correcciones urgentes de seguridad, fallos que bloqueen la operación de los usuarios o rotación de API Keys comprometidas.
*   **Ajustes Menores Validados**: Cambios menores que no alteran la arquitectura de la base de datos o el comportamiento global y que ya han sido completamente comprobados de forma local.

### 4. Integración CI/CD (Cloudflare)
La infraestructura del repositorio de GitHub está vinculada a **Cloudflare Pages** para la compilación y despliegue automático:
*   Cualquier actualización en `main` compila y actualiza instantáneamente el entorno productivo.
*   Los pushes a `staging` y `dev` generan vistas previas aisladas (Preview Deployments), permitiendo al equipo probar las actualizaciones en la nube antes de mezclarlas permanentemente.

Para más detalles detallados del flujo, nomenclatura y ejemplos, consulta la [Guía de Flujo de Trabajo en Git (git_workflow.md)](docs/git_workflow.md).


