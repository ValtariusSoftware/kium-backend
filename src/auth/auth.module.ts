import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { AuthResolver } from './auth.resolver'
import { AuthService } from './auth.service'
import { FirebaseModule } from 'src/firebase/firebase.module'
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtStrategy } from './strategies/jwt.strategy'
import { JwtGuard } from './guards/jwt.guard'
import { PassportModule } from '@nestjs/passport' // 💡 Necesario para el sistema de estrategia

@Module({
  imports: [
    UsersModule,
    FirebaseModule,
    // 💡 PASO 1: IMPORTAMOS PASSPORT
    PassportModule.register({ defaultStrategy: 'jwt' }), // CONFIGURACIÓN DEL JWT:
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        Promise.resolve({
          secret: configService.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: configService.get<string>('jwt.accessExpiration'),
          },
        } as JwtModuleOptions),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthResolver,
    AuthService,
    JwtStrategy,
    JwtGuard, // 💡 PASO 2: REGISTRAR EL GUARD como PROVEEDOR (necesario para poder exportarlo)
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtStrategy, // 💡 PASO 3: EXPORTAR LA ESTRATEGIA
    JwtGuard, // 💡 PASO 4: EXPORTAR EL GUARD para que AppModule pueda usarlo en APP_GUARD
  ],
})
export class AuthModule {}
