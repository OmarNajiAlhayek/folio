import { PermissionRouteGate } from '@/components/PermissionRouteGate';

export default function SectionEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
