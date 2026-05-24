"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredToken, setStoredToken } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/theme-toggle";
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
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const meQuery = useMe(!!token);
  const perms = new Set(meQuery.data?.permissions ?? []);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    void Promise.resolve().then(() => setToken(getStoredToken()));
  }, [pathname]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (logoutDialogOpen) {
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [logoutDialogOpen]);

  useEffect(() => {
    if (!logoutDialogOpen) return;
    const id = requestAnimationFrame(() => {
      cancelLogoutRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [logoutDialogOpen]);

  function confirmLogout() {
    const d = dialogRef.current;
    if (d?.open) d.close();
    setStoredToken(null);
    setToken(null);
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  const homeActive = isNavActive(pathname, "/", "exact");
  const dialogDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <>
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
                {perms.has(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE) && (
                  <NavTextLink href="/copyedit-assignments" match="prefix">
                    {t("copyediting")}
                  </NavTextLink>
                )}
                <div className="mx-1 h-4 w-px shrink-0 bg-ink/12" aria-hidden />
                <button
                  type="button"
                  onClick={() => setLogoutDialogOpen(true)}
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

      <dialog
        ref={dialogRef}
        className="folio-logout-dialog m-0 box-border h-dvh max-h-dvh w-full max-w-none border-0 bg-transparent p-0"
        dir={dialogDir}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => {
          if (e.target === dialogRef.current) setLogoutDialogOpen(false);
        }}
        onClose={() => setLogoutDialogOpen(false)}
        onCancel={() => setLogoutDialogOpen(false)}
      >
        <div className="pointer-events-none flex min-h-full w-full items-center justify-center p-4">
          <div
            className="folio-logout-dialog__panel pointer-events-auto w-full max-w-md rounded-2xl border border-ink/15 bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id={titleId}
              className="font-serif text-xl font-semibold text-ink"
            >
              {t("logoutConfirmTitle")}
            </h2>
            <p id={descId} className="mt-2 text-sm leading-relaxed text-ink/75">
              {t("logoutConfirmDescription")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                ref={cancelLogoutRef}
                type="button"
                onClick={() => setLogoutDialogOpen(false)}
                className={cn(
                  navLinkBase,
                  "cursor-pointer border border-ink/20 bg-surface-2 text-ink hover:bg-ink/8",
                )}
              >
                {t("logoutCancel")}
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className={cn(
                  navLinkBase,
                  "cursor-pointer border-0 bg-accent text-white hover:opacity-95",
                )}
              >
                {t("logoutConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
