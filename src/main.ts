import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GqlExceptionFilter } from './utils/filters/graphql-exception.filter'
import { graphqlUploadExpress } from 'graphql-upload-ts'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // ESTO ES LO ÚNICO QUE TIENE QUE ESTAR AQUÍ PARA SABER SI EL REQUEST LLEGA
  app.use((req, res, next) => {
    console.log('LOG_DEBUG: Petición recibida en URL:', req.url)
    console.log('LOG_DEBUG: Headers:', JSON.stringify(req.headers))
    console.log('LOG_DEBUG: Content-Type detectado:', req.get('content-type'))
    next()
  })
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

  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }))

  const port = process.env.PORT || 4000
  await app.listen(port, '0.0.0.0')
}
void bootstrap()

/**
 * 

 */
