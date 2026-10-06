import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('productos')
@UseGuards(JwtAuthGuard)
export class ProductosController {
  constructor(private readonly svc: ProductosService) {}
  @Get() list(@Query('soloActivos') s?: string) { return this.svc.fetchAll(s === 'true'); }
  @Get(':id') one(@Param('id') id: string) { return this.svc.fetchById(id); }
  @Patch(':id/precio') precio(@Param('id') id: string, @Body() b: { precio_venta: number }) { return this.svc.updatePrecio(id, b.precio_venta); }
  @Post(':id/bom') bom(@Param('id') id: string, @Body() b: { lineas: {insumo_id:string;cantidad:number}[] }) { return this.svc.replaceBom(id, b.lineas ?? []); }
}
