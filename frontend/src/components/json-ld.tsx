import { serializeJsonLd, type JsonLdObject } from '@/lib/scholarly-jsonld';

type Props = {
  data: JsonLdObject;
};

/**
 * Embeds structured data as a JSON-LD data block.
 *
 * No CSP nonce is needed and none is applied. A `<script>` whose type is not a
 * JavaScript MIME type is a *data block*: the HTML spec's "prepare the script
 * element" algorithm returns before the CSP inline check ever runs, so the
 * strict `script-src` in `lib/csp.ts` does not apply to it. Adding a nonce here
 * would imply this is executable script, and would tie the component to
 * middleware header propagation for no benefit.
 *
 * The escaping that *does* matter happens in `serializeJsonLd`.
 */
export function JsonLd({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
