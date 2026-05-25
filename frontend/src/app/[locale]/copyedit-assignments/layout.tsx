import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function CopyeditAssignmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
