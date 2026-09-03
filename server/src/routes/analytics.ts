import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  ledgerCategoryLevel,
  ledgerDayBuckets,
} from "../domain/analytics.usecases.js";

const errorSchema = z.object({ message: z.string() });

const rangeQuery = {
  from: z.string().datetime(),
  to: z.string().datetime(),
};

const childRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hasChildren: z.boolean(),
  sum: z.coerce.number(),
  count: z.number(),
});

const bucketSchema = z.object({ sum: z.coerce.number(), count: z.number() });

export async function analyticsRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // Aggregate children (rolled up, DB-first) of one category scope.
  routes.get("/api/ledgers/:ledgerId/analytics/categories", {
    schema: {
      summary: "Category buckets for an analytics drill level",
      description:
        "Without parentId: main categories + uncategorized. With parentId: that category's sub-category buckets (each including its subtree) plus how much was spent directly on it. Aggregated in the database.",
      tags: ["analytics"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      querystring: z.object({
        ...rangeQuery,
        parentId: z.string().optional(),
      }),
      response: {
        200: z.object({
          children: z.array(childRowSchema),
          direct: bucketSchema,
          uncategorized: bucketSchema,
        }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return ledgerCategoryLevel(
        session.user.id,
        request.params.ledgerId,
        { from: new Date(request.query.from), to: new Date(request.query.to) },
        request.query.parentId ?? null,
      );
    },
  });

  // Exact per-day buckets for a range (aggregated in Postgres).
  routes.get("/api/ledgers/:ledgerId/analytics/days", {
    schema: {
      summary: "Per-day buckets for a date range",
      description:
        "Each day's total & count, grouped in the database using the viewer's UTC offset (tzOffsetMinutes) so days match the user's local clock.",
      tags: ["analytics"],
      security: [{ sessionCookie: [] }],
      params: z.object({ ledgerId: z.string() }),
      querystring: z.object({
        ...rangeQuery,
        tzOffsetMinutes: z.coerce
          .number()
          .int()
          .min(-720)
          .max(840)
          .default(0),
      }),
      response: {
        200: z.object({
          days: z.array(
            z.object({
              date: z.string(),
              sum: z.coerce.number(),
              count: z.number(),
            }),
          ),
        }),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return ledgerDayBuckets(
        session.user.id,
        request.params.ledgerId,
        { from: new Date(request.query.from), to: new Date(request.query.to) },
        request.query.tzOffsetMinutes,
      );
    },
  });
}
