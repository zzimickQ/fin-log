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
  // Where uploaded files live (user avatars). Relative paths are resolved
  // against the working directory. Exposed under the /upload URL prefix.
  UPLOAD_DIR: z
    .string()
    .default("upload")
    .transform((p) => path.resolve(p)),

  // --- TypeSafe AI (category suggestions) ---
  // Optional. When unset, expense categorization falls back to the local
  // token-overlap heuristic (never breaks expense logging).
  TYPESAFE_API_KEY: z.string().default(""),
  // System One model used for predictions (see docs.typesafe.ai/models).
  TYPESAFE_MODEL: z.string().default("jev-latest"),
  // Minimum P(top category) for the server to auto-assign instead of merely
  // suggesting. "unknown" never auto-assigns.
  CATEGORY_AUTO_ASSIGN_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  // How many ranked category suggestions the API returns to the UI.
  CATEGORY_SUGGESTION_LIMIT: z.coerce.number().int().min(1).max(10).default(3),

  // --- TypeSafe AI (ledger suggestions) ---
  // Minimum P(top ledger) for the server to pre-select a ledger instead of
  // merely suggesting it. "unknown" never pre-selects.
  LEDGER_AUTO_ASSIGN_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  // How many ranked ledger suggestions the API returns to the UI.
  LEDGER_SUGGESTION_LIMIT: z.coerce.number().int().min(1).max(10).default(3),
});

const parsed = envSchema.safeParse({
  ...process.env,
  WEB_ORIGIN: process.env.WEB_ORIGIN?.split(","),
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY?.trim(),
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
