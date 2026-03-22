-- ============================================================================
-- 29 — Plantillas WhatsApp: alinear estado_destino con máquina unificada
--     señado → pendiente | entregado "listo para retirar" → listo + nueva entregado
-- ============================================================================
-- Ejecutar después de 28_pedidos_maquina_estados_unificada.sql (y 06/08 si aplica).

-- 1) Legacy: plantillas marcadas como señado pasan a pendiente (mismo mensaje de seña).
UPDATE public.plantillas_whatsapp
SET estado_destino = 'pendiente'
WHERE lower(estado_destino) IN ('señado', 'senado');

-- 2) La plantilla demo "Listo para retirar" estaba bajo entregado; ahora corresponde a listo.
UPDATE public.plantillas_whatsapp
SET estado_destino = 'listo',
    nombre = 'Listo para retirar'
WHERE estado_destino = 'entregado'
  AND nombre ILIKE '%listo%retirar%';

-- 3) Si no quedó ninguna plantilla para entregado, insertar una por defecto.
INSERT INTO public.plantillas_whatsapp (estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden)
SELECT
  'entregado',
  'Pedido entregado',
  E'Hola {{cliente}}, gracias por retirar tu pedido. ¡Que lo disfrutes!',
  false,
  true,
  4
WHERE NOT EXISTS (
  SELECT 1 FROM public.plantillas_whatsapp WHERE estado_destino = 'entregado' AND activo = true
);

-- 4) Plantilla por defecto para avisar retiro (estado listo).
INSERT INTO public.plantillas_whatsapp (estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden)
SELECT
  'listo',
  'Listo para retirar',
  E'Hola {{cliente}}, tu pedido ya está listo para retirar 🎉\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPodés pasar cuando quieras.',
  false,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.plantillas_whatsapp WHERE estado_destino = 'listo' AND activo = true
);
