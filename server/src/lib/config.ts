import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.array(z.url()),
  // Path to a built web app (dist/) to serve as static files. When unset,
  // the API server does not host any frontend. Relative paths are resolved
  // against the working directory (@fastify/static requires an absolute path).
  WEB_DIST_PATH: z
    .string()
    .optional()
    .transform((p) => (p ? path.resolve(p) : undefined)),
});

const parsed = envSchema.safeParse({
  ...process.env,
  WEB_ORIGIN: process.env.WEB_ORIGIN?.split(","),
});

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const config = parsed.data;
