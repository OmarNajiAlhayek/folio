import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AppToaster } from "@/components/app-toaster";
import { ApiAuthSync } from "@/components/api-auth-sync";
import { DocumentLocaleSync } from "@/components/document-locale-sync";
import { AuthStorageSync } from "@/components/auth-storage-sync";
import { QueryProvider } from "@/components/query-provider";
import { LocaleDirectionProvider } from "@/components/locale-direction-provider";
import { Nav } from "@/components/Nav";
import { NotificationStreamSync } from "@/components/notification-stream-sync";
import { routing } from "@/i18n/routing";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <DocumentLocaleSync />
      <QueryProvider>
        <ApiAuthSync />
        <NotificationStreamSync />
        <AuthStorageSync />
        <LocaleDirectionProvider locale={locale}>
          <AppToaster locale={locale} />
          <Nav />
          <div className="bg-page flex min-h-0 flex-1 flex-col pb-8">
            {children}
          </div>
        </LocaleDirectionProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
