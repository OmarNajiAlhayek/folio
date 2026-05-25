import { PermissionRouteGate } from "@/components/PermissionRouteGate";

type Props = {
  children: React.ReactNode;
};

export default function SubmissionSlugComposeLayout({ children }: Props) {
  return <PermissionRouteGate>{children}</PermissionRouteGate>;
}
