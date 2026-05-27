import { LoadingCenter } from "@/components/ui/spinner";

type Props = {
  label: string;
};

export function AuthGateFallback({ label }: Props) {
  return (
    <LoadingCenter
      label={label}
      className="mx-auto max-w-lg px-4 text-sm text-ink/70"
    />
  );
}
