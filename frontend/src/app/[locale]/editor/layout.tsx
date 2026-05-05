import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
