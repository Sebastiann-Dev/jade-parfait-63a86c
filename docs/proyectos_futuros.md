# Documentación Interna: Proyectos a Futuro (Estimación Avanzada por CSP)

Este documento archiva los conceptos de estimación avanzada basados en el perfil de superficie del concreto para futuras fases de la herramienta.

## 1. Perfil de Superficie del Concreto (CSP)

El **Concrete Surface Profile (CSP)** es una clasificación estandarizada por el *International Concrete Repair Institute (ICRI)* que define la rugosidad de la superficie del concreto en una escala del 1 al 9:

| Nivel CSP | Textura Común | Método de Preparación |
| :--- | :--- | :--- |
| **CSP 1** | Ácido (muy liso) | Lavado con ácido |
| **CSP 2** | Lijado ligero | Lijadora de disco |
| **CSP 3** | Desbastado fino | Desbastadora de diamante |
| **CSP 4** | Granallado ligero | Granalladora (Shotblasting) |
| **CSP 5** | Granallado medio | Granalladora |
| **CSP 6** | Escarificado ligero | Escarificadora |
| **CSP 7** | Escarificado medio | Escarificadora |
| **CSP 8** | Hidrodemolición | Chorro de agua a alta presión |
| **CSP 9** | Desbastado profundo | Martillo neumático / Rotomartillo |

---

## 2. Impacto en el Consumo de Material (Mermas)

A mayor nivel de CSP, el concreto presenta valles más profundos. Esto requiere rellenar más volumen con resinas primarias o morteros antes de lograr una superficie lisa.

### Multiplicador de Consumo Adicional Teórico
Cuando la herramienta madure, se podría implementar una matriz de ajuste automático del rendimiento para capas base o autonivelantes:

```
[Área Cotizada] x [Rendimiento Teórico] x [Factor CSP]
```

Donde el **Factor CSP** incrementa la cantidad de material:
*   **CSP 1 - 2:** +5% de merma (superficie lisa).
*   **CSP 3 - 4:** +10% a 15% de merma (estándar para la mayoría de sistemas industriales).
*   **CSP 5 - 6:** +20% a 30% de merma (requiere capas de renivelación gruesas).
*   **CSP 7 - 9:** +40% o más (casos de reparación severa).

---

## 3. Migración de Almacenamiento a AWS S3 (Próxima Fase)

Actualmente, todos los documentos (fichas técnicas, hojas de seguridad y cotizaciones de referencia) y las fotos de superficie del diagnóstico se almacenan en **Supabase Storage** (dentro del bucket `product-docs`), lo cual permite un desarrollo rápido y sin costes de infraestructura adicionales durante la fase de validación de mercado.

Como proyecto de madurez para el sistema, se tiene planificada la migración hacia **AWS S3** bajo la siguiente arquitectura propuesta:
- **Subida Directa desde Cliente:** Uso de URLs de subida firmadas (`PUT` presigned URLs) generadas por el servidor de TanStack Start para que los navegadores suban archivos grandes directo a AWS, previniendo transferencias de red y cuellos de botella en el servidor principal.
- **Acceso Privado y Seguro:** Generación de enlaces temporales (`GET` presigned URLs) con expiración de 15 minutos para descargas y visualizaciones, manteniendo los recursos ocultos ante indexadores y accesos no autorizados.
- **Políticas de Ciclo de Vida:** Archivar reportes e imágenes antiguas automáticamente a Glacier para reducir costos de almacenamiento.
- **Auditoría:** Registro automático de metadatos en la base de datos vinculando el S3 Key (`ficha_tecnica_s3key`, `foto_superficie_s3key`, etc.) con los ID de productos y prospectos correspondientes.
