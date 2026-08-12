# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/storefront/package.json apps/storefront/package.json
# --frozen-lockfile é o que torna o build reprodutível: sem ele o pnpm
# resolve versões novas a cada execução e a imagem testada deixa de ser a
# imagem publicada.
RUN pnpm install --filter storefront... --frozen-lockfile

FROM deps AS build
COPY apps/storefront apps/storefront
# NEXT_PUBLIC_* é inlineado no bundle do navegador em BUILD time, não lido em
# runtime — por isso vem como build arg. Trocar a URL da API exige rebuild.
ARG NEXT_PUBLIC_STOREFRONT_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_TENANT_SLUG=demo
ENV NEXT_PUBLIC_STOREFRONT_API_URL=$NEXT_PUBLIC_STOREFRONT_API_URL
ENV NEXT_PUBLIC_TENANT_SLUG=$NEXT_PUBLIC_TENANT_SLUG
RUN pnpm --filter storefront build

# Instalação limpa só com as dependências de produção. O estágio de build
# carrega typescript, eslint e @types, que não têm o que fazer na imagem final.
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/storefront/package.json apps/storefront/package.json
RUN pnpm install --filter storefront... --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3002

# Processo sem privilégio: se a aplicação for comprometida, o atacante não
# começa como root dentro do container.
RUN addgroup -S app && adduser -S app -G app

# Os dois são necessários: apps/storefront/node_modules é só o diretório de symlinks
# do pnpm, e eles apontam para o store em /app/node_modules/.pnpm. Copiar um
# sem o outro dá um container que sobe e morre em "Cannot find module 'next'".
COPY --from=prod-deps --chown=app:app /app/node_modules node_modules
COPY --from=prod-deps --chown=app:app /app/apps/storefront/node_modules apps/storefront/node_modules
COPY --from=build --chown=app:app /app/apps/storefront/.next apps/storefront/.next
COPY --from=build --chown=app:app /app/apps/storefront/public apps/storefront/public
COPY --from=build --chown=app:app /app/apps/storefront/package.json apps/storefront/package.json

USER app
WORKDIR /app/apps/storefront
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
