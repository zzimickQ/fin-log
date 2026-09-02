import { prisma } from "../../lib/db.js";

/** Ledger persistence. */
export const ledgerRepository = {
  /** Minimal row for authorization checks (family resolution). */
  findById(ledgerId: string) {
    return prisma.ledger.findUnique({
      where: { id: ledgerId },
      select: { id: true, familyId: true },
    });
  },

  findByFamily(familyId: string) {
    return prisma.ledger.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Every ledger across many families (e.g. the navbar switcher). */
  findByFamilies(familyIds: string[]) {
    return prisma.ledger.findMany({
      where: { familyId: { in: familyIds } },
      select: {
        id: true,
        name: true,
        description: true,
        familyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Minimal family resolution for a set of ledgers (bulk operations). */
  findByIds(ids: string[]) {
    return prisma.ledger.findMany({
      where: { id: { in: ids } },
      select: { id: true, familyId: true },
    });
  },

  create(familyId: string, data: { name: string; description?: string }) {
    return prisma.ledger.create({
      data: {
        familyId,
        name: data.name,
        description: data.description ?? null,
      },
    });
  },

  update(
    ledgerId: string,
    data: { name?: string; description?: string | null },
  ) {
    return prisma.ledger.update({
      where: { id: ledgerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  },

  deleteById(ledgerId: string) {
    return prisma.ledger.delete({ where: { id: ledgerId } });
  },
};
