import { Module } from '@nestjs/common';
import { PedidosController } from './pedidos.controller';
import { PedidoItemsController } from './pedido-items.controller';
import { PedidosService } from './pedidos.service';

@Module({
  controllers: [PedidosController, PedidoItemsController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
