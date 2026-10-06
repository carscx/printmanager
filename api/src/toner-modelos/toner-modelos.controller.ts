import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TonerModelosService } from './toner-modelos.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('toner-modelos')
@UseGuards(JwtAuthGuard)
export class TonerModelosController {
  constructor(private readonly svc: TonerModelosService) {}
  @Get() list(@Query('todos') t?: string) { return t === 'true' ? this.svc.todos() : this.svc.activos(); }
  @Post() create(@Body() b: Record<string, unknown>) { return this.svc.insert(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: Record<string, unknown>) { return this.svc.update(id, b); }
  @Delete(':id') del(@Param('id') id: string) { return this.svc.delete(id); }
}
