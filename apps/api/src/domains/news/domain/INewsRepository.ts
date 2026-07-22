/**
 * Port for news-item reads.
 *
 * Per DDD rule 10: the domain defines this interface; infrastructure provides
 * the Prisma implementation. Reads are chronological (newest first) and
 * cursor-paginated. Writes (upsert by the fetcher) live in the news-fetcher
 * task, which owns ingestion, so this read port stays minimal.
 */

import type { ListNewsOptions, NewsItemRecord } from './NewsItemEntity.js';

export type INewsRepository = {
  /**
   * Returns active news items, newest first. The caller passes `limit + 1` to
   * detect whether a further page exists; the repository returns at most that
   * many rows.
   */
  list(options: ListNewsOptions): Promise<NewsItemRecord[]>;
};
