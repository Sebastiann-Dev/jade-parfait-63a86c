-- Create systems table
CREATE TABLE IF NOT EXISTS public.sistemas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  created_at timestamptz DEFAULT now()
);

-- Create table linking products to systems with dosing/consumption per m2
CREATE TABLE IF NOT EXISTS public.sistema_productos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sistema_id uuid REFERENCES public.sistemas(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  consumo_por_m2 numeric NOT NULL,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sistemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_productos ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS "Lectura publica de sistemas" ON public.sistemas;
CREATE POLICY "Lectura publica de sistemas" ON public.sistemas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura publica de relacion de sistemas" ON public.sistema_productos;
CREATE POLICY "Lectura publica de relacion de sistemas" ON public.sistema_productos FOR SELECT USING (true);

-- Admin modification policies (restricting to @bucamx.com email domain)
DROP POLICY IF EXISTS "Solo admins modifican sistemas" ON public.sistemas;
CREATE POLICY "Solo admins modifican sistemas" ON public.sistemas
  FOR ALL TO authenticated USING (auth.jwt()->>'email' LIKE '%@bucamx.com');

DROP POLICY IF EXISTS "Solo admins modifican relacion de sistemas" ON public.sistema_productos;
CREATE POLICY "Solo admins modifican relacion de sistemas" ON public.sistema_productos
  FOR ALL TO authenticated USING (auth.jwt()->>'email' LIKE '%@bucamx.com');
