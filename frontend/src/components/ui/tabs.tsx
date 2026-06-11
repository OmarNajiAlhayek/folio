'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex flex-wrap gap-1 rounded-xl bg-ink/[0.04] p-1 dark:bg-white/[0.04]',
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-300',
        'text-ink/65 hover:bg-ink/[0.02] hover:text-ink dark:hover:bg-white/[0.02]',
        'data-[state=active]:border data-[state=active]:border-ink/[0.06] data-[state=active]:bg-surface data-[state=active]:text-accent data-[state=active]:shadow-xs',
        'dark:data-[state=active]:bg-surface-2 dark:data-[state=active]:text-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1',
        className,
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
