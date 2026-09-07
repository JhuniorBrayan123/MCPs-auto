# syntax=docker/dockerfile:1
#
# mcp-elk-observability — read-only MCP server for Elastic APM/Elasticsearch
# observability data. Multi-stage build: compile TypeScript with full
# (including dev) dependencies, then ship only the compiled `dist/` output
# and production dependencies in a slim, non-root runtime image.
#
# This is a stdio MCP server (JSON-RPC over stdin/stdout) — it exposes no
# network port. All Elasticsearch connection details and index names are
# supplied at `docker run` time via environment variables (see README.md);
# nothing credential-shaped is baked into the image.

# ---------------------------------------------------------------------------
# Stage 1: builder — install ALL deps (incl. dev) and compile TypeScript.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (better layer caching on source-only changes).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile: `npm run build` runs `tsc -p tsconfig.json`,
# which reads rootDir "src" and writes outDir "dist" (see tsconfig.json),
# producing the dist/main.js entrypoint referenced by package.json's
# "main" field and by src/main.ts's shebang-style usage comment.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — production dependencies only, non-root user.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies (no typescript/vitest/@types/node).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output only — no TypeScript source, no test files, no specs.
COPY --from=builder /app/dist ./dist

# Run as the non-root "node" user already present in the official Node
# image (uid/gid 1000), instead of root.
USER node

# No EXPOSE: stdio transport only, no HTTP port in v0.1 (see design.md).
# Configuration (ELASTICSEARCH_URL, ELASTICSEARCH_API_KEY, APM_TRACE_INDEX,
# APM_ERROR_INDEX, EXTRA_SENSITIVE_FIELDS, DEBUG) must be supplied at run
# time, e.g. `docker run --env-file .env ...` — see README.md "Docker usage".
ENTRYPOINT ["node", "dist/main.js"]
