import { prisma } from "../../lib/db.js";

/** ExpenseCategory persistence. Categories are scoped to a ledger. */
export const categoryRepository = {
  /** Minimal row for authorization/validation (ledger + parent resolution). */
  findById(categoryId: string) {
    return prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, ledgerId: true, parentId: true },
    });
  },

  /** Ledger resolution for many categories (bulk categorization). */
  findByIds(ids: string[]) {
    return prisma.expenseCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, ledgerId: true },
    });
  },

  /** All categories of a ledger (flat, ordered) with direct expense counts. */
  findByLedger(ledgerId: string) {
    return prisma.expenseCategory.findMany({
      where: { ledgerId },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true } } },
    });
  },

  findParent(parentId: string) {
    return prisma.expenseCategory.findUnique({
      where: { id: parentId },
      select: { id: true, ledgerId: true, parentId: true },
    });
  },

  /** Duplicate sibling check: another category with the same parent+name. */
  findSibling(
    ledgerId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ) {
    return prisma.expenseCategory.findFirst({
      where: {
        ledgerId,
        parentId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  },

  create(data: {
    ledgerId: string;
    name: string;
    description: string | null;
    parentId: string | null;
  }) {
    return prisma.expenseCategory.create({ data });
  },

  update(
    categoryId: string,
    data: {
      name?: string;
      description?: string | null;
      parentId?: string | null;
    },
  ) {
    return prisma.expenseCategory.update({
      where: { id: categoryId },
      data,
      include: { _count: { select: { expenses: true } } },
    });
  },

  deleteById(categoryId: string) {
    return prisma.expenseCategory.delete({ where: { id: categoryId } });
  },
};
