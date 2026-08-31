import { prisma } from "../../lib/db.js";
import type { ExpenseWhereInput } from "../../generated/prisma/models/Expense.js";

/** Per-ledger totals computed from the expense table. */
export interface LedgerTotals {
  count: number;
  uncategorized: number;
  sum: number;
}

/** Relations included on every expense read (API shape). */
export const expenseInclude = {
  category: { select: { id: true, name: true, parentId: true } },
  createdBy: { select: { id: true, name: true, email: true, image: true } },
  paidBy: { select: { id: true, name: true, email: true, image: true } },
} as const;

export interface ExpenseCreateInput {
  ledgerId: string;
  createdById: string;
  amount: number;
  currency: string;
  description: string | null;
  note: string | null;
  occurredAt: Date;
  categoryId: string | null;
  paidById: string | null;
}

export interface ExpenseUpdateInput {
  amount?: number;
  currency?: string;
  description?: string | null;
  note?: string | null;
  occurredAt?: Date;
  categoryId?: string | null;
  paidById?: string | null;
}

/** Expense persistence + aggregations. */
export const expenseRepository = {
  /** Minimal row so the caller can resolve the ledger. */
  findById(expenseId: string) {
    return prisma.expense.findUnique({
      where: { id: expenseId },
      select: { ledgerId: true },
    });
  },

  /** Totals per ledger for every ledger of a family (dashboard/family view). */
  async groupTotalsByLedger(familyId: string): Promise<Map<string, LedgerTotals>> {
    const rows = await prisma.expense.groupBy({
      by: ["ledgerId", "categoryId"],
      where: { ledger: { familyId } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    return toTotalsMap(rows);
  },

  /** Totals for a single ledger. */
  async getLedgerTotals(ledgerId: string): Promise<LedgerTotals> {
    const rows = await prisma.expense.groupBy({
      by: ["categoryId"],
      where: { ledgerId },
      _count: { _all: true },
      _sum: { amount: true },
    });
    let count = 0;
    let uncategorized = 0;
    let sum = 0;
    for (const row of rows) {
      count += row._count._all;
      sum += Number(row._sum.amount ?? 0);
      if (row.categoryId === null) uncategorized += row._count._all;
    }
    return { count, uncategorized, sum };
  },

  findMany(params: {
    where: ExpenseWhereInput;
    skip: number;
    take: number;
  }) {
    return prisma.expense.findMany({
      where: params.where,
      include: expenseInclude,
      orderBy: { occurredAt: "desc" },
      skip: params.skip,
      take: params.take,
    });
  },

  count(where: ExpenseWhereInput) {
    return prisma.expense.count({ where });
  },

  create(data: ExpenseCreateInput) {
    return prisma.expense.create({ data, include: expenseInclude });
  },

  update(expenseId: string, data: ExpenseUpdateInput) {
    return prisma.expense.update({
      where: { id: expenseId },
      data,
      include: expenseInclude,
    });
  },

  deleteById(expenseId: string) {
    return prisma.expense.delete({ where: { id: expenseId } });
  },

  /** Latest expenses across all families the user belongs to (dashboard). */
  findRecentForUser(userId: string, limit: number) {
    return prisma.expense.findMany({
      where: {
        ledger: {
          family: { members: { some: { userId } } },
        },
      },
      include: {
        ...expenseInclude,
        ledger: {
          select: {
            id: true,
            name: true,
            family: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  },
};

type TotalsRow = {
  ledgerId: string;
  categoryId: string | null;
  _count: { _all: number };
  _sum: { amount: unknown };
};

function toTotalsMap(rows: TotalsRow[]): Map<string, LedgerTotals> {
  const totals = new Map<string, LedgerTotals>();
  for (const row of rows) {
    const t = totals.get(row.ledgerId) ?? {
      count: 0,
      uncategorized: 0,
      sum: 0,
    };
    t.count += row._count._all;
    t.sum += Number(row._sum.amount ?? 0);
    if (row.categoryId === null) t.uncategorized += row._count._all;
    totals.set(row.ledgerId, t);
  }
  return totals;
}
