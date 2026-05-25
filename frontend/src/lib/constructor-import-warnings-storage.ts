const IMPORT_WARNINGS_KEY = "folio.constructor-import-warnings.v2";

/** Scope for pre-slug compose/create (no submission slug yet). */
export const CONSTRUCTOR_IMPORT_WARNINGS_SCOPE_PRE_SLUG = "pre-slug";

type StoredPayload = {
  scopeKey: string;
  warnings: string[];
  savedAt?: string;
};

function parseStored(raw: string | null, scopeKey: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      scopeKey?: unknown;
      warnings?: unknown;
    };
    if (typeof parsed.scopeKey === "string" && parsed.scopeKey !== scopeKey) {
      return [];
    }
    if (!Array.isArray(parsed.warnings)) return [];
    return parsed.warnings.filter((w): w is string => typeof w === "string");
  } catch {
    return [];
  }
}

export function readStoredImportWarnings(scopeKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStored(sessionStorage.getItem(IMPORT_WARNINGS_KEY), scopeKey);
  } catch {
    return [];
  }
}

export function writeStoredImportWarnings(
  scopeKey: string,
  warnings: string[],
): void {
  if (typeof window === "undefined") return;
  try {
    if (warnings.length === 0) {
      const existing = sessionStorage.getItem(IMPORT_WARNINGS_KEY);
      if (existing) {
        const parsed = JSON.parse(existing) as { scopeKey?: string };
        if (parsed.scopeKey === scopeKey) {
          sessionStorage.removeItem(IMPORT_WARNINGS_KEY);
        }
      }
      return;
    }
    const payload: StoredPayload = {
      scopeKey,
      warnings,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(IMPORT_WARNINGS_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearStoredImportWarnings(scopeKey: string): void {
  writeStoredImportWarnings(scopeKey, []);
}
