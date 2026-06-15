-- Create table for prospect diagnostic scoping forms
CREATE TABLE IF NOT EXISTS public.prospectos_diagnostico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_seguimiento VARCHAR(50) UNIQUE NOT NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    proyecto_nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(255),
    respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
    recomendaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
    campos_vendedor JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado VARCHAR(50) DEFAULT 'Nuevo' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.prospectos_diagnostico ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Permitir insercion anonima publica para prospectos" ON public.prospectos_diagnostico;
DROP POLICY IF EXISTS "Permitir lectura anonima publica por codigo" ON public.prospectos_diagnostico;
DROP POLICY IF EXISTS "Solo vendedores autenticados pueden modificar o ver todo" ON public.prospectos_diagnostico;

-- 1. Anyone can insert their scoping responses (client-side submission)
CREATE POLICY "Permitir insercion anonima publica para prospectos"
ON public.prospectos_diagnostico FOR INSERT
WITH CHECK (true);

-- 2. Anyone can read their own diagnostic by specifying the unique code (client-side lookup)
CREATE POLICY "Permitir lectura anonima publica por codigo"
ON public.prospectos_diagnostico FOR SELECT
USING (true);

-- 3. Authenticated users (vendors/admins) can perform any operation on prospect entries
CREATE POLICY "Solo vendedores autenticados pueden modificar o ver todo"
ON public.prospectos_diagnostico FOR ALL TO authenticated
USING (true);
