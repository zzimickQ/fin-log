import fastifyStatic from "@fastify/static";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { config } from "../lib/config.js";

/**
 * Serves user uploads (currently: profile pictures) from `UPLOAD_DIR`
 * under the `/upload/*` URL prefix. Files are content-hashed/implicitly
 * unique (uuid filenames) so they can be cached aggressively and never
 * fall through to the SPA index fallback.
 */
export const registerUploads = fp(async function registerUploads(
  app: FastifyInstance,
) {
  const root = config.UPLOAD_DIR;
  // Make sure the avatars directory exists up front.
  mkdirSync(path.join(root, "profiles"), { recursive: true });

  await app.register(fastifyStatic, {
    root,
    prefix: "/upload/",
    wildcard: true,
    maxAge: "1y",
    immutable: true,
    // The web-dist static plugin (when enabled) adds the `sendFile` reply
    // decorator — registering it here too would throw
    // FST_ERR_DEC_ALREADY_PRESENT when both are active.
    decorateReply: false,
    setHeaders(reply, filePath) {
      if (filePath.endsWith(".png")) {
        reply.header("Content-Type", "image/png");
      }
    },
  });
});
