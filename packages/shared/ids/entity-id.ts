import { uuidv7 } from 'uuidv7';

/** RFC 4122 UUID v7 for database primary keys and cross-service entity references. */
export function generateEntityId(): string {
  return uuidv7();
}
