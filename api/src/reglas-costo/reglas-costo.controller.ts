import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReglasCostoService } from './reglas-costo.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('reglas-costo')
@UseGuards(JwtAuthGuard)
export class ReglasCostoController {
  constructor(private readonly svc: ReglasCostoService) {}
  @Get() list(@Query('tipo') tipo?: string, @Query('tarifaId') tarifaId?: string, @Query('todas') todas?: string) {
    if (todas === 'anillado') return this.svc.todasAnillado();
    if (todas === 'impresion') return this.svc.todasImpresion();
    return this.svc.byTarifa((tipo as 'impresion'|'anillado') || 'impresion', tarifaId!);
  }
  @Post() create(@Body() b: Record<string, unknown>) { return this.svc.insert(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: Record<string, unknown>) { return this.svc.update(id, b); }
  @Delete(':id') del(@Param('id') id: string) { return this.svc.delete(id); }
}
