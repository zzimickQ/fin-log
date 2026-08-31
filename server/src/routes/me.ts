import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireSession } from "../lib/guards.js";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
});

const errorSchema = z.object({
  message: z.string(),
});

export async function meRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/api/me", {
    schema: {
      summary: "Get the current user",
      description: "Returns the authenticated user for the session cookie.",
      tags: ["auth"],
      security: [{ sessionCookie: [] }],
      response: {
        200: z.object({ user: userSchema }),
        401: errorSchema,
      },
    },
    handler: async (request) => {
      const session = await requireSession(request);
      return { user: session.user };
    },
  });
}
