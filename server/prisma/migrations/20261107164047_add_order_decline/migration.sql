-- CreateTable
CREATE TABLE "order_declines" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_declines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_declines_riderId_idx" ON "order_declines"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_declines_deliveryId_riderId_key" ON "order_declines"("deliveryId", "riderId");

-- AddForeignKey
ALTER TABLE "order_declines" ADD CONSTRAINT "order_declines_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
