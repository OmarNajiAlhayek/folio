import { MigrationInterface, QueryRunner } from 'typeorm';
import { JOURNAL_CATALOG } from '../../journals/journal-catalog';

/**
 * Backfills the ISSN and e-ISSN columns from Damascus University's official
 * ISSN table, supplied 2026-09-12 (docs/EXTERNAL-ACTIONS.md A1).
 *
 * `MultiJournalIssues1783000000000` inserted the nine journal rows without
 * these numbers because nobody had them yet, so a fresh INSERT can no longer
 * carry them — the rows already exist by the time this runs. Hence an UPDATE.
 *
 * **It fills; it never clears or overwrites.** On 2026-09-14 the university
 * made ISSNs editable in the app, by the journal manager and by each journal's
 * editor-in-chief (`JournalMetadataService`). From then on the database, not
 * `JOURNAL_CATALOG`, is the source of truth. A number is written only into a
 * column that is still NULL; anything staff have entered or corrected is left
 * as it is.
 *
 * Six journals have numbers; three do not:
 *
 * - `hisj` (الدراسات التاريخية) — absent from the university's table entirely.
 * - `eduj` (العلوم التربوية والنفسية) — listed as "متوفرة إلكترونياً"
 *   (electronic edition exists) with no number printed.
 * - `agrj` (العلوم الزراعية) — same.
 *
 * NULL is deliberate for those three. Every consumer omits the field when it
 * is null, so an un-numbered journal publishes no ISSN rather than a
 * placeholder a harvester would index forever. Their numbers are entered in the
 * app when they arrive, not by another migration.
 */
export class JournalIssns1783600000000 implements MigrationInterface {
  name = 'JournalIssns1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const journal of JOURNAL_CATALOG) {
      if (!journal.issn && !journal.eissn) continue;
      await queryRunner.query(
        `UPDATE "journals"
            SET "issn" = COALESCE("issn", $1::varchar),
                "eissn" = COALESCE("eissn", $2::varchar),
                "updated_at" = now()
          WHERE "slug" = $3
            AND (("issn" IS NULL AND $1::varchar IS NOT NULL)
              OR ("eissn" IS NULL AND $2::varchar IS NOT NULL))`,
        [journal.issn ?? null, journal.eissn ?? null, journal.slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Removes only the numbers this migration wrote. A different number staff
    // entered since, or one for a journal the table left blank, stays.
    for (const journal of JOURNAL_CATALOG) {
      if (!journal.issn && !journal.eissn) continue;
      await queryRunner.query(
        `UPDATE "journals"
            SET "issn" = CASE WHEN "issn" = $1::varchar THEN NULL ELSE "issn" END,
                "eissn" = CASE WHEN "eissn" = $2::varchar THEN NULL ELSE "eissn" END,
                "updated_at" = now()
          WHERE "slug" = $3
            AND ("issn" = $1::varchar OR "eissn" = $2::varchar)`,
        [journal.issn ?? null, journal.eissn ?? null, journal.slug],
      );
    }
  }
}
