import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  deleteIncoming,
  labelIncoming,
  listIncoming,
  moveIncoming,
} from "../domain/ingest/incoming.usecases.js";

/**
 * The human-facing review API for transactions captured by
 * `POST /api/ingest/sms`. Session-authenticated: these are the app's own
 * screens, not a machine caller.
 */

const errorSchema = z.object({ message: z.string() });

const stagedTransactionSchema = z.object({
  id: z.string(),
  /** SMS sender — the temporary label until a description is typed. */
  source: z.string().nullable(),
  text: z.string(),
  amount: z.coerce.number(),
  currency: z.string(),
  /** When the message was received. */
  occurredAt: z.date(),
  description: z.string().nullable(),
  createdAt: z.date(),
});

/** Bulk actions are one review gesture, so they are bounded like a page. */
const idsSchema = z.array(z.string()).min(1).max(200);

export async function incomingRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- list what is waiting for review ----------

  routes.get("/api/incoming", {
    schema: {
      summary: "List staged transactions awaiting review",
      description:
        "Transactions captured from inbound messages. They have no ledger or category yet — that is what review supplies.",
      tags: ["review"],
      security: [{ sessionCookie: [] }],
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      response: {
        200: z.object({
          transactions: z.array(stagedTransactionSchema),
          total: z.number(),
        }),
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return listIncoming(session.user.id, request.query);
    },
  });

  // ---------- label ----------

  routes.patch("/api/incoming/:id", {
    schema: {
      summary: "Set the label of a staged transaction",
      description:
        "`description: null` clears the label, in which case the message source is used as the label when the transaction is moved.",
      tags: ["review"],
      security: [{ sessionCookie: [] }],
      params: z.object({ id: z.string() }),
      body: z.object({ description: z.string().trim().max(200).nullable() }),
      response: {
        200: z.object({ transaction: stagedTransactionSchema }),
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return labelIncoming(
        session.user.id,
        request.params.id,
        request.body.description,
      );
    },
  });

  // ---------- move into a ledger (the review hand-off) ----------

  routes.post("/api/incoming/move", {
    schema: {
      summary: "Move staged transactions into a ledger as expenses",
      description:
        "Creates one expense per staged transaction and removes them from the review list. " +
        "The category is optional: without one the expenses land uncategorized and show up in the normal categorize flow.",
      tags: ["review"],
      security: [{ sessionCookie: [] }],
      body: z.object({
        ids: idsSchema,
        ledgerId: z.string(),
        categoryId: z.string().nullable().optional(),
      }),
      response: {
        200: z.object({ moved: z.number() }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return moveIncoming(session.user.id, request.body);
    },
  });

  // ---------- discard ----------

  routes.post("/api/incoming/delete", {
    schema: {
      summary: "Discard staged transactions",
      description:
        "For captured messages that are not really the user's spending. Nothing is written to the ledger.",
      tags: ["review"],
      security: [{ sessionCookie: [] }],
      body: z.object({ ids: idsSchema }),
      response: {
        200: z.object({ deleted: z.number() }),
        400: errorSchema,
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return deleteIncoming(session.user.id, request.body.ids);
    },
  });
}
