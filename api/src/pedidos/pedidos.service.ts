import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type HistorialFiltros = {
  fromDate?: string | null;
  toDate?: string | null;
  estado?: string | null;
  busquedaClientePedido?: string | null;
  searchQuery?: string | null;
  tipoTrabajo?: 'bn' | 'color' | 'stickers' | 'anillado' | null;
  cobranza?: 'todos' | 'impago' | 'pagado' | null;
  impresos?: 'todos' | 'si' | 'no' | null;
  page?: number;
  pageSize?: number;
};

function mapItemToDb(it: Record<string, unknown>, pedidoId: string) {
  return {
    pedido_id: pedidoId,
    nombre_archivo: it.nombre_archivo ?? null,
    paginas: it.paginas || 0,
    copias: it.copias || 1,
    tipo_impresion: it.tipo_impresion || null,
    anillado: it.anillado || null,
    precio_unitario: it.precio_unitario || 0,
    observaciones: it.observaciones || '',
    descuento_porcentaje: it.descuento_porcentaje ?? null,
    descuento_monto: it.descuento_monto ?? null,
    recargo_porcentaje: it.recargo_porcentaje ?? null,
    recargo_monto: it.recargo_monto ?? null,
    solo_anillado: it.solo_anillado ?? false,
    precio_impresion_id: it.precio_impresion_id ?? null,
    precio_anillado_id: it.precio_anillado_id ?? null,
    anillado_medida_mm: it.anillado_medida_mm ?? null,
    doble_faz: it.doble_faz ?? false,
    impreso: it.impreso ?? false,
    producto_id: it.producto_id ?? null,
  };
}

@Injectable()
export class PedidosService {
  constructor(private readonly db: DatabaseService) {}

  private async attachItems<T extends { id: string }>(
    pedidos: T[],
  ): Promise<(T & { pedido_items: Record<string, unknown>[] })[]> {
    if (pedidos.length === 0) return [];
    const ids = pedidos.map((p) => p.id);
    const items = await this.db.many<{ pedido_id: string } & Record<string, unknown>>(
      `SELECT * FROM public.pedido_items WHERE pedido_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    );
    const byPedido = new Map<string, Record<string, unknown>[]>();
    for (const it of items) {
      const list = byPedido.get(it.pedido_id) ?? [];
      list.push(it);
      byPedido.set(it.pedido_id, list);
    }
    return pedidos.map((p) => ({
      ...p,
      pedido_items: byPedido.get(p.id) ?? [],
    }));
  }

  async fetchPedidos(entregado = false) {
    const orderCol = entregado ? 'fecha_pago' : 'created_at';
    const rows = await this.db.many(
      `SELECT * FROM public.pedidos WHERE entregado = $1 ORDER BY ${orderCol} DESC NULLS LAST`,
      [entregado],
    );
    return this.attachItems(rows as { id: string }[]);
  }

  async fetchById(id: string) {
    const row = await this.db.one(`SELECT * FROM public.pedidos WHERE id = $1`, [
      id,
    ]);
    if (!row) return null;
    const [full] = await this.attachItems([row as { id: string }]);
    return full;
  }

  private normalizarBusqueda(t: string): string {
    return t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  async fetchHistorial(params: HistorialFiltros) {
    const page = params.page ?? 0;
    const pageSize = params.pageSize ?? 20;
    const offset = page * pageSize;

    const where: string[] = ['1=1'];
    const values: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      where.push(sql.replace('?', `$${values.length}`));
    };

    if (params.fromDate) add(`created_at >= ?`, params.fromDate);
    if (params.toDate) add(`created_at <= ?`, params.toDate);

    if (params.estado === 'activos') {
      where.push(`estado NOT IN ('pagado','entregado')`);
    } else if (params.estado) {
      add(`estado = ?`, params.estado);
    }

    const qCliente = (params.busquedaClientePedido || '').trim();
    if (qCliente) {
      const patron = this.normalizarBusqueda(qCliente);
      if (/^#?\d+$/.test(qCliente)) {
        const n = parseInt(qCliente.replace(/^#/, ''), 10);
        values.push(`%${patron}%`, n);
        where.push(
          `(cliente_busqueda ILIKE $${values.length - 1} OR numero_publico = $${values.length})`,
        );
      } else if (patron) {
        add(`cliente_busqueda ILIKE ?`, `%${patron}%`);
      }
    }

    if (params.cobranza === 'impago') {
      where.push(
        `(estado IN ('presupuesto','pendiente') OR (estado = 'listo' AND forma_pago_total IS NULL))`,
      );
    } else if (params.cobranza === 'pagado') {
      where.push(
        `(estado IN ('pagado','entregado') OR (estado = 'listo' AND forma_pago_total IS NOT NULL))`,
      );
    }

    // tipoTrabajo / impresos / search libre vía EXISTS
    if (params.tipoTrabajo === 'bn') {
      where.push(
        `EXISTS (
          SELECT 1 FROM public.pedido_items pi
          WHERE pi.pedido_id = pedidos.id
            AND (pi.tipo_impresion ILIKE '%B/N%' OR pi.tipo_impresion ILIKE '%B&N%')
        )`,
      );
    } else if (params.tipoTrabajo === 'color') {
      where.push(
        `EXISTS (SELECT 1 FROM public.pedido_items pi WHERE pi.pedido_id = pedidos.id AND pi.tipo_impresion ILIKE '%COLOR%')`,
      );
    } else if (params.tipoTrabajo === 'stickers') {
      where.push(
        `EXISTS (SELECT 1 FROM public.pedido_items pi WHERE pi.pedido_id = pedidos.id AND pi.tipo_impresion ILIKE '%STICKERS%')`,
      );
    } else if (params.tipoTrabajo === 'anillado') {
      where.push(
        `EXISTS (SELECT 1 FROM public.pedido_items pi WHERE pi.pedido_id = pedidos.id AND pi.anillado IS NOT NULL)`,
      );
    }

    if (params.impresos === 'si' || params.impresos === 'no') {
      const flag = params.impresos === 'si';
      values.push(flag);
      where.push(
        `EXISTS (
          SELECT 1 FROM public.pedido_items pi
          WHERE pi.pedido_id = pedidos.id
            AND pi.precio_impresion_id IS NOT NULL
            AND pi.impreso = $${values.length}
        )`,
      );
    }

    const qSearch = (params.searchQuery || '').trim();
    if (qSearch) {
      const patron = this.normalizarBusqueda(qSearch);
      if (patron) {
        values.push(`%${patron}%`, `%${patron}%`, `%${patron}%`);
        const a = values.length - 2;
        const b = values.length - 1;
        const c = values.length;
        where.push(
          `(cliente_busqueda ILIKE $${a} OR observaciones_busqueda ILIKE $${b}
            OR EXISTS (
              SELECT 1 FROM public.pedido_items pi
              WHERE pi.pedido_id = pedidos.id AND pi.nombre_archivo_busqueda ILIKE $${c}
            ))`,
        );
      }
    }

    const whereSql = where.join(' AND ');
    const countRow = await this.db.one<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.pedidos WHERE ${whereSql}`,
      values,
    );
    const total = Number(countRow?.count ?? 0);

    values.push(pageSize, offset);
    const rows = await this.db.many(
      `SELECT * FROM public.pedidos
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const pedidos = await this.attachItems(rows as { id: string }[]);
    return { pedidos, total };
  }

  async fetchPedidosPorPeriodo(
    fromISO: string,
    toISO: string,
    options?: { incluirCancelados?: boolean; limite?: number },
  ) {
    const lim = options?.limite ?? 5000;
    const params: unknown[] = [fromISO, toISO];
    let sql = `SELECT * FROM public.pedidos WHERE created_at >= $1 AND created_at <= $2`;
    if (!options?.incluirCancelados) {
      sql += ` AND estado <> 'cancelado'`;
    }
    sql += ` ORDER BY created_at DESC LIMIT $3`;
    params.push(lim);
    const rows = await this.db.many(sql, params);
    return this.attachItems(rows as { id: string }[]);
  }

  async fetchResumenHoy() {
    const rows = await this.db.many(
      `SELECT * FROM public.pedidos
       WHERE entregado = true AND fecha_pago >= date_trunc('day', now())
       ORDER BY fecha_pago DESC`,
    );
    return this.attachItems(rows as { id: string }[]);
  }

  async updatePatch(id: string, patch: Record<string, unknown>) {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => patch[k]);
    await this.db.query(
      `UPDATE public.pedidos SET ${sets.join(', ')} WHERE id = $1`,
      [id, ...values],
    );
  }

  async updateItemPatch(id: string, patch: Record<string, unknown>) {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map((k) => patch[k]);
    await this.db.query(
      `UPDATE public.pedido_items SET ${sets.join(', ')} WHERE id = $1`,
      [id, ...values],
    );
  }

  async cambiarEstado(id: string, nuevoEstado: string) {
    const res = await this.db.many(
      `UPDATE public.pedidos SET estado = $2 WHERE id = $1 RETURNING *`,
      [id, nuevoEstado],
    );
    return res;
  }

  async entregar(id: string, total: number) {
    await this.db.query(
      `UPDATE public.pedidos SET entregado = true, fecha_pago = now(), estado = 'entregado', sena = $2 WHERE id = $1`,
      [id, total],
    );
  }

  async cobrar(id: string, total: number) {
    await this.db.query(`UPDATE public.pedidos SET sena = $2 WHERE id = $1`, [
      id,
      total,
    ]);
  }

  async borrar(id: string) {
    await this.db.query(`DELETE FROM public.pedidos WHERE id = $1`, [id]);
  }

  async rpcConvertirPresupuesto(pedidoId: string) {
    await this.db.query(
      `SELECT public.rpc_convertir_presupuesto_a_pedido($1::uuid)`,
      [pedidoId],
    );
  }

  async rpcExplotarBom(pedidoId: string) {
    await this.db.query(`SELECT public.rpc_explotar_bom_pedido($1::uuid)`, [
      pedidoId,
    ]);
  }

  private async insertItems(pedidoId: string, items: Record<string, unknown>[]) {
    for (const it of items) {
      const m = mapItemToDb(it, pedidoId);
      await this.db.query(
        `INSERT INTO public.pedido_items (
          pedido_id, nombre_archivo, paginas, copias, tipo_impresion, anillado,
          precio_unitario, observaciones, descuento_porcentaje, descuento_monto,
          recargo_porcentaje, recargo_monto, solo_anillado, precio_impresion_id,
          precio_anillado_id, anillado_medida_mm, doble_faz, impreso, producto_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )`,
        [
          m.pedido_id,
          m.nombre_archivo,
          m.paginas,
          m.copias,
          m.tipo_impresion,
          m.anillado,
          m.precio_unitario,
          m.observaciones,
          m.descuento_porcentaje,
          m.descuento_monto,
          m.recargo_porcentaje,
          m.recargo_monto,
          m.solo_anillado,
          m.precio_impresion_id,
          m.precio_anillado_id,
          m.anillado_medida_mm,
          m.doble_faz,
          m.impreso,
          m.producto_id,
        ],
      );
    }
  }

  async crearCompleto(
    cabecera: Record<string, unknown>,
    items: Record<string, unknown>[],
  ) {
    const sena = Number(cabecera.sena ?? 0);
    const modalidad = String(cabecera.modalidad ?? '');
    const stagingPedido = modalidad === 'pedido' && sena > 0;
    const insertCabecera = stagingPedido
      ? { ...cabecera, estado: 'presupuesto', modalidad: 'presupuesto' }
      : cabecera;

    const cols = Object.keys(insertCabecera);
    const vals = cols.map((k) => insertCabecera[k]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const inserted = await this.db.one(
      `INSERT INTO public.pedidos (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${placeholders.join(',')}) RETURNING *`,
      vals,
    );
    if (!inserted) throw new BadRequestException('No se pudo crear pedido');
    const pedidoId = (inserted as { id: string }).id;

    try {
      await this.insertItems(pedidoId, items);
      await this.rpcExplotarBom(pedidoId);
    } catch (e) {
      await this.borrar(pedidoId);
      throw e;
    }

    if (stagingPedido) {
      await this.updatePatch(pedidoId, {
        modalidad: 'pedido',
        estado: 'pendiente',
        sena: cabecera.sena,
        forma_pago_sena: cabecera.forma_pago_sena ?? null,
        forma_pago_total: cabecera.forma_pago_total ?? null,
        tipo_pago: cabecera.tipo_pago,
        total: cabecera.total,
        total_pedido: cabecera.total_pedido,
        cliente: cabecera.cliente,
        fecha_entrega: cabecera.fecha_entrega,
        observaciones: cabecera.observaciones,
        vendedor_id: cabecera.vendedor_id,
        descuento_global_porcentaje: cabecera.descuento_global_porcentaje,
        descuento_global_monto: cabecera.descuento_global_monto,
        recargo_global_porcentaje: cabecera.recargo_global_porcentaje,
        recargo_global_monto: cabecera.recargo_global_monto,
      });
    }

    return [inserted];
  }

  async actualizarCompleto(
    pedidoId: string,
    cabecera: Record<string, unknown>,
    items: Record<string, unknown>[],
  ) {
    const existing = await this.db.one(
      `SELECT id FROM public.pedidos WHERE id = $1`,
      [pedidoId],
    );
    if (!existing) throw new NotFoundException('Pedido no encontrado');
    await this.updatePatch(pedidoId, cabecera);
    await this.db.query(`DELETE FROM public.pedido_items WHERE pedido_id = $1`, [
      pedidoId,
    ]);
    await this.insertItems(pedidoId, items);
    await this.rpcExplotarBom(pedidoId);
  }

  async fetchConsumoInsumosPorItemIds(itemIds: string[]) {
    if (itemIds.length === 0) return [];
    return this.db.many(
      `SELECT * FROM public.pedido_items_insumos WHERE pedido_item_id = ANY($1::uuid[])`,
      [itemIds],
    );
  }
}
