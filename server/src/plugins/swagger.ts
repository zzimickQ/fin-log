import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { config } from "../lib/config.js";

/**
 * OpenAPI + Swagger UI.
 *
 * Route schemas are declared with Zod (see the route files); the
 * `jsonSchemaTransform` from fastify-type-provider-zod converts them into
 * OpenAPI components for @fastify/swagger.
 *
 * Wrapped in fastify-plugin so the @fastify/swagger decorator and its
 * `onRoute` capture hook apply to the root instance (where all routes are
 * registered) instead of this plugin's own encapsulated context.
 */
export const registerSwagger = fp(async function registerSwagger(
  app: FastifyInstance,
) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Fin Log API",
        description:
          "REST API for the Fin Log personal finance logger. " +
          "Auth endpoints are served by Better Auth under /api/auth/*.",
        version: "0.1.0",
      },
      servers: [{ url: config.BETTER_AUTH_URL }],
      components: {
        securitySchemes: {
          // Session cookie set by Better Auth (same-site on localhost).
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
});
