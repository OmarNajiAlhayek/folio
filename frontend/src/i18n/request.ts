import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { mergeMessages } from "./merge-messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const defaultLocale = routing.defaultLocale;
  const defaultMessages = (
    await import(`../../messages/${defaultLocale}.json`)
  ).default as Record<string, unknown>;

  if (locale === defaultLocale) {
    return { locale, messages: defaultMessages };
  }

  const localeMessages = (await import(`../../messages/${locale}.json`))
    .default as Record<string, unknown>;

  return {
    locale,
    messages: mergeMessages(defaultMessages, localeMessages),
  };
});
