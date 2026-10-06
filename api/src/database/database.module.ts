import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';

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
