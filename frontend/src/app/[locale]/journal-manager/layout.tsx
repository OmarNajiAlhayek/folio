import { ManagerSeatNotice } from '@/components/manager-seat-notice';
import { PermissionRouteGate } from '@/components/PermissionRouteGate';

export default function JournalManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PermissionRouteGate>
      <ManagerSeatNotice />
      {children}
    </PermissionRouteGate>
  );
}
