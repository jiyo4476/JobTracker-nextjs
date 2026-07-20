# ── Stage 1: install deps ──────────────────────────────────────────────────────
FROM node:24.16-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@12.0.1 && npm ci

# Run the unit suite from the same dependency image used by the production build.
FROM deps AS test
WORKDIR /app
COPY . .
ENV CI=true
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm test

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:24.16-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS builder
WORKDIR /app
RUN npm install --global npm@12.0.1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:24.16-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static    ./.next/static
COPY --from=builder /app/public          ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
