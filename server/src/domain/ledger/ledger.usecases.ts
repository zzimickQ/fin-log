import { ledgerRepository } from "./ledger.repository.js";
import { expenseRepository } from "../expense/expense.repository.js";
import { familyRepository } from "../family/family.repository.js";
import {
  requireFamilyMembership,
  requireFamilyRole,
  requireLedgerAccess,
} from "../../lib/guards.js";

/** Ledger usecases. */

/**
 * Every ledger the user belongs to across all their families, with the
 * owning family attached — powers the navbar ledger switcher.
 */
export async function listMyLedgers(userId: string) {
  const memberships = await familyRepository.findMembershipsByUser(userId);
  const familyIds = memberships.map((m) => m.familyId);
  if (familyIds.length === 0) return { ledgers: [] };

  const familyNameById = new Map(
    memberships.map((m) => [m.familyId, m.family.name]),
  );
  const [ledgers, totals] = await Promise.all([
    ledgerRepository.findByFamilies(familyIds),
    expenseRepository.groupTotalsForFamilies(familyIds),
  ]);

  return {
    ledgers: ledgers.map((l) => {
      const t = totals.get(l.id) ?? { count: 0, uncategorized: 0, sum: 0 };
      return {
        id: l.id,
        name: l.name,
        description: l.description,
        familyId: l.familyId,
        familyName: familyNameById.get(l.familyId) ?? "",
        expenseCount: t.count,
        uncategorizedCount: t.uncategorized,
      };
    }),
  };
}

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
