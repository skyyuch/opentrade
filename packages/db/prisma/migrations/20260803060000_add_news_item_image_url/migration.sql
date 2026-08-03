-- ADR-0060: add the publisher's own RSS-provided thumbnail URL to news items.
-- Additive + nullable: existing rows keep NULL until the news-fetcher backfills
-- them on the next poll. Stored as a URL only (never re-hosted).
ALTER TABLE "news_items" ADD COLUMN "imageUrl" VARCHAR(2048);
