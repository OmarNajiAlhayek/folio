import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

function statusToCode(status: number): string {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  return 'HTTP_ERROR';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const excResponse = exception.getResponse();
      if (
        typeof excResponse === 'object' &&
        excResponse !== null &&
        'code' in excResponse &&
        'message' in excResponse
      ) {
        return res.status(status).json(excResponse);
      }
      const messageRaw =
        typeof excResponse === 'string'
          ? excResponse
          : (excResponse as { message?: string | string[] }).message;
      let message = Array.isArray(messageRaw)
        ? messageRaw.join('; ')
        : (messageRaw ?? exception.message);
      if (status === 429) {
        message = 'Too many requests. Please try again in a minute.';
      }
      return res.status(status).json({
        message,
        code: statusToCode(status),
      });
    }

    console.error(exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
}
