# Proyectos a Futuro y Plan de Madurez (Roadmap Técnico)

Este documento registra los proyectos de optimización, automatización e infraestructura previstos para las siguientes fases de la plataforma BUCA Recubrimientos.

---

## 🚀 FASE 2: Corto/Mediano Plazo (Primeras Semanas de Uso)

Estas características mejoran la operación del equipo de ventas y proporcionan las herramientas de análisis iniciales para dirección.

### 1. Historial de Cotizaciones en Admin
- **Propósito:** Crear una interfaz de visualización en el panel `/admin` para listar todas las cotizaciones guardadas.
- **Detalle:** Permitirá a dirección y ventas filtrar cotizaciones por vendedor, rango de fechas, cliente y estados de conversión.
- **Acceso:** Permitirá descargar el PDF de cotización generado en cualquier momento a partir de su ID.

### 2. Autenticación y Asignación Automática de Vendedor
- **Propósito:** Identificar automáticamente qué vendedor está usando la herramienta para asociar su nombre/email a las cotizaciones.
- **Detalle:** Utilizar la sesión de Supabase Auth en el cotizador principal (`/`) para rellenar de forma automática el campo "Vendedor" y registrar la autoría en la base de datos.

### 3. CI/CD con GitHub Actions
- **Propósito:** Configurar un pipeline de integración y despliegue continuo en el archivo `.github/workflows/deploy.yml`.
- **Detalle:** Compilar la aplicación y desplegarla automáticamente en Cloudflare Workers usando Wrangler cada vez que se haga push a la rama `main`.

### 4. Entorno de Staging (Pruebas Seguras)
- **Propósito:** Disponer de una base de pruebas independiente de la producción.
- **Detalle:** Configurar despliegues automáticos de previsualización ("Preview Deployments") en Cloudflare vinculados a la rama `dev` con su propia base de datos de testeo.

---

## 🧠 FASE 3: Mediano/Largo Plazo (Madurez Tecnológica)

Proyectos de optimización avanzada de código, algoritmos inteligentes y telemetría de producción.

### 1. Sistema Dinámico de Recomendación por Matriz de Pesos (Fórmula Adaptable)
- **Propósito:** Automatizar el motor de recomendaciones en lugar de usar condicionales e ifs estáticos.
- **Detalle:** 
  - Diseñar una estructura matricial donde cada producto cuente con coeficientes de idoneidad (pesos) en base a su resistencia química, tráfico y tipo de sustrato.
  - Al ingresar respuestas en el diagnóstico, estas actúan como ponderadores.
  - Cuando los vendedores guarden las cotizaciones (y modifiquen los productos recomendados), el sistema recopilará ese feedback para re-calcular los coeficientes de peso y optimizar la predicción futura.

### 2. Monitoreo de Errores en Producción (Sentry/LogRocket)
- **Propósito:** Detectar fallos en el navegador de los asesores en tiempo real.
- **Detalle:** Envolver el enrutador en `__root.tsx` con el SDK de Sentry para capturar excepciones no controladas, fallas de conexión con Supabase o de consulta con Gemini.

### 3. Refactorización del Monolito `/admin` y Modularización
- **Propósito:** Dividir el código de `admin.tsx` (actualmente de ~210 KB) en sub-componentes independientes y reutilizables.
- **Detalle:** 
  - Separar los módulos de: Gestión de Productos (CRUD), Sistemas Multicapa, Consola de Extracción IA (Gemini), Portal de Prospección (Leads) y la Guía de Uso.
  - Esto evitará conflictos de combinación de ramas y facilitará la mantenibilidad.

### 4. Perfil de Superficie del Concreto (CSP)
- **Propósito:** Ajustar mermas precisas basadas en la rugosidad física del concreto.
- **Detalle:** Implementar un selector de CSP (del 1 al 9, según la escala ICRI) para aplicar multiplicadores dinámicos teóricos a capas base y morteros de renivelación.

### 5. Migración a AWS S3
- **Propósito:** Migrar el almacenamiento de documentos técnicos y fotos del bucket de Supabase a AWS S3.
- **Detalle:** Mantener la subida directa a través de presigned URLs temporales de carga y descarga con expiración de 15 minutos para maximizar la seguridad y escalabilidad del almacenamiento a largo plazo.
