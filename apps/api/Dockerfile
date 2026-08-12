# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ------------------------------------------------------------------ dependências
FROM base AS deps
# bcrypt compila binário nativo — precisa de toolchain no alpine (musl).
# openssl é exigido pelo engine do Prisma: sem ele, tanto as migrations
# quanto as consultas falham em runtime, não no build.
RUN apk add --no-cache python3 make g++ openssl
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
# --frozen-lockfile é o que torna o build reprodutível: sem ele, o pnpm
# resolve versões novas a cada build e a imagem que foi testada deixa de ser
# a imagem que vai para produção.
RUN pnpm install --filter api... --frozen-lockfile

# ---------------------------------------------------------------------- build
FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

# -------------------------------------------------------------- migrations
# Imagem separada, de execução única, para aplicar as migrations antes da API
# subir. Parte do estágio de build de propósito: o CLI do Prisma é uma
# dependência de DESENVOLVIMENTO e não existe na imagem de runtime — e é bom
# que não exista, porque uma API em produção não deveria conseguir alterar o
# schema do banco sozinha.
FROM build AS migrate
CMD ["pnpm", "--filter", "api", "exec", "prisma", "migrate", "deploy"]

# ------------------------------------------------- dependências de produção
# Instalação separada, só com as de produção. O estágio de build carrega
# typescript, jest e @types, que não têm nada que fazer na imagem final.
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter api... --frozen-lockfile --prod

# O client do Prisma é GERADO, não vem do registro — e não dá para regerá-lo
# aqui, porque o CLI do Prisma é dependência de desenvolvimento e não existe
# numa instalação --prod. Então trazemos o que o estágio de build já gerou.
#
# O caminho é o mesmo nos dois estágios: o pnpm mantém o sufixo do peer no
# nome do diretório (@prisma+client@X_prisma@X) mesmo quando o peer não está
# instalado, porque a resolução vem do lockfile. Verificado, não presumido.
COPY --from=build /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /tmp/prisma-client
RUN set -eu; \
    target=$(ls -d node_modules/.pnpm/@prisma+client@*/node_modules); \
    rm -rf "$target/.prisma"; \
    mv /tmp/prisma-client "$target/.prisma"

# -------------------------------------------------------------------- runtime
FROM base AS runtime
ENV NODE_ENV=production

# O query engine do Prisma é um binário nativo que linka com OpenSSL — sem
# isto o container sobe e quebra na primeira consulta. Ver binaryTargets em
# prisma/schema.prisma.
RUN apk add --no-cache openssl

# Processo sem privilégio. Se a aplicação for comprometida, o atacante não
# começa como root dentro do container.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /app/node_modules node_modules
COPY --from=prod-deps --chown=app:app /app/apps/api/node_modules apps/api/node_modules
COPY --from=build --chown=app:app /app/apps/api/dist apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/prisma apps/api/prisma
COPY --from=build --chown=app:app /app/apps/api/package.json apps/api/package.json

USER app
WORKDIR /app/apps/api
EXPOSE 3001

# As migrations NÃO rodam aqui. Com mais de uma réplica, cada container
# aplicaria migrations ao subir, ao mesmo tempo. Elas rodam uma vez, no
# serviço "migrate" do docker-compose.prod.yml, antes da API subir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dist/SRC/main.js, não dist/main.js: o tsconfig inclui prisma/seed.ts fora de
# src, então o TypeScript preserva a estrutura e aninha a saída. Conferido
# dentro da imagem.
CMD ["node", "dist/src/main.js"]
