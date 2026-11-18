import { GuestOnly } from '@/components/guest-only';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <GuestOnly>{children}</GuestOnly>;
}
