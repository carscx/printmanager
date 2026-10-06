import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('equipos')
@UseGuards(JwtAuthGuard)
export class EquiposController {
  constructor(private readonly svc: EquiposService) {}
  @Get() list(@Query('soloActivos') s?: string) { return this.svc.fetchAll(s !== 'false'); }
  @Get('roi') roi() { return this.svc.fetchResumenRoi(); }
  @Post() crear(@Body() b: Record<string, unknown>) { return this.svc.crear(b); }
  @Patch(':id') upd(@Param('id') id: string, @Body() b: Record<string, unknown>) { return this.svc.actualizar(id, b); }
  @Post(':id/activo') toggle(@Param('id') id: string, @Body() b: { activo: boolean }) { return this.svc.toggleActivo(id, b.activo); }
}
