-- Create historical quotes tables and indexes

CREATE TABLE IF NOT EXISTS public.cotizaciones_historicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente VARCHAR(255),
    proyecto VARCHAR(255),
    fecha DATE,
    area_total_m2 NUMERIC,
    monto_total NUMERIC,
    archivo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.items_cotizacion_historica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id UUID REFERENCES public.cotizaciones_historicas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    producto_nombre_original VARCHAR(255) NOT NULL,
    cantidad NUMERIC NOT NULL,
    unidad VARCHAR(50),
    precio_unitario NUMERIC NOT NULL,
    moneda VARCHAR(10) DEFAULT 'MXN',
    total NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_hist_producto ON public.items_cotizacion_historica(producto_id);
CREATE INDEX IF NOT EXISTS idx_items_hist_nombre_orig ON public.items_cotizacion_historica(producto_nombre_original);
