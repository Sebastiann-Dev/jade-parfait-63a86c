-- Habilitar RLS en tablas de cotizaciones históricas
ALTER TABLE public.cotizaciones_historicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_cotizacion_historica ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir acceso completo únicamente a administradores autorizados
DROP POLICY IF EXISTS "Solo admins gestionan cotizaciones" ON public.cotizaciones_historicas;
CREATE POLICY "Solo admins gestionan cotizaciones" ON public.cotizaciones_historicas
  FOR ALL TO authenticated 
  USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');

DROP POLICY IF EXISTS "Solo admins gestionan items" ON public.items_cotizacion_historica;
CREATE POLICY "Solo admins gestionan items" ON public.items_cotizacion_historica
  FOR ALL TO authenticated 
  USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');
