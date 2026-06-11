import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { LOG_FIELDS } from '@folio/shared/observability';

function statusToCode(status: number): string {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  return 'HTTP_ERROR';
}

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ApiExceptionFilter.name)
    private readonly logger: PinoLogger,
    private readonly cls: ClsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = this.cls.get<string>('requestId');

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
        ...(requestId ? { requestId } : {}),
      });
    }

    this.logger.error(
      {
        err: exception,
        [LOG_FIELDS.requestId]: requestId,
        method: req.method,
        path: req.url,
      },
      'unhandled exception',
    );
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(requestId ? { requestId } : {}),
    });
  }
}
