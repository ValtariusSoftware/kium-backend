import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver } from '@nestjs/apollo'

import { typeOrmConfig } from './config/typeorm.config'
import { graphqlConfig } from './config/graphql.config'

// import { ProjectsModule } from './projects/projects.module'
import appConfig from './config/app.config'
import { UsersModule } from './users/users.module'
// import { AccessLevel, SubscriptionStatus } from './users/entities/user.entity'
// import { APP_GUARD } from '@nestjs/core'
// import { AuthGuard } from './auth/guards/auth.guard'

@Module({
  imports: [
    // Variables de entorno
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        typeOrmConfig(configService),
    }),

    // GraphQL
    GraphQLModule.forRootAsync({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        graphqlConfig(configService),
      // useFactory: (configService: ConfigService) => ({
      //   ...graphqlConfig(configService),
      //   // 💡 ESTO ES CRUCIAL para que GraphQL vea los ENUMS
      //   buildSchemaOptions: {
      //     orphanedTypes: [AccessLevel, SubscriptionStatus],
      //   },
      // }),
    }),

    // Módulos de negocio
    UsersModule,
  ],
  providers: [
    // {
    //   provide: APP_GUARD,
    //   useClass: AuthGuard,
    // },
  ],
})
export class AppModule {}
