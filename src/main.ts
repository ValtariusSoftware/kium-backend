import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
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
      stopAtFirstError: false, // <--- ESTO permite capturar múltiples errores del DTO
      exceptionFactory: (errors) => {
        const errorData = errors.map((err) => ({
          field: err.property,
          codes: Object.keys(err.constraints || {}),
        }))
        return new BadRequestException(errorData)
      },
    }),
  )
  app.useGlobalFilters(new GqlExceptionFilter())
  const port = process.env.PORT || 4000
  await app.listen(port, '0.0.0.0')
}
void bootstrap()
