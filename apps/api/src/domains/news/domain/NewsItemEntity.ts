/**
 * Domain types for the news bounded context (per ADR-0057).
 *
 * Aggregated third-party news headlines are global reference data (no
 * tenantId, ADR-0057 D5). The compliance contract (ADR-0057 D1) means a record
 * carries ONLY the headline, source attribution, canonical outbound link, and
 * the publisher timestamp — never an article body. The domain layer keeps zero
 * infrastructure imports (rule 10).
 */

export type NewsItemRecord = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: Date;
  lang: string;
  /**
   * Publisher's own feed-provided thumbnail URL (ADR-0060). `null` when the
   * source feed carried no media — the record is otherwise unchanged.
   */
  imageUrl: string | null;
};

export type ListNewsOptions = {
  limit: number;
  /** Opaque cursor — the `id` of the last item from the previous page. */
  cursor?: string;
  /**
   * Forward-compatible per-instrument filter seam (ADR-0057 D4). Matches an
   * `Instrument.symbol` code against `NewsItem.symbols`. Unused by the MVP UI
   * (the standalone feed has no instrument context yet); wired so the future
   * quotes vertical's related-news is a data-population task, not a rewrite.
   */
  symbol?: string;
};
