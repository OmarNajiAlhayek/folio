import { NotFoundException } from '@nestjs/common';

/**
 * Keep in sync with `CONSTRUCTOR_ENTRY_POINTS_ENABLED` in
 * `frontend/src/lib/constructor-entry-points.ts`.
 *
 * HTTP and websocket entry points answer "not found" while this is false.
 * The service methods stay callable so the implementation and its tests remain.
 */
export const WORD_CONSTRUCTOR_ENABLED = false;

export function assertWordConstructorEnabled(): void {
  if (WORD_CONSTRUCTOR_ENABLED) return;
  throw new NotFoundException({
    message: 'Not found',
    code: 'NOT_FOUND',
  });
}
