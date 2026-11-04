# syntax=docker/dockerfile:1.7

# Courier's website — the landing page, the documentation with its live
# examples, the API reference and Studio's page — as one container: the
# Next.js server, and beside it the Express backend the live examples call,
# which only the site's own server reaches. Built from the repository's
# root, as the site takes Courier's packages from it:
#   docker build -f docs/Dockerfile -t courier-site .
# Point a domain at port 3000 with HTTPS.

FROM node:24-bookworm-slim AS build
WORKDIR /repo
# Git hooks belong to a working copy, not to an image.
ENV HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm ci
RUN npx turbo run build \
      --filter=@noverax/courier... \
      --filter=@noverax/courier-next... \
      --filter=@noverax/courier-react...
WORKDIR /repo/docs
RUN npm ci
# The server Next.js traced, its assets beside it, and the backend as one
# file with its dependencies, run by Node alone: the same server the live
# examples' end-to-end tests run (server/assemble.mjs).
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_URL=http://127.0.0.1:4000 \
    EXPRESS_HOST=127.0.0.1 \
    EXPRESS_PORT=4000
WORKDIR /site
COPY --from=build --chown=node:node /repo/docs/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "launch.mjs"]
