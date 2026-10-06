import { Module } from '@nestjs/common';
import { ReglasCostoController } from './reglas-costo.controller';
import { ReglasCostoService } from './reglas-costo.service';
@Module({ controllers: [ReglasCostoController], providers: [ReglasCostoService] })
export class ReglasCostoModule {}
