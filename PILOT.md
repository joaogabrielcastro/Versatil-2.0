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

Copia [`.env.example`](./.env.example) para `.env` e ajusta segredos:

- `JWT_SECRET`, `NEXTAUTH_SECRET` ≥ 32 caracteres
- Terminal de treino: token por dispositivo em **Integrações → Terminais** (o antigo `KIOSK_ACCESS_SECRET` não autoriza mais nada)
- `CRON_SECRET` ≥ 8 (para jobs de fatura/recálculo)

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
npm run deploy:smoke
```

## 4. Worker no Docker (opcional)

Com Postgres/Redis já a subir pelo Compose, com segredos no `.env` na raiz (o Compose usa estes valores para o serviço `worker`):

```bash
docker compose --profile pilot up -d --build worker
```

O worker na rede Docker usa `REDIS_URL=redis://redis:6379` e `DATABASE_URL` com host `postgres` (definidos no `docker-compose.yml`).

## 5. Cobrança (Plano C — balcão + Stone manual)

- **Balcão → Cobrança:** faturas em aberto e registro de pagamento (dinheiro, Pix, cartão Stone).
- Ao associar plano ao aluno, a **primeira fatura** é criada automaticamente.
- Cron (ou botão no balcão): `GET /api/cron/generate-invoices` com `Authorization: Bearer CRON_SECRET`.
- Integrações Stone + catraca: **[INTEGRACOES.md](./INTEGRACOES.md)**.

## 6. Stone Connect

Credenciais por academia em **Balcão → Pagamentos**. Webhook: ver **[INTEGRACOES.md](./INTEGRACOES.md)**. Stripe e checkout Pagar.me foram removidos do produto.

## 7. Cron (recalcular estados dos alunos)

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

## 8. Checklist funcional

| Item | Onde |
|------|------|
| Login balcão | `/login` (slug `demo` se não usares subdomínio) |
| Painel | `/balcao` |
| Cobrança (faturas + pagamento balcão) | `/balcao/cobranca` |
| Alunos / fatura por aluno | Balcão → ficha do aluno |
| Planos / assinaturas | `/balcao/planos` e ficha do aluno |
| Modelos de treino | `/balcao/treinos` (pré-fixados, imprimíveis) |
| Presença diária | `/balcao/presenca` e ficha do aluno (automático via catraca / facial) |
| Relatórios | `/balcao/relatorios` — financeiro + presença por período, export CSV |
| Terminal do aluno | `/imprimir-treino?slug=demo` — cupom 80mm (token do terminal em Integrações → Terminais) |
| Import CSV | `/balcao/importar` + worker |
| Webhook Stone | `POST /api/webhooks/stone` — único caminho que liquida fatura |
| Catraca | `POST /api/turnstile/v1/access` — ver INTEGRACOES.md |
| Stone (webhook Fase 2) | `POST /api/webhooks/stone` |

## 9. Produção (`npm run start`)

Garante `SKIP_MIGRATIONS` **não** definido como `true` no processo do Next se quiseres migrações no arranque (`scripts/pre-start.mjs`). O worker deve usar `SKIP_MIGRATIONS=true` (já no Compose).

Define em produção: `CRON_SECRET` e `PAYMENT_ENCRYPTION_KEY` (obrigatória; o processo não sobe sem ela). Credenciais de banco: ver DEPLOY.md.

No GitHub: secrets **`APP_BASE_URL`** + **`CRON_SECRET`** — os workflows de fatura e recálculo correm diariamente (e também via *Run workflow*).

## 10. Backup Postgres

Dump local (requer `pg_dump` no PATH):

```bash
npm run db:backup
```

Via Docker Compose (serviço `postgres` a correr):

```bash
BACKUP_VIA_DOCKER=1 npm run db:backup
```

Ficheiros em `./backups/versatil-*.dump` (gitignored). Retenção: `BACKUP_KEEP` (default 14).

Restaurar — **nunca** sobre o banco em uso. Ensaie num banco vazio e separado:

```bash
CONFIRM_RESTORE=yes RESTORE_DATABASE_URL=postgresql://…/ensaio npm run db:restore -- backups/versatil-YYYYMMDD….dump
```

O script recusa se o destino for igual a `DATABASE_URL`. Procedimento completo em DEPLOY.md.

No Coolify/VPS, agenda o mesmo comando no cron do host (ex. diário 03:00) e copia os dumps para armazenamento externo.
