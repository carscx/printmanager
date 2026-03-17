-- SEED COMPLETO PARA PRINTMANAGER (Supabase)
-- Ejecutar en Supabase DEV para poblar todas las tablas principales

insert into insumos (id, categoria, nombre, unidad, stock, stock_minimo, activo)
values
  (gen_random_uuid(), 'papel', 'Resma A4', 'unidad', 50, 10, true),
  (gen_random_uuid(), 'toner', 'Tóner Negro', 'unidad', 5, 1, true),
  (gen_random_uuid(), 'tapa_transparente', 'Tapa Plástica', 'unidad', 100, 20, true)
on conflict do nothing;

-- 2. Equipos
insert into equipos (id, nombre, tipo, activo)
values
  (gen_random_uuid(), 'Impresora HP 1234', 'inkjet', true)
on conflict do nothing;

-- 3. Precios de impresión
insert into precios_impresion (id, tipo, doble_faz, precio_venta, activo)
values
  (gen_random_uuid(), 'bn', false, 10, true),
  (gen_random_uuid(), 'bn', true, 15, true),
  (gen_random_uuid(), 'color', false, 30, true),
  (gen_random_uuid(), 'color', true, 40, true)
on conflict do nothing;

-- 4. Precios de anillado
insert into precios_anillado (id, medida_mm, paginas_max, precio_venta, activo)
values
  (gen_random_uuid(), 6, 30, 100, true),
  (gen_random_uuid(), 8, 50, 120, true),
  (gen_random_uuid(), 12, 100, 150, true)
on conflict do nothing;

-- 5. Configuración de costos
insert into config_costos (key, value, descripcion)
values
  ('markup_general', '2.5', 'Divisor Ganancia (markup sobre costo)'),
  ('comision_sobrina', '10', '% Comisión Avru sobre ventas'),
  ('pago_alias', 'alias.mercadopago', 'Alias de mercadopago/transferencia'),
  ('pago_cbu', '0000000000000000000000', 'CBU completo'),
  ('pago_titular', 'Nombre Apellido', 'Nombre del titular'),
  ('pago_banco', 'Banco Ejemplo', 'Nombre del banco')
on conflict (key) do nothing;

-- 6. Plantillas WhatsApp
insert into plantillas_whatsapp (id, estado_destino, nombre, cuerpo, incluir_datos_pago, activo, orden)
values
  (gen_random_uuid(), 'presupuesto', 'Presupuesto', 'Hola {{cliente}}, te paso el presupuesto:\n\n{{detalle}}\n\n*Total: {{total}}*\n\nPagos:\nAlias: _{{alias_pago}}_', true, true, 1),
  (gen_random_uuid(), 'señado', 'Confirmación de seña', 'Hola {{cliente}}, recibimos tu seña de _{{sena}}_.\nResta: _{{resta}}_\n\nTe avisamos cuando esté listo!', true, true, 2),
  (gen_random_uuid(), 'pagado', 'Pago registrado', 'Hola {{cliente}}, tu pago de _{{total}}_ fue registrado. Te avisamos cuando esté listo!', false, true, 3),
  (gen_random_uuid(), 'entregado', 'Pedido listo', 'Hola {{cliente}}, tu pedido está listo para retirar 🎉\n\n{{detalle}}', false, true, 4),
  (gen_random_uuid(), 'cancelado', 'Pedido cancelado', 'Hola {{cliente}}, tu pedido fue cancelado. Si tenías seña, coordinamos la devolución.', true, true, 5)
on conflict do nothing;

-- 7. Pedidos y pedido_items
insert into pedidos (id, cliente, estado, total, sena, fecha_entrega, observaciones, entregado, created_at)
values
  (gen_random_uuid(), 'Juan Pérez', 'pendiente', 500, 100, now() + interval '2 days', 'Urgente', false, now()),
  (gen_random_uuid(), 'Ana Gómez', 'en produccion', 1200, 0, now() + interval '1 day', '', false, now())
on conflict do nothing;

-- Relacionar con pedido_items (ejemplo para un pedido)
insert into pedido_items (id, pedido_id, nombre_archivo, paginas, copias, tipo_impresion, anillado, precio_unitario, observaciones)
values
  (gen_random_uuid(), (select id from pedidos limit 1), 'archivo1.pdf', 20, 2, 'bn', null, 10, ''),
  (gen_random_uuid(), (select id from pedidos limit 1), 'archivo2.pdf', 10, 1, 'color', '8', 30, '')
on conflict do nothing;
