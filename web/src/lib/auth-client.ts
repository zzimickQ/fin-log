import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth client — points at the Fastify server in `../server` (port 3000).
 *
 * The server exposes Better Auth's REST API at `http://localhost:3000/api/auth/*`
 * and allows cross-origin credentialed requests from the web origin
 * (see `WEB_ORIGIN` in `server/.env`).
 *
 * Override the URL per-environment via VITE_AUTH_BASE_URL (see `.env.local`).
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_BASE_URL,
})

// Convenience re-exports used across the app
export const {
  useSession,
  signIn,
  signUp,
  signOut,
  updateUser,
  changePassword,
  getSession,
} = authClient
