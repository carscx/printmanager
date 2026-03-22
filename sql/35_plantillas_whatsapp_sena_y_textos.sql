-- ============================================================================
-- 35 — Plantillas WhatsApp: textos con seña, saldo (resta) y emojis
-- Ejecutar en Supabase SQL (producción o dev) para alinear con la app:
--   - selectPlantillaParaPedido: pendiente + seña → plantilla "Seña recibida"
--   - {{linea_sena}}: línea opcional cuando hay seña
--   - listo: saldo pendiente = {{resta}} (no el total del pedido)
-- Requiere: 06_plantillas_whatsapp.sql
-- ============================================================================

BEGIN;

-- Presupuesto
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} 👋

📋 Te pasamos el presupuesto:

{{detalle}}

💵 *Total: {{total}}*
{{linea_sena}}

📅 *Entrega:* {{fecha_entrega}}
$t$,
  incluir_datos_pago = true
WHERE id = '33f4fa90-249d-4e38-8348-01936c896bd4';

-- Listo para retirar (saldo pendiente = resta, no total)
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} 🎉

✅ Tu pedido está *listo para retirar*.

{{detalle}}

💳 *Saldo pendiente al retirar:* {{resta}}

Podés pasar cuando quieras 👍
$t$,
  incluir_datos_pago = true
WHERE id = '9d2401fa-fb3f-4a55-bbcf-eeb01f6368bc';

-- Pendiente — Pedido confirmado (sin seña o genérico; usa {{linea_sena}} vacío si no hubo seña)
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} ✨

🖨️ Confirmamos tu pedido.

{{detalle}}

💵 *Total del pedido:* {{total}}
{{linea_sena}}
$t$,
  incluir_datos_pago = true
WHERE id = 'a04667ee-94fa-4884-8c59-cb302f5294bc';

-- Pendiente — Seña recibida
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} 🙌

💰 Registramos tu *seña* de _{{sena}}_.

📌 *Resta a pagar:* _{{resta}}_

{{detalle}}
$t$,
  incluir_datos_pago = true
WHERE id = 'c94f4561-7a76-467a-8859-450fcdb23e37';

-- Pagado
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} ✅

Registramos tu pago total de *{{total}}*. Te avisamos cuando esté listo para retirar 🔔
$t$,
  incluir_datos_pago = false
WHERE id = 'f0dfdcc3-b3c6-43d4-b471-07b34f7c34f4';

-- Entregado
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}}, gracias por retirar tu pedido. ¡Que lo disfrutes! 😊
$t$,
  incluir_datos_pago = false
WHERE id = '71edb8fd-8f95-44da-ad23-2a5e8d3c01d5';

-- Cancelado
UPDATE public.plantillas_whatsapp
SET
  cuerpo = $t$
Hola {{cliente}} 🙏

Lamentablemente el pedido fue *cancelado*. Si querés retomarlo, escribinos.
$t$,
  incluir_datos_pago = false
WHERE id = 'dbf22837-b46e-416a-8eb1-7ae8059089e4';

COMMIT;
