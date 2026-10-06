import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('recetas')
@UseGuards(JwtAuthGuard)
export class RecetasController {
  constructor(private readonly svc: RecetasService) {}
  @Get() list() { return this.svc.fetchAll(); }
  @Post() create(@Body() b: Record<string, unknown>) { return this.svc.insert(b); }
  @Delete(':id') del(@Param('id') id: string) { return this.svc.delete(id); }
}
