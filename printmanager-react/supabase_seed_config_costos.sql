-- SEED de configuración de costos para PreciosPage
-- Ejecutar en Supabase DEV

-- Costos generales
insert into config_costos (key, value, descripcion)
values
  ('markup_general', '2.5', 'Divisor Ganancia (markup sobre costo)'),
  ('comision_sobrina', '10', '% Comisión Avru sobre ventas');

-- Datos de pago
insert into config_costos (key, value, descripcion)
values
  ('pago_alias', 'alias.mercadopago', 'Alias de mercadopago/transferencia'),
  ('pago_cbu', '0000000000000000000000', 'CBU completo'),
  ('pago_titular', 'Nombre Apellido', 'Nombre del titular'),
  ('pago_banco', 'Banco Ejemplo', 'Nombre del banco');

-- Evitar duplicados
on conflict (key) do nothing;
