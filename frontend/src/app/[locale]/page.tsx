"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { PAGE_SHELL } from "@/lib/page-shell";

type TabKind = "author" | "editor" | "reviewer" | "copyeditor";

export default function HomePage() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<TabKind>("author");
  const [activeTimelineStep, setActiveTimelineStep] = useState<number>(2); // Default to Peer Review

  const features = [
    {
      title: t("featureSubmitTitle"),
      body: t("featureSubmitBody"),
      color: "border-s-indigo-500",
      icon: (
        <svg className="size-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
        </svg>
      )
    },
    {
      title: t("featureReviewTitle"),
      body: t("featureReviewBody"),
      color: "border-s-accent",
      icon: (
        <svg className="size-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      )
    },
    {
      title: t("featurePublicTitle"),
      body: t("featurePublicBody"),
      color: "border-s-emerald-500",
      icon: (
        <svg className="size-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
        </svg>
      )
    },
  ];

  // Dynamic content for the Peer Review Simulator widget based on locale and selected tab
  const getSimulatorContent = (tab: TabKind) => {
    const isAr = locale === "ar";
    switch (tab) {
      case "author":
        return {
          title: isAr ? "تقديم المخطوطة البحثية" : "Submit Manuscript",
          roleLabel: isAr ? "مؤلف ✍️" : "Author ✍️",
          status: isAr ? "مسودة نشطة" : "Active Draft",
          statusColor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
          statusIndicator: "bg-amber-500",
          progress: 20,
          milestone: isAr ? "منشئ النصوص نشط" : "Word Constructor Active",
          details: isAr
            ? "كتابة البحث قسماً بقسم باللغتين العربية والإنجليزية. يقوم النظام بتوليد ملف DOCX منسق ومطابق كلياً لمعايير المجلة."
            : "Write your manuscript block-by-block. The system compiles a journal-compliant DOCX with bilingual support.",
          stats: [
            { label: isAr ? "الأقسام المكتوبة" : "Sections Added", val: "7" },
            { label: isAr ? "الكلمات المقدرة" : "Est. Words", val: "3,420" }
          ]
        };
      case "editor":
        return {
          title: isAr ? "فرز وفحص طلبات النشر" : "Editorial Desk Triage",
          roleLabel: isAr ? "محرر 🔍" : "Editor 🔍",
          status: isAr ? "قيد التقييم" : "Under Desk Review",
          statusColor: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
          statusIndicator: "bg-indigo-500",
          progress: 50,
          milestone: isAr ? "اقتراح الحقل بالذكاء الاصطناعي" : "AI Academic Field Triage",
          details: isAr
            ? "يقوم الذكاء الاصطناعي باقتراح التخصص الأكاديمي من العنوان والملخص لتسهيل التوزيع وتجنب تعارض المصالح."
            : "AI automatically scans keywords and abstracts to suggest specific academic fields, enabling instant editor assignment.",
          stats: [
            { label: isAr ? "المحكمون المقترحون" : "Suggested Reviewers", val: "5" },
            { label: isAr ? "تحذيرات النطاق" : "Scope Check", val: "Clear" }
          ]
        };
      case "reviewer":
        return {
          title: isAr ? "تحكيم أقران معمي الطرفين" : "Double-Blind Review",
          roleLabel: isAr ? "مُحكّم 🛡️" : "Reviewer 🛡️",
          status: isAr ? "بانتظار التقارير" : "Awaiting Evaluation",
          statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
          statusIndicator: "bg-emerald-500",
          progress: 75,
          milestone: isAr ? "مراجعة سرية للمحرر" : "Author Feedback & Confidential Notes",
          details: isAr
            ? "تنزيل حزم التحكيم بأمان. كتابة تقرير وافٍ للمؤلف، وتدوين ملاحظات تقييم سرية خاصة بالمحرر فقط."
            : "Download secure reviewer packages. Submit formatted evaluation reports to authors and private notes directly to editors.",
          stats: [
            { label: isAr ? "الوقت المتبقي" : "Time Allotted", val: "14 Days" },
            { label: isAr ? "نموذج التحكيم" : "Review Model", val: "Double-Blind" }
          ]
        };
      case "copyeditor":
        return {
          title: isAr ? "التدقيق اللغوي النهائي" : "Interactive Copyediting",
          roleLabel: isAr ? "مدقق لغوي 📝" : "Copyeditor 📝",
          status: isAr ? "جولات تنقيح نشطة" : "Active Query Round",
          statusColor: "bg-purple-500/10 text-purple-500 border-purple-500/20",
          statusIndicator: "bg-purple-500",
          progress: 95,
          milestone: isAr ? "جاهز للنشر الورقي" : "Final Layout Publication",
          details: isAr
            ? "تبادل الملاحظات وجولات التصحيح والملفات المنقحة مع المؤلف مباشرة لحين النشر الفوري في الكتالوج المفتوح."
            : "Engage in multi-round query threads with authors. Upload final revised manuscripts and publish them directly to the open catalog.",
          stats: [
            { label: isAr ? "الملفات المنقحة" : "Revised Files", val: "3" },
            { label: isAr ? "جاهز للنشر" : "Ready to Publish", val: "Yes" }
          ]
        };
    }
  };

  // Interactive timeline step data
  const timelineSteps = [
    {
      step: 1,
      title: locale === "ar" ? "1. مسودة البحث" : "1. Draft Workspace",
      desc: locale === "ar" 
        ? "يكتب الباحث مخطوطته عبر منشئ النصوص أو يرفع ملف .docx جاهز مع المرفقات." 
        : "Authors write section-by-section inside the Word Constructor or upload their preparated .docx files."
    },
    {
      step: 2,
      title: locale === "ar" ? "2. الفرز الأولي" : "2. Editor Triage",
      desc: locale === "ar"
        ? "يفحص المحرر البحث بمساعدة اقتراحات الذكاء الاصطناعي ويوزعه على المحكمين."
        : "Handling editors evaluate the incoming manuscript, verify the academic scope, and assign peer reviewers."
    },
    {
      step: 3,
      title: locale === "ar" ? "3. تحكيم الأقران" : "3. Peer Review",
      desc: locale === "ar"
        ? "يقوم المحكمون بتحكيم البحث بشكل معمي بالكامل مع توفير تذكيرات آلية بالبريد."
        : "Reviewers conduct secure double-blind evaluation of the review package, submitting separate logs for authors and editors."
    },
    {
      step: 4,
      title: locale === "ar" ? "4. التدقيق اللغوي" : "4. Copyediting",
      desc: locale === "ar"
        ? "يتعاون المدقق اللغوي مع الباحث لتسوية أي استفسارات وتعديل الملف النهائي."
        : "Copyeditors raise structured rounds of author-facing queries to finalize typesetting and manuscript parameters."
    },
    {
      step: 5,
      title: locale === "ar" ? "5. الكتالوج العام" : "5. Open Publication",
      desc: locale === "ar"
        ? "يُنشر المقال فورياً في الكتالوج العام المفتوح للجميع للبحث والتصفح."
        : "The accepted scholarly article is instantly published to the public searchable catalog with abstracts and PDF links."
    }
  ];

  const activeSim = getSimulatorContent(activeTab);

  return (
    <main className={`relative ${PAGE_SHELL} overflow-hidden`}>
      {/* Dynamic Background Layout with grid overlays and radial glow */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-12 h-64 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,var(--page-glow-accent),transparent_70%)] sm:h-80"
        aria-hidden
      />
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
        aria-hidden
      />

      {/* Hero Container */}
      <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center">
        
        {/* Left Column: Core CTA and Branding */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <span className="inline-flex max-w-fit items-center rounded-full bg-accent/8 dark:bg-accent/18 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {t("badge")}
          </span>
          
          <h1 className="mt-4 font-serif text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-[3.65rem] lg:text-[4rem]">
            {t("title")}
          </h1>
          
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink/80 sm:text-lg">
            {t("intro")}
          </p>
          
          {/* Enhanced Action Buttons with glows */}
          <div className="mt-8 flex flex-wrap gap-4 items-center">
            <Link
              href="/register"
              className="group relative inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-300 hover:shadow-[0_0_20px_rgba(196,92,62,0.35)] dark:hover:shadow-[0_0_20px_rgba(212,120,92,0.25)]"
            >
              {t("createAccount")}
              <span className="ml-1.5 rtl:mr-1.5 rtl:ml-0 transform transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">→</span>
            </Link>
            
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-accent-2/30 bg-surface/80 px-6 py-3 text-sm font-semibold text-accent-2 shadow-xs backdrop-blur-md transition-all duration-300 hover:bg-accent-2/8 hover:border-accent-2/45 active:scale-[0.98]"
            >
              {t("logIn")}
            </Link>
            
            <Link
              href="/publications"
              className="group inline-flex items-center gap-1 px-4 py-3 text-sm font-semibold text-accent transition-all duration-200 hover:text-accent/85 underline-offset-4 hover:underline"
            >
              {t("browsePublications")}
              <span className="text-[10px] transform transition-transform duration-300 group-hover:translate-y-0.5">▼</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Dynamic Role Simulator Widget (WOW Factor!) */}
        <aside className="lg:col-span-5 group relative overflow-hidden rounded-3xl border border-accent-2/20 border-s-4 border-s-accent bg-linear-to-br from-surface/95 via-surface-muted/90 to-accent-2/[0.1] p-6 sm:p-8 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.06),0_30px_60px_-24px_rgba(15,23,42,0.2)] dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)] dark:ring-white/[0.04] backdrop-blur-lg transition-all duration-500 hover:shadow-lg hover:border-accent-2/30">
          
          {/* Ambient Glow Bubbles */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.4] mix-blend-soft-light dark:opacity-20" aria-hidden>
            <div className="absolute -start-1/4 -top-1/3 h-[90%] w-[60%] rounded-full bg-[radial-gradient(closest-side,var(--accent),transparent_72%)]" />
            <div className="absolute -bottom-1/3 -end-1/4 h-[75%] w-[50%] rounded-full bg-[radial-gradient(closest-side,var(--accent-2),transparent_70%)]" />
          </div>

          {/* Interactive Role Tabs Selector */}
          <div className="relative mb-5 flex flex-wrap gap-1 bg-ink/[0.04] dark:bg-white/[0.04] p-1 rounded-xl">
            {(["author", "editor", "reviewer", "copyeditor"] as TabKind[]).map((tab) => {
              const isSelected = activeTab === tab;
              const label =
                tab === "author"
                  ? (locale === "ar" ? "المؤلف" : "Author")
                  : tab === "editor"
                    ? (locale === "ar" ? "المحرر" : "Editor")
                    : tab === "reviewer"
                      ? (locale === "ar" ? "المحكّم" : "Reviewer")
                      : (locale === "ar" ? "المدقق" : "Copyeditor");
              
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 text-center py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-300 ${
                    isSelected
                      ? "bg-surface text-accent shadow-xs border border-ink/[0.06] dark:bg-surface-2 dark:text-accent"
                      : "text-ink/65 hover:text-ink hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Simulator Card Box Content */}
          <div className="relative bg-surface/40 dark:bg-surface-muted/30 border border-ink/[0.06] dark:border-white/[0.06] rounded-2xl p-5 shadow-xs transition-all duration-300">
            <div className="flex justify-between items-center gap-3">
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${activeSim.statusColor}`}>
                {activeSim.roleLabel}
              </span>
              
              {/* Dynamic Status Pill */}
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${activeSim.statusIndicator} animate-pulse`} />
                <span className="text-[11px] font-semibold text-ink/75">{activeSim.status}</span>
              </div>
            </div>

            <h3 className="mt-4 font-serif text-xl font-bold text-ink">
              {activeSim.title}
            </h3>

            {/* Simulated Dynamic Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between items-center text-[10px] font-semibold text-ink/55 mb-1.5">
                <span>{activeSim.milestone}</span>
                <span>{activeSim.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-ink/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${activeSim.progress}%` }} 
                />
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink/70">
              {activeSim.details}
            </p>

            {/* Simulated Live Metadata Statistics */}
            <div className="mt-5 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06] grid grid-cols-2 gap-4">
              {activeSim.stats.map((s) => (
                <div key={s.label}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-ink/40">{s.label}</p>
                  <p className="text-base font-serif font-bold text-ink mt-0.5">{s.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footnotes badge */}
          <div className="relative mt-5 text-[10px] text-center text-ink/40 font-medium select-none">
            {locale === "ar"
              ? "انقر فوق علامات التبويب أعلاه لتصفح مراحل تدفق العمل العلمي"
              : "Click the tabs above to preview scholarly editorial steps"}
          </div>

        </aside>

      </div>

      {/* Interactive Peer-Review Process Timeline (Addresses blank space beautifully) */}
      <section className="relative mt-16 pt-8 border-t border-ink/[0.08] dark:border-white/[0.08]">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            {locale === "ar" ? "مسار حياة المخطوطة الأكاديمية" : "Scholarly Lifecycle Timeline"}
          </h2>
          <p className="text-xs text-ink/65 mt-1.5">
            {locale === "ar"
              ? "خمس مراحل دقيقة تضمن رصانة وتوثيق المحتوى العلمي المقبول للنشر."
              : "Explore the five rigorous phases that secure scientific excellence from drafting to catalog listing."}
          </p>
        </div>

        {/* Timeline Row Grid */}
        <div className="mt-8 grid gap-4 grid-cols-5 md:gap-6">
          {timelineSteps.map((step) => {
            const isStepActive = activeTimelineStep === step.step;
            return (
              <button
                key={step.step}
                type="button"
                onClick={() => setActiveTimelineStep(step.step)}
                className={`group flex flex-col items-center p-3 rounded-2xl border text-center transition-all duration-300 ${
                  isStepActive
                    ? "bg-surface border-accent shadow-xs dark:bg-surface-2"
                    : "border-transparent bg-transparent hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]"
                }`}
              >
                <div className={`flex size-10 items-center justify-center rounded-xl font-bold text-sm shadow-xs transition-all duration-300 ${
                  isStepActive
                    ? "bg-accent text-white"
                    : "bg-surface-muted text-ink/60 group-hover:bg-ink/10 dark:bg-surface-2 dark:text-white/70"
                }`}>
                  {step.step}
                </div>
                <span className="hidden sm:block mt-3 text-xs font-serif font-bold text-ink leading-tight truncate w-full">
                  {step.title.split(". ")[1] || step.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeline Tooltip Details Panel */}
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-accent-2/15 bg-surface/50 dark:bg-surface-muted/30 p-5 shadow-xs">
          <div className="pointer-events-none absolute inset-0 opacity-[0.2] bg-[radial-gradient(ellipse_at_bottom_left,var(--accent),transparent_50%)]" aria-hidden />
          <div className="relative">
            <h4 className="font-serif text-base font-bold text-accent">
              {timelineSteps[activeTimelineStep - 1].title}
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-ink/75">
              {timelineSteps[activeTimelineStep - 1].desc}
            </p>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid Section */}
      <section
        className="relative mt-8 grid gap-4 sm:grid-cols-3"
        aria-label={t("badge")}
      >
        {features.map((f) => (
          <div
            key={f.title}
            className={`group rounded-2xl border border-ink/10 bg-surface/85 p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-accent-2/30 hover:shadow-md border-s-4 ${f.color}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.04] dark:bg-white/[0.04] transition-transform duration-300 group-hover:scale-110">
                {f.icon}
              </div>
              <h2 className="font-serif text-base font-bold text-ink leading-tight">{f.title}</h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/70">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
