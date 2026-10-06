import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class ConfigAppService {
  constructor(private readonly db: DatabaseService) {}
  async fetchAll() {
    const rows = await this.db.many<{id:string;valor:string}>(`SELECT id, valor FROM public.config`);
    const config: Record<string, string> = {};
    for (const r of rows) config[r.id] = r.valor;
    return config;
  }
  async update(key: string, value: string) {
    await this.db.query(`UPDATE public.config SET valor=$2 WHERE id=$1`, [key, value]);
  }
}
