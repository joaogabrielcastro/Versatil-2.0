# Versátil Academia

SaaS multi-tenant de gestão de academia: balcão, alunos, planos, cobrança (manual / online / maquininha), treinos em cupom térmico, presença (catraca), relatórios e PWA.

Identidade visual: vermelho `#c41e3a`, fundo `#f4f4f5`, logo em `public/versatil-academia-logo.png`.

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 15 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Radix Slot, Lucide, TanStack Query |
| API | Route Handlers + Zod |
| Auth | JWT (`jose`), cookie de sessão, roles (`super_admin`, `tenant_admin`, `tenant_user`) |
| Banco | PostgreSQL 16, Drizzle ORM, RLS por tenant |
| Filas | Redis 7, BullMQ (worker separado) |
| Pagamentos | Manual (balcão), Pagar.me (online/recorrência), Stone Connect (POS), Stripe (legado) |
| Infra | Docker Compose, GitHub Actions (CI + crons) |
| Testes | Vitest |

## Início rápido

1. Instale [Docker Desktop](https://www.docker.com/products/docker-desktop/) e inicie-o.
2. Copie [`.env.example`](./.env.example) para `.env` e ajuste os segredos (`JWT_SECRET`, `NEXTAUTH_SECRET`, `KIOSK_ACCESS_SECRET`, `CRON_SECRET`). Em produção, defina também `PAYMENT_ENCRYPTION_KEY`.
3. Suba a infra e prepare a base:

```bash
npm install
npm run pilot:infra
npm run pilot:setup
```

4. Em dois terminais:

```bash
npm run dev      # app Next.js
npm run worker   # filas BullMQ (obrigatório para webhooks/import)
```

5. Verifique: `npm run pilot:check` → http://localhost:3000/login (tenant `demo`).
6. Smoke pós-arranque: `npm run deploy:smoke`.

## Documentação

| Doc | Conteúdo |
|-----|----------|
| **[PILOT.md](./PILOT.md)** | Piloto local/produção, checklist funcional, backup |
| **[INTEGRACOES.md](./INTEGRACOES.md)** | Catraca e webhooks |
| **[DEMO.md](./DEMO.md)** | Roteiro de apresentação |
| **[QUESTIONARIO-CLIENTE.md](./QUESTIONARIO-CLIENTE.md)** | Levantamento com o cliente |

## Módulos principais

- **Balcão** — alunos, planos, assinaturas, cobrança, presença, relatórios, import CSV
- **Cobrança** — registro manual; Pix/boleto via Pagar.me; cobrança na maquininha (Stone Connect); renovação automática com cartão salvo
- **Pagamentos (admin)** — `/balcao/configuracoes/pagamentos` (credenciais cifradas por tenant)
- **Catraca** — `POST /api/turnstile/v1/access` (status do aluno libera/bloqueia)
- **Terminal de treino** — `/imprimir-treino?slug=…&token=…` (requer `KIOSK_ACCESS_SECRET`)
- **Plataforma** — super admin de tenants

## Scripts úteis

| Script | Descrição |
|--------|-----------|
| `npm run pilot:infra` | Postgres + Redis (Docker) |
| `npm run pilot:setup` | Migrações + seed demo |
| `npm run demo:seed` | Alunos e dados de apresentação |
| `npm run pilot:check` | Health check (`/api/health`) |
| `npm run deploy:smoke` | Smoke pós-deploy (health + login + gate kiosk) |
| `npm run db:backup` | Dump Postgres (`pg_dump`; ou `BACKUP_VIA_DOCKER=1`) |
| `npm run worker` | Processador de filas |
| `npm test` | Testes unitários (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Build de produção |

## CI e crons

GitHub Actions em `.github/workflows/ci.yml` — lint, typecheck, **test**, build.

Crons diários (secrets obrigatórios no repositório: **`APP_BASE_URL`** + **`CRON_SECRET`**):

| Workflow | Horário (UTC) | Endpoint |
|----------|---------------|----------|
| `cron-billing.yml` | 05:00 | `/api/cron/generate-invoices` |
| `cron-charge.yml` | 06:00 | `/api/cron/charge-open-invoices` |
| `cron-recalculate.yml` | 06:15 | `/api/cron/recalculate-students` |

Configure em **Settings → Secrets and variables → Actions**. Sem esses secrets, os workflows falham com `BASE`/`SECRET` vazios.

## Pagamentos (resumo)

| Forma | Onde configurar | Observação |
|-------|-----------------|------------|
| Manual (dinheiro/Pix/cartão) | Balcão → Cobrança | Sempre disponível |
| Pagar.me (Pix/boleto/cartão + recorrência) | Configurações → Pagamentos | Webhook: `/api/webhooks/pagarme?tenantSlug=…` |
| Stone Connect (maquininha) | Configurações → Pagamentos | Requer Partner Program (`ServiceRefererName`); confirmação via webhook Pagar.me |
| Stripe | Configurações → Pagamentos | Legado / opcional |

Credenciais por tenant ficam cifradas (`PAYMENT_ENCRYPTION_KEY`). Homologação em sandbox Pagar.me / Stone ainda é necessária antes de produção com cobrança online/POS.

## Produção (checklist rápido)

- [ ] `.env` com segredos fortes e `APP_URL` pública
- [ ] `KIOSK_ACCESS_SECRET`, `CRON_SECRET`, `PAYMENT_ENCRYPTION_KEY`
- [ ] Migrações aplicadas (`npm run start` ou `pilot:setup`)
- [ ] Worker rodando (`npm run worker` ou Compose profile `pilot`)
- [ ] Secrets GitHub `APP_BASE_URL` + `CRON_SECRET` para os crons
- [ ] Backup agendado: `npm run db:backup`
- [ ] (Opcional) Credenciais Pagar.me / Stone Connect por academia
