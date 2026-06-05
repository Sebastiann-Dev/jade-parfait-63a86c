-- 1. Asegurar columnas de densidad y bitácora
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "densidadRecomendada" text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "bitacora" text;

-- 2. Habilitar seguridad RLS en la tabla
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- 3. Crear política para que cualquiera pueda ver precios y productos
DROP POLICY IF EXISTS "Lectura publica de productos" ON public.productos;
CREATE POLICY "Lectura publica de productos" 
ON public.productos 
FOR SELECT 
USING (true);

-- 4. Crear política para que solo usuarios @bucamx.com autenticados modifiquen
DROP POLICY IF EXISTS "Solo administradores BUCA pueden modificar productos" ON public.productos;
CREATE POLICY "Solo administradores BUCA pueden modificar productos"
ON public.productos
FOR ALL
TO authenticated
USING (auth.jwt()->>'email' LIKE '%@bucamx.com');

-- 5. Crear trigger de validación de dominio de correo al registrarse
CREATE OR REPLACE FUNCTION public.check_user_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@bucamx.com' THEN
    RAISE EXCEPTION 'Registro no permitido. Debes usar un correo oficial de BUCA.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validate_buca_email ON auth.users;
CREATE TRIGGER validate_buca_email
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.check_user_domain();
