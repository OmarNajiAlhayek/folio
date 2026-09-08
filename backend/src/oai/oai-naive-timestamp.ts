/**
 * Reconciling `timestamp without time zone` with real instants.
 *
 * `submissions.updated_at` is declared without an explicit type, so Postgres
 * created it as `timestamp without time zone`. Postgres stores the correct UTC
 * wall clock in it, but `node-postgres` parses a naive timestamp as **local**
 * time, so the `Date` TypeORM hands back is displaced by the server's UTC
 * offset — a machine at UTC+3 reads a stored `13:33:30` as `10:33:30Z`.
 *
 * That matters here more than almost anywhere else in the app. An OAI datestamp
 * is the value harvesters record and hand straight back as `from=` on their next
 * incremental harvest, so a displaced datestamp silently drops records from
 * later harvests. It was visible the moment the endpoint ran against real data,
 * and invisible to every spec, because the specs mock the repository.
 *
 * The real fix is `timestamptz` on the column, which is what the newer tables
 * (`journals`, `journal_issues`, `refresh_sessions`, …) already use — but 11
 * entities still carry naive columns, and migrating them is a schema change
 * across the whole application rather than part of this feature. So the
 * displacement is corrected here, at the one boundary that publishes these
 * values to the outside world.
 *
 * Both directions are needed and must stay symmetric: reads are corrected on
 * the way out, and `from`/`until` bounds are displaced on the way in so they
 * compare against what is actually stored.
 *
 * `published_at` is already `timestamptz` and must NOT go through these.
 */

/**
 * A naive-column `Date` (mis-parsed as local) to the instant it represents.
 *
 * Reads the local calendar fields back as UTC. Correct across DST because the
 * fields are exactly what the driver produced from the stored wall clock.
 */
export function naiveColumnToInstant(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    ),
  );
}

/**
 * The inverse: an instant to the local-clock `Date` that TypeORM will serialise
 * into the naive column as the matching wall clock.
 */
export function instantToNaiveColumn(value: Date): Date {
  return new Date(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  );
}
