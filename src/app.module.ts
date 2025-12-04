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
import { APP_GUARD } from '@nestjs/core'
import { FirebaseGuard } from './auth/guards/firebase.guard'
import { FirebaseModule } from './firebase/firebase.module'
import { AuthModule } from './auth/auth.module'

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
    }),

    // Módulos de negocio
    FirebaseModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FirebaseGuard,
    },
  ],
})
export class AppModule {}
