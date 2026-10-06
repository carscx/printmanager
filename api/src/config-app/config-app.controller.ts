import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ConfigAppService } from './config-app.service';
import { JwtAuthGuard } from '../auth/auth.types';
@Controller('config')
@UseGuards(JwtAuthGuard)
export class ConfigAppController {
  constructor(private readonly svc: ConfigAppService) {}
  @Get() all() { return this.svc.fetchAll(); }
  @Put() update(@Body() b: { key: string; value: string }) { return this.svc.update(b.key, b.value); }
}
