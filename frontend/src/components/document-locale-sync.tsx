"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * Keeps <html lang> and <html dir> aligned with the routed locale after
 * navigation and for any edge cases where SSR and the active segment differ.
 */
export function DocumentLocaleSync() {
  const locale = useLocale();

  useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  return null;
}
