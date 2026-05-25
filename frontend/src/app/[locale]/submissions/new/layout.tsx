import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function NewSubmissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
