import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PreciosService {
  constructor(private readonly db: DatabaseService) {}

  async fetchConfigNegocio() {
    let row = await this.db.one(`SELECT * FROM public.configuracion_negocio WHERE id = 1`);
    if (!row) {
      row = await this.db.one(
        `INSERT INTO public.configuracion_negocio (id) VALUES (1) RETURNING *`,
      );
    }
    return row;
  }

  async updateConfigNegocio(patch: Record<string, unknown>, userId?: string) {
    const data: Record<string, unknown> = {
      ...patch,
      updated_by: userId ?? null,
      updated_at: new Date().toISOString(),
    };
    const cols = Object.keys(data);
    const sets = cols.map((c, i) => `"${c}" = $${i + 1}`);
    return this.db.one(
      `UPDATE public.configuracion_negocio SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
      cols.map((c) => data[c]),
    );
  }

  async fetchPreciosImpresion(soloActivos = false) {
    const sql = soloActivos
      ? `SELECT * FROM public.precios_impresion WHERE activo = true ORDER BY tipo, doble_faz, nombre NULLS LAST`
      : `SELECT * FROM public.precios_impresion ORDER BY tipo, doble_faz, nombre NULLS LAST`;
    return this.db.many(sql);
  }

  async crearPrecioImpresion(input: Record<string, unknown>) {
    const cols = Object.keys(input);
    return this.db.one(
      `INSERT INTO public.precios_impresion (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => input[c]),
    );
  }

  async updatePrecioImpresion(id: string, input: Record<string, unknown>) {
    const cols = Object.keys(input);
    const sets = cols.map((c, i) => `"${c}" = $${i + 2}`);
    return this.db.one(
      `UPDATE public.precios_impresion SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...cols.map((c) => input[c])],
    );
  }

  async deletePrecioImpresion(id: string) {
    await this.db.query(`DELETE FROM public.precios_impresion WHERE id = $1`, [id]);
  }

  async fetchPreciosAnillado(soloActivos = false) {
    const sql = soloActivos
      ? `SELECT * FROM public.precios_anillado WHERE activo = true ORDER BY medida_mm`
      : `SELECT * FROM public.precios_anillado ORDER BY medida_mm`;
    return this.db.many(sql);
  }

  async crearPrecioAnillado(input: Record<string, unknown>) {
    const cols = Object.keys(input);
    return this.db.one(
      `INSERT INTO public.precios_anillado (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => input[c]),
    );
  }

  async updatePrecioAnillado(id: string, input: Record<string, unknown>) {
    const cols = Object.keys(input);
    const sets = cols.map((c, i) => `"${c}" = $${i + 2}`);
    return this.db.one(
      `UPDATE public.precios_anillado SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...cols.map((c) => input[c])],
    );
  }

  async deletePrecioAnillado(id: string) {
    await this.db.query(`DELETE FROM public.precios_anillado WHERE id = $1`, [id]);
  }

  async fetchConfigCostos() {
    return this.db.many(`SELECT * FROM public.config_costos`);
  }

  async upsertConfigCostos(rows: { key: string; value: string; descripcion?: string | null }[], userId?: string) {
    for (const r of rows) {
      await this.db.query(
        `INSERT INTO public.config_costos (key, value, descripcion, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
           descripcion = COALESCE(EXCLUDED.descripcion, public.config_costos.descripcion),
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [r.key, r.value, r.descripcion ?? null, userId ?? null],
      );
    }
    return this.fetchConfigCostos();
  }
}
