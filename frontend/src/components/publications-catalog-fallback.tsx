'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonBusyRegion } from '@/components/ui/skeleton-loading-status';

export function PublicationsCatalogFallback() {
  const t = useTranslations('Publications');

  return (
    <SkeletonBusyRegion label={t('loading')} className="mt-6">
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ '--sk-delay': `${i * 75}ms` } as React.CSSProperties}
            className="rounded-2xl border border-ink/10 bg-surface/85 p-6 space-y-3"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 w-28 rounded-full" />
            </div>
            <Skeleton className="h-8 max-w-xl rounded-xl" />
            <Skeleton className="h-3 w-48" />
            <div className="mt-2 border-s-4 border-ink/10 ps-4 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 max-w-lg" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonBusyRegion>
  );
}
