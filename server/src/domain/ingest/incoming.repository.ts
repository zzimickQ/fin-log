import { prisma } from "../../lib/db.js";

/** The shape every incoming-transaction read returns. */
export interface IncomingRow {
  id: string;
  source: string | null;
  text: string;
  amount: unknown; // Prisma Decimal
  currency: string;
  occurredAt: Date;
  description: string | null;
  createdAt: Date;
}

/** Normalize a staged row into the API DTO (Decimal → number). */
export function toIncomingDto(row: IncomingRow) {
  return {
    id: row.id,
    source: row.source,
    text: row.text,
    amount: Number(row.amount),
    currency: row.currency,
    occurredAt: row.occurredAt,
    description: row.description,
    createdAt: row.createdAt,
  };
}

/** Columns the API exposes (the row has no secrets, so this is just shape). */
const incomingSelect = {
  id: true,
  source: true,
  text: true,
  amount: true,
  currency: true,
  occurredAt: true,
  description: true,
  createdAt: true,
} as const;

/**
 * IncomingTransaction persistence — the review staging area between an inbound
 * message and a real expense. Every read and write is scoped by `userId`, so a
 * foreign id simply matches nothing.
 */
export const incomingRepository = {
  /** A user's pending transactions, most recently received first. */
  findManyByUser(userId: string, params: { skip: number; take: number }) {
    return prisma.incomingTransaction.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      select: incomingSelect,
      skip: params.skip,
      take: params.take,
    });
  },

  countByUser(userId: string) {
    return prisma.incomingTransaction.count({ where: { userId } });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.incomingTransaction.findFirst({
      where: { id, userId },
      select: incomingSelect,
    });
  },

  /** The subset of `ids` this user actually owns. */
  findByIdsForUser(ids: string[], userId: string) {
    return prisma.incomingTransaction.findMany({
      where: { id: { in: ids }, userId },
      // Oldest first, so moved expenses appear in the order they arrived.
      orderBy: { occurredAt: "asc" },
      select: incomingSelect,
    });
  },

  create(data: {
    userId: string;
    source: string | null;
    text: string;
    amount: number;
    currency: string;
    occurredAt: Date;
  }) {
    return prisma.incomingTransaction.create({
      data,
      select: incomingSelect,
    });
  },

  /** The review label. Owner-scoped, so returns a count rather than throwing. */
  updateDescription(id: string, userId: string, description: string | null) {
    return prisma.incomingTransaction.updateMany({
      where: { id, userId },
      data: { description },
    });
  },

  deleteByIds(ids: string[], userId: string) {
    return prisma.incomingTransaction.deleteMany({
      where: { id: { in: ids }, userId },
    });
  },

  /**
   * The review hand-off: turn each staged row into a real expense and delete
   * it, in one transaction, so a row can never be lost or recorded twice.
   *
   * Lives in the repository (rather than a usecase) because it spans two
   * tables and this codebase keeps multi-write transactions here — see
   * `expenseRepository.categorizeMany`.
   */
  moveToExpenses(params: {
    rows: IncomingRow[];
    ledgerId: string;
    createdById: string;
    categoryId: string | null;
  }) {
    const { rows, ledgerId, createdById, categoryId } = params;
    return prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.expense.create({
          data: {
            ledgerId,
            createdById,
            amount: Number(row.amount),
            currency: row.currency,
            // The label typed during review, else the temporary source label.
            description: row.description ?? row.source ?? null,
            // Keep the raw message now that the staging row disappears.
            note: row.text,
            occurredAt: row.occurredAt,
            categoryId,
          },
        });
        await tx.incomingTransaction.delete({ where: { id: row.id } });
      }
      return rows.length;
    });
  },
};
