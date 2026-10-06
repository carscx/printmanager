import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly svc: StockService) {}
  @Post(':pedidoId/descontar') descontar(@Param('pedidoId') id: string) { return this.svc.descontar(id); }
  @Post(':pedidoId/restaurar') restaurar(@Param('pedidoId') id: string) { return this.svc.restaurar(id); }
}
