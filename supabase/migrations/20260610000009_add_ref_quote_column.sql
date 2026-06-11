-- Migration to add cotizacion_referencia_url column to productos
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS "cotizacion_referencia_url" text;
