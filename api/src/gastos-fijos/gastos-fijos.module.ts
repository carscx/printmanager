import { Module } from '@nestjs/common';
import { GastosFijosController } from './gastos-fijos.controller';
import { GastosFijosService } from './gastos-fijos.service';
@Module({ controllers: [GastosFijosController], providers: [GastosFijosService] })
export class GastosFijosModule {}
