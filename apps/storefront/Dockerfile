# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/storefront/package.json apps/storefront/package.json
RUN pnpm install --filter storefront...

FROM deps AS build
COPY apps/storefront apps/storefront
ARG NEXT_PUBLIC_STOREFRONT_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_TENANT_SLUG=demo
ENV NEXT_PUBLIC_STOREFRONT_API_URL=$NEXT_PUBLIC_STOREFRONT_API_URL
ENV NEXT_PUBLIC_TENANT_SLUG=$NEXT_PUBLIC_TENANT_SLUG
RUN pnpm --filter storefront build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/storefront/public apps/storefront/public
COPY --from=build /app/apps/storefront/.next apps/storefront/.next
COPY --from=build /app/apps/storefront/node_modules apps/storefront/node_modules
COPY --from=build /app/apps/storefront/package.json apps/storefront/package.json
WORKDIR /app/apps/storefront
EXPOSE 3002
CMD ["pnpm", "start"]
