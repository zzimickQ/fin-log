import {
  expenseRepository,
} from "./expense.repository.js";
import { categoryRepository } from "../category/category.repository.js";
import { familyRepository } from "../family/family.repository.js";
import { ledgerRepository } from "../ledger/ledger.repository.js";
import { badRequest, notFound } from "../../lib/errors.js";
import {
  requireFamilyMembership,
  requireLedgerAccess,
} from "../../lib/guards.js";
import type { ExpenseWhereInput } from "../../generated/prisma/models/Expense.js";

/**
 * Expense usecases — "capture first, categorize later" is a first-class
 * flow: `categoryId` is optional everywhere and can be assigned/cleared
 * after the fact via categorizeExpense.
 */

// ---------- DTO mapping ----------

export interface ExpenseRow {
  id: string;
  ledgerId: string;
  amount: unknown; // Prisma Decimal (or number in tests)
  currency: string;
  description: string | null;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
  category: { id: string; name: string; parentId: string | null } | null;
  createdBy: { id: string; name: string; email: string; image: string | null };
  paidBy: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
}

/** Normalize a Prisma expense row into the API DTO (Decimal → number). */
export function toExpenseDto(e: ExpenseRow) {
  return {
    id: e.id,
    ledgerId: e.ledgerId,
    amount: Number(e.amount),
    currency: e.currency,
    description: e.description,
    note: e.note,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
    category: e.category,
    createdBy: e.createdBy,
    paidBy: e.paidBy,
  };
}

// ---------- shared validation ----------

interface LinkInput {
  categoryId?: string | null;
  paidById?: string | null;
}

/**
 * Verify the payer is a family member and the category belongs to the
 * family that owns the ledger the expense is recorded in.
 */
async function validateLinks(
  familyId: string,
  input: LinkInput,
): Promise<void> {
  if (input.categoryId !== undefined && input.categoryId !== null) {
    const category = await categoryRepository.findById(input.categoryId);
    if (!category) throw notFound("Category not found");
    if (category.familyId !== familyId) {
      throw badRequest("Category does not belong to this family");
    }
  }
  if (input.paidById !== undefined && input.paidById !== null) {
    const payer = await familyRepository.findMembership(familyId, input.paidById);
    if (!payer) {
      throw badRequest("Payer must be a member of this family");
    }
  }
}

// ---------- usecases ----------

export interface ExpenseListFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  uncategorized?: boolean;
  createdById?: string;
  search?: string;
  sort?: "newest" | "oldest" | "highest" | "lowest";
  limit: number;
  offset: number;
}

export async function listExpenses(
  userId: string,
  ledgerId: string,
  filters: ExpenseListFilters,
) {
  await requireLedgerAccess(userId, ledgerId);

  const where: ExpenseWhereInput = {
    ledgerId,
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
    ...(filters.uncategorized ? { categoryId: null } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.createdById ? { createdById: filters.createdById } : {}),
    ...(filters.search
      ? {
          OR: [
            { description: { contains: filters.search, mode: "insensitive" } },
            { note: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [expenses, total] = await Promise.all([
    expenseRepository.findMany({
      where,
      skip: filters.offset,
      take: filters.limit,
      ...(filters.sort
        ? {
            orderBy: toExpenseOrder(filters.sort),
          }
        : {}),
    }),
    expenseRepository.count(where),
  ]);

  return { expenses: expenses.map(toExpenseDto), total };
}

/** Sort id → repository order. */
function toExpenseOrder(
  sort: "newest" | "oldest" | "highest" | "lowest",
): { field: "occurredAt" | "amount"; dir: "asc" | "desc" } {
  switch (sort) {
    case "oldest":
      return { field: "occurredAt", dir: "asc" };
    case "highest":
      return { field: "amount", dir: "desc" };
    case "lowest":
      return { field: "amount", dir: "asc" };
    default:
      return { field: "occurredAt", dir: "desc" };
  }
}

export async function createExpense(
  userId: string,
  ledgerId: string,
  input: {
    amount: number;
    currency?: string;
    description?: string;
    note?: string;
    occurredAt?: string;
    categoryId?: string | null;
    paidById?: string | null;
  },
) {
  const ledger = await requireLedgerAccess(userId, ledgerId);
  await validateLinks(ledger.familyId, input);

  const expense = await expenseRepository.create({
    ledgerId,
    createdById: userId,
    amount: input.amount,
    currency: input.currency ?? "ETB",
    description: input.description ?? null,
    note: input.note ?? null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    categoryId: input.categoryId ?? null,
    paidById: input.paidById ?? null,
  });
  return toExpenseDto(expense);
}

export async function updateExpense(
  userId: string,
  expenseId: string,
  input: {
    amount?: number;
    currency?: string;
    description?: string | null;
    note?: string | null;
    occurredAt?: string;
    categoryId?: string | null;
    paidById?: string | null;
  },
) {
  const ledger = await expenseLedgerOf(userId, expenseId);
  await validateLinks(ledger.familyId, input);

  const expense = await expenseRepository.update(expenseId, {
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.currency !== undefined && { currency: input.currency }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.note !== undefined && { note: input.note }),
    ...(input.occurredAt !== undefined && {
      occurredAt: new Date(input.occurredAt),
    }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    ...(input.paidById !== undefined && { paidById: input.paidById }),
  });
  return toExpenseDto(expense);
}

/**
 * Aggregate count + sum for a ledger's expenses, optionally filtered by
 * occurredAt range (e.g. the “today” total on the home tab). Exact — no
 * pagination undercounting.
 */
export async function ledgerTotals(
  userId: string,
  ledgerId: string,
  range?: { from?: string; to?: string },
) {
  await requireLedgerAccess(userId, ledgerId);
  const totals = await expenseRepository.getLedgerTotals(ledgerId, {
    ...(range?.from ? { from: new Date(range.from) } : {}),
    ...(range?.to ? { to: new Date(range.to) } : {}),
  });
  return { count: totals.count, sum: totals.sum };
}

/**
 * Per-category totals for a date range, rolled up to ROOT categories
 * (amounts logged under subcategories count towards their top-level
 * parent), plus today's uncategorized bucket. Powers the home tab list.
 */
export async function ledgerCategoryBreakdown(
  userId: string,
  ledgerId: string,
  range?: { from?: string; to?: string },
) {
  const ledger = await requireLedgerAccess(userId, ledgerId);
  const [rows, categories] = await Promise.all([
    expenseRepository.categoryRows(ledgerId, {
      ...(range?.from ? { from: new Date(range.from) } : {}),
      ...(range?.to ? { to: new Date(range.to) } : {}),
    }),
    categoryRepository.findByFamily(ledger.familyId),
  ]);

  // Category id → node, for resolving every expense's root parent.
  interface CategoryRef {
    id: string;
    name: string;
    parentId: string | null;
  }
  const nodeById = new Map<string, CategoryRef>(
    categories.map((c) => [c.id, { id: c.id, name: c.name, parentId: c.parentId }]),
  );
  const rootOf = (categoryId: string): CategoryRef | undefined => {
    let node = nodeById.get(categoryId);
    if (!node) return undefined;
    while (node.parentId) {
      const parent = nodeById.get(node.parentId);
      if (!parent) break;
      node = parent;
    }
    return node;
  };

  const buckets = new Map<string, { id: string; name: string; sum: number; count: number }>();
  let uncategorizedSum = 0;
  let uncategorizedCount = 0;

  for (const row of rows) {
    const sum = Number(row._sum.amount ?? 0);
    const count = row._count._all;
    if (row.categoryId === null) {
      uncategorizedSum += sum;
      uncategorizedCount += count;
      continue;
    }
    const root = rootOf(row.categoryId);
    if (!root) {
      // Shouldn't happen (deletes null out categoryId), but keep the money visible.
      uncategorizedSum += sum;
      uncategorizedCount += count;
      continue;
    }
    const bucket = buckets.get(root.id) ?? { id: root.id, name: root.name, sum: 0, count: 0 };
    bucket.sum += sum;
    bucket.count += count;
    buckets.set(root.id, bucket);
  }

  return {
    categories: [...buckets.values()].sort((a, b) => b.sum - a.sum),
    uncategorized: { sum: uncategorizedSum, count: uncategorizedCount },
  };
}

/** Assign (or clear, with null) the category of an expense. */
export async function categorizeExpense(
  userId: string,
  expenseId: string,
  categoryId: string | null,
) {
  const ledger = await expenseLedgerOf(userId, expenseId);
  await validateLinks(ledger.familyId, { categoryId });

  const expense = await expenseRepository.update(expenseId, { categoryId });
  return toExpenseDto(expense);
}

/**
 * Categorize several expenses at once (the "select, then Assign" flow).
 *
 * Each item may target a different ledger (the UI uses one ledger at a
 * time, but the API stays general): authorization is per expense-ledger
 * family, and every category must belong to the family of the expense it
 * is assigned to.
 */
export async function categorizeExpenses(
  userId: string,
  items: { expenseId: string; categoryId: string }[],
): Promise<{ count: number }> {
  if (items.length === 0) throw badRequest("Nothing to categorize");

  const expenseIds = [...new Set(items.map((i) => i.expenseId))];
  const expenses = await expenseRepository.findBulkMeta(expenseIds);
  if (expenses.length !== expenseIds.length) {
    throw notFound("One or more expenses were not found");
  }
  const expenseById = new Map(expenses.map((e) => [e.id, e]));

  // Resolve each expense's ledger → family, and authorize membership.
  const ledgerIds = [...new Set(expenses.map((e) => e.ledgerId))];
  const ledgers = await ledgerRepository.findByIds(ledgerIds);
  if (ledgers.length !== ledgerIds.length) {
    throw notFound("One or more ledgers were not found");
  }
  const ledgerFamilyById = new Map(ledgers.map((l) => [l.id, l.familyId]));
  const familyIds = [
    ...new Set(ledgers.map((l) => l.familyId)),
  ];
  await Promise.all(familyIds.map((fid) => requireFamilyMembership(userId, fid)));

  // Validate categories exist and belong to the right family.
  const categoryIds = [...new Set(items.map((i) => i.categoryId))];
  const categories = await categoryRepository.findByIds(categoryIds);
  if (categories.length !== categoryIds.length) {
    throw notFound("One or more categories were not found");
  }
  const categoryFamilyById = new Map(categories.map((c) => [c.id, c.familyId]));

  // Validate every item, then keep only assignments that change something.
  const toApply = new Map<string, string[]>(); // categoryId → expense ids
  for (const item of items) {
    const expense = expenseById.get(item.expenseId)!;
    const familyId = ledgerFamilyById.get(expense.ledgerId)!;
    if (categoryFamilyById.get(item.categoryId) !== familyId) {
      throw badRequest("Category does not belong to the expense's family");
    }
    if (expense.categoryId === item.categoryId) continue;
    const group = toApply.get(item.categoryId) ?? [];
    group.push(expense.id);
    toApply.set(item.categoryId, group);
  }

  if (toApply.size === 0) return { count: 0 };

  const results = await expenseRepository.categorizeMany(
    [...toApply.entries()].map(([categoryId, ids]) => ({
      categoryId,
      expenseIds: ids,
    })),
  );
  return { count: results.reduce((acc, r) => acc + r.count, 0) };
}

export async function deleteExpense(userId: string, expenseId: string) {
  await expenseLedgerOf(userId, expenseId);
  await expenseRepository.deleteById(expenseId);
}

export async function recentExpenses(userId: string, limit: number) {
  const expenses = await expenseRepository.findRecentForUser(userId, limit);
  return {
    expenses: expenses.map((e) => ({
      ...toExpenseDto(e),
      ledger: e.ledger,
    })),
  };
}

/** Resolve an expense, verify membership of its ledger's family. */
async function expenseLedgerOf(
  userId: string,
  expenseId: string,
): Promise<{ familyId: string }> {
  const expense = await expenseRepository.findById(expenseId);
  if (!expense) throw notFound("Expense not found");
  return requireLedgerAccess(userId, expense.ledgerId);
}
