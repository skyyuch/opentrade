-- CreateIndex
CREATE INDEX "reviews_respondsToReviewId_idx" ON "reviews"("respondsToReviewId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_respondsToReviewId_fkey" FOREIGN KEY ("respondsToReviewId") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
