import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireApiKey } from "../lib/guards.js";
import { ingestSmsMessage } from "../domain/ingest/sms-ingest.usecases.js";

/**
 * The machine-facing ingest API.
 *
 * Authenticated with an API key rather than a session, because the caller is a
 * phone automation acting for the key's owner. Deliberately its own route file
 * so the guard cannot be confused with the session-authenticated endpoints.
 */

const errorSchema = z.object({ message: z.string() });

const stagedTransactionSchema = z.object({
  id: z.string(),
  source: z.string().nullable(),
  text: z.string(),
  amount: z.coerce.number(),
  currency: z.string(),
  occurredAt: z.date(),
  description: z.string().nullable(),
  createdAt: z.date(),
});

const ingestResultSchema = z.object({
  transaction: stagedTransactionSchema,
  classification: z.object({
    kind: z.string(),
    amountSpan: z.string().nullable(),
    confidence: z.number(),
    model: z.string().nullable(),
    degraded: z.boolean(),
  }),
});

export async function ingestRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post("/api/ingest/sms", {
    schema: {
      summary: "Submit a bank SMS for automatic expense capture",
      description:
        "Reads the transaction amount out of a bank message and stages it for review. " +
        "Only debit transactions are accepted: credits and non-transactional messages " +
        "(offers, one-time codes, balance notices) are rejected with 422 and the reason. " +
        "The staged transaction is not an expense yet — it has no ledger or category " +
        "until it is reviewed in the app. " +
        "`receivedAt` accepts any timestamp JavaScript can parse (an ISO 8601 string is best); " +
        "omit it to use the server's receipt time.",
      tags: ["ingest"],
      security: [{ apiKey: [] }],
      body: z.object({
        text: z.string().trim().min(1).max(2000),
        source: z.string().trim().max(100).optional(),
        receivedAt: z.coerce.date().optional(),
      }),
      response: {
        201: ingestResultSchema,
        400: errorSchema,
        401: errorSchema,
        422: errorSchema,
      },
    },
    handler: async (request, reply) => {
      const userId = await requireApiKey(request);
      const result = await ingestSmsMessage(userId, request.body, request.log);
      reply.code(201);
      return result;
    },
  });
}
