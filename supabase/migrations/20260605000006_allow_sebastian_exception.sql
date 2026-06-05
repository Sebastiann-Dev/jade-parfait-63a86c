-- 1. Actualizar función de validación de correo para registro en auth.users
CREATE OR REPLACE FUNCTION public.check_user_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@bucamx.com' AND NEW.email != 'sebastian.grajales.rmzz@gmail.com' THEN
    RAISE EXCEPTION 'Registro no permitido. Debes usar un correo oficial de BUCA o ser un administrador autorizado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Actualizar política en la tabla productos
DROP POLICY IF EXISTS "Solo administradores BUCA pueden modificar productos" ON public.productos;
CREATE POLICY "Solo administradores BUCA pueden modificar productos"
ON public.productos
FOR ALL
TO authenticated
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');

-- 3. Actualizar política en la tabla sistemas
DROP POLICY IF EXISTS "Solo admins modifican sistemas" ON public.sistemas;
CREATE POLICY "Solo admins modifican sistemas" ON public.sistemas
FOR ALL 
TO authenticated 
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');

-- 4. Actualizar política en la tabla sistema_productos
DROP POLICY IF EXISTS "Solo admins modifican relacion de sistemas" ON public.sistema_productos;
CREATE POLICY "Solo admins modifican relacion de sistemas" ON public.sistema_productos
FOR ALL 
TO authenticated 
USING (auth.jwt()->>'email' LIKE '%@bucamx.com' OR auth.jwt()->>'email' = 'sebastian.grajales.rmzz@gmail.com');
