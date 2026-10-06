import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly svc: ProfilesService) {}
  @Get('vendedores') vend() { return this.svc.vendedores(); }
  @Get(':id') one(@Param('id') id: string) { return this.svc.byId(id); }
}
