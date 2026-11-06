-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "public"."Channel" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "public"."Application" ADD COLUMN     "handoffRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."ConversationSession" ADD COLUMN     "channel" "public"."Channel" NOT NULL DEFAULT 'SIMULATOR',
ADD COLUMN     "contactId" TEXT;

-- CreateTable
CREATE TABLE "public"."ChannelContact" (
    "id" TEXT NOT NULL,
    "channel" "public"."Channel" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalChannelId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "botPausedAt" TIMESTAMP(3),
    "invalidStreak" INTEGER NOT NULL DEFAULT 0,
    "lastHandoffNoticeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InboundMessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageDelivery" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sessionId" TEXT,
    "externalId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "public"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelContact_channel_externalUserId_externalChannelId_key" ON "public"."ChannelContact"("channel", "externalUserId", "externalChannelId");

-- CreateIndex
CREATE INDEX "InboundMessage_receivedAt_idx" ON "public"."InboundMessage"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDelivery_externalId_key" ON "public"."MessageDelivery"("externalId");

-- CreateIndex
CREATE INDEX "MessageDelivery_contactId_createdAt_idx" ON "public"."MessageDelivery"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationSession_contactId_status_idx" ON "public"."ConversationSession"("contactId", "status");

-- AddForeignKey
ALTER TABLE "public"."ConversationSession" ADD CONSTRAINT "ConversationSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."ChannelContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InboundMessage" ADD CONSTRAINT "InboundMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."ChannelContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageDelivery" ADD CONSTRAINT "MessageDelivery_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."ChannelContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
