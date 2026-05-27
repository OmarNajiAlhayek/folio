import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function JournalManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
