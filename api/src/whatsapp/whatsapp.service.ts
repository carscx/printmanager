import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
const PAGO_KEYS = ['pago_alias','pago_cbu','pago_titular','pago_banco'];
@Injectable()
export class WhatsappService {
  constructor(private readonly db: DatabaseService) {}
  byEstado(estado: string) {
    return this.db.many(`SELECT * FROM public.plantillas_whatsapp WHERE estado_destino=$1 AND activo=true ORDER BY nombre`, [estado.toLowerCase()]);
  }
  all() { return this.db.many(`SELECT * FROM public.plantillas_whatsapp ORDER BY estado_destino, nombre`); }
  async create(input: Record<string, unknown>, userId?: string) {
    const row: Record<string, unknown> = { ...input, updated_by: userId ?? null };
    const cols = Object.keys(row);
    return this.db.one(`INSERT INTO public.plantillas_whatsapp (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, cols.map(c=>row[c]));
  }
  async update(id: string, input: Record<string, unknown>, userId?: string) {
    const row: Record<string, unknown> = { ...input, updated_by: userId ?? null, updated_at: new Date().toISOString() };
    const cols = Object.keys(row);
    return this.db.one(`UPDATE public.plantillas_whatsapp SET ${cols.map((c,i)=>`"${c}"=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...cols.map(c=>row[c])]);
  }
  async delete(id: string) { await this.db.query(`DELETE FROM public.plantillas_whatsapp WHERE id=$1`, [id]); }
  async datosPago() {
    const rows = await this.db.many(`SELECT * FROM public.config_costos WHERE key = ANY($1::text[])`, [PAGO_KEYS]);
    const by = new Map((rows as {key:string}[]).map(r => [r.key, r]));
    return PAGO_KEYS.map(key => by.get(key) ?? { key, value: '', descripcion: null, updated_at: '', updated_by: null });
  }
  async log(pedidoId: string, plantillaId: string | null, cuerpo: string, userId?: string) {
    await this.db.query(`INSERT INTO public.mensajes_whatsapp_log (pedido_id, plantilla_id, cuerpo_texto, enviado_por) VALUES ($1,$2,$3,$4)`, [pedidoId, plantillaId, cuerpo, userId ?? null]);
  }
}
