# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
# --frozen-lockfile é o que torna o build reprodutível: sem ele o pnpm
# resolve versões novas a cada execução e a imagem testada deixa de ser a
# imagem publicada.
RUN pnpm install --filter web... --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
# NEXT_PUBLIC_* é inlineado no bundle do navegador em BUILD time, não lido em
# runtime — por isso vem como build arg. Trocar a URL da API exige rebuild.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
# Domínio-base do endereço de cada loja. Vazio = a tela de login pede o
# identificador, como antes.
ARG NEXT_PUBLIC_TENANT_BASE_DOMAIN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TENANT_BASE_DOMAIN=$NEXT_PUBLIC_TENANT_BASE_DOMAIN
RUN pnpm --filter web build

# Instalação limpa só com as dependências de produção. O estágio de build
# carrega typescript, eslint e @types, que não têm o que fazer na imagem final.
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter web... --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

# Processo sem privilégio: se a aplicação for comprometida, o atacante não
# começa como root dentro do container.
RUN addgroup -S app && adduser -S app -G app

# Os dois são necessários: apps/web/node_modules é só o diretório de symlinks
# do pnpm, e eles apontam para o store em /app/node_modules/.pnpm. Copiar um
# sem o outro dá um container que sobe e morre em "Cannot find module 'next'".
COPY --from=prod-deps --chown=app:app /app/node_modules node_modules
COPY --from=prod-deps --chown=app:app /app/apps/web/node_modules apps/web/node_modules
COPY --from=build --chown=app:app /app/apps/web/.next apps/web/.next
COPY --from=build --chown=app:app /app/apps/web/public apps/web/public
COPY --from=build --chown=app:app /app/apps/web/package.json apps/web/package.json

USER app
WORKDIR /app/apps/web
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start"]
