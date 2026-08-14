-- CreateEnum
CREATE TYPE "PromoCodeStatus" AS ENUM ('ASSIGNED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountNodeId" TEXT NOT NULL,
    "status" "PromoCodeStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issuance" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resentAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Issuance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_discountNodeId_key" ON "PromoCode"("discountNodeId");

-- CreateIndex
CREATE INDEX "PromoCode_status_idx" ON "PromoCode"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Issuance_email_key" ON "Issuance"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Issuance_promoCodeId_key" ON "Issuance"("promoCodeId");

-- AddForeignKey
ALTER TABLE "Issuance" ADD CONSTRAINT "Issuance_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
