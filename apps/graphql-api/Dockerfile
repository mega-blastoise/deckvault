ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE

FROM oven/bun:1.3.8-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/graphql-api/package.json ./apps/graphql-api/
COPY packages/@clients/package.json ./packages/@clients/
COPY packages/@database/package.json ./packages/@database/
COPY packages/@logger/package.json ./packages/@logger/
COPY packages/@utils/package.json ./packages/@utils/
COPY packages/@configs/package.json ./packages/@configs/
COPY packages/@framework/package.json ./packages/@framework/
COPY packages/@build/package.json ./packages/@build/
RUN bun install

# Build
FROM deps AS build
COPY packages/ ./packages/
COPY apps/graphql-api/ ./apps/graphql-api/
WORKDIR /app/apps/graphql-api
RUN bun run build

# Production — only the bundled output needed
FROM base AS production
WORKDIR /app

ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.title="DeckVault GraphQL API"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/mega-blastoise/deckvault"

COPY --from=build /app/apps/graphql-api/dist ./dist

USER bun

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["bun", "run", "dist/main.js"]
