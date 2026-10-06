import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class EquiposService {
  constructor(private readonly db: DatabaseService) {}
  fetchAll(soloActivos = true) {
    return soloActivos
      ? this.db.many(`SELECT * FROM public.equipos WHERE activo = true ORDER BY nombre`)
      : this.db.many(`SELECT * FROM public.equipos ORDER BY nombre`);
  }
  async crear(input: Record<string, unknown>) {
    const cols = Object.keys(input);
    return this.db.one(`INSERT INTO public.equipos (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, cols.map(c=>input[c]));
  }
  async actualizar(id: string, input: Record<string, unknown>) {
    const cols = Object.keys(input);
    return this.db.one(`UPDATE public.equipos SET ${cols.map((c,i)=>`"${c}"=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...cols.map(c=>input[c])]);
  }
  toggleActivo(id: string, activo: boolean) {
    return this.db.query(`UPDATE public.equipos SET activo=$2 WHERE id=$1`, [id, activo]);
  }
  fetchResumenRoi() { return this.db.many(`SELECT * FROM public.v_equipo_resumen_roi`); }
}
