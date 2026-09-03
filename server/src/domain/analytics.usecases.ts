import { expenseRepository } from "./expense/expense.repository.js";
import { categoryRepository } from "./category/category.repository.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireLedgerAccess } from "../lib/guards.js";

export interface RangeFilter {
  from: Date;
  to: Date;
}

/**
 * Analytics aggregation helpers. All money aggregation happens in Postgres
 * (`GROUP BY` over the range); the category hierarchy is then resolved in
 * Node over that small aggregate map — no expense rows are shipped.
 */

interface CategoryAgg {
  sum: number;
  count: number;
}

/** Per-category (direct) aggregates + uncategorized within a range. */
async function rangeAggregates(
  ledgerId: string,
  range: RangeFilter,
): Promise<{ byCategory: Map<string, CategoryAgg>; uncategorized: CategoryAgg }> {
  const rows = await expenseRepository.categoryRows(ledgerId, range);
  const byCategory = new Map<string, CategoryAgg>();
  const uncategorized = { sum: 0, count: 0 };
  for (const row of rows) {
    const sum = Number(row._sum.amount ?? 0);
    const count = row._count._all;
    const agg = { sum, count };
    if (row.categoryId === null) {
      uncategorized.sum += agg.sum;
      uncategorized.count += agg.count;
    } else {
      byCategory.set(row.categoryId, agg);
    }
  }
  return { byCategory, uncategorized };
}

/**
 * The aggregate children of one category scope (root when `parentId` is
 * null): each child's sum/count includes its whole subtree. Also returns
 * how much was spent directly on the scope itself ("Expenses" row).
 */
export async function ledgerCategoryLevel(
  userId: string,
  ledgerId: string,
  range: RangeFilter,
  parentId: string | null = null,
) {
  const ledger = await requireLedgerAccess(userId, ledgerId);
  const familyId = ledger.familyId;

  const categories = await categoryRepository.findByFamily(familyId);
  const byId = new Map(categories.map((c) => [c.id, c]));
  if (parentId && !byId.has(parentId)) {
    throw notFound("Category not found");
  }
  if (parentId && byId.get(parentId)!.familyId !== familyId) {
    throw badRequest("Category does not belong to this ledger's family");
  }

  const { byCategory, uncategorized } = await rangeAggregates(ledgerId, range);

  // Direct children of the scope (top-level categories when at the root).
  const children = categories.filter((c) =>
    parentId ? c.parentId === parentId : c.parentId === null,
  );
  const childIds = new Set(children.map((c) => c.id));

  // ancestor chain of every category id (bottom-up until root)
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const chainOf = (id: string): string[] => {
    const chain: string[] = [];
    let cur: string | null = id;
    while (cur) {
      chain.push(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return chain;
  };

  const buckets = new Map<string, CategoryAgg>();
  let direct = { sum: 0, count: 0 };

  for (const [categoryId, agg] of byCategory) {
    let added = false;
    for (const id of chainOf(categoryId)) {
      if (childIds.has(id)) {
        const b = buckets.get(id) ?? { sum: 0, count: 0 };
        b.sum += agg.sum;
        b.count += agg.count;
        buckets.set(id, b);
        added = true;
        break;
      }
    }
    // Reached the scope itself (or a stale category) without matching a
    // child → count it as spent directly on the scope.
    if (!added && parentId && chainOf(categoryId).includes(parentId)) {
      direct.sum += agg.sum;
      direct.count += agg.count;
    }
  }

  return {
    children: children
      .filter((c) => (buckets.get(c.id)?.count ?? 0) > 0)
      .map((c) => {
        const b = buckets.get(c.id) ?? { sum: 0, count: 0 };
        return {
          id: c.id,
          name: c.name,
          hasChildren: categories.some((x) => x.parentId === c.id),
          sum: b.sum,
          count: b.count,
        };
      }),
    direct: { sum: direct.sum, count: direct.count },
    uncategorized: { sum: uncategorized.sum, count: uncategorized.count },
  };
}

/** Exact per-local-day buckets for a range (aggregated in Postgres). */
export async function ledgerDayBuckets(
  userId: string,
  ledgerId: string,
  range: RangeFilter,
  tzOffsetMinutes: number,
) {
  await requireLedgerAccess(userId, ledgerId);
  const days = await expenseRepository.dayBuckets(ledgerId, range, tzOffsetMinutes);
  return { days };
}
