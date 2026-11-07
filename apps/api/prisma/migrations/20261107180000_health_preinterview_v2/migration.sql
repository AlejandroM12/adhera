-- Preentrevista de salud v2. Migración ADITIVA: no borra columnas, tablas ni datos.
-- Las filas existentes de Answer toman instance = '' (pregunta general), por lo que cumplen el nuevo
-- índice único (sessionId, questionId, instance) igual que el anterior (sessionId, questionId).
-- Antes de aplicarla en producción, probala sobre una rama (branch) de Neon. Ver docs/PREENTREVISTA.md.

-- CreateEnum
CREATE TYPE "public"."NoteKind" AS ENUM ('NOTE', 'OBSERVATION', 'CLARIFICATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."QuestionType" ADD VALUE 'multi_choice';
ALTER TYPE "public"."QuestionType" ADD VALUE 'dni';
ALTER TYPE "public"."QuestionType" ADD VALUE 'phone';
ALTER TYPE "public"."QuestionType" ADD VALUE 'email';
ALTER TYPE "public"."QuestionType" ADD VALUE 'locality';

-- DropIndex
DROP INDEX "public"."Answer_sessionId_questionId_key";

-- AlterTable
ALTER TABLE "public"."Answer" ADD COLUMN     "confirmationJson" JSONB,
ADD COLUMN     "instance" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "public"."ConversationSession" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "pendingJson" JSONB,
ADD COLUMN     "reviewConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Note" ADD COLUMN     "kind" "public"."NoteKind" NOT NULL DEFAULT 'NOTE',
ADD COLUMN     "questionKey" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "public"."Question" ADD COLUMN     "metaJson" JSONB;

-- AlterTable
ALTER TABLE "public"."QuestionnaireVersion" ADD COLUMN     "templateKey" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "public"."AnswerRevision" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "previousValueJson" JSONB,
    "previousRawText" TEXT,
    "previousConfirmationJson" JSONB,
    "previousRequestId" TEXT,
    "newValueJson" JSONB,
    "newRawText" TEXT,
    "source" TEXT NOT NULL DEFAULT 'APPLICANT_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnswerRevision_answerId_createdAt_idx" ON "public"."AnswerRevision"("answerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_sessionId_questionId_instance_key" ON "public"."Answer"("sessionId", "questionId", "instance");

-- AddForeignKey
ALTER TABLE "public"."AnswerRevision" ADD CONSTRAINT "AnswerRevision_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "public"."Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

