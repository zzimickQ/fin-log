import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../domain/apikey/apikey.usecases.js";

const errorSchema = z.object({ message: z.string() });

/** A key as listed: the secret is never part of this shape. */
const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
});

/** Creation response — the only place `key` (the plaintext) is ever returned. */
const createdApiKeySchema = apiKeySchema.extend({ key: z.string() });

const nameSchema = z.string().trim().min(1, "Name is required").max(100);

export async function apiKeyRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- list my keys ----------

  routes.get("/api/api-keys", {
    schema: {
      summary: "List the current user's API keys",
      description:
        "Secret material is never returned — only the display prefix, name and usage timestamps.",
      tags: ["api-keys"],
      security: [{ sessionCookie: [] }],
      response: {
        200: z.object({ keys: z.array(apiKeySchema) }),
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return listApiKeys(session.user.id);
    },
  });

  // ---------- create a key ----------

  routes.post("/api/api-keys", {
    schema: {
      summary: "Create an API key",
      description:
        "Returns the plaintext `key` once. It is not stored and cannot be retrieved again — copy it now.",
      tags: ["api-keys"],
      security: [{ sessionCookie: [] }],
      body: z.object({ name: nameSchema }),
      response: {
        201: createdApiKeySchema,
        400: errorSchema,
        401: errorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      const created = await createApiKey(session.user.id, request.body.name);
      reply.code(201);
      return created;
    },
  });

  // ---------- revoke a key ----------

  routes.delete("/api/api-keys/:keyId", {
    schema: {
      summary: "Revoke (delete) an API key",
      description:
        "Immediately invalidates the key. Scoped to the caller's own keys.",
      tags: ["api-keys"],
      security: [{ sessionCookie: [] }],
      params: z.object({ keyId: z.string() }),
      response: {
        204: z.void(),
        401: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await revokeApiKey(session.user.id, request.params.keyId);
      reply.code(204);
      return;
    },
  });
}
