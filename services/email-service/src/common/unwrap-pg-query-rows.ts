/**
 * PostgresQueryRunner returns `[rows, rowCount]` for UPDATE/DELETE raw queries,
 * but a plain row array for SELECT. Normalize to a row array.
 */
export function unwrapPgQueryRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    typeof result[1] === 'number' &&
    Array.isArray(result[0])
  ) {
    return result[0] as T[];
  }
  return result as T[];
}
