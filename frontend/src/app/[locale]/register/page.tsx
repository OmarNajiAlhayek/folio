"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { sanitizeNextParam } from "@/lib/auth-redirect";
import { toast } from "@/lib/toast";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PAGE_SHELL } from "@/lib/page-shell";
import { PasswordInputWithToggle } from "@/components/password-input-with-toggle";
import { notifyKeywordAddFailure } from "@/components/submission-keyword-suggest";
import { KeywordTagsInput } from "@/components/ui/keyword-tags-input";
import { Spinner } from "@/components/ui/spinner";
import { type KeywordAddFailure, serializeKeywords } from "@/lib/keywords";
import {
  firstIssueByTopLevelPath,
  registerSchema,
  safeParseResult,
} from "@/lib/validation";

function fieldCls(err: boolean, extra = "") {
  const base =
    "w-full rounded-xl border ps-10 pe-3 py-2.5 text-sm text-ink outline-hidden transition bg-paper/60 focus:border-accent focus:ring-2 focus:ring-accent/15 dark:focus:ring-accent/20";
  const errCls = err ? "border-red-400 focus:border-red-400 focus:ring-red-500/15" : "border-ink/15 dark:border-white/15";
  return [base, errCls, extra].filter(Boolean).join(" ");
}

const REGISTER_KEYWORD_TOAST_ID = "register-keyword-add";

function RegisterForm() {
  const t = useTranslations("Register");
  const tNav = useTranslations("Nav");
  const tv = useTranslations("Validation");
  const tWf = useTranslations("SubmissionWorkflow");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [orcid, setOrcid] = useState("");
  const [reviewKeywordTags, setReviewKeywordTags] = useState<string[]>([]);
  const [reviewKeywordDraft, setReviewKeywordDraft] = useState("");
  const [willingToReview, setWillingToReview] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const showApiError = useToastApiError();

  const keywordAddMessages = useMemo(
    () => ({
      max: tWf("keywordSuggestMax"),
      duplicate: tWf("keywordSuggestDuplicate"),
      tooLong: tWf("keywordSuggestTooLong"),
      addAllNone: tWf("keywordSuggestAddAllNone"),
    }),
    [tWf],
  );

  const onReviewKeywordCommitFailure = useCallback(
    (failure: KeywordAddFailure) => {
      if (failure === "max") return;
      notifyKeywordAddFailure(
        failure,
        keywordAddMessages,
        REGISTER_KEYWORD_TOAST_ID,
      );
    },
    [keywordAddMessages],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const draft = reviewKeywordDraft.trim();
    const reviewKeywordsSerialized = (() => {
      if (!draft) return serializeKeywords(reviewKeywordTags);
      const lower = draft.toLowerCase();
      if (reviewKeywordTags.some((x) => x.toLowerCase() === lower)) {
        return serializeKeywords(reviewKeywordTags);
      }
      return serializeKeywords([...reviewKeywordTags, draft]);
    })();
    const parsed = safeParseResult(registerSchema, {
      email,
      password,
      displayName,
      affiliation,
      orcid,
      reviewKeywords: reviewKeywordsSerialized,
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

      await apiJson("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(t("registrationSuccess"), { id: "register-success" });
      const next = sanitizeNextParam(searchParams.get("next"));
      router.push(next ?? "/dashboard");
      router.refresh();
    } catch (err) {
      showApiError(err, t("registrationFailed"), { id: "register-failed" });
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
        <div className="hidden flex-col gap-6 md:flex md:col-span-5 lg:col-span-6">
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

          <p className="max-w-md text-xs leading-relaxed text-ink/60 bg-ink/[0.02] dark:bg-white/[0.02] border border-ink/[0.06] dark:border-white/[0.06] rounded-2xl p-4">
            {t("hint")}
          </p>

          {/* Interactive Feature checklist to maintain cohesive visual with login page */}
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
        <div className="md:col-span-7 lg:col-span-6 relative group rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)] backdrop-blur-md sm:p-8">
          
          <div className="flex flex-col md:hidden mb-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{tNav("brand")}</span>
            <h1 className="font-serif text-2xl font-bold text-ink">
              {t("title")}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-ink/65 bg-ink/5 dark:bg-white/5 rounded-xl p-3">
              {t("hint")}
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            
            {/* Section 1: Account Essentials */}
            <div>
              <h3 className="font-serif text-sm font-semibold text-accent mb-3.5 flex items-center gap-1.5 pb-1 border-b border-ink/[0.06] dark:border-white/[0.06]">
                <span className="text-accent">👤</span>
                {isAr ? "إعداد الحساب الأساسي" : "Core Account Setup"}
              </h3>
              <div className="space-y-3.5">
                
                {/* Display Name Field */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink/80">{t("displayName")}</span>
                  <div className="relative flex items-center">
                    <div className="absolute start-3 pointer-events-none text-ink/35" aria-hidden>
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
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
                  </div>
                  {fieldErrors.displayName && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.displayName}</span>
                  )}
                </label>

                {/* Email Field */}
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
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.email;
                          return n;
                        });
                      }}
                      aria-invalid={!!fieldErrors.email}
                      className={fieldCls(!!fieldErrors.email)}
                    />
                  </div>
                  {fieldErrors.email && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.email}</span>
                  )}
                  <span className="text-[10px] text-ink/50 leading-tight mt-0.5">{t("emailInstitutionalHint")}</span>
                </label>

                {/* Password Field */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink/80">{t("passwordMin")}</span>
                  <div className="relative flex items-center">
                    <div className="absolute start-3 pointer-events-none text-ink/35 z-10" aria-hidden>
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
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
                  </div>
                  {fieldErrors.password && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.password}</span>
                  )}
                </label>

              </div>
            </div>

            {/* Section 2: Academic Profile Details */}
            <div className="mt-4 pt-4 border-t border-ink/[0.08] dark:border-white/[0.08]">
              <h3 className="font-serif text-sm font-semibold text-accent mb-3.5 flex items-center gap-1.5 pb-1 border-b border-ink/[0.06] dark:border-white/[0.06]">
                <span className="text-accent">🎓</span>
                {isAr ? "الملف الأكاديمي وتفضيلات التحكيم" : "Academic Profile & Preferences"}
              </h3>
              <div className="space-y-3.5">
                
                {/* Affiliation Field */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink/85">{t("affiliation")}</span>
                  <div className="relative flex items-center">
                    <div className="absolute start-3 pointer-events-none text-ink/35" aria-hidden>
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                      </svg>
                    </div>
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
                  </div>
                  {fieldErrors.affiliation && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.affiliation}</span>
                  )}
                </label>

                {/* ORCID iD Field */}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink/85">{t("orcid")}</span>
                  <div className="relative flex items-center">
                    <div className="absolute start-3 pointer-events-none text-ink/35 flex items-center justify-center font-bold text-[8px] bg-[#A6C307] text-white size-4 rounded-full tracking-tighter" aria-hidden>iD</div>
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
                      className={fieldCls(!!fieldErrors.orcid, "font-mono text-sm placeholder:text-ink/35 !ps-10")}
                    />
                  </div>
                  {fieldErrors.orcid && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.orcid}</span>
                  )}
                  <span className="text-[10px] text-ink/50 leading-tight mt-0.5">{t("orcidHint")}</span>
                </label>

                {/* Review interests (tag input) */}
                <div className="flex flex-col gap-1 text-sm">
                  <span
                    id="register-review-keywords-label"
                    className="font-semibold text-ink/85"
                  >
                    {t("reviewKeywords")}
                  </span>
                  <div
                    className={
                      fieldErrors.reviewKeywords
                        ? "rounded-md ring-2 ring-red-400/80 ring-offset-1 ring-offset-surface"
                        : undefined
                    }
                  >
                    <KeywordTagsInput
                      tags={reviewKeywordTags}
                      onChange={(next) => {
                        setReviewKeywordTags(next);
                        setFieldErrors((f) => {
                          const n = { ...f };
                          delete n.reviewKeywords;
                          return n;
                        });
                      }}
                      inputValue={reviewKeywordDraft}
                      onInputChange={setReviewKeywordDraft}
                      placeholder={t("reviewKeywordsPlaceholder")}
                      id="register-review-keywords"
                      aria-labelledby="register-review-keywords-label"
                      aria-describedby="register-review-keywords-hint"
                      maxTags={50}
                      maxSerializedLength={2000}
                      locale={isAr ? "ar" : "en"}
                      onCommitFailure={onReviewKeywordCommitFailure}
                    />
                  </div>
                  <span
                    id="register-review-keywords-hint"
                    className="text-[10px] text-ink/50 leading-tight"
                  >
                    {t("reviewKeywordsHint", { count: reviewKeywordTags.length })}
                  </span>
                  {fieldErrors.reviewKeywords && (
                    <span className="text-xs text-red-600 mt-0.5">{fieldErrors.reviewKeywords}</span>
                  )}
                </div>

                {/* Willingness Peer Review checkbox */}
                <label className="relative flex cursor-pointer items-start gap-3 rounded-xl border border-ink/10 dark:border-white/10 bg-paper/30 p-3.5 transition hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]">
                  <input
                    type="checkbox"
                    checked={willingToReview}
                    onChange={(e) => setWillingToReview(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded-md border-ink/25 text-accent focus:ring-accent accent-accent"
                  />
                  <span className="text-xs text-ink/85 leading-normal font-medium select-none">{t("willingToReview")}</span>
                </label>

              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              aria-label={loading ? t("creating") : undefined}
              className="mt-3 inline-flex min-w-[7rem] items-center justify-center rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition-all duration-200"
            >
              {loading ? <Spinner size="sm" className="border-ink/30 border-t-white" /> : t("createAccount")}
            </button>
          </form>

          {/* Login Redirect Link */}
          <div className="mt-6 pt-5 border-t border-ink/[0.08] dark:border-white/[0.08] text-center text-sm text-ink/75">
            {t("hasAccount")}{" "}
            <Link
              href="/login"
              className="font-semibold text-accent hover:underline decoration-offset-2"
            >
              {t("loginLink")}
            </Link>
          </div>

        </div>

      </div>
    </main>
  );
}

function RegisterFallback() {
  const t = useTranslations("Register");
  return (
    <main className={PAGE_SHELL}>
      <div className="flex h-40 items-center justify-center">
        <Spinner size="md" className="border-ink/20 border-t-accent" />
        <span className="ml-2.5 text-sm text-ink/60">{t("title")}…</span>
      </div>
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
