import { notFound } from 'next/navigation';
import { PermissionRouteGate } from '@/components/PermissionRouteGate';
import { CONSTRUCTOR_ENTRY_POINTS_ENABLED } from '@/lib/constructor-entry-points';

type Props = {
  children: React.ReactNode;
};

export default function SubmissionSlugComposeLayout({ children }: Props) {
  if (!CONSTRUCTOR_ENTRY_POINTS_ENABLED) notFound();
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
