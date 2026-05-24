import type { ConstructorValidationError } from "@/lib/constructor-content.types";

export const CONSTRUCTOR_SUBMIT_ERRORS_SESSION_KEY =
  "folio.constructor-submit-errors.v1";

export function stashConstructorSubmitErrors(
  errors: ConstructorValidationError[],
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CONSTRUCTOR_SUBMIT_ERRORS_SESSION_KEY,
      JSON.stringify(errors),
    );
  } catch {
    /* ignore quota */
  }
}

export function takeConstructorSubmitErrors(): ConstructorValidationError[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CONSTRUCTOR_SUBMIT_ERRORS_SESSION_KEY);
    sessionStorage.removeItem(CONSTRUCTOR_SUBMIT_ERRORS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ConstructorValidationError[]) : null;
  } catch {
    return null;
  }
}
