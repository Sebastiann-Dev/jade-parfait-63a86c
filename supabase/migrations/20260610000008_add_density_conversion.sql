-- Agregar columna de densidad para conversión numérica (kg/L)
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "densidad_conversion" numeric default 1.0 not null;
