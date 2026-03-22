-- ============================================================================
-- 07 — Log opcional al abrir / enviar WhatsApp
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mensajes_whatsapp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  plantilla_id UUID REFERENCES public.plantillas_whatsapp(id) ON DELETE SET NULL,
  cuerpo_texto TEXT NOT NULL,
  enviado_at TIMESTAMPTZ DEFAULT now(),
  enviado_por UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_log_pedido ON public.mensajes_whatsapp_log(pedido_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_whatsapp_log_enviado_at ON public.mensajes_whatsapp_log(enviado_at DESC);

ALTER TABLE public.mensajes_whatsapp_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_mensajes_whatsapp_log" ON public.mensajes_whatsapp_log;
DROP POLICY IF EXISTS "select_mensajes_whatsapp_log" ON public.mensajes_whatsapp_log;
CREATE POLICY "insert_mensajes_whatsapp_log"
  ON public.mensajes_whatsapp_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "select_mensajes_whatsapp_log"
  ON public.mensajes_whatsapp_log FOR SELECT TO authenticated USING (true);
