"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noOpSubscribe = () => () => {};

/** True on client, false on server — avoids setState in an effect (react-hooks/set-state-in-effect). */
function useClientMounted() {
  return useSyncExternalStore(noOpSubscribe, () => true, () => false);
}

const ORDER = ["light", "dark", "system"] as const;

function cycleTheme(
  current: string | undefined,
): (typeof ORDER)[number] {
  const c = (current ?? "system") as (typeof ORDER)[number];
  const i = ORDER.includes(c) ? ORDER.indexOf(c) : 2;
  return ORDER[(i + 1) % ORDER.length];
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("Nav");
  const { theme, setTheme } = useTheme();
  const mounted = useClientMounted();

  const activeTheme = mounted ? (theme ?? "system") : "system";
  const currentLabel =
    activeTheme === "light"
      ? t("themeLight")
      : activeTheme === "dark"
        ? t("themeDark")
        : t("themeSystem");

  return (
    <button
      type="button"
      onClick={() => setTheme(cycleTheme(theme))}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-ink/15 bg-surface px-2 py-1 text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className,
      )}
      title={t("themeToggleTitle", { current: currentLabel })}
      aria-label={t("themeToggleAria", { current: currentLabel })}
    >
      <span className="size-4">
        {!mounted ? (
          <SystemIcon className="size-4 opacity-40" />
        ) : activeTheme === "light" ? (
          <SunIcon className="size-4" />
        ) : activeTheme === "dark" ? (
          <MoonIcon className="size-4" />
        ) : (
          <SystemIcon className="size-4" />
        )}
      </span>
    </button>
  );
}
