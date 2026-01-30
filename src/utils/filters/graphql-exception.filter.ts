import { Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { GraphQLError } from 'graphql'

interface ValidationErrorData {
  field: string
  codes: string[]
}

interface NestErrorResponse {
  message: string | ValidationErrorData[]
  error?: string
  statusCode?: number
  details?: any // Agregamos la posibilidad de recibir detalles
}

@Catch()
export class GqlExceptionFilter implements ExceptionFilter {
  catch(exception: unknown) {
    // Silenciar favicon
    if (exception instanceof HttpException) {
      const response = exception.getResponse() as NestErrorResponse
      const msg = typeof response === 'object' ? response.message : response
      if (msg === 'Cannot GET /favicon.ico') return null
    }

    if (exception instanceof GraphQLError) throw exception

    let statusCode = 500
    let errorCodes: string[] = ['ERR_INTERNAL_SERVER']
    let extraDetails: any = null // Para capturar nombres de items, etc.

    const ErrorCodeMap: Record<string, string> = {
      isUuid: 'ERR_INVALID_ID',
      isNotEmpty: 'ERR_NAME_EMPTY',
      isString: 'ERR_INVALID_SKU',
      isPositive: 'ERR_INVALID_PRICE',
      isNumber: 'ERR_NOT_A_NUMBER',
    }

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const response = exception.getResponse() as NestErrorResponse

      // CAPTURA DE DETALLES EXTRA
      if (typeof response === 'object' && response.details) {
        extraDetails = response.details
      }

      if (typeof response === 'object' && response.message) {
        if (Array.isArray(response.message)) {
          errorCodes = response.message.flatMap((item: ValidationErrorData) =>
            item.codes.map((c) => ErrorCodeMap[c] || c),
          )
        } else {
          errorCodes = [ErrorCodeMap[response.message] || response.message]
        }
      }
    } else if (exception instanceof Error) {
      errorCodes = [ErrorCodeMap[exception.message] || exception.message]
    }

    const finalCodes = [...new Set(errorCodes)]

    // Lanza el error con los códigos y los detalles si existen
    throw new GraphQLError(finalCodes[0], {
      extensions: {
        httpStatus: statusCode,
        code: finalCodes,
        details: extraDetails, // <--- Esto es lo que leerá Android
      },
    })
  }
}
