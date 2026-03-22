-- ============================================================================
-- 08 — Datos de prueba (config, insumos, precios, plantillas, pedidos, consumos)
-- Ejecutar UNA VEZ tras 01–07. Para repetir en DEV, descomentá el bloque TRUNCATE.
-- ============================================================================

/*
TRUNCATE TABLE
  public.mensajes_whatsapp_log,
  public.pedido_items_insumos,
  public.pedido_items,
  public.pedidos,
  public.plantillas_whatsapp,
  public.stock_movimientos,
  public.insumos_precios_log,
  public.insumos,
  public.equipos,
  public.precios_impresion,
  public.precios_anillado,
  public.config_costos,
  public.config
CASCADE;
*/

BEGIN;

-- Si pedidos existía de un esquema anterior, agregar columnas que usa la app / este seed
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS tipo_pago TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS descuento_global_porcentaje NUMERIC;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS descuento_global_monto NUMERIC;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS recargo_global_porcentaje NUMERIC;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS recargo_global_monto NUMERIC;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS total_pedido NUMERIC DEFAULT 0;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS copias INTEGER DEFAULT 1;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS tipo_impresion TEXT;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS anillado TEXT;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC DEFAULT 0;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS descuento_porcentaje NUMERIC;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS descuento_monto NUMERIC;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS recargo_porcentaje NUMERIC;
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS recargo_monto NUMERIC;

-- Quitar pedidos demo previos (permite re-ejecutar 08 sin error de PK)
DELETE FROM public.pedido_items_insumos WHERE pedido_item_id IN (
  SELECT id FROM public.pedido_items WHERE pedido_id IN (
    'cccccccc-cccc-cccc-cccc-cccccccccc01',
    'cccccccc-cccc-cccc-cccc-cccccccccc02',
    'cccccccc-cccc-cccc-cccc-cccccccccc03'));
DELETE FROM public.pedido_items WHERE pedido_id IN (
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'cccccccc-cccc-cccc-cccc-cccccccccc03');
DELETE FROM public.mensajes_whatsapp_log WHERE pedido_id IN (
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'cccccccc-cccc-cccc-cccc-cccccccccc03');
DELETE FROM public.pedidos WHERE id IN (
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'cccccccc-cccc-cccc-cccc-cccccccccc03');

-- Plantillas: se reemplazan (si ya tenés personalizadas, comentá las 2 líneas siguientes + el INSERT de plantillas)
DELETE FROM public.plantillas_whatsapp WHERE true;

INSERT INTO public.config (id, valor) VALUES
  ('t_bn_s', '35'),
  ('t_bn_d', '55'),
  ('t_col_s', '70'),
  ('t_col_d', '110'),
  ('esp_s', '700'),
  ('esp_m', '1000'),
  ('esp_l', '1400'),
  ('markup', '1.6'),
  ('comision_sobrina', '10'),
  ('pago_alias', 'tu.alias.mp')
ON CONFLICT (id) DO UPDATE SET valor = EXCLUDED.valor;

INSERT INTO public.equipos (id, nombre, tipo, costo_adquisicion, fecha_adquisicion, vida_util_meses, costo_mantenimiento_mensual, paginas_mes_estimadas, activo, notas) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Epson L3250', 'inkjet', 180000, '2024-01-15', 36, 2000, 3000, true, 'Oficina'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Epson L5590', 'inkjet', 722000, '2024-06-01', 36, 3000, 3000, true, 'Color'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Pantum P2509w', 'laser', 180000, '2023-03-10', 36, 2000, 3000, true, 'B/N rápida')
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, costo_adquisicion = EXCLUDED.costo_adquisicion;

INSERT INTO public.insumos (id, categoria, nombre, unidad, medida_mm, color, tipo_papel, rendimiento, hojas_por_unidad, precio_compra, stock_actual, stock_minimo, activo) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb107', 'espiral', 'Espiral 14mm negro', 'unidad', 14, NULL, NULL, NULL, NULL, 250, 200, 30, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb108', 'espiral', 'Espiral 12mm negro', 'unidad', 12, NULL, NULL, NULL, NULL, 220, 150, 25, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb109', 'tapa_transparente', 'Tapa transparente A4', 'unidad', NULL, NULL, NULL, NULL, NULL, 80, 300, 50, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110', 'tapa_color', 'Tapa color A4 Negra', 'unidad', NULL, 'Negro', NULL, NULL, NULL, 100, 200, 40, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb111', 'bolsa', 'Bolsa anillado', 'unidad', NULL, NULL, NULL, NULL, NULL, 30, 500, 100, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb112', 'clip', 'Clip metálico', 'unidad', NULL, NULL, NULL, NULL, NULL, 5, 1000, 200, true)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, precio_compra = EXCLUDED.precio_compra, stock_actual = EXCLUDED.stock_actual;

INSERT INTO public.precios_impresion (tipo, doble_faz, precio_venta, activo) VALUES
  ('bn', false, 35, true),
  ('bn', true, 55, true),
  ('color', false, 70, true),
  ('color', true, 110, true)
ON CONFLICT (tipo, doble_faz) DO UPDATE SET precio_venta = EXCLUDED.precio_venta, activo = true;

-- Tras 23_epic5_reglas_negocio_fin.sql ya no existe UNIQUE(medida_mm); ON CONFLICT (medida_mm) falla (42P10).
ALTER TABLE public.precios_anillado ADD COLUMN IF NOT EXISTS nombre_categoria text;
-- Reemplazamos filas demo de esos mm (CASCADE en reglas_costo si aplica).
DELETE FROM public.precios_anillado
WHERE medida_mm IN (7, 9, 12, 14, 17, 20, 23, 33);

INSERT INTO public.precios_anillado (medida_mm, paginas_max, precio_venta, activo, nombre_categoria) VALUES
  (7, 30, 700, true, 'Chico'),
  (9, 50, 750, true, 'Mediano'),
  (12, 80, 850, true, 'Grande'),
  (14, 120, 1000, true, 'Grande'),
  (17, 150, 1150, true, 'Grande'),
  (20, 180, 1300, true, 'Grande'),
  (23, 220, 1400, true, 'Grande'),
  (33, 500, 1800, true, 'Grande');

INSERT INTO public.config_costos (key, value, descripcion) VALUES
  ('markup_general', '1.6', 'Divisor ganancia bruta'),
  ('comision_sobrina', '10', '% comisión Avru'),
  ('pago_alias', 'tu.alias.mp', 'Alias Mercado Pago'),
  ('pago_cbu', '0000000000000000000000', 'CBU'),
  ('pago_titular', 'Nombre Titular', 'Titular cuenta'),
  ('pago_banco', 'Banco ejemplo', 'Banco')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, descripcion = EXCLUDED.descripcion;

INSERT INTO public.plantillas_whatsapp (estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden) VALUES
  ('presupuesto', 'Presupuesto', E'Hola {{cliente}}, te paso el presupuesto:\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPagos:\nAlias: _{{alias_pago}}_', true, true, 1),
  ('pendiente', 'Pedido confirmado', E'Hola {{cliente}}, confirmamos tu pedido:\n{{detalle}}\nTotal: {{total}}', true, true, 1),
  ('pendiente', 'Seña recibida', E'Hola {{cliente}}, recibimos tu seña de _{{sena}}_. Resta: _{{resta}}_.', true, true, 2),
  ('listo', 'Listo para retirar', E'Hola {{cliente}}, tu pedido ya está listo para retirar 🎉\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPodés pasar cuando quieras.', false, true, 1),
  ('pagado', 'Pago total', E'Hola {{cliente}}, registramos tu pago de _{{total}}_. Te avisamos cuando esté listo.', false, true, 3),
  ('entregado', 'Pedido entregado', E'Hola {{cliente}}, gracias por retirar tu pedido. ¡Que lo disfrutes!', false, true, 4),
  ('cancelado', 'Cancelado', E'Hola {{cliente}}, el pedido fue cancelado.', true, true, 5);

INSERT INTO public.pedidos (id, cliente, estado, total, sena, fecha_entrega, observaciones, entregado, fecha_pago, created_at, stock_descontado, tipo_pago, descuento_global_monto)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', 'Cliente Demo Entregado', 'entregado', 8750, 8750, CURRENT_DATE, 'Pedido de prueba — reportes', true, NOW() - INTERVAL '2 days', NOW() - INTERVAL '5 days', true, 'pago_total', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'Cliente Demo Taller', 'pendiente', 3500, 0, CURRENT_DATE + 2, 'Con descuento ítem', false, NULL, NOW() - INTERVAL '1 day', false, NULL, NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03', 'Cliente Demo Con seña', 'pendiente', 12000, 6000, CURRENT_DATE + 5, 'Con seña', false, NULL, NOW(), true, 'sena_50', 500);

INSERT INTO public.pedido_items (id, pedido_id, nombre_archivo, paginas, copias, tipo_impresion, anillado, precio_unitario, observaciones, descuento_monto)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddd1001', 'cccccccc-cccc-cccc-cccc-cccccccccc01', 'informe.pdf', 25, 1, 'B/N SF', '14mm', 8750, '', NULL),
  ('dddddddd-dddd-dddd-dddd-dddddddd1002', 'cccccccc-cccc-cccc-cccc-cccccccccc02', 'apuntes.pdf', 10, 1, 'B/N SF', NULL, 3500, '', 500),
  ('dddddddd-dddd-dddd-dddd-dddddddd1003', 'cccccccc-cccc-cccc-cccc-cccccccccc03', 'tesis.pdf', 80, 2, 'COLOR DF', '14mm', 12000, '', NULL);

INSERT INTO public.pedido_items_insumos (pedido_item_id, insumo_id, equipo_id, cantidad, costo_unitario_congelado, costo_total) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddd1001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb107', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 250, 250),
  ('dddddddd-dddd-dddd-dddd-dddddddd1001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb109', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 80, 80),
  ('dddddddd-dddd-dddd-dddd-dddddddd1001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 100, 100),
  ('dddddddd-dddd-dddd-dddd-dddddddd1001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 30, 30),
  ('dddddddd-dddd-dddd-dddd-dddddddd1003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb107', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 2, 250, 500),
  ('dddddddd-dddd-dddd-dddd-dddddddd1003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb109', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 2, 80, 160),
  ('dddddddd-dddd-dddd-dddd-dddddddd1003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb110', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 2, 100, 200);

COMMIT;
