import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import {
  FOLIO_REQUEST_ID_HEADER,
  normalizeRequestId,
} from '@folio/shared/observability';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = normalizeRequestId(
      req.header(FOLIO_REQUEST_ID_HEADER) ?? undefined,
    );
    this.cls.set('requestId', requestId);
    res.setHeader(FOLIO_REQUEST_ID_HEADER, requestId);
    next();
  }
}
