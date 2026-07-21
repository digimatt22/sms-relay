# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=sheldon_app_env,required=false \
    if [ -f /run/secrets/sheldon_app_env ]; then \
      export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' /run/secrets/sheldon_app_env | tail -n 1)"; \
    fi; \
    npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs /app/scripts/seed-admin.mjs ./scripts/
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
