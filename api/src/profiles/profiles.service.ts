import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class ProfilesService {
  constructor(private readonly db: DatabaseService) {}
  vendedores() {
    return this.db.many(`SELECT id, role::text AS role, full_name, comision_pct FROM public.profiles WHERE role::text IN ('admin','operador','vendedor') ORDER BY full_name NULLS LAST`);
  }
  byId(id: string) {
    return this.db.one(`SELECT id, role::text AS role, full_name, comision_pct FROM public.profiles WHERE id=$1`, [id]);
  }
}
