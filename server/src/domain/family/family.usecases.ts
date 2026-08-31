import { familyRepository } from "./family.repository.js";
import { expenseRepository } from "../expense/expense.repository.js";
import { categoryRepository } from "../category/category.repository.js";
import { buildCategoryTree } from "../category/category.usecases.js";
import { ApiError, conflict, forbidden, notFound } from "../../lib/errors.js";
import {
  requireFamilyMembership,
  requireFamilyRole,
} from "../../lib/guards.js";
import type { FamilyRole } from "../../generated/prisma/enums.js";

/**
 * Family usecases — the "what should happen" of the family domain. They
 * enforce authorization and business rules, orchestrate repositories (also
 * from other domains, e.g. category tree + expense totals for the detail
 * view), and return API-ready shapes.
 */

// ---------- families ----------

export async function listMyFamilies(userId: string) {
  const memberships = await familyRepository.findMembershipsByUser(userId);
  return memberships.map((m) => ({
    id: m.family.id,
    name: m.family.name,
    role: m.role,
    memberCount: m.family._count.members,
    ledgerCount: m.family._count.ledgers,
    createdAt: m.family.createdAt,
  }));
}

export async function createFamily(userId: string, name: string) {
  const family = await familyRepository.createWithOwner(name, userId);
  return {
    families: [
      {
        id: family.id,
        name: family.name,
        role: "OWNER" as const,
        memberCount: family._count.members,
        ledgerCount: family._count.ledgers,
        createdAt: family.createdAt,
      },
    ],
  };
}

export async function getFamilyDetail(userId: string, familyId: string) {
  const membership = await requireFamilyMembership(userId, familyId);

  const [family, totals, categories] = await Promise.all([
    familyRepository.findById(familyId),
    expenseRepository.groupTotalsByLedger(familyId),
    categoryRepository.findByFamily(familyId),
  ]);
  if (!family) throw notFound("Family not found");

  return {
    id: family.id,
    name: family.name,
    myRole: membership.role,
    members: family.members.map((m) => ({
      id: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
      },
    })),
    ledgers: family.ledgers.map((l) => {
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
    categories: buildCategoryTree(categories),
    createdAt: family.createdAt,
  };
}

export async function renameFamily(
  userId: string,
  familyId: string,
  name: string,
) {
  await requireFamilyRole(userId, familyId, ["OWNER", "ADMIN"]);
  return familyRepository.rename(familyId, name);
}

export async function deleteFamily(userId: string, familyId: string) {
  await requireFamilyRole(userId, familyId, ["OWNER"]);
  await familyRepository.deleteById(familyId);
}

// ---------- members ----------

interface MemberRow {
  id: string;
  role: FamilyRole;
  user: { id: string; name: string; email: string; image: string | null };
}

function toMemberDto(m: MemberRow) {
  return {
    id: m.id,
    role: m.role,
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    },
  };
}

export async function addMember(
  userId: string,
  familyId: string,
  email: string,
  role: FamilyRole,
) {
  await requireFamilyRole(userId, familyId, ["OWNER", "ADMIN"]);

  const user = await familyRepository.findUserByEmail(email.toLowerCase());
  if (!user) {
    throw new ApiError(
      404,
      `No user with email "${email}" exists. They must sign up first.`,
    );
  }

  try {
    const member = await familyRepository.createMember(familyId, user.id, role);
    return toMemberDto(member);
  } catch (err) {
    // Unique (familyId, userId) — the user is already a member.
    if ((err as { code?: string }).code === "P2002") {
      throw conflict(`${user.name} is already a member of this family`);
    }
    throw err;
  }
}

export async function changeMemberRole(
  userId: string,
  familyId: string,
  memberId: string,
  newRole: FamilyRole,
) {
  const actor = await requireFamilyRole(userId, familyId, ["OWNER", "ADMIN"]);

  const member = await familyRepository.findMemberById(memberId);
  if (!member || member.familyId !== familyId) {
    throw notFound("Member not found in this family");
  }

  // Keep at least one OWNER: you cannot demote the last remaining owner.
  if (member.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await familyRepository.countOwners(familyId);
    if (ownerCount <= 1) {
      throw new ApiError(400, "A family must keep at least one OWNER");
    }
  }
  // ADMINS cannot change roles of OWNERs.
  if (actor.role === "ADMIN" && member.role === "OWNER") {
    throw forbidden("ADMINs cannot change an OWNER's role");
  }
  // Only OWNERs can promote someone to OWNER.
  if (newRole === "OWNER" && actor.role !== "OWNER") {
    throw forbidden("Only an OWNER can grant the OWNER role");
  }

  const updated = await familyRepository.updateMemberRole(memberId, newRole);
  return toMemberDto(updated);
}

export async function removeMember(
  userId: string,
  familyId: string,
  memberId: string,
) {
  const actor = await requireFamilyRole(userId, familyId, ["OWNER", "ADMIN"]);

  const member = await familyRepository.findMemberById(memberId);
  if (!member || member.familyId !== familyId) {
    throw notFound("Member not found in this family");
  }
  if (member.id === actor.id) {
    throw new ApiError(400, "You cannot remove yourself from the family");
  }
  if (member.role === "OWNER") {
    const ownerCount = await familyRepository.countOwners(familyId);
    if (ownerCount <= 1) {
      throw new ApiError(400, "A family must keep at least one OWNER");
    }
  }
  if (actor.role === "ADMIN" && member.role === "OWNER") {
    throw forbidden("ADMINs cannot remove an OWNER");
  }

  await familyRepository.deleteMember(memberId);
}
