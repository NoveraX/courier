# syntax=docker/dockerfile:1.7

# Courier Studio's live demo: the shop in examples/demo-shop — its backends,
# its server, its traffic and its mocks — with Studio over it, reset on a
# timer. Built from the repository's root:
#   docker build -f examples/demo-shop/Dockerfile -t courier-studio-demo .
#
# The packages the demo runs are packed as npm publishes them and installed
# the way a project installs them: the image carries their runtime
# dependencies only, and runs what users get.

FROM node:24-bookworm-slim AS build
WORKDIR /repo
# Git hooks belong to a working copy, not to an image.
ENV HUSKY=0
COPY . .
RUN npm ci
RUN npx turbo run build --filter=demo-shop...
RUN mkdir /packs \
 && for pkg in core mcp mock server studio-core studio; do \
      (cd "packages/$pkg" && npm pack --pack-destination /packs --ignore-scripts --silent); \
    done

FROM node:24-bookworm-slim
# attachRuntime() connects only outside production, so NODE_ENV stays unset.
# The demo writes nothing into node_modules: its transform cache is off.
ENV COURIER_TRANSFORM_CACHE=off \
    STUDIO_PORT=6280 \
    DEMO_RESET_MINUTES=60
WORKDIR /demo
COPY --from=build /packs /packs
COPY --from=build /repo/examples/demo-shop/package.json /repo/examples/demo-shop/tsconfig.json ./
COPY --from=build /repo/examples/demo-shop/courier.config.ts /repo/examples/demo-shop/courier.mocks.ts ./
COPY --from=build /repo/examples/demo-shop/src ./src
# Each Courier package from its tarball, the ones they need among them; the
# rest resolve as a project's install would.
RUN for pkg in courier courier-mcp courier-mock courier-server courier-studio courier-studio-core; do \
      npm pkg set "dependencies.@noverax/$pkg=file:$(ls /packs/noverax-$pkg-[0-9]*.tgz)"; \
    done \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && rm -r /packs \
 && chown node:node /demo
USER node
EXPOSE 6280
CMD ["node", "--import", "tsx", "src/demo/run.ts"]
