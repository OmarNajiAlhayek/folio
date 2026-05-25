"use client";

import type { ComponentProps, ComponentType } from "react";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";

export type RouteErrorCopy = {
  title: string;
  description: string;
  retry: string;
  backHome: string;
  browsePublications: string;
};

type LinkProps = ComponentProps<"a"> & { href: string };

type Props = {
  copy: RouteErrorCopy;
  onReset: () => void;
  homeHref: string;
  publicationsHref: string;
  LinkComponent: ComponentType<LinkProps>;
};

export function RouteErrorFallback({
  copy,
  onReset,
  homeHref,
  publicationsHref,
  LinkComponent: Link,
}: Props) {
  return (
    <main className={PAGE_SHELL_NARROW}>
      <div className="rounded-2xl border border-red-200/80 bg-red-50/70 px-6 py-10 text-center shadow-sm dark:border-red-900/40 dark:bg-red-950/30 sm:px-10">
        <p
          className="font-serif text-5xl font-semibold tracking-tight text-red-800/80 dark:text-red-300/90"
          aria-hidden
        >
          !
        </p>
        <h1 className="mt-4 font-serif text-2xl font-semibold text-ink">
          {copy.title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70">
          {copy.description}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {copy.retry}
          </button>
          <Link
            href={homeHref}
            className="inline-flex rounded-md border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
          >
            {copy.backHome}
          </Link>
          <Link
            href={publicationsHref}
            className="inline-flex rounded-md border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
          >
            {copy.browsePublications}
          </Link>
        </div>
      </div>
    </main>
  );
}
