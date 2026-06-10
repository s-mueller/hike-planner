# --- Build stage ---
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd -r -g 1001 nodejs && useradd -r -u 1001 -g nodejs nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Create uploads directory
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
