"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { apiJson, getStoredToken, setStoredToken } from "@/lib/api";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { MeProfile } from "@/lib/permissions";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function isNavActive(
  pathname: string,
  href: string,
  match: "exact" | "prefix",
): boolean {
  const p = pathname === "" ? "/" : pathname;
  if (href === "/") {
    return p === "/";
  }
  if (match === "exact") {
    return p === href;
  }
  return p === href || p.startsWith(`${href}/`);
}

const navLinkBase =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function navLinkClass(active: boolean) {
  return cn(
    navLinkBase,
    active
      ? "bg-accent/12 text-accent ring-1 ring-accent/25"
      : "text-ink/75 hover:bg-ink/6 hover:text-ink",
  );
}

function NavTextLink({
  href,
  match,
  children,
}: {
  href: string;
  match: "exact" | "prefix";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, match);
  return (
    <Link
      href={href}
      className={navLinkClass(active)}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

export function Nav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    void Promise.resolve().then(() => setToken(getStoredToken()));
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const tok = getStoredToken();
      if (!tok) {
        setPerms(new Set());
        return;
      }
      try {
        const me = await apiJson<MeProfile>("/auth/me");
        if (!cancelled) setPerms(new Set(me.permissions ?? []));
      } catch {
        if (!cancelled) setPerms(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, token]);

  function logout() {
    setStoredToken(null);
    setToken(null);
    router.push("/login");
    router.refresh();
  }

  const homeActive = isNavActive(pathname, "/", "exact");

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 border-b-accent/25 bg-surface/85 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] ring-1 ring-accent/10 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className={cn(
            navLinkBase,
            "font-serif text-xl font-semibold transition-colors",
            homeActive
              ? "bg-accent/12 text-accent ring-1 ring-accent/25"
              : "text-ink hover:bg-ink/6",
          )}
          aria-current={homeActive ? "page" : undefined}
        >
          {t("brand")}
        </Link>
        <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <LocaleSwitcher />
          <div className="mx-1 h-4 w-px shrink-0 bg-ink/12" aria-hidden />
          <NavTextLink href="/publications" match="prefix">
            {t("publications")}
          </NavTextLink>
          {token ? (
            <>
              <NavTextLink href="/dashboard" match="exact">
                {t("dashboard")}
              </NavTextLink>
              <NavTextLink href="/submissions" match="prefix">
                {t("submissions")}
              </NavTextLink>
              {perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE) && (
                <NavTextLink href="/editor" match="exact">
                  {t("editor")}
                </NavTextLink>
              )}
              {perms.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) && (
                <NavTextLink href="/editor/email-settings" match="prefix">
                  {t("emailSettings")}
                </NavTextLink>
              )}
              {perms.has(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN) && (
                <NavTextLink href="/assignments" match="prefix">
                  {t("myReviews")}
                </NavTextLink>
              )}
              <div className="mx-1 h-4 w-px shrink-0 bg-ink/12" aria-hidden />
              <button
                type="button"
                onClick={logout}
                className={cn(
                  navLinkBase,
                  "cursor-pointer border-0 bg-transparent text-ink/60 hover:bg-ink/6 hover:text-ink",
                )}
              >
                {t("logout")}
              </button>
            </>
          ) : (
            <>
              <NavTextLink href="/login" match="exact">
                {t("login")}
              </NavTextLink>
              <Link
                href="/register"
                className={cn(
                  navLinkBase,
                  "shadow-sm",
                  isNavActive(pathname, "/register", "exact")
                    ? "bg-accent text-white ring-2 ring-accent/40 ring-offset-2 ring-offset-surface"
                    : "bg-accent text-white hover:opacity-95",
                )}
                aria-current={
                  isNavActive(pathname, "/register", "exact")
                    ? "page"
                    : undefined
                }
              >
                {t("register")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
