import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PreciosService } from './precios.service';
import { AuthRequestUser, JwtAuthGuard } from '../auth/auth.types';

@Controller()
@UseGuards(JwtAuthGuard)
export class PreciosController {
  constructor(private readonly precios: PreciosService) {}

  @Get('configuracion-negocio')
  configNegocio() { return this.precios.fetchConfigNegocio(); }

  @Patch('configuracion-negocio')
  updateConfig(@Body() body: Record<string, unknown>, @Req() req: { user: AuthRequestUser }) {
    return this.precios.updateConfigNegocio(body, req.user.sub);
  }

  @Get('precios-impresion')
  listImp(@Query('soloActivos') soloActivos?: string) {
    return this.precios.fetchPreciosImpresion(soloActivos === 'true');
  }

  @Post('precios-impresion')
  createImp(@Body() body: Record<string, unknown>, @Req() req: { user: AuthRequestUser }) {
    return this.precios.crearPrecioImpresion({ ...body, updated_by: req.user.sub });
  }

  @Patch('precios-impresion/:id')
  updateImp(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: { user: AuthRequestUser }) {
    return this.precios.updatePrecioImpresion(id, { ...body, updated_by: req.user.sub });
  }

  @Delete('precios-impresion/:id')
  delImp(@Param('id') id: string) { return this.precios.deletePrecioImpresion(id); }

  @Get('precios-anillado')
  listAn(@Query('soloActivos') soloActivos?: string) {
    return this.precios.fetchPreciosAnillado(soloActivos === 'true');
  }

  @Post('precios-anillado')
  createAn(@Body() body: Record<string, unknown>, @Req() req: { user: AuthRequestUser }) {
    return this.precios.crearPrecioAnillado({ ...body, updated_by: req.user.sub });
  }

  @Patch('precios-anillado/:id')
  updateAn(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: { user: AuthRequestUser }) {
    return this.precios.updatePrecioAnillado(id, { ...body, updated_by: req.user.sub });
  }

  @Delete('precios-anillado/:id')
  delAn(@Param('id') id: string) { return this.precios.deletePrecioAnillado(id); }

  @Get('config-costos')
  configCostos() { return this.precios.fetchConfigCostos(); }

  @Put('config-costos')
  upsertCostos(@Body() body: { rows: { key: string; value: string; descripcion?: string | null }[] }, @Req() req: { user: AuthRequestUser }) {
    return this.precios.upsertConfigCostos(body.rows ?? [], req.user.sub);
  }
}
