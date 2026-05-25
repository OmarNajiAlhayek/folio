import { PermissionRouteGate } from "@/components/PermissionRouteGate";

export default function SubmissionComposeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
