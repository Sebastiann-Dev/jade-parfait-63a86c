-- Agregar columnas para kits y proporciones de mezcla
ALTER TABLE public.productos 
  ADD COLUMN IF NOT EXISTS "kitInfo" text,
  ADD COLUMN IF NOT EXISTS "proporcionesMezcla" text;
