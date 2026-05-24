"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson, setStoredToken } from "@/lib/api";
import { sanitizeNextParam } from "@/lib/auth-redirect";
import { toastApiError } from "@/lib/toast";
import { PAGE_SHELL } from "@/lib/page-shell";
import { PasswordInputWithToggle } from "@/components/password-input-with-toggle";
import {
  firstIssueByTopLevelPath,
  registerSchema,
  safeParseResult,
} from "@/lib/validation";

function fieldCls(err: boolean, extra = "") {
  const base =
    "rounded-lg border px-3 py-2 text-ink outline-none transition bg-surface focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
  const errCls = err ? "border-red-300" : "border-ink/15";
  return [base, errCls, extra].filter(Boolean).join(" ");
}


function RegisterForm() {
  const t = useTranslations("Register");
  const tNav = useTranslations("Nav");
  const tv = useTranslations("Validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [orcid, setOrcid] = useState("");
  const [reviewKeywords, setReviewKeywords] = useState("");
  const [willingToReview, setWillingToReview] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const parsed = safeParseResult(registerSchema, {
      email,
      password,
      displayName,
      affiliation,
      orcid,
      reviewKeywords,
      willingToReview,
    });
    if (!parsed.ok) {
      setFieldErrors(firstIssueByTopLevelPath(tv, parsed.error));
      return;
    }
    setLoading(true);
    try {
      const d = parsed.data;
      const body: Record<string, unknown> = {
        email: d.email,
        password: d.password,
        displayName: d.displayName,
        willingToReview: d.willingToReview ?? false,
      };
      if (d.affiliation) body.affiliation = d.affiliation;
      if (d.orcid) body.orcid = d.orcid;
      if (d.reviewKeywords) body.reviewKeywords = d.reviewKeywords;

      const data = await apiJson<{ accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStoredToken(data.accessToken);
      const next = sanitizeNextParam(searchParams.get("next"));
      router.push(next ?? "/dashboard");
      router.refresh();
    } catch (err) {
      toastApiError(err, t("registrationFailed"), { id: "register-failed" });
    } finally {
      setLoading(false);
    }
  }

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
          <p className="max-w-md text-sm leading-relaxed text-ink/75">
            {t("hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-8">
          <h1 className="font-serif text-2xl font-semibold text-ink md:hidden">
            {t("title")}
          </h1>
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 md:mt-0">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("displayName")}</span>
          <input
            autoComplete="name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.displayName;
                return n;
              });
            }}
            aria-invalid={!!fieldErrors.displayName}
            className={fieldCls(!!fieldErrors.displayName)}
          />
          {fieldErrors.displayName && (
            <span className="text-sm text-red-700">{fieldErrors.displayName}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("email")}</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.email;
                return n;
              });
            }}
            aria-invalid={!!fieldErrors.email}
            className={fieldCls(!!fieldErrors.email)}
          />
          {fieldErrors.email && (
            <span className="text-sm text-red-700">{fieldErrors.email}</span>
          )}
          <span className="text-xs text-ink/55">{t("emailInstitutionalHint")}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("passwordMin")}</span>
          <PasswordInputWithToggle
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.password;
                return n;
              });
            }}
            aria-invalid={!!fieldErrors.password}
            inputClassName={fieldCls(!!fieldErrors.password)}
            showLabel={t("showPassword")}
            hideLabel={t("hidePassword")}
          />
          {fieldErrors.password && (
            <span className="text-sm text-red-700">{fieldErrors.password}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("affiliation")}</span>
          <input
            value={affiliation}
            onChange={(e) => {
              setAffiliation(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.affiliation;
                return n;
              });
            }}
            placeholder={t("affiliationPlaceholder")}
            aria-invalid={!!fieldErrors.affiliation}
            className={fieldCls(!!fieldErrors.affiliation, "placeholder:text-ink/35")}
          />
          {fieldErrors.affiliation && (
            <span className="text-sm text-red-700">{fieldErrors.affiliation}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("orcid")}</span>
          <input
            value={orcid}
            onChange={(e) => {
              setOrcid(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.orcid;
                return n;
              });
            }}
            placeholder="0000-0000-0000-0000"
            aria-invalid={!!fieldErrors.orcid}
            className={fieldCls(!!fieldErrors.orcid, "font-mono text-sm placeholder:text-ink/35")}
          />
          {fieldErrors.orcid && (
            <span className="text-sm text-red-700">{fieldErrors.orcid}</span>
          )}
          <span className="text-xs text-ink/55">{t("orcidHint")}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t("reviewKeywords")}</span>
          <textarea
            value={reviewKeywords}
            onChange={(e) => {
              setReviewKeywords(e.target.value);
              setFieldErrors((f) => {
                const n = { ...f };
                delete n.reviewKeywords;
                return n;
              });
            }}
            rows={3}
            placeholder={t("reviewKeywordsPlaceholder")}
            aria-invalid={!!fieldErrors.reviewKeywords}
            className={fieldCls(!!fieldErrors.reviewKeywords, "resize-y placeholder:text-ink/35")}
          />
          {fieldErrors.reviewKeywords && (
            <span className="text-sm text-red-700">
              {fieldErrors.reviewKeywords}
            </span>
          )}
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={willingToReview}
            onChange={(e) => setWillingToReview(e.target.checked)}
            className="mt-1 size-4 rounded border-ink/25 text-accent focus:ring-accent"
          />
          <span className="text-ink/90">{t("willingToReview")}</span>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? t("creating") : t("createAccount")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink/70">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    
        </div>
      </div>
    </main>
  );
}

function RegisterFallback() {
  const t = useTranslations("Register");
  return (
    <main className={PAGE_SHELL}>
      <p className="text-sm text-ink/70">{t("title")}…</p>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
