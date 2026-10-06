import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { InsumosModule } from './insumos/insumos.module';
import { PreciosModule } from './precios/precios.module';
import { EquiposModule } from './equipos/equipos.module';
import { ProductosModule } from './productos/productos.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { GastosFijosModule } from './gastos-fijos/gastos-fijos.module';
import { ProfilesModule } from './profiles/profiles.module';
import { TonerModelosModule } from './toner-modelos/toner-modelos.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { ReglasCostoModule } from './reglas-costo/reglas-costo.module';
import { RecetasModule } from './recetas/recetas.module';
import { StockModule } from './stock/stock.module';
import { ConfigAppModule } from './config-app/config-app.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    PedidosModule,
    InsumosModule,
    PreciosModule,
    EquiposModule,
    ProductosModule,
    DashboardModule,
    WhatsappModule,
    GastosFijosModule,
    ProfilesModule,
    TonerModelosModule,
    FacturacionModule,
    ReglasCostoModule,
    RecetasModule,
    StockModule,
    ConfigAppModule,
  ],
})
export class AppModule {}
