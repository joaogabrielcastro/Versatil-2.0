# Tecnofit Enxuto (Versatil)

SaaS multi-tenant para gestão de academias: balcão, cobrança, treinos imprimíveis, presença (catraca facial), importação CSV e Stripe.

## Início rápido

1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) e inicia-o.
2. Copia `.env.example` para `.env` (ou usa o `.env` já criado para desenvolvimento local).
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

Guia completo do piloto: **[PILOT.md](./PILOT.md)**.

## Scripts úteis

| Script | Descrição |
|--------|-----------|
| `npm run pilot:infra` | Postgres + Redis (Docker) |
| `npm run pilot:setup` | Migrações + seed demo |
| `npm run pilot:check` | Health check (`/api/health`) |
| `npm run worker` | Processador de filas |
| `npm run typecheck` | TypeScript |
| `npm run build` | Build de produção |

## CI

GitHub Actions em `.github/workflows/ci.yml` (lint, typecheck, build). Cron de recálculo de alunos: `.github/workflows/cron-recalculate.yml`.
