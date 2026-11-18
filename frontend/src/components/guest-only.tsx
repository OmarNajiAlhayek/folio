'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { sanitizeNextParam } from '@/lib/auth-redirect';
import { useMe } from '@/lib/queries/auth';

function GuestRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signedIn = !!useMe().data;

  useEffect(() => {
    if (!signedIn) return;
    router.replace(sanitizeNextParam(searchParams.get('next')) ?? '/dashboard');
  }, [signedIn, router, searchParams]);

  return null;
}

/**
 * For pages meant only for signed-out visitors (login, register, password
 * reset). Sends an already-signed-in user to `next` or the dashboard.
 */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <GuestRedirect />
      </Suspense>
      {children}
    </>
  );
}
