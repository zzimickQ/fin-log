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
