import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}
  estadisticas(desde: string, hasta: string) {
    return this.db.many(
      `SELECT * FROM public.v_estadisticas_diarias WHERE dia >= $1::date AND dia <= $2::date ORDER BY dia`,
      [desde, hasta],
    );
  }
  topProductos(desde: string, hasta: string, limit = 3) {
    return this.db.many(`SELECT * FROM public.fn_dashboard_top_productos_margen($1::date,$2::date,$3)`, [desde, hasta, limit]);
  }
  async pendientes() {
    const row = await this.db.one<{ fn_dashboard_pedidos_pendientes: number }>(`SELECT public.fn_dashboard_pedidos_pendientes()`);
    return Number(row?.fn_dashboard_pedidos_pendientes ?? 0);
  }
  rendimiento() { return this.db.many(`SELECT * FROM public.v_rendimiento_vendedores`); }
}
