import { categoryRepository } from "./category.repository.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import {
  requireCategoryAccess,
  requireFamilyMembership,
} from "../../lib/guards.js";

/**
 * Category usecases — tree building plus the hierarchy business rules from
 * docs/basic-doc.md:
 *  - the parent must belong to the same family as the child
 *  - a category cannot be moved under itself or one of its descendants
 *  - sibling names must be unique (root duplicates are additionally guarded
 *    by a partial unique index in the migration)
 */

export interface CategoryNode {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  expenseCount: number;
  children: CategoryNode[];
}

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  _count: { expenses: number };
};

/** Build a nested tree from the flat, family-scoped category rows. */
export function buildCategoryTree(categories: CategoryRow[]): CategoryNode[] {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  const toNode = (c: CategoryRow): CategoryNode => ({
    id: c.id,
    name: c.name,
    description: c.description,
    parentId: c.parentId,
    expenseCount: c._count.expenses,
    children: (byParent.get(c.id) ?? []).map(toNode),
  });
  return (byParent.get(null) ?? []).map(toNode);
}

async function assertValidParent(
  familyId: string,
  parentId: string | null,
  categoryId?: string,
): Promise<void> {
  if (!parentId) return;
  if (categoryId && parentId === categoryId) {
    throw badRequest("A category cannot be its own parent");
  }
  const parent = await categoryRepository.findParent(parentId);
  if (!parent) throw notFound("Parent category not found");
  if (parent.familyId !== familyId) {
    throw badRequest("A category's parent must belong to the same family");
  }
  if (!categoryId) return;

  // Walk up from the proposed parent: if we ever reach the category itself,
  // moving it under the parent would create a cycle.
  let cursor: { id: string; parentId: string | null } | null = parent;
  while (cursor?.parentId) {
    if (cursor.parentId === categoryId) {
      throw badRequest(
        "Cannot move a category under one of its own descendants",
      );
    }
    cursor = await categoryRepository.findParent(cursor.parentId);
  }
}

async function assertUniqueSibling(
  familyId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await categoryRepository.findSibling(
    familyId,
    parentId,
    name,
    excludeId,
  );
  if (existing) {
    throw conflict(`A category named "${name}" already exists at this level`);
  }
}

// ---------- usecases ----------

export async function getCategoryTree(userId: string, familyId: string) {
  await requireFamilyMembership(userId, familyId);
  const categories = await categoryRepository.findByFamily(familyId);
  return { categories: buildCategoryTree(categories) };
}

export async function createCategory(
  userId: string,
  familyId: string,
  input: { name: string; description?: string; parentId?: string | null },
) {
  await requireFamilyMembership(userId, familyId);

  const parentId = input.parentId ?? null;
  await assertValidParent(familyId, parentId);
  await assertUniqueSibling(familyId, parentId, input.name);

  const category = await categoryRepository.create({
    familyId,
    name: input.name,
    description: input.description ?? null,
    parentId,
  });
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    parentId: category.parentId,
    expenseCount: 0,
  };
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: {
    name?: string;
    description?: string | null;
    parentId?: string | null;
  },
) {
  const info = await requireCategoryAccess(userId, categoryId);

  const { name, parentId, description } = input;
  if (parentId !== undefined) {
    await assertValidParent(info.familyId, parentId, categoryId);
  }
  if (name !== undefined) {
    const effectiveParent =
      parentId !== undefined ? parentId : info.parentId;
    await assertUniqueSibling(info.familyId, effectiveParent, name, categoryId);
  }

  const category = await categoryRepository.update(categoryId, {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(parentId !== undefined && { parentId }),
  });
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    parentId: category.parentId,
    expenseCount: category._count.expenses,
  };
}

export async function deleteCategory(userId: string, categoryId: string) {
  await requireCategoryAccess(userId, categoryId);
  await categoryRepository.deleteById(categoryId);
}
