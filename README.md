# Versátil Academia

Sistema de gestão da academia: balcão, cobrança, treinos em cupom térmico, presença (catraca facial), importação CSV e Stripe.

Identidade visual: vermelho `#c41e3a`, fundo `#f4f4f5`, logo em `public/versatil-academia-logo.png`.

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

Questionário para reunião com o cliente (cobrança, catraca, nuvem): **[QUESTIONARIO-CLIENTE.md](./QUESTIONARIO-CLIENTE.md)**.

Cobrança Plano C (balcão + Stone manual) e APIs Stone/cataca: **[INTEGRACOES.md](./INTEGRACOES.md)**.

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
