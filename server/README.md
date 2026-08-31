# Fin Log — API Server

Fastify + Prisma (Postgres) + Better Auth + Zod + Swagger UI.

The web app (`../web`) is a React SPA whose Better Auth client points at this
server (`http://localhost:3000`).

## Stack

| Concern      | Choice                                                              |
| ------------ | ------------------------------------------------------------------- |
| HTTP         | [Fastify](https://fastify.dev) 5                                    |
| Validation   | [Zod](https://zod.dev) 4 via `fastify-type-provider-zod`            |
| OpenAPI docs | `@fastify/swagger` + `@fastify/swagger-ui` (Swagger UI at `/docs`)  |
| Static hosting | `@fastify/static` — serves the built web app + SPA fallback        |
| Database     | PostgreSQL 16 via Docker Compose, [Prisma](https://prisma.io) 7 ORM |
| Auth         | [Better Auth](https://better-auth.com) 1.7 (email/password)         |

## Prerequisites

- Node.js ≥ 20
- Docker (for the database)

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (real values go in server/.env — copy the example)
cp .env.example .env
#    - BETTER_AUTH_SECRET: generate with `openssl rand -base64 32`
#    - BETTER_AUTH_URL, WEB_ORIGIN: point at your server / web app origins

# 3. Start Postgres (host port 5433, so it never collides with other
#    Postgres instances on this machine — see docker-compose.yml)
npm run db:up

# 4. Apply migrations
npm run db:migrate        # or: npm run db:deploy

# 5. Run the API (tsx watch, http://localhost:3000)
npm run dev
```

Verify:

- Health: <http://localhost:3000/health>
- Better Auth ok: <http://localhost:3000/api/auth/ok>
- Swagger UI: <http://localhost:3000/docs> (OpenAPI JSON: `/docs/json`)

## Docker image

The repo root `Dockerfile` is a **packaging-only** image: it does not build
anything. It expects the built outputs (`web/dist`, `server/dist`) in the
build context, installs production npm packages, and copies them in:

```bash
# Build the web app and the server first, then package the image:
(cd web && npm ci && npm run build)      # → web/dist
(cd server && npm ci && npm run build)   # → server/dist
docker build -t finlog-server .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://finlog:finlog@host.docker.internal:5433/finlog \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  -e WEB_ORIGIN=http://localhost:5173 \
  finlog-server
```

The server serves the web app's static files itself when `WEB_DIST_PATH` is
set (it is, in the image). Unknown GET routes that are not `/api/*` or
`/docs/*` fall back to `index.html`, so client-side routes survive a refresh.

On startup the container runs `prisma migrate deploy` (skippable with
`SKIP_MIGRATIONS=1`, and skipped automatically when `DATABASE_URL` is unset),
then starts the server. Static assets are served with long-lived immutable
cache headers; `index.html`, `sw.js` and Workbox files are `no-cache`.

GitHub Actions (`.github/workflows/ci.yml`) builds the web app and the server
and uploads their `dist` folders as artifacts; the docker job downloads those
artifacts into the build context and packages the image (no building inside
the image). The image is pushed to GHCR (`ghcr.io/<owner>/<repo>`) on pushes
to `main` and on `v*` tags. Pull requests build but do not push.

## Scripts

| Script                  | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Run with `tsx watch` (auto-restart)                       |
| `npm run build`         | `prisma generate` + `tsc` → `dist/`                       |
| `npm run start`         | Run the built server (`node dist/index.js`)               |
| `npm run typecheck`     | `tsc --noEmit`                                            |
| `npm run db:up`         | `docker compose up -d` (Postgres)                         |
| `npm run db:down`       | `docker compose down` (data kept in the named volume)     |
| `npm run db:migrate`    | `prisma migrate dev` (interactive; creates migrations)    |
| `npm run db:deploy`     | `prisma migrate deploy` (non-interactive, CI-safe)        |
| `npm run db:studio`     | Prisma Studio                                             |
| `npm run auth:generate` | Regenerate Better Auth models into `prisma/schema.prisma` |

## Project layout

```
server/
├── docker-compose.yml        # Postgres 16 on host port 5433
├── prisma.config.ts          # Prisma 7 CLI config (schema path, datasource URL)
├── prisma/
│   ├── schema.prisma         # Prisma 7 generator + Better Auth models
│   └── migrations/           # SQL migrations
├── scripts/
│   └── merge-auth-schema.mjs # merges better-auth CLI output into schema.prisma
└── src/
    ├── index.ts              # entrypoint (listen, graceful shutdown)
    ├── app.ts                # Fastify instance: zod compilers, CORS, swagger, routes
    ├── lib/                  # core infrastructure
    │   ├── config.ts         # env validation with Zod (fails fast on bad env)
    │   ├── db.ts             # PrismaClient + @prisma/adapter-pg driver adapter
    │   └── auth.ts           # Better Auth config (email/password)
    ├── generated/prisma/     # generated Prisma client (gitignored)
    ├── plugins/
    │   ├── swagger.ts        # @fastify/swagger + swagger-ui, zod→OpenAPI transform
    │   └── static.ts         # serves the built web app + SPA fallback
    └── routes/
        ├── auth.ts           # mounts Better Auth at /api/auth/*
        ├── health.ts         # GET /health (zod-schema'd, DB check)
        └── me.ts             # GET /api/me (session-protected example)
```

## Architecture notes

### Better Auth on Fastify (`src/routes/auth.ts`)

Better Auth's node handler reads the request body from the raw Node stream,
but Fastify eagerly parses `application/json` bodies and consumes that stream.
Rather than fighting the two, an `onRequest` hook:

1. matches `/api/auth/*` (non-OPTIONS),
2. writes the CORS headers the hijacked reply would otherwise lose,
3. `reply.hijack()`s before Fastify's body-parsing stage,
4. passes the untouched `request.raw` / `reply.raw` to
   `toNodeHandler(auth)`.

Preflight (OPTIONS) requests are answered by `@fastify/cors` as usual. The
plugin is wrapped in `fastify-plugin` so the hook applies to the root
instance.

### Prisma 7

- `prisma-client` generator emits TypeScript into `src/generated/prisma`
  (`output` is required in v7).
- Runtime connects via the `@prisma/adapter-pg` driver adapter
  (`src/lib/db.ts`) — no built-in query engine.
- The datasource URL lives in `prisma.config.ts`, not the schema
  (`url = env(...)` in the schema was removed in v7).

### Better Auth 1.7 `issuer` field

Better Auth 1.7 scopes accounts by an `issuer` column
(`local:credential` for email/password). The bundled better-auth CLI (1.4.x)
does not emit it yet, so `scripts/merge-auth-schema.mjs` patches the Account
model with `issuer String` + `@@unique([issuer, accountId])` after every
`npm run auth:generate`.

### Rate limiting

Better Auth rate limiting is enabled (memory storage). Sign-in/sign-up are
limited to 3 requests per 10 seconds per client IP by Better Auth's built-in
rules; in development, IPs resolve to `127.0.0.1` (set `NODE_ENV`).

### Adding a new route

1. Create `src/routes/<name>.ts` exporting an async plugin function.
2. Use `app.withTypeProvider<ZodTypeProvider>()` and declare
   `schema: { ... }` with Zod objects — swagger and validation come for free.
3. Register it in `src/app.ts`.

### Environment variables

| Variable             | Default            | Purpose                                 |
| -------------------- | ------------------ | --------------------------------------- |
| `NODE_ENV`           | `development`      | Dev/test/production mode                |
| `HOST` / `PORT`      | `0.0.0.0` / `3000` | Listen address                          |
| `DATABASE_URL`       | —                  | Postgres connection string              |
| `BETTER_AUTH_SECRET` | —                  | ≥32 chars (`openssl rand -base64 32`)   |
| `BETTER_AUTH_URL`    | —                  | Public base URL of this server          |
| `WEB_ORIGIN`         | —                  | Comma-separated allowed web origins     |
| `WEB_DIST_PATH`      | unset (disabled)   | Path to a built web app to serve        |
| `SKIP_MIGRATIONS`    | `0`                 | `1` disables migrate-on-start (container)|
