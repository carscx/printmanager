import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
const SEL = `id, codigo, nombre, notas, gramos_por_cartucho, mg_por_cara, activo, orden, created_at`;
@Injectable()
export class TonerModelosService {
  constructor(private readonly db: DatabaseService) {}
  activos() { return this.db.many(`SELECT ${SEL} FROM public.toner_modelos WHERE activo=true ORDER BY orden, nombre`); }
  todos() { return this.db.many(`SELECT ${SEL} FROM public.toner_modelos ORDER BY orden, nombre`); }
  async insert(p: Record<string, unknown>) {
    return this.db.one(`INSERT INTO public.toner_modelos (codigo,nombre,notas,gramos_por_cartucho,mg_por_cara,activo,orden) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${SEL}`,
      [p.codigo, p.nombre, p.notas, p.gramos_por_cartucho, p.mg_por_cara, p.activo, p.orden]);
  }
  async update(id: string, p: Record<string, unknown>) {
    return this.db.one(`UPDATE public.toner_modelos SET codigo=$2,nombre=$3,notas=$4,gramos_por_cartucho=$5,mg_por_cara=$6,activo=$7,orden=$8 WHERE id=$1 RETURNING ${SEL}`,
      [id, p.codigo, p.nombre, p.notas, p.gramos_por_cartucho, p.mg_por_cara, p.activo, p.orden]);
  }
  async delete(id: string) { await this.db.query(`DELETE FROM public.toner_modelos WHERE id=$1`, [id]); }
}
