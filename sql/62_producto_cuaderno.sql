-- ============================================================================
-- 62 — Producto cerrado Cuaderno
-- Requiere: 61 (tabla productos / productos_insumos)
--
-- Mismo esquema que Agenda Semanal: precio único y BOM de papel.
-- Precio de venta: 16000. Hojas por unidad: 100, copiando el papel de la agenda.
-- ============================================================================

INSERT INTO public.productos (nombre, slug, precio_venta, activo)
VALUES ('Cuaderno', 'cuaderno', 16000, true)
ON CONFLICT (slug) DO UPDATE
SET nombre = EXCLUDED.nombre,
    precio_venta = EXCLUDED.precio_venta,
    activo = true,
    updated_at = now();

INSERT INTO public.productos_insumos (producto_id, insumo_id, cantidad)
SELECT c.id, a_bom.insumo_id, 100
FROM public.productos c
JOIN public.productos a ON a.slug = 'agenda_semanal'
JOIN public.productos_insumos a_bom ON a_bom.producto_id = a.id
WHERE c.slug = 'cuaderno'
ON CONFLICT (producto_id, insumo_id) DO UPDATE
SET cantidad = EXCLUDED.cantidad;
