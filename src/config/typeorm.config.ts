import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('db.host'),
  port: configService.get<number>('db.port'),
  username: configService.get<string>('db.user'),
  password: configService.get<string>('db.pass'),
  database: configService.get<string>('db.name'),
  schema: configService.get<string>('db.schema'),
  autoLoadEntities: true,
  synchronize: false,
})
