-- ============================================================================
-- 36 — Plantillas WhatsApp: criterio de pago (sin depender del orden)
-- La app elige plantilla por estado_destino + match_criterio según el pedido:
--   pago_total  → seña >= total (pagó todo)
--   con_sena    → 0 < seña < total
--   sin_sena    → sin seña
--   any         → respaldo si no hay coincidencia exacta
-- Requiere: 06_plantillas_whatsapp.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.plantillas_whatsapp
  ADD COLUMN IF NOT EXISTS match_criterio TEXT NOT NULL DEFAULT 'any';

ALTER TABLE public.plantillas_whatsapp
  DROP CONSTRAINT IF EXISTS plantillas_whatsapp_match_criterio_check;

ALTER TABLE public.plantillas_whatsapp
  ADD CONSTRAINT plantillas_whatsapp_match_criterio_check
  CHECK (match_criterio IN ('any', 'pago_total', 'con_sena', 'sin_sena'));

COMMENT ON COLUMN public.plantillas_whatsapp.match_criterio IS
  'Criterio de pago para elegir plantilla: pago_total | con_sena | sin_sena | any (fallback).';

-- Backfill por nombre (idempotente)
UPDATE public.plantillas_whatsapp
SET match_criterio = 'con_sena'
WHERE estado_destino = 'pendiente'
  AND (
    lower(nombre) LIKE '%seña%'
    OR (lower(nombre) LIKE '%sena%' AND lower(nombre) LIKE '%recibida%')
  );

UPDATE public.plantillas_whatsapp
SET match_criterio = 'sin_sena'
WHERE estado_destino = 'pendiente'
  AND (lower(nombre) LIKE '%confirmad%' OR lower(nombre) LIKE '%confirmado%')
  AND match_criterio = 'any';

-- Plantilla “pago total” anticipado (solo si no existe ya)
INSERT INTO public.plantillas_whatsapp (
  estado_destino,
  nombre,
  cuerpo,
  incluir_datos_pago,
  activo,
  orden,
  match_criterio
)
SELECT
  'pendiente',
  'Pago total recibido',
  $t$
Hola {{cliente}} ✅

Registramos el *pago total* de {{total}}. Tu pedido queda confirmado 🙌

{{detalle}}

📅 *Entrega:* {{fecha_entrega}}
$t$,
  false,
  true,
  0,
  'pago_total'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_whatsapp
  WHERE estado_destino = 'pendiente' AND match_criterio = 'pago_total'
);

COMMIT;
