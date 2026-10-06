import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class RecetasService {
  constructor(private readonly db: DatabaseService) {}
  async fetchAll() {
    return this.db.many(
      `SELECT ri.*, jsonb_build_object('nombre', i.nombre) AS insumos
       FROM public.recetas_items ri
       LEFT JOIN public.insumos i ON i.id = ri.insumo_id
       ORDER BY ri.alcance, ri.precio_impresion_id`,
    );
  }
  async insert(row: Record<string, unknown>) {
    await this.db.query(
      `INSERT INTO public.recetas_items (alcance, precio_impresion_id, insumo_id, modo_consumo, cantidad, es_espiral_auto)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.alcance, row.precio_impresion_id ?? null, row.insumo_id, row.modo_consumo, row.cantidad, row.es_espiral_auto ?? false],
    );
  }
  async delete(id: string) { await this.db.query(`DELETE FROM public.recetas_items WHERE id=$1`, [id]); }
}
