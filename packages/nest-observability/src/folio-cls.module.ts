import {
  FOLIO_REQUEST_ID_HEADER,
  normalizeRequestId,
} from '@folio/shared/observability';

type ClsStore = { set(key: string, value: string): void };
type RequestLike = { header(name: string): string | undefined };
type ResponseLike = { setHeader(name: string, value: string): void };

/**
 * Options for `ClsModule.forRoot()` in the host AppModule.
 * Call `ClsModule.forRoot(folioClsRootOptions)` in the host — do not wrap this
 * inside a library dynamic module, or nestjs-cls may resolve HttpAdapterHost
 * from a duplicate @nestjs/core.
 */
export const folioClsRootOptions = {
  global: true,
  middleware: {
    mount: true,
    setup: (cls: ClsStore, req: RequestLike, res: ResponseLike) => {
      const requestId = normalizeRequestId(
        req.header(FOLIO_REQUEST_ID_HEADER) ?? undefined,
      );
      cls.set('requestId', requestId);
      res.setHeader(FOLIO_REQUEST_ID_HEADER, requestId);
    },
  },
};
