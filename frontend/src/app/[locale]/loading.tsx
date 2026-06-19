import { getTranslations } from 'next-intl/server';
import { LoadingCenter } from '@/components/ui/spinner';

export default async function LocaleLoading() {
  const t = await getTranslations('Common');
  return (
    <LoadingCenter
      label={t('loading')}
      className="mx-auto max-w-lg px-4 text-sm text-ink/70"
    />
  );
}
