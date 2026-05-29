# Piloto — colocar tudo a funcionar

## 1. Infra (Postgres + Redis)

Na raiz do projeto:

```bash
docker compose up -d postgres redis
```

- Postgres: `localhost:5432`, utilizador `app`, password `app`, BD `tecnofit`.
- Redis: `localhost:6380` → mapeado para o Redis interno na porta 6379.

No `.env` local (desenvolvimento):

- `DATABASE_URL=postgresql://app:app@localhost:5432/tecnofit`
- `REDIS_URL=redis://localhost:6380`

## 2. Variáveis e base de dados

Copia `.env.example` para `.env` e ajusta segredos (`JWT_SECRET`, `NEXTAUTH_SECRET` ≥ 32 caracteres).

Depois:

```bash
npm install
npm run pilot:setup
```

Isto aplica migrações e corre o seed (tenant demo, utilizador recepção, super admin plataforma, **planos Mensal/Anual** se ainda não existirem).

## 3. Aplicação Next (API + UI)

Num terminal:

```bash
npm run dev
```

Noutro terminal (obrigatório para filas):

```bash
npm run worker
```

Smoke rápido (com o dev a correr):

```bash
npm run pilot:check
```

## 4. Worker no Docker (opcional)

Com Postgres/Redis já a subir pelo Compose, com segredos no `.env` na raiz (o Compose usa estes valores para o serviço `worker`):

```bash
docker compose --profile pilot up -d --build worker
```

O worker na rede Docker usa `REDIS_URL=redis://redis:6379` e `DATABASE_URL` com host `postgres` (definidos no `docker-compose.yml`).

## 5. Stripe (cobrança online)

1. `STRIPE_SECRET_KEY` e/ou credenciais em **Balcão → Pagamentos**.
2. `STRIPE_WEBHOOK_SECRET` + webhook Stripe para `POST …/api/webhooks/stripe` com evento **checkout.session.completed**.
3. `APP_URL` = URL pública do site (redirects do checkout).

## 6. Cron (recalcular estados dos alunos)

1. Define `CRON_SECRET` no `.env`.
2. Agenda um HTTP GET para `/api/cron/recalculate-students` com header  
   `Authorization: Bearer <CRON_SECRET>`.

No GitHub: configura os secrets **`APP_BASE_URL`** (URL pública, sem barra final opcional) e **`CRON_SECRET`**, depois **Actions → "Cron — recalculate students" → Run workflow**.

Para agenda fixa, edita `.github/workflows/cron-recalculate.yml` e descomenta o bloco `schedule:` (exemplo no ficheiro).

**Windows (Task Scheduler ou teste manual):**

```powershell
$base = "http://localhost:3000"
$secret = "SEU_CRON_SECRET"
Invoke-WebRequest -Uri "$base/api/cron/recalculate-students" -Headers @{ Authorization = "Bearer $secret" }
```

## 7. Checklist funcional

| Item | Onde |
|------|------|
| Login balcão | `/login` (slug `demo` se não usares subdomínio) |
| Painel | `/balcao` |
| Alunos / fatura / Stripe | Balcão |
| Planos / assinaturas | `/balcao/planos` e ficha do aluno |
| Modelos de treino | `/balcao/treinos` (pré-fixados, imprimíveis) |
| Presença diária | `/balcao/presenca` e ficha do aluno (automático via catraca / facial) |
| Relatórios | `/balcao/relatorios` — financeiro + presença por período, export CSV |
| Terminal do aluno | `/imprimir-treino?slug=demo` — cupom 80mm para impressora térmica |
| Import CSV | `/balcao/importar` + worker |
| Webhook gateway | `POST /api/webhooks/gateway` com Bearer `WEBHOOK_INGEST_SECRET` |
| Catraca | `POST /api/turnstile/v1/access` |

## 8. Produção (`npm run start`)

Garante `SKIP_MIGRATIONS` **não** definido como `true` no processo do Next se quiseres migrações no arranque (`scripts/pre-start.mjs`). O worker deve usar `SKIP_MIGRATIONS=true` (já no Compose).
