import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InsumosService } from './insumos.service';
import { AuthRequestUser, JwtAuthGuard } from '../auth/auth.types';

@Controller('insumos')
@UseGuards(JwtAuthGuard)
export class InsumosController {
  constructor(private readonly insumos: InsumosService) {}

  @Get()
  list(
    @Query('soloActivos') soloActivos?: string,
    @Query('categoria') categoria?: string,
  ) {
    if (categoria) return this.insumos.fetchByCategoria(categoria);
    return this.insumos.fetchAll(soloActivos !== 'false');
  }

  @Get('alertas-stock')
  alertas() {
    return this.insumos.fetchAlertasStock();
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.insumos.fetchById(id);
  }

  @Get(':id/uso-pedidos')
  uso(@Param('id') id: string) {
    return this.insumos.countUsoEnPedidos(id).then((count) => ({ count }));
  }

  @Get(':id/tarifas-afectadas')
  tarifas(@Param('id') id: string) {
    return this.insumos.fetchProductosTarifaAfectados(id);
  }

  @Get(':id/movimientos')
  movimientos(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.insumos.fetchMovimientos(id, limit ? Number(limit) : 50);
  }

  @Get(':id/precios-log')
  preciosLog(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.insumos.fetchPreciosLog(id, limit ? Number(limit) : 20);
  }

  @Post()
  crear(@Body() body: Record<string, unknown>) {
    return this.insumos.crear(body);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.insumos.actualizar(id, body);
  }

  @Post(':id/activar')
  activar(@Param('id') id: string) {
    return this.insumos.setActivo(id, true);
  }

  @Post(':id/desactivar')
  desactivar(@Param('id') id: string) {
    return this.insumos.setActivo(id, false);
  }

  @Post(':id/movimientos')
  mov(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { user: AuthRequestUser },
  ) {
    return this.insumos.registrarMovimiento({
      insumo_id: id,
      tipo: String(body.tipo),
      cantidad: Number(body.cantidad),
      motivo: String(body.motivo),
      referencia_pedido_id: body.referencia_pedido_id as string | undefined,
      notas: body.notas as string | undefined,
      precioCompraBulto: body.precioCompraBulto as number | undefined,
      created_by: req.user.sub,
    });
  }

  @Delete(':id')
  borrar(@Param('id') id: string) {
    return this.insumos.rpcDelete(id);
  }
}
