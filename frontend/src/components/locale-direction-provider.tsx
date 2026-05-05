"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";

type Props = {
  locale: string;
  children: ReactNode;
};

export function LocaleDirectionProvider({ locale, children }: Props) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
