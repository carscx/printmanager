import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('facturacion')
@UseGuards(JwtAuthGuard)
export class FacturacionController {
  constructor(private readonly svc: FacturacionService) {}
  @Get('pedidos') list(@Query('desde') d: string, @Query('hasta') h: string) { return this.svc.pedidos(d, h); }
  @Post('marcar') marcar(@Body() b: { ids: string[] }) { return this.svc.marcar(b.ids ?? []); }
  @Get('ultima-export') get() { return this.svc.getUltimaExport().then(v => ({ fecha: v })); }
  @Put('ultima-export') set(@Body() b: { fecha: string }) { return this.svc.setUltimaExport(b.fecha); }
}
