-- Crear tabla de productos para BUCA Recubrimientos
create table if not exists public.productos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  "cantRef" numeric,
  unidad text,
  moneda text default 'MXN',
  precio numeric,
  "tieneRendimiento" boolean default false,
  nota text,
  rendimiento numeric,
  "espesorRecomendado" text,
  "manosRecomendadas" text,
  pros text,
  cons text,
  "cuidadoCon" text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Deshabilitar Row Level Security para permitir acceso sin autenticacion
alter table public.productos disable row level security;
