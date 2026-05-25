"use client";

import { usePathname } from "@/i18n/navigation";
import { AuthGate } from "@/components/auth-gate";
import { isPublicPathname } from "@/lib/auth-redirect";
import { normalizePathname } from "@/lib/route-permissions";

type Props = { children: React.ReactNode };

export function ProtectedShell({ children }: Props) {
  const pathname = usePathname();
  const path = normalizePathname(pathname);

  if (isPublicPathname(path)) {
    return <>{children}</>;
  }

  return <AuthGate>{children}</AuthGate>;
}
