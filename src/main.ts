import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GqlExceptionFilter } from './utils/filters/graphql-exception.filter'
import { graphqlUploadExpress } from 'graphql-upload-ts'

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

  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }))

  const port = process.env.PORT || 4000
  await app.listen(port, '0.0.0.0')
}
void bootstrap()

/**
 * 
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2VTV4WG5reW92UU03eXNqZ2g4eHZ2WmhhTkczIiwiaWF0IjoxNzgyMzA5NjI0LCJleHAiOjE3ODI5MTQ0MjR9.7j-z9RYKUDp8KAsVfHx3hqw2F7ifzyytPW7R1KZdqLQ

errores traducirlos 
falta el dropdown de tipo de producto.

borrado de archivos de la carpeta temp

programar que ademas que se creen items se puedan actualizar en ese mismo servicio mediante el excel? o convendria 
 */
