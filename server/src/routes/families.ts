import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireSession } from "../lib/guards.js";
import { FamilyRole } from "../generated/prisma/enums.js";
import {
  addMember,
  changeMemberRole,
  createFamily,
  deleteFamily,
  getFamilyDetail,
  listMyFamilies,
  removeMember,
  renameFamily,
} from "../domain/family/family.usecases.js";

// ---------- response schemas ----------

const userBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

const memberSchema = z.object({
  id: z.string(),
  role: z.nativeEnum(FamilyRole),
  user: userBriefSchema,
});

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

const familyListSchema = z.object({
  families: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.nativeEnum(FamilyRole),
      memberCount: z.number(),
      ledgerCount: z.number(),
      createdAt: z.date(),
    }),
  ),
});

const familyDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  myRole: z.nativeEnum(FamilyRole),
  members: z.array(memberSchema),
  ledgers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      expenseCount: z.number(),
      uncategorizedCount: z.number(),
      sum: z.coerce.number(),
      createdAt: z.date(),
    }),
  ),
  categories: z.array(categoryNodeSchema),
  createdAt: z.date(),
});

export async function familyRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // ---------- list my families ----------

  routes.get("/api/families", {
    schema: {
      summary: "List the user's families",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      response: { 200: familyListSchema, 401: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return { families: await listMyFamilies(session.user.id) };
    },
  });

  // ---------- create a family ----------

  routes.post("/api/families", {
    schema: {
      summary: "Create a family (creator becomes OWNER)",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      body: z.object({ name: z.string().trim().min(1).max(100) }),
      response: { 201: familyListSchema, 400: errorSchema, 401: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      reply.code(201);
      return createFamily(session.user.id, request.body.name);
    },
  });

  // ---------- family detail (members + ledgers + category tree) ----------

  routes.get("/api/families/:familyId", {
    schema: {
      summary: "Family detail with members, ledgers and category tree",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      response: { 200: familyDetailSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return getFamilyDetail(session.user.id, request.params.familyId);
    },
  });

  // ---------- rename a family ----------

  routes.patch("/api/families/:familyId", {
    schema: {
      summary: "Rename a family (OWNER/ADMIN)",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      body: z.object({ name: z.string().trim().min(1).max(100) }),
      response: { 200: z.object({ id: z.string(), name: z.string() }), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return renameFamily(
        session.user.id,
        request.params.familyId,
        request.body.name,
      );
    },
  });

  // ---------- delete a family ----------

  routes.delete("/api/families/:familyId", {
    schema: {
      summary: "Delete a family (OWNER only). Cascades to ledgers, expenses and categories.",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      response: { 204: z.void(), 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await deleteFamily(session.user.id, request.params.familyId);
      reply.code(204);
      return;
    },
  });

  // ---------- add a member by email ----------

  routes.post("/api/families/:familyId/members", {
    schema: {
      summary: "Add an existing user (by email) to the family (OWNER/ADMIN)",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string() }),
      body: z.object({
        email: z.string().email(),
        role: z.nativeEnum(FamilyRole).default("MEMBER"),
      }),
      response: { 201: memberSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      const member = await addMember(
        session.user.id,
        request.params.familyId,
        request.body.email,
        request.body.role,
      );
      reply.code(201);
      return member;
    },
  });

  // ---------- change a member's role ----------

  routes.patch("/api/families/:familyId/members/:memberId", {
    schema: {
      summary: "Change a member's role (OWNER/ADMIN)",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string(), memberId: z.string() }),
      body: z.object({ role: z.nativeEnum(FamilyRole) }),
      response: { 200: memberSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return changeMemberRole(
        session.user.id,
        request.params.familyId,
        request.params.memberId,
        request.body.role,
      );
    },
  });

  // ---------- remove a member ----------

  routes.delete("/api/families/:familyId/members/:memberId", {
    schema: {
      summary: "Remove a member from the family (OWNER/ADMIN)",
      tags: ["families"],
      security: [{ sessionCookie: [] }],
      params: z.object({ familyId: z.string(), memberId: z.string() }),
      response: { 204: z.void(), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await removeMember(
        session.user.id,
        request.params.familyId,
        request.params.memberId,
      );
      reply.code(204);
      return;
    },
  });
}
