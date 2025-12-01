import { Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'

import { GraphQLError } from 'graphql'

@Catch()
export class GqlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GqlExceptionFilter.name)
  catch(exception: unknown) {
    if (exception instanceof HttpException) {
      const response = exception.getResponse()

      let message: string | null = null

      if (typeof response === 'string') {
        message = response
      } else if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>
        if (typeof resp.message === 'string') {
          message = resp.message
        }
      }

      if (message === 'Cannot GET /favicon.ico') {
        return {
          message: 'Favicon request ignored',
          code: 'IGNORED',
        }
      }
    }
    let statusCode: number | null = null
    let message: string

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const response = exception.getResponse()

      if (typeof response === 'string') {
        message = response
      } else if (typeof response === 'object' && response !== null) {
        const msg = (response as Record<string, unknown>).message
        message = Array.isArray(msg)
          ? msg.join(', ')
          : typeof msg === 'string'
            ? msg
            : exception.message
      } else {
        message = exception.message
      }
    } else {
      message =
        exception instanceof Error ? exception.message : 'Internal server error'
    }

    this.logger.error(
      `Status: ${statusCode ?? 'N/A'} - Message: ${message}`,
      exception instanceof Error ? exception.stack : '',
    )

    if (exception instanceof HttpException) {
      throw new GraphQLError(message, {
        extensions: {
          code: exception.constructor.name,
          httpStatus: statusCode,
        },
      })
    }

    throw new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    })
  }
}
