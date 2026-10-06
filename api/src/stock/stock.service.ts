import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class StockService {
  constructor(private readonly db: DatabaseService) {}
  async descontar(pedidoId: string) {
    try {
      await this.db.query(`SELECT public.descontar_stock_pedido($1::uuid)`, [pedidoId]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async restaurar(pedidoId: string) {
    try {
      await this.db.query(`SELECT public.restaurar_stock_pedido($1::uuid)`, [pedidoId]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
