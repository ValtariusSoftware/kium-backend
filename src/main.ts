import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GqlExceptionFilter } from './utils/filters/graphql-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)
  // Habilitar CORS
  app.enableCors({
    origin: configService.get<string>('corsOrigin'),
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new GqlExceptionFilter())
  const port = process.env.PORT || 4000
  await app.listen(port, '0.0.0.0')
}
void bootstrap()
