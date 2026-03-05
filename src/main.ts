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

/*

Opción A: Costo Promedio Ponderado (CPP): Ir un paso más allá en las finanzas. Si compras harina a distintos precios, el sistema recalcula el costo medio para que tus márgenes de ganancia sean exactos y no dependan solo del último precio cargado.

Opción B: Dashboard de Stock Crítico: Crear una vista (Query) que alerte al usuario qué ingredientes están por debajo del minStockAlert. Es la herramienta principal para saber qué hay que salir a comprar mañana mismo.

ESta la B ya esta, pero habria que preguntar si solo se enviara y se pintara o se crearan notificaciones push.

Ver ultima respuesta Gemini para ver y analizar ganancias.

Token leído de DataStore (Inicio): 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2dURaaU4yOGp1TWFzUDlpY25rTFc4anprMWYyIiwiaWF0IjoxNzY2NzY0MjkyLCJleHAiOjE3NjY3Njc4OTJ9.mJvebd2Gf8HwPl2kMhkrBUnjRACfdl0OlQI3PfhuP3Y...' (Length: 177)



REFRESH TOKEN: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2dURaaU4yOGp1TWFzUDlpY25rTFc4anprMWYyIiwiaWF0IjoxNzcyNTQ4NjAzLCJleHAiOjE3NzMxNTM0MDN9.IR1p1iDATUxAvuYvOXNMN0xqUZliaZ2u54gnojXC0X0

{
  "createItemInput": {
    "name": "Cerveza Artesanal IPA 500ml",
    "costPrice": 1200.50,
    "salePrice": 2500.00,
    "stock": 5.0,
    "minStockAlert": 10.0,
    "sku": "BEER-IPA-001",
    "barcode": "7791234567890",
    "baseUnit": "UNIDAD",
    "conversionToBaseQty": 1.0
  }
}

{
  "createItemInput": {
    "name": "Harina de Trigo 000 x 1kg",
    "costPrice": 450.00,
    "salePrice": 850.00,
    "stock": 50.0,
    "minStockAlert": 5.0,
    "sku": "ALIM-HARI-002",
    "barcode": "7790987654321",
    "baseUnit": "KG",
    "conversionToBaseQty": 1.0
  }
}

Carga masiva para usuarios de mas de x productos, cual podria ser el limite? darles una pequeña prueba a usuarios free.
Debatir la creacion del excel quizas en un solo excel se podria armar el producto final ingredientes y cantidades.

*/
