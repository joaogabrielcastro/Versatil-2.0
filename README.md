# Versátil Academia

SaaS multi-tenant de gestão de academia: balcão, alunos, planos, cobrança (manual / online / maquininha), treinos em cupom térmico, presença (catraca), relatórios e PWA.

Identidade visual: vermelho `#c41e3a`, fundo `#f4f4f5`, logo em `public/versatil-academia-logo.png`.

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Radix Slot, Lucide, TanStack Query |
| API | Route Handlers + Zod |
| Auth | JWT (`jose`), cookie de sessão, roles (`super_admin`, `tenant_admin`, `tenant_user`) |
| Banco | PostgreSQL 16, Drizzle ORM, RLS por tenant |
| Filas | Redis 7, BullMQ (worker separado) |
| Pagamentos | Manual (balcão) + Stone Connect (POS / recorrência). Sem Pagar.me/Stripe no produto |
| Infra | Docker Compose, GitHub Actions (CI + crons) |
| Testes | Vitest |

## Início rápido

1. Instale [Docker Desktop](https://www.docker.com/products/docker-desktop/) e inicie-o.
2. Copie [`.env.example`](./.env.example) para `.env` e ajuste os segredos (`JWT_SECRET`, `NEXTAUTH_SECRET`, `CRON_SECRET`). Em produção, `PAYMENT_ENCRYPTION_KEY` é obrigatória, e `MIGRATION_DATABASE_URL` / `BACKUP_DATABASE_URL` usam o login dono das tabelas (ver [DEPLOY.md](./DEPLOY.md)).
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
| **[LGPD.md](./LGPD.md)** | Direitos do titular, o que está implementado e o que falta |

## Módulos principais

- **Balcão** — alunos, planos, assinaturas, cobrança, presença, relatórios, import CSV
- **Cobrança** — registro manual; cobrança e renovação automática na maquininha Stone Connect
- **Pagamentos (admin)** — `/balcao/configuracoes/pagamentos` (Stone Connect, credenciais cifradas)
- **Catraca** — `POST /api/turnstile/v1/access` (status do aluno libera/bloqueia)
- **Terminal de treino** — Integrações → Terminais (token por dispositivo, hash no banco)
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
| `npm run test:e2e` | Fluxos no navegador (Playwright): login, cadastro, matrícula e pagamento, perfis, isolamento entre academias, celular. Requer `npm run build`, Postgres e Redis |
| `npm run typecheck` | TypeScript |
| `npm run build` | Build de produção |

## CI e crons

GitHub Actions em `.github/workflows/ci.yml` — lint, typecheck, **test**, build e **E2E**.

Crons (secrets obrigatórios no repositório: **`APP_BASE_URL`** + **`CRON_SECRET`**):

| Workflow | Horário (UTC) | Endpoint |
|----------|---------------|----------|
| `cron-billing.yml` | 05:00 | `/api/cron/generate-invoices` |
| `cron-charge.yml` | 06:00 | `/api/cron/charge-open-invoices` |
| `cron-recalculate.yml` | 06:15 | `/api/cron/recalculate-students` |
| `cron-reconcile-stone.yml` | a cada 15 min | `/api/cron/reconcile-stone` |

Configure em **Settings → Secrets and variables → Actions**. Sem esses secrets, os workflows falham com `BASE`/`SECRET` vazios.

## Pagamentos (resumo)

| Forma | Onde configurar | Observação |
|-------|-----------------|------------|
| Manual (dinheiro/Pix/cartão já recebido) | Balcão → Cobrança | Sempre disponível |
| Stone Connect (maquininha + recorrência) | Configurações → Pagamentos | Partner Program (`ServiceRefererName`); webhook HMAC ou Bearer. Ver INTEGRACOES.md |

Credenciais por tenant ficam cifradas (`PAYMENT_ENCRYPTION_KEY`). Homologação Stone (POS real / sandbox) é bloqueio externo — testes mockados não a substituem.

## Produção (checklist rápido)

- [ ] `.env` com segredos fortes e `APP_URL` pública
- [ ] `CRON_SECRET`, `PAYMENT_ENCRYPTION_KEY`, `MIGRATION_DATABASE_URL`, `BACKUP_DATABASE_URL`, `PLATFORM_DATABASE_URL`
- [ ] Migrações aplicadas (`npm run start` ou `pilot:setup`)
- [ ] Worker rodando (`npm run worker` ou Compose profile `pilot`)
- [ ] Secrets GitHub `APP_BASE_URL` + `CRON_SECRET` para os crons
- [ ] Backup agendado (`npm run db:backup`) e restauração ensaiada em banco separado (DEPLOY.md)
- [ ] Termos, política de privacidade e LGPD ([LGPD.md](./LGPD.md))
- [ ] (Opcional) Credenciais Stone Connect por academia + webhook
