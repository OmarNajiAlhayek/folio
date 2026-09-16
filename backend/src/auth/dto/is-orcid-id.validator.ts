import { ValidateBy, type ValidationOptions } from 'class-validator';
import { normalizeValidOrcidId } from '../orcid-id.util';

/**
 * Canonical ORCID iD with a correct check character. Pair it with a transform
 * that trims and upper-cases, since the canonical form is what gets stored.
 */
export function IsOrcidId(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOrcidId',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizeValidOrcidId(value) === value,
        defaultMessage: () =>
          'orcid must be a valid ORCID iD (0000-0000-0000-000X with a correct check digit)',
      },
    },
    options,
  );
}
