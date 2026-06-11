import { captureCsrfFromApiResponse } from '@/lib/csrf-token';

function refreshUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const base = raw == null || raw.trim() === '' ? '' : raw.replace(/\/+$/, '');
  return base ? `${base}/api/v1/auth/refresh` : '/api/v1/auth/refresh';
}

let inflightRefresh: Promise<boolean> | null = null;

/** Rotate refresh cookie and sync CSRF. Single-flight across concurrent 401s. */
export async function refreshSession(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        const res = await fetch(refreshUrl(), {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as Record<string, unknown>;
        captureCsrfFromApiResponse('/auth/refresh', data);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}
