import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireSession } from "../lib/guards.js";
import { clearAvatar, setAvatar } from "../domain/avatar.usecases.js";

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

  // ---------- profile picture ----------

  // Body is a base64 image (≈33% larger than the bytes). Allow generous
  // bodies here; the decoded size is validated in the usecase.
  app
    .withTypeProvider<ZodTypeProvider>()
    .post("/api/me/avatar", {
      schema: {
        summary: "Upload / replace the profile picture",
        description:
          "Body: { data } with a base64 PNG/JPEG/WebP. The server resizes it to a 256×256 PNG thumbnail stored under /upload/profiles/<uuid>.png.",
        tags: ["auth"],
        security: [{ sessionCookie: [] }],
        body: z.object({
          data: z
            .string({ message: "Image data is required" })
            .min(1, "Image data is required"),
        }),
        response: {
          200: z.object({ url: z.string() }),
          400: errorSchema,
          401: errorSchema,
        },
      },
      bodyLimit: 12 * 1024 * 1024,
      handler: async (request, reply) => {
        const session = await requireSession(request);
        const url = await setAvatar(session.user.id, request.body.data);
        reply.code(200);
        return { url };
      },
    });

  app.withTypeProvider<ZodTypeProvider>().delete("/api/me/avatar", {
    schema: {
      summary: "Remove the profile picture",
      description: "Deletes the uploaded thumbnail and clears the user's image.",
      tags: ["auth"],
      security: [{ sessionCookie: [] }],
      response: {
        204: z.void(),
        401: errorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await requireSession(request);
      await clearAvatar(session.user.id);
      reply.code(204);
      return;
    },
  });
}
