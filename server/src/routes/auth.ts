import { toNodeHandler } from "better-auth/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { auth } from "../lib/auth.js";
import { config } from "../lib/config.js";

/**
 * Mounts Better Auth's REST API at `/api/auth/*`.
 *
 * Why an `onRequest` hook instead of a normal route handler:
 * Fastify eagerly parses `application/json` bodies, which consumes the raw
 * request stream. Better Auth's node handler needs that stream to read the
 * body itself, so we hijack the request *before* Fastify's parsing stage and
 * pass the untouched `request.raw` through.
 *
 * CORS note: the hijacked reply bypasses Fastify's response pipeline, so the
 * normal `@fastify/cors` headers are not applied — we set them manually.
 * Preflight (OPTIONS) requests are left to `@fastify/cors` (registered
 * before this plugin in app.ts).
 *
 * Wrapped in fastify-plugin so the hook is registered on the root instance:
 * hooks added inside a plain plugin only apply to routes of that plugin's own
 * encapsulated context, and /api/auth/* has no Fastify routes of its own.
 */
export const authRoutes = fp(async function authRoutes(app: FastifyInstance) {
  const handler = toNodeHandler(auth);

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.url.startsWith("/api/auth")) return;
      if (request.method === "OPTIONS") return; // let @fastify/cors answer preflight

      // The hijacked reply bypasses Fastify's response pipeline, so add the
      // CORS headers the browser needs for credentialed cross-origin
      // requests from the web app.
      reply.raw.setHeader("Access-Control-Allow-Origin", config.WEB_ORIGIN);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Vary", "Origin");

      reply.hijack();

      try {
        await handler(request.raw, reply.raw);
      } catch (err) {
        request.log.error({ err }, "Better Auth handler failed");
        if (!reply.raw.headersSent) {
          reply.raw.statusCode = 500;
          reply.raw.setHeader("content-type", "application/json");
          reply.raw.end(JSON.stringify({ error: "Internal Server Error" }));
        }
      }
    },
  );
});
