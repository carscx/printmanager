import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

function dayStartISO(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0).toISOString();
}
function dayEndISO(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999).toISOString();
}

@Injectable()
export class FacturacionService {
  constructor(private readonly db: DatabaseService) {}

  async pedidos(desde: string, hasta: string) {
    const rows = await this.db.many(
      `SELECT id, numero_publico, fecha_pago, forma_pago_total, created_at, total, total_pedido,
              descuento_global_porcentaje, descuento_global_monto, recargo_global_porcentaje, recargo_global_monto
       FROM public.pedidos
       WHERE estado = 'entregado' AND facturado = false AND forma_pago_total = 'transferencia'
         AND fecha_pago IS NOT NULL AND fecha_pago >= $1 AND fecha_pago <= $2
       ORDER BY fecha_pago ASC`,
      [dayStartISO(desde), dayEndISO(hasta)],
    );
    const ids = (rows as {id:string}[]).map(r => r.id);
    if (!ids.length) return [];
    const items = await this.db.many(
      `SELECT id, pedido_id, precio_unitario FROM public.pedido_items WHERE pedido_id = ANY($1::uuid[])`,
      [ids],
    );
    const by = new Map<string, unknown[]>();
    for (const it of items as {pedido_id:string}[]) {
      const list = by.get(it.pedido_id) ?? [];
      list.push(it);
      by.set(it.pedido_id, list);
    }
    return (rows as {id:string}[]).map(r => ({ ...r, pedido_items: by.get(r.id) ?? [] }));
  }

  async marcar(ids: string[]) {
    if (!ids.length) return;
    await this.db.query(`UPDATE public.pedidos SET facturado = true WHERE id = ANY($1::uuid[])`, [ids]);
  }

  async getUltimaExport() {
    const row = await this.db.one<{valor:string}>(`SELECT valor FROM public.config WHERE id='facturacion_ultima_export_hasta'`);
    const v = row?.valor?.trim();
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  async setUltimaExport(fecha: string) {
    await this.db.query(
      `INSERT INTO public.config (id, valor) VALUES ('facturacion_ultima_export_hasta', $1)
       ON CONFLICT (id) DO UPDATE SET valor = EXCLUDED.valor`,
      [fecha],
    );
  }
}
