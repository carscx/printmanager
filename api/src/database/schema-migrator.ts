import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from './database.service';

const MIGRATION_ID = '063_plastificado';

/**
 * Aplica sql/63 al arrancar. El deploy de producción no ejecuta scripts SQL:
 * sin esto, crear un insumo `pouch` choca con insumos_categoria_check (500).
 */
@Injectable()
export class SchemaMigrator implements OnModuleInit {
  private readonly logger = new Logger(SchemaMigrator.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const done = await this.db.one(
      `SELECT id FROM public.schema_migrations WHERE id = $1`,
      [MIGRATION_ID],
    );
    if (done) return;

    const sql = readFileSync(resolverSql(), 'utf8');
    this.logger.log(`Aplicando migración ${MIGRATION_ID}`);
    await this.db.query(sql);
    await this.db.query(
      `INSERT INTO public.schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [MIGRATION_ID],
    );
    this.logger.log(`Migración ${MIGRATION_ID} aplicada`);
  }
}

function resolverSql(): string {
  const nombre = `${MIGRATION_ID}.sql`;
  const candidatos = [
    join(__dirname, 'migrations', nombre),
    join(process.cwd(), 'dist/database/migrations', nombre),
    join(process.cwd(), 'src/database/migrations', nombre),
  ];
  const hallado = candidatos.find((p) => existsSync(p));
  if (!hallado) {
    throw new Error(`No encuentro ${nombre} (${candidatos.join(', ')})`);
  }
  return hallado;
}
