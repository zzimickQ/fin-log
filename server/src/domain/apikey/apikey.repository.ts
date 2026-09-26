import { prisma } from "../../lib/db.js";

/** ApiKey persistence. Keys are scoped to one user. */
export const apiKeyRepository = {
  /**
   * A user's keys, newest first. Selects only the fields the API exposes, so
   * keyHash is never loaded and can never leak into a response.
   */
  findByUser(userId: string) {
    return prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  },

  create(data: {
    userId: string;
    name: string;
    keyHash: string;
    prefix: string;
  }) {
    return prisma.apiKey.create({ data });
  },

  /**
   * Resolve a presented key by its hash (the ingest auth path). Returns only
   * the owner id — the caller already holds the plaintext.
   */
  findByHash(keyHash: string) {
    return prisma.apiKey.findUnique({
      where: { keyHash },
      select: { id: true, userId: true },
    });
  },

  /** Record that a key just authenticated a request. */
  touch(keyId: string, at: Date) {
    return prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: at },
    });
  },

  /**
   * Delete one key, scoped to its owner in the WHERE clause so a foreign id
   * simply matches nothing. Returns the affected count.
   */
  deleteByUser(keyId: string, userId: string) {
    return prisma.apiKey.deleteMany({ where: { id: keyId, userId } });
  },
};
