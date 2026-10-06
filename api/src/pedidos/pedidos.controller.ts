import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PedidosService, HistorialFiltros } from './pedidos.service';
import { JwtAuthGuard } from '../auth/auth.types';

@Controller('pedidos')
@UseGuards(JwtAuthGuard)
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  list(@Query('entregado') entregado?: string) {
    return this.pedidos.fetchPedidos(entregado === 'true');
  }

  @Get('historial')
  historial(@Query() q: Record<string, string>) {
    const filtros: HistorialFiltros = {
      page: q.page ? Number(q.page) : 0,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
      fromDate: q.fromDate || null,
      toDate: q.toDate || null,
      estado: q.estado || null,
      busquedaClientePedido: q.busquedaClientePedido || null,
      searchQuery: q.searchQuery || null,
      tipoTrabajo: (q.tipoTrabajo as HistorialFiltros['tipoTrabajo']) || null,
      cobranza: (q.cobranza as HistorialFiltros['cobranza']) || null,
      impresos: (q.impresos as HistorialFiltros['impresos']) || null,
    };
    return this.pedidos.fetchHistorial(filtros);
  }

  @Get('periodo')
  periodo(
    @Query('from') fromISO: string,
    @Query('to') toISO: string,
    @Query('incluirCancelados') incluirCancelados?: string,
    @Query('limite') limite?: string,
  ) {
    return this.pedidos.fetchPedidosPorPeriodo(fromISO, toISO, {
      incluirCancelados: incluirCancelados === 'true',
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Get('resumen-hoy')
  resumenHoy() {
    return this.pedidos.fetchResumenHoy();
  }

  @Post('consumo-insumos')
  consumo(@Body() body: { itemIds: string[] }) {
    return this.pedidos.fetchConsumoInsumosPorItemIds(body.itemIds ?? []);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.pedidos.fetchById(id);
  }

  @Post()
  crear(
    @Body() body: { cabecera: Record<string, unknown>; items: Record<string, unknown>[] },
  ) {
    return this.pedidos.crearCompleto(body.cabecera, body.items ?? []);
  }

  @Put(':id')
  actualizar(
    @Param('id') id: string,
    @Body() body: { cabecera: Record<string, unknown>; items: Record<string, unknown>[] },
  ) {
    return this.pedidos.actualizarCompleto(id, body.cabecera, body.items ?? []);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() patch: Record<string, unknown>) {
    return this.pedidos.updatePatch(id, patch);
  }

  @Post(':id/estado')
  estado(@Param('id') id: string, @Body() body: { estado: string }) {
    return this.pedidos.cambiarEstado(id, body.estado);
  }

  @Post(':id/entregar')
  entregar(@Param('id') id: string, @Body() body: { total: number }) {
    return this.pedidos.entregar(id, body.total);
  }

  @Post(':id/cobrar')
  cobrar(@Param('id') id: string, @Body() body: { total: number }) {
    return this.pedidos.cobrar(id, body.total);
  }

  @Post(':id/convertir-presupuesto')
  convertir(@Param('id') id: string) {
    return this.pedidos.rpcConvertirPresupuesto(id);
  }

  @Post(':id/explotar-bom')
  explotar(@Param('id') id: string) {
    return this.pedidos.rpcExplotarBom(id);
  }

  @Delete(':id')
  borrar(@Param('id') id: string) {
    return this.pedidos.borrar(id);
  }
}
