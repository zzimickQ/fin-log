import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config } from "./config.js";
import { prisma } from "./db.js";

export const auth = betterAuth({
  appName: "Fin Log",
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  // Allow the web app (different origin) to call the auth endpoints.
  trustedOrigins: config.WEB_ORIGIN,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
    },
  },
});

/** Inferred session shape: `{ user, session } | null`. */
export type Session = typeof auth.$Infer.Session;
