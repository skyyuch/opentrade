-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "sourceLocale" TEXT;

-- CreateTable
CREATE TABLE "review_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "translatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_translations_reviewId_locale_key" ON "review_translations"("reviewId", "locale");

-- AddForeignKey
ALTER TABLE "review_translations" ADD CONSTRAINT "review_translations_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
