# Guía del Flujo Comercial y Plataforma: BUCA Recubrimientos

Esta guía proporciona una explicación completa de la plataforma de cotización y administración de **BUCA Recubrimientos** para que cualquier miembro del equipo de ventas o administración pueda comprender el flujo de trabajo desde cero.

---

## 1. El Cotizador Principal (Calculadora Comercial)

El cotizador principal es la herramienta diaria para generar cotizaciones exactas a los clientes.

*   **Selector de Productos:** Búsqueda en tiempo real de selladores, primarios, morteros y recubrimientos del portafolio.
*   **Cálculo de Consumos:**
    *   **Productos Estándar:** Usan rendimiento teórico por m² para sugerir la cantidad de cubetas, galones o sacos.
    *   **Morteros Especiales (ej. BucaCrete):** Se calculan dinámicamente según el **espesor (mm)** y la **densidad (kg/L)** requerida para la obra.
*   **Márgenes y Monedas:**
    *   Soporte para productos en pesos (MXN) y dólares (USD), aplicando un tipo de cambio comercial editable (default $17.50 MXN/USD).
    *   Toggle **Minorista / Mayorista** para aplicar automáticamente un 5% de descuento sobre el precio base.
*   **Exportación a PDF:** Genera propuestas comerciales premium listas para enviar por WhatsApp o correo.

---

## 2. Gestión del Catálogo (Productos y Sistemas)

Desde el panel de administración (`/admin`), el equipo técnico mantiene actualizado el portafolio:

*   **Productos:** CRUD para agregar unidades, precios, monedas y adjuntar fichas técnicas/seguridad en PDF.
*   **Sistemas Multicapa:** Agrupaciones predefinidas de productos (ej. Sistema Epóxico de 3 Capas: Primario + Intermedio + Sello). Al cotizar un sistema, el cotizador desglosa automáticamente todos los productos y cantidades por m².
*   **Asistente IA (Gemini 2.5 Flash):** Al dar de alta un producto, puedes subir su ficha técnica en PDF. La inteligencia artificial analizará el documento y pre-llenará el formulario en segundos (nombre, descripción, densidades y rendimientos sugeridos), listos para que el administrador los valide side-by-side.

---

## 3. Asistente de Diagnóstico (Scoping Wizard en `/diagnostico`)

Es la puerta de entrada para clientes finales y prospectores:

*   Un cuestionario dinámico paso a paso que ramifica las preguntas según la situación real de la obra (exposición al sol, tráfico pesado, contacto químico, tipo de llantas de montacargas, etc.).
*   **Filtro Anti-Spam:** Valida en tiempo real y bloquea correos temporales, groserías y teclazos aleatorios (`asdfgh`).
*   **Motor de Recomendaciones:** Sugiere automáticamente los sistemas o productos idóneos que solucionan la necesidad del cliente y genera un código de seguimiento inteligente.

---

## 4. Portal de Prospectos y Seguimiento Comercial

Permite al equipo de ventas gestionar los leads del asistente de diagnóstico:

*   **Bitácora de Ventas:** Permite asignar asesores, actualizar el estatus de la cotización (Nuevo, Contactado, Cotizado, Ganado, Perdido) y registrar notas de seguimiento.
*   **Visualización de Evidencia:** Muestra en pantalla la foto de la superficie cargada por el cliente desde la obra (almacenada en Supabase Storage).
*   **Carga Directa al Cotizador:** Con un solo botón, el asesor puede jalar toda la recomendación sugerida por el diagnóstico a la calculadora principal para generar la propuesta formal de inmediato.

---

## 5. Nomenclatura del Código de Seguimiento (ID de Prospecto)

Los IDs de prospecto están estandarizados para decirte toda la información técnica del cliente de un solo vistazo:

```
BUCA-[AÑO][MES]-[SUPERFICIE]-[NECESIDAD]-[TRÁFICO]-[UBICACIÓN]-[SECUENCIAL]-[CLIENTE]
```

### Tabla de Desglose de Términos:

| Segmento | Significado | Valores Comunes | Ejemplo |
| :--- | :--- | :--- | :--- |
| **AÑO+MES** | Fecha de Registro | `2606` = Junio 2026 | `2606` |
| **SUPERFICIE** | Tipo de Superficie | `CF` = Concreto Piso, `MT` = Metal, `MR` = Muro, `XX` = Sin definir/Otro | `CF` (Concreto) |
| **NECESIDAD** | Familia Recomendada | `EQ` = Epóxico Químico/Mortero, `PU` = Poliuretano, `PX` = Epóxico, `AS` = Asesoría | `EQ` (Epóxico Químico) |
| **TRÁFICO** | Intensidad de Uso | `IN` = Industrial Severo, `HV` = Vehicular Pesado, `LD` = Peatonal Ligero, `NA` = N/A | `HV` (Tráfico Pesado) |
| **UBICACIÓN** | Zona de la Obra | `INT` = Interior, `EXT` = Exterior, `AMB` = Ambos | `INT` (Interior) |
| **SECUENCIAL** | Número de Prospecto | `001`, `002`, `042` (se resetea cada mes) | `001` (1er lead del mes) |
| **CLIENTE** | Siglas del Cliente | Primeras 3 letras del nombre/empresa (libre de acentos y espacios) | `SEB` (Sebastian) |

**Ejemplo completo:** `BUCA-2606-CF-EQ-HV-INT-001-SEB`
> **Interpretación:** Registro de Junio 2026, piso de concreto, requiere Epóxico Químico por tráfico pesado vehicular en interior, es el prospecto #1 del mes y pertenece a Sebastian.
