# syntax=docker/dockerfile:1.7

# Courier Studio's live demo: the shop in examples/demo-shop — its backends,
# its server, its traffic and its mocks — with Studio over it, reset on a
# timer. Built from the repository's root:
#   docker build -f examples/demo-shop/Dockerfile -t courier-studio-demo .

FROM node:24-bookworm-slim AS build
WORKDIR /repo
# Git hooks belong to a working copy, not to an image.
ENV HUSKY=0
COPY . .
RUN npm ci
RUN npx turbo run build --filter=demo-shop...
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
# attachRuntime() connects only outside production, so NODE_ENV stays unset.
# The demo writes nothing into node_modules: its transform cache is off.
ENV COURIER_TRANSFORM_CACHE=off \
    STUDIO_PORT=6280 \
    DEMO_RESET_MINUTES=60
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/examples/demo-shop
USER node
EXPOSE 6280
CMD ["node", "--import", "tsx", "src/demo/run.ts"]
