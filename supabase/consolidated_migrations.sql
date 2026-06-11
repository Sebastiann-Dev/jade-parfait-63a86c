-- ==========================================
-- CONSOLIDATED MIGRATIONS FOR BUCA COTIZADOR
-- Run this script in the Supabase Dashboard SQL Editor
-- ==========================================

-- 1. Create systems tables (from 20260605000005_sistemas_multicapa.sql)
CREATE TABLE IF NOT EXISTS public.sistemas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sistema_productos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sistema_id uuid REFERENCES public.sistemas(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  consumo_por_m2 numeric NOT NULL,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS for systems tables
ALTER TABLE public.sistemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_productos ENABLE ROW LEVEL SECURITY;

-- Create public read policies for systems
DROP POLICY IF EXISTS "Lectura publica de sistemas" ON public.sistemas;
CREATE POLICY "Lectura publica de sistemas" ON public.sistemas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica de relacion de sistemas" ON public.sistema_productos;
CREATE POLICY "Lectura publica de relacion de sistemas" ON public.sistema_productos FOR SELECT USING (true);


-- 2. Setup admin permissions and exception for Sebastian (from 20260605000006_allow_sebastian_exception.sql)
CREATE OR REPLACE FUNCTION public.check_user_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@bucamx.com' AND NEW.email != 'sebastian.grajales.rmzz@gmail.com' THEN
    RAISE EXCEPTION 'Registro no permitido. Debes usar un correo oficial de BUCA o ser un administrador autorizado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for products table to allow Sebastian
DROP POLICY IF EXISTS "Solo administradores BUCA pueden modificar productos" ON public.productos;
CREATE POLICY "Solo administradores BUCA pueden modificar productos"
ON public.productos
FOR ALL
TO authenticated
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');

-- Update RLS policies for systems tables to allow Sebastian
DROP POLICY IF EXISTS "Solo admins modifican sistemas" ON public.sistemas;
CREATE POLICY "Solo admins modifican sistemas" ON public.sistemas
FOR ALL 
TO authenticated 
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');

DROP POLICY IF EXISTS "Solo admins modifican relacion de sistemas" ON public.sistema_productos;
CREATE POLICY "Solo admins modifican relacion de sistemas" ON public.sistema_productos
FOR ALL 
TO authenticated 
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');


-- 3. Create historical quotes tables (from 20260610000007_historical_quotes.sql)
CREATE TABLE IF NOT EXISTS public.cotizaciones_historicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente VARCHAR(255),
    proyecto VARCHAR(255),
    fecha DATE,
    area_total_m2 NUMERIC,
    monto_total NUMERIC,
    archivo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.items_cotizacion_historica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID REFERENCES public.cotizaciones_historicas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    producto_nombre_original VARCHAR(255) NOT NULL,
    cantidad NUMERIC NOT NULL,
    unidad VARCHAR(50),
    precio_unitario NUMERIC NOT NULL,
    moneda VARCHAR(10) DEFAULT 'MXN',
    total NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_hist_producto ON public.items_cotizacion_historica(producto_id);
CREATE INDEX IF NOT EXISTS idx_items_hist_nombre_orig ON public.items_cotizacion_historica(producto_nombre_original);


-- 4. Add missing columns to products table (from 20260610000009_add_ref_quote_column.sql)
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "cotizacion_referencia_url" text;
