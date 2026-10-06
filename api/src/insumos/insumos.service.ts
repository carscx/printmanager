import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InsumosService {
  constructor(private readonly db: DatabaseService) {}

  async fetchAll(soloActivos = true) {
    if (soloActivos) {
      return this.db.many(
        `SELECT * FROM public.insumos WHERE activo = true ORDER BY categoria, nombre`,
      );
    }
    return this.db.many(
      `SELECT * FROM public.insumos ORDER BY categoria, nombre`,
    );
  }

  async fetchByCategoria(categoria: string) {
    return this.db.many(
      `SELECT * FROM public.insumos WHERE categoria = $1 AND activo = true ORDER BY nombre`,
      [categoria],
    );
  }

  async fetchById(id: string) {
    return this.db.one(`SELECT * FROM public.insumos WHERE id = $1`, [id]);
  }

  async crear(input: Record<string, unknown>) {
    const cols = Object.keys(input);
    const vals = cols.map((k) => input[k]);
    return this.db.one(
      `INSERT INTO public.insumos (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      vals,
    );
  }

  async actualizar(id: string, input: Record<string, unknown>) {
    const cols = Object.keys(input);
    if (cols.length === 0) return this.fetchById(id);
    const sets = cols.map((c, i) => `"${c}" = $${i + 2}`);
    return this.db.one(
      `UPDATE public.insumos SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...cols.map((c) => input[c])],
    );
  }

  async rpcDelete(id: string) {
    await this.db.query(`SELECT public.rpc_delete_insumo_fisico($1::uuid)`, [
      id,
    ]);
  }

  async countUsoEnPedidos(insumoId: string) {
    const row = await this.db.one<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.pedido_items_insumos WHERE insumo_id = $1`,
      [insumoId],
    );
    return Number(row?.count ?? 0);
  }

  async fetchProductosTarifaAfectados(insumoId: string) {
    return this.db.many(
      `SELECT ri.id, ri.alcance, ri.cantidad, ri.modo_consumo, ri.costo_unitario_reposicion,
              ri.precio_impresion_id,
              pi.id AS pi_id, pi.tipo, pi.doble_faz, pi.precio_venta, pi.costo_insumo_directo
       FROM public.recetas_items ri
       LEFT JOIN public.precios_impresion pi ON pi.id = ri.precio_impresion_id
       WHERE ri.insumo_id = $1 AND ri.es_espiral_auto = false`,
      [insumoId],
    );
  }

  async setActivo(id: string, activo: boolean) {
    await this.db.query(`UPDATE public.insumos SET activo = $2 WHERE id = $1`, [
      id,
      activo,
    ]);
  }

  async registrarMovimiento(params: {
    insumo_id: string;
    tipo: string;
    cantidad: number;
    motivo: string;
    referencia_pedido_id?: string;
    notas?: string;
    precioCompraBulto?: number;
    created_by?: string;
  }) {
    await this.db.query(
      `INSERT INTO public.stock_movimientos
        (insumo_id, tipo, cantidad, motivo, referencia_pedido_id, notas, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        params.insumo_id,
        params.tipo,
        params.cantidad,
        params.motivo,
        params.referencia_pedido_id ?? null,
        params.notas ?? null,
        params.created_by ?? null,
      ],
    );
    const insumo = await this.db.one<{ stock_actual: number }>(
      `SELECT stock_actual FROM public.insumos WHERE id = $1`,
      [params.insumo_id],
    );
    const nuevoStock = Number(insumo?.stock_actual ?? 0) + params.cantidad;
    const patch: Record<string, unknown> = { stock_actual: nuevoStock };
    if (
      params.tipo === 'entrada' &&
      params.motivo === 'compra' &&
      params.precioCompraBulto != null &&
      params.precioCompraBulto > 0
    ) {
      patch.precio_compra = params.precioCompraBulto;
      patch.costo_compra = params.precioCompraBulto;
      patch.costo_base = params.precioCompraBulto;
    }
    await this.actualizar(params.insumo_id, patch);
  }

  async fetchMovimientos(insumoId: string, limit = 50) {
    return this.db.many(
      `SELECT * FROM public.stock_movimientos WHERE insumo_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [insumoId, limit],
    );
  }

  async fetchPreciosLog(insumoId: string, limit = 20) {
    return this.db.many(
      `SELECT * FROM public.insumos_precios_log WHERE insumo_id = $1
       ORDER BY changed_at DESC LIMIT $2`,
      [insumoId, limit],
    );
  }

  async fetchAlertasStock() {
    return this.db.many(`SELECT * FROM public.v_insumos_alerta_stock`);
  }
}
