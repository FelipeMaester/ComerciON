# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# bcrypt compila um binário nativo — precisa de toolchain no alpine (musl)
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
# Sem --frozen-lockfile até o pnpm-lock.yaml ser gerado e commitado (rode `pnpm install` localmente primeiro)
RUN pnpm install --filter api...

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
