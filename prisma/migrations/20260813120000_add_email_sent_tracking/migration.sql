-- AlterTable
ALTER TABLE "Issuance" ADD COLUMN "emailSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Issuance" ADD COLUMN "emailSentAt" TIMESTAMP(3);
