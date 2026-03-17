-- ============================================
-- MIGRACIÓN: Stock automático al pasar pedido a 'en produccion'
-- ============================================

-- 1. Función para descontar stock de insumos de un pedido
create or replace function descontar_stock_pedido(pedido_id uuid)
returns void
language plpgsql
as $$
declare
  item record;
begin
  -- Verifica que el pedido no haya descontado stock aún
  if (select stock_descontado from pedidos where id = pedido_id) then
    raise exception 'El stock ya fue descontado para este pedido';
  end if;

  -- Por cada item del pedido, descuenta insumos según pedido_items_insumos
  for item in
    select * from pedido_items_insumos where pedido_item_id in (
      select id from pedido_items where pedido_id = pedido_id
    )
  loop
    -- Descontar stock del insumo
    update insumos
      set stock = stock - item.cantidad
      where id = item.insumo_id;
  end loop;

  -- Marca el pedido como stock_descontado
  update pedidos set stock_descontado = true where id = pedido_id;
end;
$$;

-- 2. Función trigger para ejecutar el descuento al cambiar estado
create or replace function trigger_descontar_stock()
returns trigger as $$
begin
  if NEW.estado = 'en produccion' and OLD.estado is distinct from 'en produccion' then
    perform descontar_stock_pedido(NEW.id);
  end if;
  return NEW;
end;
$$ language plpgsql;

-- 3. Trigger: ejecuta el descuento de stock automáticamente

drop trigger if exists descontar_stock_pedido_trigger on pedidos;

create trigger descontar_stock_pedido_trigger
  after update of estado on pedidos
  for each row
  when (NEW.estado = 'en produccion' and OLD.estado is distinct from 'en produccion')
  execute procedure trigger_descontar_stock();
