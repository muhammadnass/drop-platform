-- CreateEnum
CREATE TYPE "KycType" AS ENUM ('NIN', 'BVN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VOICE_NOTE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTransactionType" ADD VALUE 'COMMISSION';
ALTER TYPE "WalletTransactionType" ADD VALUE 'TOPUP';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "itemDescription" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "durationSecs" INTEGER,
ADD COLUMN     "voiceNoteUrl" TEXT;

-- AlterTable
ALTER TABLE "rider_profiles" ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "kycType" "KycType",
ADD COLUMN     "kycValue" TEXT,
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "profilePhotoUrl" TEXT,
ADD COLUMN     "vehiclePlatePhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "paystackRef" TEXT;

-- CreateTable
CREATE TABLE "customer_wallets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balanceNgn" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lifetimeTopupNgn" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountNgn" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "deliveryId" TEXT,
    "paystackRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_stops" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "notes" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "fareNgn" DOUBLE PRECISION NOT NULL,
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "delivery_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_photos" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
    "balanceNgn" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_transactions" (
    "id" TEXT NOT NULL,
    "founderAccountId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "commissionNgn" DOUBLE PRECISION NOT NULL,
    "shareNgn" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_wallets_customerId_key" ON "customer_wallets"("customerId");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_walletId_idx" ON "customer_wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "delivery_stops_deliveryId_idx" ON "delivery_stops"("deliveryId");

-- CreateIndex
CREATE INDEX "delivery_photos_deliveryId_idx" ON "delivery_photos"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "founder_accounts_userId_key" ON "founder_accounts"("userId");

-- CreateIndex
CREATE INDEX "profit_transactions_founderAccountId_idx" ON "profit_transactions"("founderAccountId");

-- CreateIndex
CREATE INDEX "profit_transactions_deliveryId_idx" ON "profit_transactions"("deliveryId");

-- AddForeignKey
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "customer_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_stops" ADD CONSTRAINT "delivery_stops_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_photos" ADD CONSTRAINT "delivery_photos_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_accounts" ADD CONSTRAINT "founder_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_transactions" ADD CONSTRAINT "profit_transactions_founderAccountId_fkey" FOREIGN KEY ("founderAccountId") REFERENCES "founder_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
