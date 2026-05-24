export class ApiError extends Error {
  /**
   * The full parsed response body (when JSON). Useful for endpoints that
   * return structured details alongside the human-readable message — e.g. the
   * Word Constructor submit endpoint returns
   * `{ message, code: 'CONSTRUCTOR_VALIDATION_FAILED', errors: [...] }`.
   */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code?: string,
    status?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  code?: string;
  status?: number;
}

let unauthorizedHandler: (() => void) | null = null;

export function setApiUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function notifyUnauthorized(status: number): void {
  if (status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }
}

/**
 * Parse a response body as Nest-style JSON (`message`, `code`, …).
 * Throws `ApiError` when `res.ok` is false.
 */
export function parseApiJsonBody(
  res: Response,
  text: string,
): Record<string, unknown> {
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { message: text || res.statusText };
  }

  if (!res.ok) {
    notifyUnauthorized(res.status);
    throw new ApiError(
      typeof data.message === "string" ? data.message : res.statusText,
      typeof data.code === "string" ? data.code : undefined,
      res.status,
      data,
    );
  }

  return data;
}

export async function readResponseText(res: Response): Promise<string> {
  return res.text();
}
