# ComerciON

Sistema de gestão de comércios (ERP + CRM + e-commerce + automação de WhatsApp), multi-tenant desde a fundação. Construído em fases incrementais — veja o roadmap completo em [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| API | NestJS + TypeScript | Modular por natureza (módulos ativáveis por tenant), DI/guards prontos para multi-tenant e RBAC, gera OpenAPI automaticamente |
| ORM / DB | Prisma + PostgreSQL | Migrations versionadas, type-safety ponta a ponta, RLS no Postgres para isolamento de tenant |
| Fila / cache | Redis + BullMQ | Preparado para automações assíncronas (WhatsApp, cobrança, carrinho abandonado) desde já |
| Painel admin | Next.js + TypeScript + Tailwind | Mesma linguagem do backend, SSR quando fizer sentido, base para a loja online da Fase 3 |
| Auth | JWT (access + refresh) + TOTP (2FA) | Padrão stateless, fácil de escalar horizontalmente |
| Deploy | Docker Compose | Sobe local ou em qualquer VPS sem mudanças |

## Arquitetura multi-tenant

Banco compartilhado, schema compartilhado: toda tabela de domínio tem `tenantId`. Um middleware do Prisma injeta e filtra o `tenantId` automaticamente a partir do contexto da requisição (resolvido pelo header `x-tenant-slug` em dev, ou subdomínio em produção), então nenhuma query de módulo de negócio precisa lembrar de filtrar por tenant manualmente. Módulos de negócio (CRM, estoque, vendas, fiscal, WhatsApp...) são habilitados por tenant via a tabela `TenantModule` — a base do futuro modelo de planos do SaaS (Fase 7).

## Estrutura de pastas

```
.
├── apps/
│   ├── api/            # NestJS — API REST, Prisma, regras de negócio
│   └── web/             # Next.js — painel administrativo
├── packages/             # (futuro) tipos/utilitários compartilhados entre api e web
├── docs/
│   └── ROADMAP.md
├── docker-compose.yml
└── .env.example
```

## Rodando localmente

Pré-requisitos: Node.js 20+, pnpm 9+, Docker (para Postgres/Redis, ou instale-os localmente).

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm --filter api prisma:migrate
pnpm dev:api    # http://localhost:3001 (Swagger em /docs)
pnpm dev:web    # http://localhost:3000
```

Ou tudo via Docker:

```bash
cp .env.example .env
docker compose up -d --build
```

## Status

Fase 0 (Fundação) em desenvolvimento — ver resumo de entrega no final da conversa/PR correspondente.
