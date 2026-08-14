-- CreateTable
CREATE TABLE "PromoSettings" (
    "shop" TEXT NOT NULL,
    "discountTitle" TEXT NOT NULL,
    "discountPercentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoSettings_pkey" PRIMARY KEY ("shop")
);
