import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { config } from "./lib/config.js";
import { prisma } from "./lib/db.js";
import { ApiError } from "./lib/errors.js";
import { registerSwagger } from "./plugins/swagger.js";
import { registerStatic } from "./plugins/static.js";
import { registerUploads } from "./plugins/upload.js";
import { authRoutes } from "./routes/auth.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { categoryRoutes } from "./routes/categories.js";
import { expenseRoutes } from "./routes/expenses.js";
import { familyRoutes } from "./routes/families.js";
import { healthRoutes } from "./routes/health.js";
import { ledgerRoutes } from "./routes/ledgers.js";
import { meRoutes } from "./routes/me.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "development" ? "info" : "warn",
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  // Zod-based schema validation & response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Zod validation errors → 400 with the issue list (instead of Fastify's
  // generic JSON-schema error shape).
  app.setErrorHandler((error, request, reply) => {
    // Domain errors thrown by route handlers.
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: "Request Error",
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      });
    }
    // Prisma: unique constraint violation → 409, record not found → 404.
    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    if (prismaError.code === "P2002") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "A record with this value already exists",
        details: prismaError.meta?.target,
      });
    }
    if (prismaError.code === "P2025") {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Record not found",
      });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Request doesn't match the schema",
        issues: error.validation,
      });
    }
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, "Response validation failed");
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Response doesn't match the schema",
      });
    }
    reply.send(error);
  });

  // Order matters: CORS must be registered before the auth hook so preflight
  // (OPTIONS) is answered by @fastify/cors while real auth requests are
  // hijacked by the Better Auth mount (see routes/auth.ts).
  app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  app.register(registerSwagger);

  app.register(authRoutes);
  app.register(analyticsRoutes);
  app.register(healthRoutes);
  app.register(meRoutes);
  app.register(familyRoutes);
  app.register(ledgerRoutes);
  app.register(categoryRoutes);
  app.register(expenseRoutes);

  // Last: serves the built web app + SPA fallback (no-op unless
  // WEB_DIST_PATH is configured). Uploads are served first so /upload files
  // never hit the SPA fallback.
  app.register(registerUploads);
  app.register(registerStatic);

  // Close the Prisma connection when the server shuts down.
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
