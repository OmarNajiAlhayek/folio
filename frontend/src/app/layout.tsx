import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { Amiri, Noto_Sans_Arabic, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { routing } from "@/i18n/routing";
import "./globals.css";

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  weight: ["400", "700"],
  subsets: ["arabic"],
});

type Props = {
  children: React.ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const headerLocale = (await headers()).get("X-NEXT-INTL-LOCALE");
  const locale =
    headerLocale && hasLocale(routing.locales, headerLocale)
      ? headerLocale
      : await getLocale();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${notoArabic.variable} ${amiri.variable} h-full`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
