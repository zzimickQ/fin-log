import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import {
  createCategory,
  deleteCategory,
  getCategoryTree,
  updateCategory,
} from "../domain/category/category.usecases.js";

const errorSchema = z.object({ message: z.string() });

const categoryNodeSchema: z.ZodType<{
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  expenseCount: number;
  children: z.infer<typeof categoryNodeSchema>[];
}> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    parentId: z.string().nullable(),
    expenseCount: z.number(),
    children: z.array(categoryNodeSchema),
  }),
);

const categoryTreeSchema = z.object({
  categories: z.array(categoryNodeSchema),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  expenseCount: z.number(),
});

export async function categoryRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- category tree of a family ----------

  routes.get("/api/families/:familyId/categories", {
    schema: {
      summary: "List a family's categories as a nested tree",
      tags: ["categories"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      response: { 200: categoryTreeSchema, 401: errorSchema, 403: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return getCategoryTree(session.user.id, request.params.familyId);
    },
  });

  // ---------- create a category ----------

  routes.post("/api/families/:familyId/categories", {
    schema: {
      summary: "Create a category (optionally under a parent)",
      tags: ["categories"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      body: z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).optional(),
        parentId: z.string().nullable().optional(),
      }),
      response: { 201: categorySchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      const category = await createCategory(
        session.user.id,
        request.params.familyId,
        request.body,
      );
      reply.code(201);
      return category;
    },
  });

  // ---------- update a category (rename / move / describe) ----------

  routes.patch("/api/categories/:categoryId", {
    schema: {
      summary: "Update a category (rename, move under a new parent, describe)",
      tags: ["categories"],
      security: [{ sessionCookie: [] }],
      params: z.object({ categoryId: z.string() }),
      body: z.object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        parentId: z.string().nullable().optional(),
      }),
      response: { 200: categorySchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return updateCategory(
        session.user.id,
        request.params.categoryId,
        request.body,
      );
    },
  });

  // ---------- delete a category ----------

  routes.delete("/api/categories/:categoryId", {
    schema: {
      summary:
        "Delete a category. Children are deleted too; expenses keep their data but lose the category.",
      tags: ["categories"],
      security: [{ sessionCookie: [] }],
      params: z.object({ categoryId: z.string() }),
      response: { 204: z.void(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await deleteCategory(session.user.id, request.params.categoryId);
      reply.code(204);
      return;
    },
  });
}
