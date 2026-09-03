import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  categorizeExpense,
  categorizeExpenses,
  createExpense,
  deleteExpense,
  listExpenses,
  recentExpenses,
  updateExpense,
} from "../domain/expense/expense.usecases.js";

const errorSchema = z.object({ message: z.string() });

const userBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

const categoryBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
});

const expenseSchema = z.object({
  id: z.string(),
  ledgerId: z.string(),
  amount: z.coerce.number(),
  currency: z.string(),
  description: z.string().nullable(),
  note: z.string().nullable(),
  occurredAt: z.date(),
  createdAt: z.date(),
  category: categoryBriefSchema.nullable(),
  createdBy: userBriefSchema,
  paidBy: userBriefSchema.nullable(),
});

const expenseListSchema = z.object({
  expenses: z.array(expenseSchema),
  total: z.number(),
});

const amountSchema = z.coerce.number().finite().nonnegative();

export async function expenseRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- list expenses of a ledger ----------

  routes.get("/api/ledgers/:ledgerId/expenses", {
    schema: {
      summary: "List a ledger's expenses with filters",
      description:
        "Filters: from/to (occurredAt range), categoryId, uncategorized=true, createdById, search (description/note).",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      querystring: z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        categoryId: z.string().optional(),
        uncategorized: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        createdById: z.string().optional(),
        search: z.string().optional(),
        sort: z.enum(["newest", "oldest", "highest", "lowest"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      response: { 200: expenseListSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return listExpenses(session.user.id, request.params.ledgerId, request.query);
    },
  });

  // ---------- create an expense (capture first) ----------

  routes.post("/api/ledgers/:ledgerId/expenses", {
    schema: {
      summary: "Record an expense",
      description:
        "Category is optional — an expense can be recorded now and categorized later.",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      body: z.object({
        amount: amountSchema,
        currency: z.string().min(2).max(8).default("ETB"),
        description: z.string().trim().max(200).optional(),
        note: z.string().trim().max(2000).optional(),
        occurredAt: z.string().datetime().optional(),
        categoryId: z.string().nullable().optional(),
        paidById: z.string().nullable().optional(),
      }),
      response: { 201: expenseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      const expense = await createExpense(
        session.user.id,
        request.params.ledgerId,
        request.body,
      );
      reply.code(201);
      return expense;
    },
  });

  // ---------- update an expense ----------

  routes.patch("/api/expenses/:expenseId", {
    schema: {
      summary: "Update an expense",
      description: "Pass categoryId: null to remove the category (uncategorize).",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      params: z.object({ expenseId: z.string() }),
      body: z.object({
        amount: amountSchema.optional(),
        currency: z.string().min(2).max(8).optional(),
        description: z.string().trim().max(200).nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
        occurredAt: z.string().datetime().optional(),
        categoryId: z.string().nullable().optional(),
        paidById: z.string().nullable().optional(),
      }),
      response: { 200: expenseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return updateExpense(session.user.id, request.params.expenseId, request.body);
    },
  });

  // ---------- categorize (or uncategorize) an expense ----------

  routes.put("/api/expenses/:expenseId/category", {
    schema: {
      summary: "Assign (or clear) the category of an expense",
      description:
        "The 'categorize later' flow: body { categoryId } or { categoryId: null }.",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      params: z.object({ expenseId: z.string() }),
      body: z.object({ categoryId: z.string().nullable() }),
      response: { 200: expenseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return categorizeExpense(
        session.user.id,
        request.params.expenseId,
        request.body.categoryId,
      );
    },
  });

  // ---------- categorize a batch of expenses at once ----------

  routes.post("/api/expenses/categorize-batch", {
    schema: {
      summary: "Assign categories to several expenses in one transaction",
      description:
        "Body { items: [{ expenseId, categoryId }] }. Each category must belong to the family of the expense's ledger.",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      body: z.object({
        items: z
          .array(z.object({ expenseId: z.string(), categoryId: z.string() }))
          .min(1)
          .max(200),
      }),
      response: {
        200: z.object({ count: z.number() }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return categorizeExpenses(session.user.id, request.body.items);
    },
  });

  // ---------- delete an expense ----------

  routes.delete("/api/expenses/:expenseId", {
    schema: {
      summary: "Delete an expense",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      params: z.object({ expenseId: z.string() }),
      response: { 204: z.void(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await deleteExpense(session.user.id, request.params.expenseId);
      reply.code(204);
      return;
    },
  });

  // ---------- recent expenses across all my families (dashboard) ----------

  routes.get("/api/expenses/recent", {
    schema: {
      summary: "Most recent expenses across the user's families",
      tags: ["expenses"],
      security: [{ sessionCookie: [] }],
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(10),
      }),
      response: {
        200: z.object({
          expenses: z.array(
            expenseSchema.extend({
              ledger: z.object({
                id: z.string(),
                name: z.string(),
                family: z.object({ id: z.string(), name: z.string() }),
              }),
            }),
          ),
        }),
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return recentExpenses(session.user.id, request.query.limit);
    },
  });
}
