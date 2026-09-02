import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  createLedger,
  deleteLedger,
  listLedgers,
  listMyLedgers,
  updateLedger,
} from "../domain/ledger/ledger.usecases.js";
import { ledgerCategoryBreakdown, ledgerTotals } from "../domain/expense/expense.usecases.js";

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

  // ---------- every ledger of mine, across families (navbar switcher) ----------

  routes.get("/api/ledgers/mine", {
    schema: {
      summary: "All ledgers across the user's families",
      description:
        "Flattened list with the owning family, used by the navbar ledger switcher.",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      response: {
        200: z.object({
          ledgers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string().nullable(),
              familyId: z.string(),
              familyName: z.string(),
              expenseCount: z.number(),
              uncategorizedCount: z.number(),
            }),
          ),
        }),
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return listMyLedgers(session.user.id);
    },
  });

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

  // ---------- totals for a date range (home tab: “today”) ----------

  routes.get("/api/ledgers/:ledgerId/totals", {
    schema: {
      summary: "Count + sum of a ledger's expenses, optionally for a date range",
      description:
        "Filters by occurredAt. Omit from/to for lifetime totals. Used by the home tab's 'today' summary.",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      querystring: z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
      response: {
        200: z.object({ count: z.number(), sum: z.coerce.number() }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return ledgerTotals(session.user.id, request.params.ledgerId, {
        from: request.query.from,
        to: request.query.to,
      });
    },
  });

  // ---------- per-root-category breakdown for a date range (home tab) ----------

  routes.get("/api/ledgers/:ledgerId/breakdown", {
    schema: {
      summary: "Category totals for a date range, rolled up to root categories",
      description:
        "Returns each top-level category's count + sum (subcategories roll up into their root) plus an uncategorized bucket.",
      tags: ["ledgers"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      querystring: z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
      response: {
        200: z.object({
          categories: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              sum: z.coerce.number(),
              count: z.number(),
            }),
          ),
          uncategorized: z.object({
            sum: z.coerce.number(),
            count: z.number(),
          }),
        }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return ledgerCategoryBreakdown(session.user.id, request.params.ledgerId, {
        from: request.query.from,
        to: request.query.to,
      });
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
