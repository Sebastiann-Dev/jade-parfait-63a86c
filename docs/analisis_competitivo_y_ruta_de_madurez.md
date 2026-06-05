# Ruta de Madurez y Especificaciones Técnicas: BUCA Recubrimientos

Este documento detalla la ruta de madurez para el cotizador interno de **BUCA Recubrimientos**, refinada a partir de tu retroalimentación. Se eliminaron los componentes de presupuesto de mano de obra y viáticos por no ser de utilidad, y se profundizaron los temas clave de precisión técnica, mermas y seguridad del backend.

---

## 1. Mermas y Estado del Piso (Explicación Extendida)

En lugar de implementar una compleja matriz de perfiles industriales (CSP) que resulta poco viable a corto plazo, el cotizador puede incorporar un **selector simplificado del estado del piso**. 

El consumo real de resina y mortero se ve afectado directamente por los poros y grietas del concreto. Un piso poroso absorbe mucho más producto que un piso sellado y liso.

### Implementación en la Interfaz (React)
Añadiremos un selector en la barra de configuración o al lado del producto:

*   **Piso Liso / Pulido (+5% de merma):** Para concreto nuevo pulido o pisos con recubrimiento previo en buen estado.
*   **Piso Estándar (+10% de merma):** Concreto promedio desbastado o con porosidad media.
*   **Piso Rugoso / Poroso (+15% de merma):** Concreto viejo, muy absorbente, o con imperfecciones notables.

### El Algoritmo en la Calculadora
Al calcular la cantidad del producto a cotizar, el sistema aplicará automáticamente el multiplicador seleccionado:

```typescript
const multiplicadorMerma = 
  estadoPiso === 'liso' ? 1.05 :
  estadoPiso === 'rugoso' ? 1.15 : 
  1.10; // Estándar por defecto

// Ajuste automático de cantidad en el cotizador
const cantidadFinal = cantidadCalculada * multiplicadorMerma;
```

Esto asegura que las propuestas enviadas al cliente contemplen la realidad física del piso, evitando pérdidas económicas para BUCA al tener que reponer material gratis en obra.

---

## 2. Morteros por Espesor Dinámico (Explicación Extendida)

### ¿Por qué el rendimiento de un mortero no es fijo?
A diferencia de una pintura o sello epóxico convencional, un **mortero de poliuretano-cemento (ej. BucaCrete HL)** se aplica a diferentes espesores (usualmente entre **3 mm y 9 mm**) según la carga de tráfico o temperatura que recibirá el piso. 
Si el cotizador usa un "rendimiento fijo" (ej. 4 m² por saco), cometerá un gran error si el cliente requiere un espesor de 6 mm en lugar de 3 mm (necesitará exactamente el doble de material).

### El Cálculo Matemático Basado en Densidad
Para obtener la cantidad exacta de sacos de 25 kg requeridos, usamos la densidad recomendada del mortero (ej. $1.8\text{ kg/L}$):

$$\text{Rendimiento (kg/m²)} = \text{Espesor (mm)} \times \text{Densidad (kg/L)}$$

$$\text{Total Kilos} = \text{Área (m²)} \times \text{Rendimiento (kg/m²)}$$

$$\text{Sacos de 25 kg} = \frac{\text{Total Kilos}}{25}$$

#### Ejemplo Práctico:
*   **Área a recubrir:** $100\text{ m²}$
*   **Espesor deseado:** $6\text{ mm}$
*   **Densidad de BucaCrete:** $1.8\text{ kg/L}$ (es decir, $1.8\text{ kg}$ de mezcla rellenan exactamente un litro de volumen).
*   **Fórmula:**
    $$\text{Rendimiento} = 6\text{ mm} \times 1.8\text{ kg/L} = 10.8\text{ kg/m²}$$
    $$\text{Total Kilos} = 100\text{ m²} \times 10.8\text{ kg/m²} = 1080\text{ kg}$$
    $$\text{Sacos de 25 kg} = \frac{1080\text{ kg}}{25\text{ kg}} = 43.2\text{ sacos} \approx 44\text{ sacos}$$

### Cómo se vería en el Cotizador:
Si el producto seleccionado tiene una `densidadRecomendada` en su ficha técnica y el usuario ingresa a cotizar por m²:
1. El cotizador habilita un campo numérico: **Espesor requerido (mm)**.
2. El sistema calcula y muestra en tiempo real cuántos sacos se necesitan utilizando la densidad del producto.
3. El vendedor entiende perfectamente el rendimiento por m² a esa densidad y espesor elegidos.

---

## 3. Cotización por Sistemas Multicapa (Fase 2)

Dado que es una propuesta de alto valor para BUCA, la lógica consistiría en:
1. Crear una tabla `sistemas` en la base de datos (ej. "Sistema BucaCrete HD 6mm").
2. Crear una tabla de relación `sistema_productos` donde se defina qué productos contiene (ej. *Base Primer + Mortero BucaCrete + Sello Bucathane*) y su factor de dosificación por m².
3. En la interfaz, al cotizar $200\text{ m²}$ de dicho sistema, se agregarán de forma automática 3 líneas de cotización con sus respectivas cantidades exactas y precios individuales.

---

## 4. Generación de PDF Premium con Hipervínculos a Fichas Técnicas

Esta herramienta le dará un toque sumamente profesional a tus propuestas:
*   En la base de datos se añaden dos campos de tipo URL a la tabla de productos: `ficha_tecnica_url` (TDS) y `ficha_seguridad_url` (SDS).
*   Al presionar el botón "Descargar PDF", se genera un archivo formal (con membrete de BUCA, desglose del proyecto y cotización).
*   En la tabla de conceptos del PDF, el nombre de cada producto será un enlace cliqueable. Al pulsarlo, el cliente podrá ver o descargar la Ficha Técnica directamente en su teléfono o computadora.

---

## 5. Seguridad de Supabase: Permisos de Dominio `@bucamx.com`

Para evitar accesos no autorizados y permitir cuentas internas seguras, estructuramos las políticas de Supabase bajo las siguientes reglas:

### A. Autenticación Restringida por Dominio
Para asegurar que solo empleados autorizados de BUCA puedan crear cuentas o acceder a la sección de administración:
1.  **Restricción en el Registro:** Se configura Supabase Auth para restringir registros únicamente a direcciones de correo electrónico que terminen en `@bucamx.com`.
2.  **Trigger de Validación (PostgreSQL):** Se crea una función de validación en la base de datos de Supabase que se ejecuta automáticamente cada vez que un usuario intenta registrarse:
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

### B. Políticas Row Level Security (RLS) en la tabla `productos`
Implementaremos políticas basadas en el correo autenticado para autorizar operaciones:
*   **Lectura (`SELECT`):** Permitida para todos los usuarios (público / anónimo), para que la calculadora cargue la información de precios sin necesidad de loguearse.
*   **Modificaciones (`INSERT / UPDATE / DELETE`):** Permitida únicamente para usuarios cuya sesión autenticada (`auth.jwt()`) pertenezca a un correo `@bucamx.com`:
    ```sql
    CREATE POLICY "Solo administradores BUCA pueden modificar productos"
    ON public.productos
    FOR ALL
    TO authenticated
    USING (auth.jwt()->>'email' LIKE '%@bucamx.com');
    ```
