import { ledgerRepository } from "./ledger.repository.js";
import { expenseRepository } from "../expense/expense.repository.js";
import {
  requireFamilyMembership,
  requireFamilyRole,
  requireLedgerAccess,
} from "../../lib/guards.js";

/** Ledger usecases. */

export async function listLedgers(userId: string, familyId: string) {
  await requireFamilyMembership(userId, familyId);

  const [ledgers, totals] = await Promise.all([
    ledgerRepository.findByFamily(familyId),
    expenseRepository.groupTotalsByLedger(familyId),
  ]);

  return {
    ledgers: ledgers.map((l) => {
      const t = totals.get(l.id) ?? { count: 0, uncategorized: 0, sum: 0 };
      return {
        id: l.id,
        name: l.name,
        description: l.description,
        expenseCount: t.count,
        uncategorizedCount: t.uncategorized,
        sum: t.sum,
        createdAt: l.createdAt,
      };
    }),
  };
}

export async function createLedger(
  userId: string,
  familyId: string,
  input: { name: string; description?: string },
) {
  await requireFamilyMembership(userId, familyId);
  const ledger = await ledgerRepository.create(familyId, input);
  return {
    id: ledger.id,
    name: ledger.name,
    description: ledger.description,
    expenseCount: 0,
    uncategorizedCount: 0,
    sum: 0,
    createdAt: ledger.createdAt,
  };
}

export async function updateLedger(
  userId: string,
  ledgerId: string,
  input: { name?: string; description?: string | null },
) {
  await requireLedgerAccess(userId, ledgerId);
  const ledger = await ledgerRepository.update(ledgerId, input);
  const totals = await expenseRepository.getLedgerTotals(ledgerId);
  return {
    id: ledger.id,
    name: ledger.name,
    description: ledger.description,
    expenseCount: totals.count,
    uncategorizedCount: totals.uncategorized,
    sum: totals.sum,
    createdAt: ledger.createdAt,
  };
}

export async function deleteLedger(userId: string, ledgerId: string) {
  const ledger = await requireLedgerAccess(userId, ledgerId);
  await requireFamilyRole(userId, ledger.familyId, ["OWNER", "ADMIN"]);
  await ledgerRepository.deleteById(ledgerId);
}
