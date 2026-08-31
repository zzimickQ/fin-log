import { prisma } from "../../lib/db.js";
import type { FamilyRole } from "../../generated/prisma/enums.js";

/**
 * Family + FamilyMember persistence. Every direct Prisma access to the
 * family domain lives here; usecases go through this repository.
 */
export const familyRepository = {
  /** All memberships of a user, with family + counts (dashboard list). */
  findMembershipsByUser(userId: string) {
    return prisma.familyMember.findMany({
      where: { userId },
      include: {
        family: {
          include: { _count: { select: { members: true, ledgers: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Create a family with its founding OWNER member in one transaction. */
  createWithOwner(name: string, ownerUserId: string) {
    return prisma.family.create({
      data: {
        name,
        members: { create: { userId: ownerUserId, role: "OWNER" } },
      },
      include: { _count: { select: { members: true, ledgers: true } } },
    });
  },

  /** Family with members (+user) and ledgers for the detail view. */
  findById(familyId: string) {
    return prisma.family.findUnique({
      where: { id: familyId },
      include: {
        members: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
        ledgers: { orderBy: { createdAt: "asc" } },
      },
    });
  },

  rename(familyId: string, name: string) {
    return prisma.family.update({
      where: { id: familyId },
      data: { name },
      select: { id: true, name: true },
    });
  },

  deleteById(familyId: string) {
    return prisma.family.delete({ where: { id: familyId } });
  },

  // ---- members ----

  findMembership(familyId: string, userId: string) {
    return prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
  },

  findMemberById(memberId: string) {
    return prisma.familyMember.findUnique({ where: { id: memberId } });
  },

  countOwners(familyId: string) {
    return prisma.familyMember.count({ where: { familyId, role: "OWNER" } });
  },

  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  createMember(familyId: string, userId: string, role: FamilyRole) {
    return prisma.familyMember.create({
      data: { familyId, userId, role },
      include: { user: true },
    });
  },

  updateMemberRole(memberId: string, role: FamilyRole) {
    return prisma.familyMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: true },
    });
  },

  deleteMember(memberId: string) {
    return prisma.familyMember.delete({ where: { id: memberId } });
  },
};
