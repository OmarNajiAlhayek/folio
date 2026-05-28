"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { sanitizeNextParam } from "@/lib/auth-redirect";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PAGE_SHELL } from "@/lib/page-shell";
import { PasswordInputWithToggle } from "@/components/password-input-with-toggle";
import { Spinner } from "@/components/ui/spinner";
import {
  firstIssueByTopLevelPath,
  loginSchema,
  safeParseResult,
} from "@/lib/validation";

function inputCls(err: boolean) {
  return `w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20 ${
    err ? "border-red-400 focus:border-red-400 focus:ring-red-500/15" : "border-ink/15 dark:border-white/15"
  }`;
}

function LoginForm() {
  const t = useTranslations("Login");
  const tNav = useTranslations("Nav");
  const tv = useTranslations("Validation");
  const locale = useLocale();
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

  const isAr = locale === "ar";

  return (
    <main className={PAGE_SHELL}>
      {/* Background Canvas Grid Texture */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.01]"
        style={{
          backgroundImage: `linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
        aria-hidden
      />

      <div className="relative grid gap-8 md:grid-cols-12 md:items-start max-w-5xl mx-auto">
        
        {/* Left Column: Visual Presentation Column */}
        <div className="hidden flex-col gap-6 md:flex md:col-span-6 lg:col-span-7">
          <div>
            <span className="inline-flex items-center rounded-full bg-accent/8 dark:bg-accent/18 px-3.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {tNav("brand")}
            </span>
            <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {t("title")}
            </h1>
            <div className="h-1 w-16 bg-linear-to-r from-accent to-accent-2/60 mt-3" aria-hidden />
          </div>

          <p className="max-w-md text-sm leading-relaxed text-ink/75">
            {t("sideBlurb")}
          </p>

          {/* Interactive Feature list representing the system */}
          <div className="rounded-2xl border border-accent-2/15 bg-surface/65 backdrop-blur-md px-5 py-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-3.5">
              {isAr ? "مميزات البوابة الأكاديمية" : "Scholarly Portal Key Pillars"}
            </h3>
            <ul className="space-y-3.5 text-xs text-ink/70">
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">1</span>
                <div>
                  <strong className="text-ink">{isAr ? "منشئ النصوص العلمي" : "Word Constructor:"}</strong>{" "}
                  {isAr 
                    ? "ابنِ بحثك ونسّقه تلقائياً قسماً بقسم."
                    : "Create formatted, journal-compliant drafts block-by-block."}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">2</span>
                <div>
                  <strong className="text-ink">{isAr ? "تحكيم أقران معمي" : "Double-Blind Review:"}</strong>{" "}
                  {isAr
                    ? "تدفقات عمل سرية وآمنة بالكامل لحفظ الرصانة العلمية."
                    : "Secure review queues and anonymized evaluation packages."}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent font-bold">3</span>
                <div>
                  <strong className="text-ink">{isAr ? "كتالوج النشر المفتوح" : "Open Access Indexing:"}</strong>{" "}
                  {isAr
                    ? "فهرسة شاملة وأرشفة دائمة للمقالات المقبولة."
                    : "Stable links, indexing, and discoverability for published papers."}
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Sleek Form Card */}
        <div className="md:col-span-6 lg:col-span-5 relative group rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-8">
          
          <div className="flex flex-col md:hidden mb-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{tNav("brand")}</span>
            <h1 className="font-serif text-2xl font-bold text-ink">
              {t("title")}
            </h1>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            
            {/* Email Field with embedded icon */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink/80">{t("email")}</span>
              <div className="relative flex items-center">
                <div className="absolute start-3 pointer-events-none text-ink/35" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
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
              </div>
              {emailError && (
                <span className="text-xs text-red-600 mt-0.5">{emailError}</span>
              )}
            </label>

            {/* Password Field with embedded icon */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink/80">{t("password")}</span>
              <div className="relative flex items-center">
                <div className="absolute start-3 pointer-events-none text-ink/35 z-10" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
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
              </div>
              {passwordError && (
                <span className="text-xs text-red-600 mt-0.5">{passwordError}</span>
              )}
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              aria-label={loading ? t("signingIn") : undefined}
              className="mt-3 inline-flex min-w-[7rem] items-center justify-center rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition-all duration-200"
            >
              {loading ? <Spinner size="sm" className="border-ink/30 border-t-white" /> : t("signIn")}
            </button>
          </form>

          {/* Registration Redirect Link */}
          <div className="mt-6 pt-5 border-t border-ink/[0.08] dark:border-white/[0.08] text-center text-sm text-ink/75">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="font-semibold text-accent hover:underline decoration-offset-2"
            >
              {t("registerLink")}
            </Link>
          </div>

        </div>

      </div>
    </main>
  );
}

function LoginFallback() {
  const t = useTranslations("Login");
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t("title")}…</span>
      </div>
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
