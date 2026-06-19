'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BadgeCheck, CloudUpload, Globe } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

type TabKind = 'author' | 'editor' | 'reviewer' | 'copyeditor';

export default function HomePage() {
  const t = useTranslations('Home');
  const [activeTimelineStep, setActiveTimelineStep] = useState<number>(2); // Default to Peer Review

  const features = [
    {
      title: t('featureSubmitTitle'),
      body: t('featureSubmitBody'),
      color: 'border-s-indigo-500',
      icon: (
        <CloudUpload
          className="size-5 text-indigo-500"
          strokeWidth={2}
          aria-hidden
        />
      ),
    },
    {
      title: t('featureReviewTitle'),
      body: t('featureReviewBody'),
      color: 'border-s-accent',
      icon: (
        <BadgeCheck
          className="size-5 text-accent"
          strokeWidth={2}
          aria-hidden
        />
      ),
    },
    {
      title: t('featurePublicTitle'),
      body: t('featurePublicBody'),
      color: 'border-s-emerald-500',
      icon: (
        <Globe
          className="size-5 text-emerald-500"
          strokeWidth={2}
          aria-hidden
        />
      ),
    },
  ];

  // Dynamic content for the Peer Review Simulator widget based on locale and selected tab
  const getSimulatorContent = (tab: TabKind) => {
    switch (tab) {
      case 'author':
        return {
          title: t('simulator.author.title'),
          roleLabel: t('simulator.author.roleLabel'),
          status: t('simulator.author.status'),
          statusColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          statusIndicator: 'bg-amber-500',
          progress: 20,
          milestone: t('simulator.author.milestone'),
          details: t('simulator.author.details'),
          stats: [
            { label: t('simulator.author.statSections'), val: '7' },
            { label: t('simulator.author.statWords'), val: '3,420' },
          ],
        };
      case 'editor':
        return {
          title: t('simulator.editor.title'),
          roleLabel: t('simulator.editor.roleLabel'),
          status: t('simulator.editor.status'),
          statusColor: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
          statusIndicator: 'bg-indigo-500',
          progress: 50,
          milestone: t('simulator.editor.milestone'),
          details: t('simulator.editor.details'),
          stats: [
            {
              label: t('simulator.editor.statReviewers'),
              val: '5',
            },
            { label: t('simulator.editor.statScope'), val: 'Clear' },
          ],
        };
      case 'reviewer':
        return {
          title: t('simulator.reviewer.title'),
          roleLabel: t('simulator.reviewer.roleLabel'),
          status: t('simulator.reviewer.status'),
          statusColor:
            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
          statusIndicator: 'bg-emerald-500',
          progress: 75,
          milestone: t('simulator.reviewer.milestone'),
          details: t('simulator.reviewer.details'),
          stats: [
            { label: t('simulator.reviewer.statTime'), val: '14 Days' },
            {
              label: t('simulator.reviewer.statModel'),
              val: 'Double-Blind',
            },
          ],
        };
      case 'copyeditor':
        return {
          title: t('simulator.copyeditor.title'),
          roleLabel: t('simulator.copyeditor.roleLabel'),
          status: t('simulator.copyeditor.status'),
          statusColor: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
          statusIndicator: 'bg-purple-500',
          progress: 95,
          milestone: t('simulator.copyeditor.milestone'),
          details: t('simulator.copyeditor.details'),
          stats: [
            { label: t('simulator.copyeditor.statFiles'), val: '3' },
            { label: t('simulator.copyeditor.statReady'), val: 'Yes' },
          ],
        };
    }
  };

  const timelineSteps = [
    {
      step: 1,
      title: t('timeline.step1Title'),
      desc: t('timeline.step1Desc'),
    },
    {
      step: 2,
      title: t('timeline.step2Title'),
      desc: t('timeline.step2Desc'),
    },
    {
      step: 3,
      title: t('timeline.step3Title'),
      desc: t('timeline.step3Desc'),
    },
    {
      step: 4,
      title: t('timeline.step4Title'),
      desc: t('timeline.step4Desc'),
    },
    {
      step: 5,
      title: t('timeline.step5Title'),
      desc: t('timeline.step5Desc'),
    },
  ];

  const tabLabels: Record<TabKind, string> = {
    author: t('simulator.tabs.author'),
    editor: t('simulator.tabs.editor'),
    reviewer: t('simulator.tabs.reviewer'),
    copyeditor: t('simulator.tabs.copyeditor'),
  };

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
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      {/* Hero Container */}
      <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center">
        {/* Left Column: Core CTA and Branding */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <span className="inline-flex max-w-fit items-center rounded-full bg-accent/8 dark:bg-accent/18 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {t('badge')}
          </span>

          <h1 className="mt-4 font-serif text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-[3.65rem] lg:text-[4rem]">
            {t('title')}
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink/80 sm:text-lg">
            {t('intro')}
          </p>

          {/* Enhanced Action Buttons with glows */}
          <div className="mt-8 flex flex-wrap gap-4 items-center">
            <Button
              asChild
              variant="primary"
              size="lg"
              className="group relative min-w-0 hover:shadow-[0_0_20px_rgba(196,92,62,0.35)] dark:hover:shadow-[0_0_20px_rgba(212,120,92,0.25)]"
            >
              <Link href="/register">
                {t('createAccount')}
                <span className="ms-1.5 transform transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                  →
                </span>
              </Link>
            </Button>

            <Button
              asChild
              variant="secondary"
              size="lg"
              className="min-w-0 border-accent-2/30 bg-surface/80 text-accent-2 shadow-xs backdrop-blur-md hover:border-accent-2/45 hover:bg-accent-2/8"
            >
              <Link href="/login">{t('logIn')}</Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="lg"
              className="group min-w-0 px-4 text-accent hover:text-accent/85 hover:underline hover:underline-offset-4"
            >
              <Link href="/publications">
                {t('browsePublications')}
                <span className="text-[10px] transition-transform duration-300 group-hover:translate-y-0.5">
                  ▼
                </span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Right Column: Dynamic Role Simulator Widget (WOW Factor!) */}
        <aside className="lg:col-span-5 group relative overflow-hidden rounded-3xl border border-accent-2/20 border-s-4 border-s-accent bg-linear-to-br from-surface/95 via-surface-muted/90 to-accent-2/[0.1] p-6 sm:p-8 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.06),0_30px_60px_-24px_rgba(15,23,42,0.2)] dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)] dark:ring-white/[0.04] backdrop-blur-lg transition-all duration-500 hover:shadow-lg hover:border-accent-2/30">
          {/* Ambient Glow Bubbles */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.4] mix-blend-soft-light dark:opacity-20"
            aria-hidden
          >
            <div className="absolute -start-1/4 -top-1/3 h-[90%] w-[60%] rounded-full bg-[radial-gradient(closest-side,var(--accent),transparent_72%)]" />
            <div className="absolute -bottom-1/3 -end-1/4 h-[75%] w-[50%] rounded-full bg-[radial-gradient(closest-side,var(--accent-2),transparent_70%)]" />
          </div>

          {/* Interactive Role Tabs Selector */}
          <Tabs defaultValue="author" className="relative">
            <TabsList className="mb-5">
              {(
                ['author', 'editor', 'reviewer', 'copyeditor'] as TabKind[]
              ).map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {tabLabels[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            {(['author', 'editor', 'reviewer', 'copyeditor'] as TabKind[]).map(
              (tab) => {
                const sim = getSimulatorContent(tab);
                return (
                  <TabsContent key={tab} value={tab}>
                    <div className="relative bg-surface/40 dark:bg-surface-muted/30 border border-ink/[0.06] dark:border-white/[0.06] rounded-2xl p-5 shadow-xs transition-all duration-300">
                      <div className="flex justify-between items-center gap-3">
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${sim.statusColor}`}
                        >
                          {sim.roleLabel}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`size-2 rounded-full ${sim.statusIndicator} animate-pulse`}
                          />
                          <span className="text-[11px] font-semibold text-ink/75">
                            {sim.status}
                          </span>
                        </div>
                      </div>

                      <h3 className="mt-4 font-serif text-xl font-bold text-ink">
                        {sim.title}
                      </h3>

                      <div className="mt-4">
                        <div className="flex justify-between items-center text-[10px] font-semibold text-ink/55 mb-1.5">
                          <span>{sim.milestone}</span>
                          <span>{sim.progress}%</span>
                        </div>
                        <Progress value={sim.progress} />
                      </div>

                      <p className="mt-4 text-xs leading-relaxed text-ink/70">
                        {sim.details}
                      </p>

                      <div className="mt-5 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06] grid grid-cols-2 gap-4">
                        {sim.stats.map((s) => (
                          <div key={s.label}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-ink/40">
                              {s.label}
                            </p>
                            <p className="text-base font-serif font-bold text-ink mt-0.5">
                              {s.val}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                );
              },
            )}
          </Tabs>

          {/* Footnotes badge */}
          <div className="relative mt-5 text-[10px] text-center text-ink/40 font-medium select-none">
            {t('simulator.tabsHint')}
          </div>
        </aside>
      </div>

      {/* Interactive Peer-Review Process Timeline (Addresses blank space beautifully) */}
      <section className="relative mt-16 pt-8 border-t border-ink/[0.08] dark:border-white/[0.08]">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ink">
            {t('timeline.heading')}
          </h2>
          <p className="text-xs text-ink/65 mt-1.5">{t('timeline.subtitle')}</p>
        </div>

        {/* Timeline Row Grid */}
        <div className="mt-8 grid gap-4 grid-cols-5 md:gap-6">
          {timelineSteps.map((step) => {
            const isStepActive = activeTimelineStep === step.step;
            return (
              <button
                key={step.step}
                type="button"
                aria-pressed={isStepActive}
                onClick={() => setActiveTimelineStep(step.step)}
                className={`group flex flex-col items-center p-3 rounded-2xl border text-center transition-all duration-300 ${
                  isStepActive
                    ? 'bg-surface border-accent shadow-xs dark:bg-surface-2'
                    : 'border-transparent bg-transparent hover:bg-ink/[0.02] dark:hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`flex size-10 items-center justify-center rounded-xl font-bold text-sm shadow-xs transition-all duration-300 ${
                    isStepActive
                      ? 'bg-accent text-white'
                      : 'bg-surface-muted text-ink/60 group-hover:bg-ink/10 dark:bg-surface-2 dark:text-white/70'
                  }`}
                >
                  {step.step}
                </div>
                <span className="hidden sm:block mt-3 text-xs font-serif font-bold text-ink leading-tight truncate w-full">
                  {step.title.split('. ')[1] || step.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeline Tooltip Details Panel */}
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-accent-2/15 bg-surface/50 dark:bg-surface-muted/30 p-5 shadow-xs">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.2] bg-[radial-gradient(ellipse_at_bottom_left,var(--accent),transparent_50%)]"
            aria-hidden
          />
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
        aria-label={t('badge')}
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
              <h2 className="font-serif text-base font-bold text-ink leading-tight">
                {f.title}
              </h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/70">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
