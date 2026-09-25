import { createHash, randomBytes } from "node:crypto";
import { apiKeyRepository } from "./apikey.repository.js";
import { notFound } from "../../lib/errors.js";

/** API key usecases. Keys are user-scoped: a key identifies one user. */

/** Every key gets this marker so it is recognizable in logs and configs. */
const KEY_PREFIX = "fl_";
/** How many leading characters (marker + 8 secret chars) identify a key. */
const DISPLAY_PREFIX_LENGTH = 11;

/**
 * The hash a key is stored and looked up by. Keys are 256-bit random, so a
 * plain fast hash is enough here — no bcrypt work factor (and no per-request
 * cost when a future ingest endpoint verifies a key).
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Mint a fresh key. Format: `fl_` + 32 random bytes as base64url (43 chars).
 * The leading DISPLAY_PREFIX_LENGTH characters are safe to display in lists.
 *
 * Split out from `createApiKey` so the secret-generating logic is verifiable
 * without a database (see `apikey.selfcheck.ts`).
 */
export function generateApiKey(): { key: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

export async function listApiKeys(userId: string) {
  return { keys: await apiKeyRepository.findByUser(userId) };
}

/**
 * Create a key. The plaintext is returned exactly once — only its hash is
 * persisted, so a lost key can only be revoked and replaced.
 */
export async function createApiKey(userId: string, name: string) {
  const { key, prefix } = generateApiKey();
  const created = await apiKeyRepository.create({
    userId,
    name,
    keyHash: hashApiKey(key),
    prefix,
  });
  return {
    id: created.id,
    name: created.name,
    prefix: created.prefix,
    lastUsedAt: created.lastUsedAt,
    createdAt: created.createdAt,
    key,
  };
}

export async function revokeApiKey(userId: string, keyId: string) {
  const { count } = await apiKeyRepository.deleteByUser(keyId, userId);
  if (count === 0) throw notFound("API key not found");
}
