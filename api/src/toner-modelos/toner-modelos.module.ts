import { Module } from '@nestjs/common';
import { TonerModelosController } from './toner-modelos.controller';
import { TonerModelosService } from './toner-modelos.service';
@Module({ controllers: [TonerModelosController], providers: [TonerModelosService] })
export class TonerModelosModule {}
