import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class GastosFijosService {
  constructor(private readonly db: DatabaseService) {}
  all() { return this.db.many(`SELECT * FROM public.gastos_fijos ORDER BY categoria, concepto`); }
  activos() { return this.db.many(`SELECT * FROM public.gastos_fijos WHERE activo=true ORDER BY concepto`); }
  async insert(p: Record<string, unknown>) {
    await this.db.query(`INSERT INTO public.gastos_fijos (concepto, monto, categoria, dia_vencimiento, activo) VALUES ($1,$2,$3,$4,$5)`,
      [p.concepto, p.monto, p.categoria, p.dia_vencimiento ?? null, p.activo ?? true]);
  }
  async update(id: string, patch: Record<string, unknown>) {
    const cols = Object.keys(patch);
    await this.db.query(`UPDATE public.gastos_fijos SET ${cols.map((c,i)=>`"${c}"=$${i+2}`).join(',')}, updated_at=now() WHERE id=$1`, [id, ...cols.map(c=>patch[c])]);
  }
  async delete(id: string) { await this.db.query(`DELETE FROM public.gastos_fijos WHERE id=$1`, [id]); }
}
