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

## 🛠️ FASE 2: Complejo o Tedioso (Mediano/Largo Plazo)

Estas características aportan un valor de automatización muy alto y una experiencia de usuario premium, pero requieren de mayor tiempo de desarrollo, lógica avanzada en el servidor (Edge Functions) y rediseño de las tablas de datos.

### 1. Cotización por Sistemas Multicapa
Permite cotizar paquetes completos de recubrimientos (ej. "Sistema Autonivelante de 3mm") en lugar de añadir cada componente por separado.
*   **Por qué es complejo:** Requiere crear dos nuevas tablas en la base de datos (`sistemas` y `sistema_productos`) para enlazar las proporciones relativas, y programar una lógica en React que desglose dinámicamente múltiples filas al añadir un sistema a la cotización.
*   **Beneficio:** Ahorra tiempo al vendedor y estandariza los sistemas que ofrece la empresa.

### 2. Generador de PDF Premium con Hipervínculos a Fichas Técnicas
Genera un presupuesto en PDF formal y elegante listo para enviar al cliente.
*   **Por qué es tedioso:** Requiere configurar **Supabase Edge Functions** en Deno/Node para compilar y maquetar el PDF con código en el servidor, crear un bucket de almacenamiento para guardar los PDFs generados y diseñar una plantilla visual comercial que no se descuadre.
*   **Beneficio:** El cliente recibe un PDF formal y estético directamente en su WhatsApp. Al pulsar el nombre de cualquier producto en el PDF, este abre la **Ficha Técnica (TDS)** o **Ficha de Seguridad (SDS)** del mismo desde internet.
