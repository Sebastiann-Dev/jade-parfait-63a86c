-- Migración: Extender tabla cotizaciones_historicas para persistencia completa
-- Agrega columnas necesarias para vincular prospecto, vendedor, estado y metadata

ALTER TABLE public.cotizaciones_historicas
  ADD COLUMN IF NOT EXISTS vendedor_email       TEXT,
  ADD COLUMN IF NOT EXISTS prospecto_codigo     VARCHAR(60),
  ADD COLUMN IF NOT EXISTS estado_cotizacion    VARCHAR(50) DEFAULT 'Borrador' NOT NULL,
  ADD COLUMN IF NOT EXISTS notas                TEXT,
  ADD COLUMN IF NOT EXISTS tipo_cambio          NUMERIC,
  ADD COLUMN IF NOT EXISTS es_minorista         BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado_piso          VARCHAR(20) DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS pdf_storage_key      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Agregar columnas faltantes a items_cotizacion_historica para mayor detalle
ALTER TABLE public.items_cotizacion_historica
  ADD COLUMN IF NOT EXISTS metros_cuadrados     NUMERIC,
  ADD COLUMN IF NOT EXISTS moneda               VARCHAR(10) DEFAULT 'MXN';

-- Índices para búsquedas frecuentes en el Admin
CREATE INDEX IF NOT EXISTS idx_cotizaciones_vendedor  ON public.cotizaciones_historicas(vendedor_email);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_prospecto ON public.cotizaciones_historicas(prospecto_codigo);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado    ON public.cotizaciones_historicas(estado_cotizacion);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha     ON public.cotizaciones_historicas(fecha);

-- Actualizar políticas RLS para permitir inserción anónima
-- (el Cotizador puede ser usado sin login durante la fase de testeo)
DROP POLICY IF EXISTS "Solo admins gestionan cotizaciones" ON public.cotizaciones_historicas;
DROP POLICY IF EXISTS "Solo admins gestionan items" ON public.items_cotizacion_historica;

-- Lectura: solo usuarios autenticados del equipo BUCA
CREATE POLICY "Admins leen cotizaciones"
  ON public.cotizaciones_historicas FOR SELECT
  TO authenticated
  USING (true);

-- Inserción: permitida de forma anónima (el cotizador no requiere login)
CREATE POLICY "Insercion publica de cotizaciones"
  ON public.cotizaciones_historicas FOR INSERT
  WITH CHECK (true);

-- Modificación: solo autenticados
CREATE POLICY "Admins modifican cotizaciones"
  ON public.cotizaciones_historicas FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins eliminan cotizaciones"
  ON public.cotizaciones_historicas FOR DELETE
  TO authenticated
  USING (true);

-- Mismas políticas para items
CREATE POLICY "Admins leen items cotizacion"
  ON public.items_cotizacion_historica FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insercion publica items cotizacion"
  ON public.items_cotizacion_historica FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins modifican items"
  ON public.items_cotizacion_historica FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins eliminan items"
  ON public.items_cotizacion_historica FOR DELETE
  TO authenticated
  USING (true);
