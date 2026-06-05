# Ruta de Madurez y Especificaciones Técnicas: BUCA Recubrimientos

Este documento detalla el plan de evolución del cotizador interno de **BUCA Recubrimientos**, dividido en dos fases: desde lo más fácil y necesario hasta lo más complejo o laborioso.

---

## 🚀 FASE 1: Fácil y Necesario (Corto Plazo)

Estas características son sumamente necesarias para asegurar la rentabilidad de las cotizaciones y proteger la base de datos de modificaciones maliciosas. Son rápidas de implementar ya que no requieren integraciones externas complejas ni grandes cambios estructurales.

### 1. Factor de Merma por Estado del Piso
El consumo real de resinas y morteros se ve afectado directamente por los poros y grietas del concreto. Un piso poroso absorbe mucho más producto que un piso sellado y liso.
*   **Implementación:** Añadiremos un selector rápido en el cotizador (ej. *Liso +5%*, *Estándar +10%*, *Rugoso/Poroso +15%*).
*   **Algoritmo:**
    ```typescript
    const multiplicadorMerma = 
      estadoPiso === 'liso' ? 1.05 :
      estadoPiso === 'rugoso' ? 1.15 : 
      1.10; // Estándar por defecto

    const cantidadFinal = cantidadCalculada * multiplicadorMerma;
    ```
*   **Importancia:** Evita que BUCA pierda dinero reponiendo material faltante en obra debido a la porosidad imprevista del concreto.

### 2. Rendimiento de Morteros por Espesor Dinámico
A diferencia de una pintura convencional, un **mortero (ej. BucaCrete HL)** se aplica a diferentes espesores (de 3 mm a 9 mm) según el tráfico o choque térmico que recibirá. Usar un "rendimiento fijo" en m² causa graves errores de cotización.
*   **El Cálculo:** Usamos la **Densidad Recomendada** del mortero (ej. $1.8\text{ kg/L}$) y el espesor en mm ingresado por el vendedor:
    $$\text{Rendimiento (kg/m²)} = \text{Espesor (mm)} \times \text{Densidad (kg/L)}$$
    $$\text{Total Kilos} = \text{Área (m²)} \times \text{Rendimiento (kg/m²)}$$
    $$\text{Sacos de 25 kg} = \frac{\text{Total Kilos}}{25}$$
*   **Ejemplo Práctico:** Para $100\text{ m²}$ a un espesor de $6\text{ mm}$ con densidad de $1.8\text{ kg/L}$:
    $$\text{Rendimiento} = 6 \times 1.8 = 10.8\text{ kg/m²}$$
    $$\text{Total Kilos} = 100 \times 10.8 = 1080\text{ kg}$$
    $$\text{Sacos} = \frac{1080}{25} = 43.2 \approx 44\text{ sacos}$$
*   **Implementación:** Al elegir un mortero, el cotizador pide el "Espesor requerido (mm)" y realiza este cálculo exacto en lugar de usar un número estático.

### 3. Seguridad de Supabase: Restringir por Dominio `@bucamx.com`
Actualmente, las claves de Supabase están expuestas en el código del frontend. Es crucial proteger la base de datos de alteraciones externas.
*   **Políticas Row Level Security (RLS) en la tabla `productos`:**
    *   **Lectura (`SELECT`):** Permitida para todos (público / anónimo) para que la calculadora cargue la información de precios sin loguearse.
    *   **Modificaciones (`INSERT / UPDATE / DELETE`):** Permitida únicamente para usuarios autenticados con cuentas del correo oficial `@bucamx.com`:
        ```sql
        CREATE POLICY "Solo administradores BUCA pueden modificar productos"
        ON public.productos
        FOR ALL
        TO authenticated
        USING (auth.jwt()->>'email' LIKE '%@bucamx.com');
        ```
*   **Filtro en Base de Datos (Postgres Trigger):**
    Evita que personas ajenas a la empresa puedan crear cuentas desde la API:
    ```sql
    CREATE OR REPLACE FUNCTION public.check_user_domain()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.email NOT LIKE '%@bucamx.com' THEN
        RAISE EXCEPTION 'Registro no permitido. Debes usar un correo oficial de BUCA.';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE TRIGGER validate_buca_email
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_user_domain();
    ```

---

### 📝 Pasos Accionables para Implementar la Fase 1

#### Paso 1: Implementar Mermas en el Frontend
1.  **Definir el Estado de Merma:**
    En [Cotizador.tsx](file:///c:/Users/52811/Desktop/Nueva%20carpeta/calculadora_cotizacion/jade-parfait-63a86c-main/src/components/Cotizador.tsx), declarar el estado:
    ```typescript
    const [estadoPiso, setEstadoPiso] = useState<'liso' | 'estandar' | 'rugoso'>('estandar');
    ```
2.  **Pintar el Selector en la Interfaz:**
    Agregar un selector visual en la tarjeta de configuración superior de [Cotizador.tsx](file:///c:/Users/52811/Desktop/Nueva%20carpeta/calculadora_cotizacion/jade-parfait-63a86c-main/src/components/Cotizador.tsx) para que el usuario seleccione la porosidad del piso.
3.  **Ajustar la Función de Cálculo:**
    Actualizar `calcularLinea` para que reciba el factor de merma (ej. `liso: 1.05`, `estandar: 1.10`, `rugoso: 1.15`) e incremente de forma directa la cantidad estimada y el total de la línea de cotización.

#### Paso 2: Implementar Espesor Dinámico en el Frontend
1.  **Definir el Estado de Espesor:**
    En [Cotizador.tsx](file:///c:/Users/52811/Desktop/Nueva%20carpeta/calculadora_cotizacion/jade-parfait-63a86c-main/src/components/Cotizador.tsx), declarar el estado:
    ```typescript
    const [espesorMm, setEspesorMm] = useState<string>('');
    ```
2.  **Pintar el Campo de Espesor:**
    Bajo el campo de metros cuadrados en [Cotizador.tsx](file:///c:/Users/52811/Desktop/Nueva%20carpeta/calculadora_cotizacion/jade-parfait-63a86c-main/src/components/Cotizador.tsx), si el producto seleccionado tiene `tieneRendimiento: true` y cuenta con una `densidadRecomendada` configurada, renderizar un campo de entrada para los milímetros de espesor (ej. `3 mm`, `6 mm`, `9 mm`).
3.  **Cálculo Dinámico de Rendimiento:**
    En la lógica de cálculo, si el usuario ingresó un espesor válido, calcular el rendimiento del producto dinámicamente usando la fórmula matemática antes de estimar el total de sacos:
    ```typescript
    const densidadNum = parseFloat(producto.densidadRecomendada);
    const espesorNum = parseFloat(espesorMm);

    // rendimientoCalculado = Kg por saco / (espesor mm * densidad kg/L)
    const rendimientoCalculado = (densidadNum > 0 && espesorNum > 0)
      ? (producto.cantRef / (espesorNum * densidadNum))
      : (producto.rendimiento || 1);
    ```

#### Paso 3: Configurar Seguridad en Supabase
1.  **Habilitar RLS:**
    Acceder al SQL Editor del panel de control de Supabase y activar Row Level Security (RLS) en la tabla `productos`.
2.  **Registrar la Política de Edición:**
    Ejecutar el script SQL para validar que solo usuarios logueados con correos con terminación `@bucamx.com` puedan editar.
3.  **Registrar el Trigger de Creación de Cuentas:**
    Ejecutar el trigger DDL en `auth.users` para denegar registros a cualquier correo que no pertenezca al dominio oficial.

---

## 🛠️ FASE 2: Complejo o Tedioso (Mediano/Largo Plazo)

Estas características aportan un valor de automatización muy alto y una experiencia de usuario premium, pero requieren de mayor tiempo de desarrollo, lógica avanzada en el servidor (Edge Functions) y rediseño de las tablas de datos.

### 1. Cotización por Sistemas Multicapa
Permite cotizar paquetes completos de recubrimientos (ej. "Sistema Autonivelante de 3mm") en lugar de añadir cada componente por separado.
*   **Por qué es complejo:** Requiere crear dos nuevas tablas en la base de datos (`sistemas` y `sistema_productos`) para enlazar las proporciones relativas, y programar una lógica en React que desglose dinámicamente múltiples filas al añadir un sistema a la cotización.

### 2. Generador de PDF Premium con Hipervínculos a Fichas Técnicas
Genera un presupuesto en PDF formal y elegante listo para enviar al cliente.
*   **Por qué es tedioso:** Requiere configurar **Supabase Edge Functions** en Deno/Node para compilar y maquetar el PDF con código en el servidor, crear un bucket de almacenamiento para guardar los PDFs generados y diseñar una plantilla visual comercial que no se descuadre.

#### 📂 ¿Cómo usar tus PDFs en la Fase 2? (Guía de Almacenamiento)
Para integrar tus PDFs de Fichas Técnicas (TDS) y Hojas de Seguridad (SDS):

1.  **Crear el Bucket de Almacenamiento:**
    *   Entra a tu consola de Supabase.
    *   Ve a la sección **Storage** (Menú izquierdo, icono de balde/cubeta).
    *   Haz clic en **New Bucket**.
    *   Nómbralo `documentacion-productos` y asegúrate de marcarlo como **Public** (para que cualquiera con el enlace pueda descargar el PDF).
2.  **Subir las Fichas en PDF:**
    *   Entra a la carpeta de tu nuevo bucket y arrastra tus archivos PDF (ej. `BucaTrafic-TDS.pdf` y `BucaTrafic-SDS.pdf`).
    *   Haz clic en los tres puntos de cada archivo y selecciona **Get URL**. Obtendrás un enlace directo como:
        `https://[id-proyecto].supabase.co/storage/v1/object/public/documentacion-productos/BucaTrafic-TDS.pdf`
3.  **Vincularlas a los Productos:**
    *   En tu base de datos de Supabase, agrega dos nuevas columnas de tipo texto a la tabla `productos`:
        ```sql
        ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "ficha_tecnica_url" text;
        ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "ficha_seguridad_url" text;
        ```
    *   En el **Panel de Administración**, introduce las URLs públicas de Supabase Storage en sus respectivos inputs al editar o crear el producto.
4.  **Generar los hipervínculos en el PDF de Cotización:**
    *   Al cotizar, el código del PDF tomará dinámicamente `ficha_tecnica_url` y `ficha_seguridad_url` del producto y los pintará como textos cliqueables (ej. *Ficha Técnica*). El cliente solo tendrá que hacer clic en la propuesta digital para abrir tus PDFs directamente.

