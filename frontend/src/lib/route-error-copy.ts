import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import type { RouteErrorCopy } from "@/components/route-error-fallback";
import { routing } from "@/i18n/routing";

export function localeFromPathname(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (segment && routing.locales.includes(segment as (typeof routing.locales)[number])) {
    return segment;
  }
  return routing.defaultLocale;
}

export function getRouteErrorCopy(locale: string): RouteErrorCopy {
  const messages = locale === "ar" ? ar : en;
  const t = messages.RouteError;
  return {
    title: t.title,
    description: t.description,
    retry: t.retry,
    backHome: t.backHome,
    browsePublications: t.browsePublications,
  };
}
