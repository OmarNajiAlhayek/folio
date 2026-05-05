"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const other = locale === "en" ? "ar" : "en";
  const label = other === "ar" ? "العربية" : "English";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: other })}
      className="rounded-md border border-ink/15 bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-ink/5"
      lang={other}
    >
      {label}
    </button>
  );
}
