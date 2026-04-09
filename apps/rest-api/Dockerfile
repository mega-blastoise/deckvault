ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE

FROM oven/bun:1.3.8-alpine AS base
WORKDIR /app/pokemon-rest-api

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/rest-api/package.json ./apps/rest-api/
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
COPY apps/rest-api/ ./apps/rest-api/
WORKDIR /app/pokemon-rest-api/apps/rest-api
RUN bun run build

# Production — only the bundled output, nothing else needed
FROM base AS production
WORKDIR /app/pokemon-rest-api

ARG VERSION
ARG GIT_SHA
ARG BUILD_DATE

LABEL org.opencontainers.image.title="DeckVault REST API"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/mega-blastoise/deckvault"

COPY --from=build /app/pokemon-rest-api/apps/rest-api/dist ./dist
COPY --from=build /app/pokemon-rest-api/apps/rest-api/migrations ./migrations

USER bun

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/src/index.js"]
