import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class ProductosService {
  constructor(private readonly db: DatabaseService) {}
  async fetchAll(soloActivos = false) {
    const prods = soloActivos
      ? await this.db.many(`SELECT * FROM public.productos WHERE activo = true ORDER BY nombre`)
      : await this.db.many(`SELECT * FROM public.productos ORDER BY nombre`);
    const ids = (prods as {id:string}[]).map(p => p.id);
    if (!ids.length) return [];
    const bom = await this.db.many(`SELECT * FROM public.productos_insumos WHERE producto_id = ANY($1::uuid[])`, [ids]);
    const by = new Map<string, unknown[]>();
    for (const r of bom as {producto_id:string}[]) {
      const list = by.get(r.producto_id) ?? [];
      list.push(r);
      by.set(r.producto_id, list);
    }
    return (prods as {id:string}[]).map(p => ({ ...p, productos_insumos: by.get(p.id) ?? [] }));
  }
  async fetchById(id: string) {
    const p = await this.db.one(`SELECT * FROM public.productos WHERE id=$1`, [id]);
    if (!p) return null;
    const bom = await this.db.many(`SELECT * FROM public.productos_insumos WHERE producto_id=$1`, [id]);
    return { ...p, productos_insumos: bom };
  }
  async updatePrecio(id: string, precioVenta: number) {
    await this.db.query(`UPDATE public.productos SET precio_venta=$2, updated_at=now() WHERE id=$1`, [id, precioVenta]);
  }
  async replaceBom(productoId: string, lineas: {insumo_id:string; cantidad:number}[]) {
    await this.db.query(`DELETE FROM public.productos_insumos WHERE producto_id=$1`, [productoId]);
    const validas = lineas.filter(l => l.insumo_id && Number(l.cantidad) > 0);
    const out = [];
    for (const l of validas) {
      const row = await this.db.one(
        `INSERT INTO public.productos_insumos (producto_id, insumo_id, cantidad) VALUES ($1,$2,$3) RETURNING *`,
        [productoId, l.insumo_id, Number(l.cantidad)],
      );
      out.push(row);
    }
    return out;
  }
}
