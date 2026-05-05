import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function AssignmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
