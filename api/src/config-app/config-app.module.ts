import { Module } from '@nestjs/common';
import { ConfigAppController } from './config-app.controller';
import { ConfigAppService } from './config-app.service';
@Module({ controllers: [ConfigAppController], providers: [ConfigAppService] })
export class ConfigAppModule {}
