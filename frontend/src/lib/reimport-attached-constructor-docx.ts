import { apiJson } from '@/lib/api';
import type { ConstructorContent } from '@/lib/constructor-content.types';

export type ReimportAttachedConstructorDocxResult = {
  content: ConstructorContent;
  warnings: string[];
  warningCodes?: string[];
};

export async function reimportAttachedConstructorDocx(
  slug: string,
): Promise<ReimportAttachedConstructorDocxResult> {
  return apiJson<ReimportAttachedConstructorDocxResult>(
    `/submissions/${encodeURIComponent(slug)}/reimport-attached-constructor-docx`,
    { method: 'POST' },
  );
}
