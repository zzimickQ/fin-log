import { badRequest, notFound } from "../../lib/errors.js";
import { requireLedgerAccess } from "../../lib/guards.js";
import { categoryRepository } from "../category/category.repository.js";
import { incomingRepository, toIncomingDto } from "./incoming.repository.js";

/**
 * Review usecases for staged transactions: list what a phone automation
 * captured, label it, then either move it into a ledger as a real expense or
 * discard it.
 *
 * The staging rows are ledgerless on purpose — a bank message never says which
 * ledger or category the spending belongs to, so review supplies both, and the
 * row only becomes an `Expense` at that point.
 */

export async function listIncoming(
  userId: string,
  params: { limit: number; offset: number },
) {
  const [rows, total] = await Promise.all([
    incomingRepository.findManyByUser(userId, {
      skip: params.offset,
      take: params.limit,
    }),
    incomingRepository.countByUser(userId),
  ]);
  return { transactions: rows.map(toIncomingDto), total };
}

/**
 * Set (or clear) the label a transaction will carry. Falls back to the message
 * source at move time when left empty.
 */
export async function labelIncoming(
  userId: string,
  id: string,
  description: string | null,
) {
  const { count } = await incomingRepository.updateDescription(
    id,
    userId,
    description,
  );
  if (count === 0) throw notFound("Pending transaction not found");

  const row = await incomingRepository.findByIdForUser(id, userId);
  if (!row) throw notFound("Pending transaction not found");
  return { transaction: toIncomingDto(row) };
}

/**
 * Turn staged transactions into expenses in one ledger, optionally already
 * categorized, and remove them from the review list.
 *
 * The whole batch moves to a single ledger because that is what bulk review
 * means: you have just decided these belong together. Category stays optional
 * so an item you cannot place yet still lands in the ledger and surfaces in the
 * normal categorize flow.
 */
export async function moveIncoming(
  userId: string,
  input: { ids: string[]; ledgerId: string; categoryId?: string | null },
) {
  const ledger = await requireLedgerAccess(userId, input.ledgerId);
  const categoryId = input.categoryId ?? null;

  if (categoryId !== null) {
    const category = await categoryRepository.findById(categoryId);
    if (!category) throw notFound("Category not found");
    // Every ledger owns its own hierarchy, so a foreign category is invalid.
    if (category.ledgerId !== ledger.id) {
      throw badRequest("Category does not belong to this ledger");
    }
  }

  const rows = await incomingRepository.findByIdsForUser(input.ids, userId);
  if (rows.length === 0) {
    throw notFound("No pending transactions match those ids");
  }

  const moved = await incomingRepository.moveToExpenses({
    rows,
    ledgerId: ledger.id,
    createdById: userId,
    categoryId,
  });

  return { moved };
}

/** Discard staged transactions that do not look correct. */
export async function deleteIncoming(userId: string, ids: string[]) {
  const { count } = await incomingRepository.deleteByIds(ids, userId);
  return { deleted: count };
}
