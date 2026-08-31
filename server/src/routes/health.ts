import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../lib/db.js";

const healthResponse = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  timestamp: z.string(),
  database: z.enum(["up", "down"]),
});

export async function healthRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/health", {
    schema: {
      summary: "Health check",
      description: "Reports process uptime and database connectivity.",
      tags: ["system"],
      response: { 200: healthResponse },
    },
    handler: async () => {
      let database: "up" | "down" = "up";
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = "down";
      }
      return {
        status: "ok" as const,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database,
      };
    },
  });
}
