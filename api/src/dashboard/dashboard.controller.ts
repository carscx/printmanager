import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}
  @Get('estadisticas') est(@Query('desde') d: string, @Query('hasta') h: string) { return this.svc.estadisticas(d, h); }
  @Get('top-productos') top(@Query('desde') d: string, @Query('hasta') h: string, @Query('limit') l?: string) { return this.svc.topProductos(d, h, l ? Number(l) : 3); }
  @Get('pendientes') pend() { return this.svc.pendientes().then(n => ({ count: n })); }
  @Get('rendimiento-vendedores') rend() { return this.svc.rendimiento(); }
}
