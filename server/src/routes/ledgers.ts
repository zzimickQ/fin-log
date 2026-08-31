import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  createLedger,
  deleteLedger,
  listLedgers,
  updateLedger,
} from "../domain/ledger/ledger.usecases.js";

const errorSchema = z.object({ message: z.string() });

const ledgerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  expenseCount: z.number(),
  uncategorizedCount: z.number(),
  sum: z.coerce.number(),
  createdAt: z.date(),
});

const ledgerListSchema = z.object({ ledgers: z.array(ledgerSchema) });

export async function ledgerRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- list ledgers of a family ----------

  routes.get("/api/families/:familyId/ledgers", {
    schema: {
      summary: "List ledgers of a family",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      response: { 200: ledgerListSchema, 401: errorSchema, 403: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return listLedgers(session.user.id, request.params.familyId);
    },
  });

  // ---------- create a ledger ----------

  routes.post("/api/families/:familyId/ledgers", {
    schema: {
      summary: "Create a ledger in a family",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      body: z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).optional(),
      }),
      response: { 201: ledgerSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      const ledger = await createLedger(
        session.user.id,
        request.params.familyId,
        request.body,
      );
      reply.code(201);
      return ledger;
    },
  });

  // ---------- rename a ledger ----------

  routes.patch("/api/ledgers/:ledgerId", {
    schema: {
      summary: "Rename a ledger (or update its description)",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      body: z.object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
      }),
      response: { 200: ledgerSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return updateLedger(session.user.id, request.params.ledgerId, request.body);
    },
  });

  // ---------- delete a ledger ----------

  routes.delete("/api/ledgers/:ledgerId", {
    schema: {
      summary: "Delete a ledger (cascades to its expenses)",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      response: { 204: z.void(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await deleteLedger(session.user.id, request.params.ledgerId);
      reply.code(204);
      return;
    },
  });
}
