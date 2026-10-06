import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AuthRequestUser, JwtAuthGuard } from '../auth/auth.types';
@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly svc: WhatsappService) {}
  @Get('plantillas') list(@Query('estado') estado?: string) { return estado ? this.svc.byEstado(estado) : this.svc.all(); }
  @Post('plantillas') create(@Body() b: Record<string, unknown>, @Req() r: {user: AuthRequestUser}) { return this.svc.create(b, r.user.sub); }
  @Patch('plantillas/:id') update(@Param('id') id: string, @Body() b: Record<string, unknown>, @Req() r: {user: AuthRequestUser}) { return this.svc.update(id, b, r.user.sub); }
  @Delete('plantillas/:id') del(@Param('id') id: string) { return this.svc.delete(id); }
  @Get('datos-pago') pago() { return this.svc.datosPago(); }
  @Post('log') log(@Body() b: {pedidoId:string; plantillaId?:string|null; cuerpoTexto:string}, @Req() r: {user: AuthRequestUser}) {
    return this.svc.log(b.pedidoId, b.plantillaId ?? null, b.cuerpoTexto, r.user.sub);
  }
}
