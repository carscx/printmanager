import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { JwtAuthGuard } from '../auth/auth.types';

@Controller('pedido-items')
@UseGuards(JwtAuthGuard)
export class PedidoItemsController {
  constructor(private readonly pedidos: PedidosService) {}

  @Patch(':id')
  patchItem(@Param('id') id: string, @Body() patch: Record<string, unknown>) {
    return this.pedidos.updateItemPatch(id, patch);
  }
}
