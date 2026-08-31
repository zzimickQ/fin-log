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
import { registerSwagger } from "./plugins/swagger.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
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
  app.register(healthRoutes);
  app.register(meRoutes);

  // Close the Prisma connection when the server shuts down.
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
