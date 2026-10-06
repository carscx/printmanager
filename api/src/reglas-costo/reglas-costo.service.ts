import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class ReglasCostoService {
  constructor(private readonly db: DatabaseService) {}
  byTarifa(tipo: 'impresion'|'anillado', tarifaId: string) {
    if (tipo === 'impresion') {
      return this.db.many(`SELECT * FROM public.reglas_costo WHERE precio_impresion_id=$1 AND precio_anillado_id IS NULL ORDER BY created_at`, [tarifaId]);
    }
    return this.db.many(`SELECT * FROM public.reglas_costo WHERE precio_anillado_id=$1 AND precio_impresion_id IS NULL ORDER BY created_at`, [tarifaId]);
  }
  todasAnillado() { return this.db.many(`SELECT * FROM public.reglas_costo WHERE precio_anillado_id IS NOT NULL ORDER BY created_at`); }
  todasImpresion() { return this.db.many(`SELECT * FROM public.reglas_costo WHERE precio_impresion_id IS NOT NULL AND precio_anillado_id IS NULL ORDER BY created_at`); }
  async insert(row: Record<string, unknown>) {
    return this.db.one(
      `INSERT INTO public.reglas_costo (precio_impresion_id, precio_anillado_id, insumo_id, cantidad_usada, activo)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [row.precio_impresion_id ?? null, row.precio_anillado_id ?? null, row.insumo_id, row.cantidad_usada, row.activo ?? true],
    );
  }
  async update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    await this.db.query(`UPDATE public.reglas_costo SET ${cols.map((c,i)=>`"${c}"=$${i+2}`).join(',')} WHERE id=$1`, [id, ...cols.map(c=>patch[c])]);
  }
  async delete(id: string) { await this.db.query(`DELETE FROM public.reglas_costo WHERE id=$1`, [id]); }
}
