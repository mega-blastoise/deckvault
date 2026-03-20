FROM oven/bun:1.3.5-alpine AS base

FROM base AS workspace

RUN mkdir -p /home/bun/workspace
WORKDIR /home/bun/workspace

RUN bun i -g turbo

FROM workspace AS copy_package_manifests

COPY ./package.json ./package.json
COPY ./bun.lock ./bun.lock

COPY ./turbo.json ./turbo.json

COPY ./apps/web ./apps/web

COPY ./packages ./packages

FROM copy_package_manifests AS install

RUN bun install

FROM install AS build

RUN bun run build

FROM base AS runtime

RUN mkdir -p /home/bun/runtime-workspace
WORKDIR /home/bun/runtime-workspace

COPY --from=build /home/bun/workspace/package.json ./package.json
COPY --from=build /home/bun/workspace/bun.lock ./bun.lock

COPY --from=build /home/bun/workspace/turbo.json ./turbo.json

COPY --from=build /home/bun/workspace/apps/web ./apps/web

COPY --from=build /home/bun/workspace/packages ./packages

RUN rm -rf ./apps/web/node_modules
RUN find ./packages -name "node_modules" -type d -prune -exec rm -rf {} +

RUN bun install --production

ENV NODE_ENV=production
ENV PORT=3000

USER bun

EXPOSE 3000

CMD ["bun", "run", "docker:web:start"]
