import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../lib/config.js";

/**
 * Serves the built web app (`web/dist`) as static files and implements the
 * SPA fallback: any unknown GET route that is not an API or docs path is
 * answered with `index.html` so client-side routes survive a refresh.
 *
 * Enabled only when `WEB_DIST_PATH` is set and contains a built `index.html`
 * (e.g. inside the Docker image). In development the API server hosts no
 * frontend and the default Fastify 404 is kept.
 *
 * Wrapped in fastify-plugin because `setNotFoundHandler` must apply to the
 * root instance.
 */
export const registerStatic = fp(async function registerStatic(
  app: FastifyInstance,
) {
  const root = config.WEB_DIST_PATH;
  if (!root) {
    app.log.info("WEB_DIST_PATH not set — static hosting disabled");
    return;
  }
  if (!existsSync(path.join(root, "index.html"))) {
    app.log.warn(
      `WEB_DIST_PATH=${root} does not contain index.html — static hosting disabled`,
    );
    return;
  }

  await app.register(fastifyStatic, {
    root,
    wildcard: false, // serve real files only; everything else → notFoundHandler
    // Vite emits content-hashed assets — cache them aggressively. The
    // un-hashed entry points must never be cached.
    maxAge: "1y",
    immutable: true,
    setHeaders(reply, filePath) {
      const name = path.basename(filePath);
      if (
        name === "index.html" ||
        name.startsWith("sw.") ||
        name.startsWith("workbox-") ||
        name === "registerSW.js"
      ) {
        reply.header("Cache-Control", "no-cache");
      }
    },
  });

  app.setNotFoundHandler(
    (request: FastifyRequest, reply: FastifyReply) => {
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        !request.url.startsWith("/api") &&
        !request.url.startsWith("/docs") &&
        !request.url.startsWith("/upload")
      ) {
        // SPA fallback: let the client-side router decide.
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ message: "Not Found" });
    },
  );
});
