import type { FastifyRequest } from "fastify";
import { auth, type Session } from "./auth.js";
import { forbidden, notFound, unauthorized } from "./errors.js";
import { FamilyRole } from "../generated/prisma/enums.js";
import { familyRepository } from "../domain/family/family.repository.js";
import { ledgerRepository } from "../domain/ledger/ledger.repository.js";
import { categoryRepository } from "../domain/category/category.repository.js";

export interface Membership {
  id: string;
  familyId: string;
  userId: string;
  role: FamilyRole;
}

/**
 * Authorization layer (request/session → identity, then policy checks that
 * read via the repositories). Usecases receive a plain `userId` and stay
 * agnostic of HTTP; only this module knows about the Fastify request.
 */

/** Require a valid session cookie; returns the session (user + session). */
export async function requireSession(
  request: FastifyRequest,
): Promise<Session> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw unauthorized();
  return session;
}

/** Require `userId` to be a member of the family; returns the membership. */
export async function requireFamilyMembership(
  userId: string,
  familyId: string,
): Promise<Membership> {
  const membership = await familyRepository.findMembership(familyId, userId);
  if (!membership) {
    throw forbidden("You are not a member of this family");
  }
  return membership;
}

/** Require `userId` to hold one of the given roles in the family. */
export async function requireFamilyRole(
  userId: string,
  familyId: string,
  roles: FamilyRole[],
): Promise<Membership> {
  const membership = await requireFamilyMembership(userId, familyId);
  if (!roles.includes(membership.role)) {
    throw forbidden(
      `This action requires the ${roles.join(" or ")} role in the family`,
    );
  }
  return membership;
}

/**
 * Resolve a ledger and require the user to be a member of the family that
 * owns it. Returns the ledger's familyId for downstream queries.
 */
export async function requireLedgerAccess(
  userId: string,
  ledgerId: string,
): Promise<{ id: string; familyId: string }> {
  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) throw notFound("Ledger not found");
  await requireFamilyMembership(userId, ledger.familyId);
  return ledger;
}

/**
 * Resolve a category and require the user to be a member of the family that
 * owns it. Returns the category's familyId (and parentId) for downstream
 * queries.
 */
export async function requireCategoryAccess(
  userId: string,
  categoryId: string,
): Promise<{ id: string; familyId: string; parentId: string | null }> {
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw notFound("Category not found");
  await requireFamilyMembership(userId, category.familyId);
  return category;
}

export { FamilyRole };
