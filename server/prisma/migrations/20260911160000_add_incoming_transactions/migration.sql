-- Staging table for transactions parsed out of inbound messages (bank SMS
-- forwarded by a phone automation). Rows are ledgerless and unlabeled until a
-- human reviews them; review moves the row into "expense" and deletes it.

-- CreateTable
CREATE TABLE "incoming_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT,
    "text" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incoming_transaction_userId_occurredAt_idx" ON "incoming_transaction"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "incoming_transaction" ADD CONSTRAINT "incoming_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
