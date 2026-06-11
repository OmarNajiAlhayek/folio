import type { FieldErrors, Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { firstIssueByTopLevelPath, type ValidationTranslate } from './errors';

/**
 * Zod resolver that maps schema issues to translated field messages via next-intl.
 * Optional preprocess merges extra fields (e.g. serialized keywords) before parse.
 */
export function translatedZodResolver<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  tv: ValidationTranslate,
  preprocess?: (values: unknown) => unknown,
): Resolver<z.infer<TSchema>> {
  return (values) => {
    const input = preprocess ? preprocess(values) : values;
    const parsed = schema.safeParse(input);
    if (parsed.success) {
      return { values: parsed.data, errors: {} };
    }
    const by = firstIssueByTopLevelPath(tv, parsed.error);
    const errors: FieldErrors<z.infer<TSchema>> = {};
    for (const [key, message] of Object.entries(by)) {
      (errors as Record<string, { type: string; message: string }>)[key] = {
        type: 'validation',
        message,
      };
    }
    return { values: {}, errors };
  };
}
