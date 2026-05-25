"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { sanitizeNextParam } from "@/lib/auth-redirect";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PAGE_SHELL } from "@/lib/page-shell";
import { PasswordInputWithToggle } from "@/components/password-input-with-toggle";
import {
  firstIssueByTopLevelPath,
  loginSchema,
  safeParseResult,
} from "@/lib/validation";

function inputCls(err: boolean) {
  return `rounded-lg border px-3 py-2 text-ink outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface bg-surface-muted/80 ${
    err ? "border-red-300" : "border-ink/15"
  }`;
}

function LoginForm() {
  const t = useTranslations("Login");
  const tNav = useTranslations("Nav");
  const tv = useTranslations("Validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showApiError = useToastApiError();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    const parsed = safeParseResult(loginSchema, { email, password });
    if (!parsed.ok) {
      const by = firstIssueByTopLevelPath(tv, parsed.error);
      setEmailError(by.email ?? null);
      setPasswordError(by.password ?? null);
      return;
    }
    setLoading(true);
    try {
      await apiJson("/auth/login", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      const next = sanitizeNextParam(searchParams.get("next"));
      router.push(next ?? "/dashboard");
      router.refresh();
    } catch (err) {
      showApiError(err, t("loginFailed"), { id: "login-failed" });
    } finally {
      setLoading(false);
    }
  }

  const showDevHint = process.env.NODE_ENV === "development";

  return (
    <main className={PAGE_SHELL}>
      <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,480px)] md:items-start md:gap-8">
        <div className="hidden flex-col gap-5 md:flex">
          <p className="font-serif text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {tNav("brand")}
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("title")}
          </h1>
          <div className="h-px w-16 bg-linear-to-r from-accent to-accent-2/60" />
          <p className="max-w-md text-sm leading-relaxed text-ink/70">
            {t("sideBlurb")}
          </p>
          <div className="mt-auto rounded-xl border border-accent-2/20 bg-surface/70 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">
              {tNav("publications")}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
              {t("sideBlurb")}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-8">
          <h1 className="font-serif text-2xl font-semibold text-ink md:hidden">
            {t("title")}
          </h1>
          {showDevHint && (
            <p className="mt-3 text-xs leading-relaxed text-ink/50 md:mt-0">
              {t("demoHint", {
                email: "editor@folio.local",
                password: "Editor123!",
                seedCmd: "npm run seed",
                backend: "backend",
              })}
            </p>
          )}
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">{t("email")}</span>
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                aria-invalid={!!emailError}
                className={inputCls(!!emailError)}
              />
              {emailError && (
                <span className="text-sm text-red-700">{emailError}</span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">{t("password")}</span>
              <PasswordInputWithToggle
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                aria-invalid={!!passwordError}
                inputClassName={inputCls(!!passwordError)}
                showLabel={t("showPassword")}
                hideLabel={t("hidePassword")}
              />
              {passwordError && (
                <span className="text-sm text-red-700">{passwordError}</span>
              )}
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-md bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? t("signingIn") : t("signIn")}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-ink/70">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="font-medium text-accent hover:underline"
            >
              {t("registerLink")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function LoginFallback() {
  const t = useTranslations("Login");
  return (
    <main className={PAGE_SHELL}>
      <p className="text-sm text-ink/70">{t("title")}…</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
