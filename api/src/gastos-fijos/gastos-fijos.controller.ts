import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { GastosFijosService } from './gastos-fijos.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('gastos-fijos')
@UseGuards(JwtAuthGuard)
export class GastosFijosController {
  constructor(private readonly svc: GastosFijosService) {}
  @Get() list(@Query('activos') a?: string) { return a === 'true' ? this.svc.activos() : this.svc.all(); }
  @Post() create(@Body() b: Record<string, unknown>) { return this.svc.insert(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: Record<string, unknown>) { return this.svc.update(id, b); }
  @Delete(':id') del(@Param('id') id: string) { return this.svc.delete(id); }
}
