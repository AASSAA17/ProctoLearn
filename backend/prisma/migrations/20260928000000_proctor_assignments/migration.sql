CREATE TABLE "exam_proctors" (
  "examId" TEXT NOT NULL,
  "proctorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exam_proctors_pkey" PRIMARY KEY ("examId", "proctorId"),
  CONSTRAINT "exam_proctors_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exam_proctors_proctorId_fkey" FOREIGN KEY ("proctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "exam_proctors_proctorId_idx" ON "exam_proctors"("proctorId");
