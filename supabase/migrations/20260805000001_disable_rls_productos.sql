-- Desactivar Row Level Security en la tabla productos
-- para permitir operaciones CRUD con la anon key del cliente.
ALTER TABLE public.productos DISABLE ROW LEVEL SECURITY;

-- Eliminar cualquier política existente que pudiera re-activar restricciones
DROP POLICY IF EXISTS "Enable read access for all users" ON public.productos;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.productos;
DROP POLICY IF EXISTS "Enable update for all users" ON public.productos;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.productos;
DROP POLICY IF EXISTS "Allow all" ON public.productos;

-- Otorgar permisos explícitos al rol anon y authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos TO authenticated;
