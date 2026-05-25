import { ApiError } from "@/lib/api-response";

/** Keys under the `ApiErrors` next-intl namespace. */
export const API_ERROR_MESSAGE_KEYS = [
  "tooManyRequests",
  "notFound",
  "unauthorized",
  "invalidCredentials",
  "forbidden",
  "badRequest",
  "serverError",
  "networkError",
] as const;

export type ApiErrorMessageKey = (typeof API_ERROR_MESSAGE_KEYS)[number];
export type ApiErrorMessageBundle = Record<ApiErrorMessageKey, string>;

export const DEFAULT_API_ERROR_MESSAGES: ApiErrorMessageBundle = {
  tooManyRequests:
    "Too many requests. Please wait a minute and try again.",
  notFound: "The requested resource was not found.",
  unauthorized: "Please sign in to continue.",
  invalidCredentials: "Invalid email or password.",
  forbidden: "You do not have permission to do that.",
  badRequest: "The request could not be processed. Check your input and try again.",
  serverError: "Something went wrong on our side. Please try again later.",
  networkError:
    "Could not reach the server. Check your connection and try again.",
};

export type ApiErrorKind =
  | "rateLimit"
  | "notFound"
  | "unauthorized"
  | "forbidden"
  | "badRequest"
  | "serverError"
  | "generic";

const THROTTLE_MESSAGE_RE =
  /throttlerexception|too many requests/i;

/** Passport/Nest default — use translated unauthorized copy instead. */
const GENERIC_UNAUTHORIZED_MESSAGE_RE = /^unauthorized$/i;

/** Auth login failure — backend English copy; map to `invalidCredentials` in UI. */
const INVALID_CREDENTIALS_MESSAGE_RE = /^invalid email or password\.?$/i;

const CSRF_MESSAGE_RE = /invalid or missing csrf token/i;

const STATUS_TRANSITION_MESSAGE_RE =
  /^cannot transition from \S+ to \S+$/i;

/** Whether the API message is safe to show users (not a Nest/internal string). */
export function isUserFacingApiMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (THROTTLE_MESSAGE_RE.test(trimmed)) return false;
  if (GENERIC_UNAUTHORIZED_MESSAGE_RE.test(trimmed)) return false;
  if (CSRF_MESSAGE_RE.test(trimmed)) return false;
  if (STATUS_TRANSITION_MESSAGE_RE.test(trimmed)) return false;
  if (/^internal server error$/i.test(trimmed)) return false;
  if (/^ThrottlerException:/i.test(trimmed)) return false;
  return true;
}

export function isCsrfApiError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "CSRF_TOKEN_INVALID" || CSRF_MESSAGE_RE.test(err.message))
  );
}

export function getApiErrorKind(err: unknown): ApiErrorKind {
  if (!(err instanceof ApiError)) return "generic";
  if (err.status === 429 || err.code === "TOO_MANY_REQUESTS") return "rateLimit";
  if (err.status === 404 || err.code === "NOT_FOUND") return "notFound";
  if (err.status === 401 || err.code === "UNAUTHORIZED") return "unauthorized";
  if (err.status === 403 || err.code === "FORBIDDEN") return "forbidden";
  if (
    err.status === 400 ||
    err.code === "VALIDATION_ERROR" ||
    err.code === "CONSTRUCTOR_VALIDATION_FAILED"
  ) {
    return "badRequest";
  }
  if (err.status != null && err.status >= 500) return "serverError";
  return "generic";
}

function messageForKind(
  kind: ApiErrorKind,
  messages: ApiErrorMessageBundle,
): string {
  switch (kind) {
    case "rateLimit":
      return messages.tooManyRequests;
    case "notFound":
      return messages.notFound;
    case "unauthorized":
      return messages.unauthorized;
    case "forbidden":
      return messages.forbidden;
    case "badRequest":
      return messages.badRequest;
    case "serverError":
      return messages.serverError;
    default:
      return "";
  }
}

/**
 * User-facing copy for API failures. Prefers translated status messages over raw
 * Nest/throttler strings; uses `fallback` for unknown errors.
 */
export function resolveApiErrorMessage(
  err: unknown,
  fallback: string,
  messages: ApiErrorMessageBundle = DEFAULT_API_ERROR_MESSAGES,
): string {
  if (!(err instanceof ApiError)) {
    if (err instanceof TypeError && /fetch/i.test(String(err.message))) {
      return messages.networkError;
    }
    return fallback;
  }

  if (isCsrfApiError(err)) {
    return fallback;
  }

  const kind = getApiErrorKind(err);
  if (
    kind === "unauthorized" &&
    INVALID_CREDENTIALS_MESSAGE_RE.test(err.message.trim())
  ) {
    return messages.invalidCredentials;
  }
  if (isUserFacingApiMessage(err.message)) {
    if (kind === "badRequest") return err.message;
    if (kind === "unauthorized" || kind === "forbidden") return err.message;
  }
  if (kind !== "generic") {
    return messageForKind(kind, messages);
  }

  if (isUserFacingApiMessage(err.message)) {
    return err.message;
  }

  return fallback;
}

export function apiErrorBundleFromTranslations(
  t: (key: ApiErrorMessageKey) => string,
): ApiErrorMessageBundle {
  return {
    tooManyRequests: t("tooManyRequests"),
    notFound: t("notFound"),
    unauthorized: t("unauthorized"),
    invalidCredentials: t("invalidCredentials"),
    forbidden: t("forbidden"),
    badRequest: t("badRequest"),
    serverError: t("serverError"),
    networkError: t("networkError"),
  };
}
