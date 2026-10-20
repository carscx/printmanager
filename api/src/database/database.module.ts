import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types } from 'pg';
import { DatabaseService } from './database.service';

// DATE de Postgres llega como YYYY-MM-DD. Si se parsea a Date, el JSON
// se vuelve ISO y el mensaje de WhatsApp muestra "Invalid Date".
types.setTypeParser(types.builtins.DATE, (value: string) => value);

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is required');
        }
        return new Pool({ connectionString: url });
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService, 'PG_POOL'],
})
export class DatabaseModule {}
