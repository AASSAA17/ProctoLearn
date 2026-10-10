CREATE TABLE "content_import_receipts" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "revisionHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_import_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "content_import_receipts_courseId_key" ON "content_import_receipts"("courseId");
ALTER TABLE "content_import_receipts" ADD CONSTRAINT "content_import_receipts_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
