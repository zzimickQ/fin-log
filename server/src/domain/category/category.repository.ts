import { prisma } from "../../lib/db.js";

/** ExpenseCategory persistence. */
export const categoryRepository = {
  /** Minimal row for authorization/validation (family + parent resolution). */
  findById(categoryId: string) {
    return prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, familyId: true, parentId: true },
    });
  },

  /** Family resolution for many categories (bulk categorization). */
  findByIds(ids: string[]) {
    return prisma.expenseCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, familyId: true },
    });
  },

  /** All categories of a family (flat, ordered) with direct expense counts. */
  findByFamily(familyId: string) {
    return prisma.expenseCategory.findMany({
      where: { familyId },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true } } },
    });
  },

  findParent(parentId: string) {
    return prisma.expenseCategory.findUnique({
      where: { id: parentId },
      select: { id: true, familyId: true, parentId: true },
    });
  },

  /** Duplicate sibling check: another category with the same parent+name. */
  findSibling(
    familyId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ) {
    return prisma.expenseCategory.findFirst({
      where: {
        familyId,
        parentId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  },

  create(data: {
    familyId: string;
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
