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
  ('presupuesto', 'Presupuesto', E'Hola {{cliente}} 👋\n\n📋 Te pasamos el presupuesto:\n\n{{detalle}}\n\n💵 *Total: {{total}}*\n{{linea_sena}}\n\n📅 *Entrega:* {{fecha_entrega}}', true, true, 1),
  ('pendiente', 'Pedido confirmado', E'Hola {{cliente}} ✨\n\n🖨️ Confirmamos tu pedido.\n\n{{detalle}}\n\n💵 *Total del pedido:* {{total}}\n{{linea_sena}}', true, true, 1),
  ('pendiente', 'Seña recibida', E'Hola {{cliente}} 🙌\n\n💰 Registramos tu *seña* de _{{sena}}_.\n\n📌 *Resta a pagar:* _{{resta}}_\n\n{{detalle}}', true, true, 2),
  ('listo', 'Listo para retirar', E'Hola {{cliente}} 🎉\n\n✅ Tu pedido está *listo para retirar*.\n\n{{detalle}}\n\n💳 *Saldo pendiente al retirar:* {{resta}}\n\nPodés pasar cuando quieras 👍', true, true, 1),
  ('pagado', 'Pago total', E'Hola {{cliente}} ✅\n\nRegistramos tu pago total de *{{total}}*. Te avisamos cuando esté listo para retirar 🔔', false, true, 3),
  ('entregado', 'Pedido entregado', E'Hola {{cliente}}, gracias por retirar tu pedido. ¡Que lo disfrutes! 😊', false, true, 4),
  ('cancelado', 'Cancelado', E'Hola {{cliente}} 🙏\n\nLamentablemente el pedido fue *cancelado*. Si querés retomarlo, escribinos.', false, true, 5);

COMMIT;
