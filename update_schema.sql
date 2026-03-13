-- 1. Crear tabla de items (si no existe)
CREATE TABLE IF NOT EXISTS public.pedido_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
    nombre_archivo text,
    paginas integer DEFAULT 0,
    tipo_tinta text DEFAULT 'bn',
    doble_faz boolean DEFAULT false,
    anillado_costo numeric DEFAULT 0,
    sobrina_trabajo boolean DEFAULT false,
    observaciones text,
    subtotal_item numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Asegurar columnas necesarias en pedidos (Cabecera)
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS total_pedido numeric DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS fecha_pago timestamp with time zone;

-- 2b. Relajar constraints de columnas legacy (ahora viven en pedido_items)
ALTER TABLE public.pedidos ALTER COLUMN paginas SET DEFAULT 0;
ALTER TABLE public.pedidos ALTER COLUMN paginas DROP NOT NULL;
ALTER TABLE public.pedidos ALTER COLUMN anillado_costo SET DEFAULT 0;
ALTER TABLE public.pedidos ALTER COLUMN anillado_costo DROP NOT NULL;
ALTER TABLE public.pedidos ALTER COLUMN tipo_tinta SET DEFAULT 'bn';
ALTER TABLE public.pedidos ALTER COLUMN tipo_tinta DROP NOT NULL;
ALTER TABLE public.pedidos ALTER COLUMN doble_faz SET DEFAULT false;
ALTER TABLE public.pedidos ALTER COLUMN doble_faz DROP NOT NULL;
ALTER TABLE public.pedidos ALTER COLUMN sobrina_trabajo SET DEFAULT false;
ALTER TABLE public.pedidos ALTER COLUMN sobrina_trabajo DROP NOT NULL;

-- 3. Habilitar RLS (Opcional, según tu config de Supabase)
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a anon" ON public.pedido_items FOR ALL USING (true);

-- NOTA: Si ya tenías datos en la tabla 'pedidos' vieja,
-- esta estructura relacional requiere una migración manual si quieres
-- que los archivos viejos aparezcan en la nueva vista.
