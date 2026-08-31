-- CreateEnum
CREATE TYPE "FamilyRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_member" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FamilyRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "categoryId" TEXT,
    "paidById" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "description" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_category" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_name_idx" ON "family"("name");

-- CreateIndex
CREATE INDEX "family_member_userId_idx" ON "family_member"("userId");

-- CreateIndex
CREATE INDEX "family_member_familyId_idx" ON "family_member"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "family_member_familyId_userId_key" ON "family_member"("familyId", "userId");

-- CreateIndex
CREATE INDEX "ledger_familyId_idx" ON "ledger"("familyId");

-- CreateIndex
CREATE INDEX "expense_ledgerId_occurredAt_idx" ON "expense"("ledgerId", "occurredAt");

-- CreateIndex
CREATE INDEX "expense_ledgerId_categoryId_idx" ON "expense"("ledgerId", "categoryId");

-- CreateIndex
CREATE INDEX "expense_createdById_idx" ON "expense"("createdById");

-- CreateIndex
CREATE INDEX "expense_paidById_idx" ON "expense"("paidById");

-- CreateIndex
CREATE INDEX "expense_category_familyId_idx" ON "expense_category"("familyId");

-- CreateIndex
CREATE INDEX "expense_category_parentId_idx" ON "expense_category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_familyId_parentId_name_key" ON "expense_category"("familyId", "parentId", "name");

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "expense_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Postgres treats NULLs as distinct in unique constraints, so the composite
-- unique (family_id, parent_id, name) does not cover root categories
-- (parent_id IS NULL). Enforce root-level name uniqueness with a partial index.
CREATE UNIQUE INDEX "expense_category_familyId_name_root_key"
  ON "expense_category" ("familyId", "name")
  WHERE "parentId" IS NULL;
