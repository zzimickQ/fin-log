# syntax=docker/dockerfile:1

# Packaging-only image for the Fin Log server + bundled web app.
#
# This image does NOT build anything: it expects the built outputs in the
# build context and only installs production npm packages and copies them in.
#
#   # Build the web app and the server first:
#   (cd web && npm ci && npm run build)      # → web/dist
#   (cd server && npm ci && npm run build)   # → server/dist
#   docker build -t finlog-server .
#
# In CI (.github/workflows/ci.yml) the web and server jobs build these dists
# and upload them as artifacts; the docker job downloads them into the build
# context before `docker build`.

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only (prisma is a runtime dep for `migrate deploy`).
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built outputs (from the build context — produced by CI or locally).
COPY server/dist ./dist
COPY web/dist ./web-dist

# Prisma schema + migrations + config, used by `prisma migrate deploy`.
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./

COPY server/docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Defaults; override at runtime.
ENV PORT=3000 \
    HOST=0.0.0.0 \
    WEB_DIST_PATH=/app/web-dist

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint"]
