# Auditoría, Arquitectura de Estados y Pendientes de la Plataforma

Este documento registra los hallazgos de la auditoría del primero de julio de 2026, las definiciones del flujo de trabajo de ventas, las propuestas de infraestructura y la ruta tecnológica hacia un motor de recomendaciones dinámico por pesos.

---

## 1. Contexto de Negocio y Flujo de Estados

El formulario de diagnóstico no es un test de autoservicio para el cliente final; **es una herramienta de scoping y perfilado que utiliza el vendedor** durante su interacción con el prospecto. 

Para reducir la fricción en la velocidad de cotización y automatizar la gestión en el portal de leads, se define la siguiente máquina de estados:

```
[ Formulario de Diagnóstico ] 
            │
            ▼ (El vendedor llena las respuestas)
[ Estado cambia a: "Contactado" ] ──► [ Botón rápido "Cotizar Recomendación" ]
                                                        │
                                                        ▼ (Carga recomendados en el Cotizador)
                                             [ Vendedor personaliza y guarda ]
                                                        │
                                                        ▼
                                            [ Estado cambia a: "Cotizado" ]
                                            [ Guarda cotización en Base de Datos ]
```

### Reglas del flujo:
1. **Paso de Diagnóstico a Cotizador:** Al finalizar el diagnóstico, el vendedor ve el resumen técnico. Un botón destacado le permite saltar directamente al Cotizador (`/`) precargando el código de seguimiento del prospecto y los productos/sistemas recomendados.
2. **Transición Automática de Estados:**
   - Al guardar el diagnóstico exitosamente, el prospecto pasa de `Nuevo` a `Contactado`.
   - Al guardar la cotización final en el Cotizador, el prospecto pasa de `Contactado` a `Cotizado`.
3. **Persistencia en Base de Datos:** La cotización calculada se almacena de forma definitiva en las tablas `cotizaciones_historicas` e `items_cotizacion_historica` vinculada al `codigo_seguimiento`, evitando que se pierda la información al cerrar el navegador.

---

## 2. Ruta Tecnológica del Motor de Recomendaciones (Pesos Flexibles)

En lugar de utilizar un "score de confianza" o reglas estáticas de recomendación, la plataforma avanzará hacia una **estructura tipo matriz de pesos (red neuronal simple)**:

- **Pesos de Productos:** Cada producto tendrá asignados pesos numéricos en base a sus propiedades químicas y capacidades de desempeño.
- **Pesos de Respuestas:** Las preguntas y respuestas del diagnóstico actuarán como filtros y multiplicadores de peso.
- **Aprendizaje por Cotizaciones:** Al registrar las cotizaciones finales de los vendedores (y ver qué productos agregaron, eliminaron o modificaron respecto a la sugerencia original del sistema), el algoritmo ajustará dinámicamente los pesos para optimizar y auto-descubrir la especificación óptima según las necesidades del suelo.

---

## 3. Propuestas de Infraestructura y Operación

Para madurar el proyecto antes y durante el uso por parte de los compañeros de equipo, se proponen las siguientes implementaciones:

### A. CI/CD (GitHub Actions)
- **Implementación:** Crear un flujo de trabajo automatizado en `.github/workflows/deploy.yml` para desplegar automáticamente a Cloudflare Workers con Wrangler en cada `git push origin main`.
- **Beneficio:** Elimina el despliegue manual desde terminal local y asegura consistencia en producción.

### B. Entorno de Staging (Pruebas)
- **Implementación:** Configurar Cloudflare para generar despliegues temporales de previsualización ("Preview Deployments") cada vez que se realice un commit o push a la rama `dev`.
- **Beneficio:** Permite probar nuevas fórmulas del cotizador, integraciones de Gemini o cambios de base de datos sin afectar a los vendedores que están cotizando en producción.

### C. Monitoreo de Errores (Sentry o LogRocket)
- **Implementación:** Integrar el SDK de Sentry en el punto de entrada de la aplicación (`__root.tsx`).
- **Beneficio:** Captura y reporta en tiempo real errores de JavaScript, fallos de API de Supabase o discrepancias en la extracción de archivos de Gemini directamente en un dashboard de alertas.

### D. Analytics Internos de Dirección
- **Implementación:** Vista administrativa en `/admin` que lea de `cotizaciones_historicas` e `items_cotizacion_historica` para graficar:
  - Frecuencia y volumen de productos cotizados (perfilado de inventario demandado).
  - Venta promedio ponderada.
  - Tiempos de respuesta de vendedores (de contacto a cotizado).

---

## 4. Pendientes de Arquitectura y Código

Para garantizar la escalabilidad y evitar regresiones a medida que se añadan funciones:

1. **Refactorización del Monolito `admin.tsx`:** Separar el archivo de más de 200 KB en sub-componentes independientes (por ejemplo, `FichasMigrador`, `SistemasCrud`, `GeminiConsole`, `LeadPortal`).
2. **Modularización de Formularios:** Separar la lógica de negocio y las llamadas a la base de datos de los componentes visuales en `FormularioDiagnostico.tsx` y `Cotizador.tsx`.
3. **Limpieza de AWS S3:** Eliminar las dependencias de S3 de `package.json` para reducir el bundle size y evitar confusión de código muerto mientras se use Supabase Storage.
