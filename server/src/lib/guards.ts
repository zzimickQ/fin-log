import type { FastifyRequest } from "fastify";
import { auth, type Session } from "./auth.js";
import { forbidden, notFound, unauthorized } from "./errors.js";
import { FamilyRole } from "../generated/prisma/enums.js";
import { familyRepository } from "../domain/family/family.repository.js";
import { ledgerRepository } from "../domain/ledger/ledger.repository.js";
import { categoryRepository } from "../domain/category/category.repository.js";
import { apiKeyRepository } from "../domain/apikey/apikey.repository.js";
import { hashApiKey } from "../domain/apikey/apikey.usecases.js";

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

/**
 * The presented API key, from either supported header. `Authorization: Bearer`
 * is the conventional form; `X-API-Key` exists because phone-automation tools
 * (iOS Shortcuts among them) make a bare header far easier to set.
 */
function presentedApiKey(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  const raw = request.headers["x-api-key"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/**
 * Require a valid API key instead of a session — the machine-facing auth path
 * for external clients that submit data as the key's owner.
 *
 * Only the hash of a key is stored, so the presented value is hashed and
 * looked up; an unknown key and a malformed one are indistinguishable to the
 * caller (both 401). Returns the owner's user id.
 */
export async function requireApiKey(request: FastifyRequest): Promise<string> {
  const presented = presentedApiKey(request);
  if (!presented) {
    throw unauthorized("Provide an API key via 'Authorization: Bearer <key>'");
  }

  const apiKey = await apiKeyRepository.findByHash(hashApiKey(presented));
  if (!apiKey) throw unauthorized("Invalid API key");

  // Best-effort usage stamp: a failure here must not reject a valid request.
  await apiKeyRepository
    .touch(apiKey.id, new Date())
    .catch(() => undefined);

  return apiKey.userId;
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
 * owns its ledger. Returns the category's ledgerId (and parentId) plus the
 * familyId for downstream queries.
 */
export async function requireCategoryAccess(
  userId: string,
  categoryId: string,
): Promise<{
  id: string;
  ledgerId: string;
  familyId: string;
  parentId: string | null;
}> {
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw notFound("Category not found");
  const ledger = await requireLedgerAccess(userId, category.ledgerId);
  return {
    id: category.id,
    ledgerId: category.ledgerId,
    parentId: category.parentId,
    familyId: ledger.familyId,
  };
}

export { FamilyRole };
