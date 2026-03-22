-- ============================================================================
-- 33 — Plantillas WhatsApp (mismas que seed 08) para PRODUCCIÓN
-- ============================================================================
-- Ejecutar en Supabase SQL Editor del proyecto de PROD (como postgres / dashboard).
--
-- ⚠️  Borra TODAS las filas de `plantillas_whatsapp` y las reemplaza por el set
--     por defecto del 08. Si ya tenés textos personalizados, exportalos o comentá
--     el DELETE y adaptá el INSERT a mano.
--
-- Requiere: `06_plantillas_whatsapp.sql` (tabla + RLS). Si usás estados unificados
-- (28) y migración 29, esas plantillas ya usan `presupuesto`, `pendiente`, `listo`,
-- etc. (alineado a la app actual).
--
-- Tras ejecutar: opcional `NOTIFY pgrst, 'reload schema';` si la API cachea raro.
-- ============================================================================

BEGIN;

DELETE FROM public.plantillas_whatsapp;

INSERT INTO public.plantillas_whatsapp (estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden) VALUES
  ('presupuesto', 'Presupuesto', E'Hola {{cliente}}, te paso el presupuesto:\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPagos:\nAlias: _{{alias_pago}}_', true, true, 1),
  ('pendiente', 'Pedido confirmado', E'Hola {{cliente}}, confirmamos tu pedido:\n{{detalle}}\nTotal: {{total}}', true, true, 1),
  ('pendiente', 'Seña recibida', E'Hola {{cliente}}, recibimos tu seña de _{{sena}}_. Resta: _{{resta}}_.', true, true, 2),
  ('listo', 'Listo para retirar', E'Hola {{cliente}}, tu pedido ya está listo para retirar 🎉\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPodés pasar cuando quieras.', false, true, 1),
  ('pagado', 'Pago total', E'Hola {{cliente}}, registramos tu pago de _{{total}}_. Te avisamos cuando esté listo.', false, true, 3),
  ('entregado', 'Pedido entregado', E'Hola {{cliente}}, gracias por retirar tu pedido. ¡Que lo disfrutes!', false, true, 4),
  ('cancelado', 'Cancelado', E'Hola {{cliente}}, el pedido fue cancelado.', true, true, 5);

COMMIT;
