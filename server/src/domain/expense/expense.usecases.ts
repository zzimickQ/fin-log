import {
  expenseRepository,
} from "./expense.repository.js";
import { categoryRepository } from "../category/category.repository.js";
import { familyRepository } from "../family/family.repository.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { requireLedgerAccess } from "../../lib/guards.js";
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
    }),
    expenseRepository.count(where),
  ]);

  return { expenses: expenses.map(toExpenseDto), total };
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
