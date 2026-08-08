# Versátil Academia

Sistema de gestão da academia: balcão, cobrança na recepção, treinos em cupom térmico, presença (catraca facial) e relatórios.

Identidade visual: vermelho `#c41e3a`, fundo `#f4f4f5`, logo em `public/versatil-academia-logo.png`.

## Início rápido

1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) e inicia-o.
2. Copia [`.env.example`](./.env.example) para `.env` e ajusta os segredos (`JWT_SECRET`, `NEXTAUTH_SECRET`, `KIOSK_ACCESS_SECRET`, `CRON_SECRET`).
3. Sobe a infra e prepara a base:

```bash
npm install
npm run pilot:infra
npm run pilot:setup
```

4. Em dois terminais:

```bash
npm run dev      # app Next.js
npm run worker   # filas BullMQ
```

5. Verifica saúde: `npm run pilot:check` → abre http://localhost:3000/login (tenant `demo`).
6. Smoke pós-arranque: `npm run deploy:smoke`.

Guia completo do piloto: **[PILOT.md](./PILOT.md)**.

Questionário para reunião com o cliente (cobrança, catraca, nuvem): **[QUESTIONARIO-CLIENTE.md](./QUESTIONARIO-CLIENTE.md)**.

Cobrança Plano C (balcão + Stone manual) e APIs Stone/cataca: **[INTEGRACOES.md](./INTEGRACOES.md)**.

Roteiro de apresentação ao cliente: **[DEMO.md](./DEMO.md)**.

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

## CI

GitHub Actions em `.github/workflows/ci.yml` (lint, typecheck, **test**, build).

Crons diários (secrets `APP_BASE_URL` + `CRON_SECRET`):

- `.github/workflows/cron-billing.yml` — gera faturas (05:00 UTC)
- `.github/workflows/cron-recalculate.yml` — recalcula estados (06:15 UTC)
