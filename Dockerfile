# syntax=docker/dockerfile:1
# Coolify pode injetar NODE_ENV=production no build — forçamos development no npm ci
# para instalar devDependencies (TypeScript, Tailwind, etc.).

FROM node:20-alpine AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL=postgresql://app:app@localhost:5432/tecnofit
ARG REDIS_URL=redis://localhost:6379
ARG JWT_SECRET=01234567890123456789012345678901
ARG NEXTAUTH_SECRET=01234567890123456789012345678901
ENV DATABASE_URL=$DATABASE_URL
ENV REDIS_URL=$REDIS_URL
ENV JWT_SECRET=$JWT_SECRET
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Seeds empacotados para o container de produção (sem tsx)
RUN npx esbuild scripts/seed.ts \
  --bundle --platform=node --format=esm --packages=external \
  --alias:dotenv/config=./scripts/env-stub.mjs \
  --outfile=scripts/seed.prod.mjs
RUN npx esbuild scripts/seed-demo-only.ts \
  --bundle --platform=node --format=esm --packages=external \
  --alias:dotenv/config=./scripts/env-stub.mjs \
  --outfile=scripts/seed-demo.prod.mjs

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# Migrações e seeds: fora do bundle standalone do Next.js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/zod ./node_modules/zod
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["sh", "-c", "node scripts/pre-start.mjs && node server.js"]
