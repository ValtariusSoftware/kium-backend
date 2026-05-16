import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver } from '@nestjs/apollo'

import { typeOrmConfig } from './config/typeorm.config'
import { graphqlConfig } from './config/graphql.config'

import appConfig from './config/app.config'
import { UsersModule } from './users/users.module'
import { APP_GUARD } from '@nestjs/core'
import { JwtGuard } from './auth/guards/jwt.guard'
import { FirebaseModule } from './firebase/firebase.module'
import { AuthModule } from './auth/auth.module'
import { ItemsModule } from './items/items.module'
import { RecipesModule } from './recipes/recipes.module'
import { InventoryTransactionsModule } from './inventory-transactions/inventory-transactions.module'
import { SalesModule } from './sales/sales.module'
import { DashboardModule } from './dashboard/dashboard.module'
import { RecipesService } from './recipes/recipes.service'
import { ProductionModule } from './production/production.module'
import { ItemsService } from './items/items.service'
import { AppController } from './app.controller'
// 🚨 ELIMINAR ESTA LÍNEA -> import { JwtStrategy } from './auth/strategies/jwt.strategy'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        typeOrmConfig(configService),
    }),
    GraphQLModule.forRootAsync({
      driver: ApolloDriver,
      imports: [RecipesModule, ItemsModule], // 1. Agregamos ItemsModule acá
      inject: [ConfigService, RecipesService, ItemsService],
      useFactory: (
        configService: ConfigService,
        recipesService: RecipesService,
        itemsService: ItemsService,
      ) => graphqlConfig(configService, recipesService, itemsService), // <--- Se lo pasamos a la función
    }),

    FirebaseModule,
    UsersModule,
    AuthModule,
    ItemsModule,
    RecipesModule,
    ProductionModule,
    InventoryTransactionsModule,
    SalesModule,
    DashboardModule,
    SubscriptionsModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard, // El Guard Global
    }, // ❌ ELIMINAR JwtStrategy DE AQUÍ. DEBE RESIDIR SÓLO EN AuthModule.
  ],
})
export class AppModule {}
