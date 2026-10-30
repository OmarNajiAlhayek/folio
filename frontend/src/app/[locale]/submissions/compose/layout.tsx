import { notFound } from 'next/navigation';
import { PermissionRouteGate } from '@/components/PermissionRouteGate';
import { CONSTRUCTOR_ENTRY_POINTS_ENABLED } from '@/lib/constructor-entry-points';

export default function SubmissionComposeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!CONSTRUCTOR_ENTRY_POINTS_ENABLED) notFound();
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
