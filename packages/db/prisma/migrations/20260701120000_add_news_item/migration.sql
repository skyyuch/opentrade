-- CreateTable
CREATE TABLE "news_items" (
    "id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "sourceName" VARCHAR(120) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "lang" VARCHAR(10) NOT NULL,
    "symbols" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_items_sourceUrl_key" ON "news_items"("sourceUrl");

-- CreateIndex
CREATE INDEX "news_items_isActive_publishedAt_idx" ON "news_items"("isActive", "publishedAt");
