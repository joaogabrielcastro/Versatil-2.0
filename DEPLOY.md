# Implantação — checklist

Não rode estas migrations no banco de produção sem revisar. O `npm start` aplica o que estiver em `drizzle/` se `SKIP_MIGRATIONS` não for `true`.

Termo `source = migration`: o preço copiado do plano vale só a partir de `valid_from` (a data da migration, em `0016`). Ciclos anteriores sem termo próprio vão para `billing_reviews` e não são cobrados. Uma fatura antiga não define o preço dos outros ciclos.

Este repositório não contém proxy reverso. `TRUST_PROXY` é ignorado. `X-Forwarded-For` não entra no IP do cliente.

## Banco

Ordem, só em ensaio primeiro:

1. `0011_stone_charge_attempt` — colunas novas em faturas, com default. Compatível com linhas já existentes.
2. `0012_db_roles_session` — papéis `versatil_platform` e `versatil_app`, RLS de `platform_admins`, `session_version`. Concede `versatil_platform` a quem aplica a migration. Troque `DATABASE_URL` depois disso.
3. `0013_app_schema_grants` — `USAGE` e `EXECUTE` em `app` para `versatil_app`.
4. `0014_cron_runs` — histórico de cron, visível só com bypass de plataforma.

Backup antes: `npm run db:backup`.

Login da aplicação, sem senha neste arquivo. Quem executa é o login das migrations, depois da `0018`:

```sql
\i scripts/provision-db-roles.sql
```

O script cria `versatil_runtime` e `versatil_jobs` (`NOSUPERUSER`, `NOBYPASSRLS`), concede `versatil_app` ao runtime e `versatil_platform` ao jobs, e revoga plataforma do runtime. A `0018` entrega ao grupo `versatil_platform` uso do schema `app`, execução das funções e DML nas tabelas existentes. Objetos futuros criados pelo mesmo login herdam esse privilégio. Um dump com `--no-acl` não recria papéis globais nem os GRANT. Em servidor novo, restaure e rode este script de novo com o login dono dos objetos.

`DATABASE_URL` = `versatil_runtime`. `PLATFORM_DATABASE_URL` = `versatil_jobs`. Sem a segunda variável, cron e bypass respondem 503 com a mensagem `PLATFORM_DATABASE_URL ausente` e não usam o login da aplicação.

Prova, conectado como `versatil_runtime`:

```sql
SELECT set_config('app.bypass_rls', 'true', true);
SELECT count(*) FROM students;          -- 0
SET ROLE versatil_platform;             -- permissão recusada
SELECT set_config('app.tenant_id', '<uuid da academia>', false);
SELECT count(*) FROM students;          -- só a academia escolhida
```

JWTs emitidos antes de `session_version` deixam de valer. Peça login de novo.

## Segredos

O processo recusa subir se faltar `JWT_SECRET`, `NEXTAUTH_SECRET` ou `PAYMENT_ENCRYPTION_KEY` (64 hex). A mensagem não imprime o valor.

- `CRON_SECRET` nos quatro crons.
- `STONE_WEBHOOK_SECRET` só se usar o contrato interno. `POST /api/webhooks/gateway` responde 410 e não quita fatura.
- `CLIENT_IP_HEADER`: só um cabeçalho que o proxy substitui por completo, por exemplo o da borda real. `x-forwarded-for` é recusado. Sem esse cabeçalho o IP fica `direct`.

## Crons

Autenticação: `Authorization: Bearer $CRON_SECRET`. Sem o segredo, 503. Bearer errado, 401. Sem `PLATFORM_DATABASE_URL`, 503.

Uma academia que falha é registrada e as outras seguem. Cada execução grava uma linha em `cron_runs` (job, ok, finished_at, summary, error). Health da API fica `ok` com banco, Redis e banco de plataforma. O worker entra em `processing.ok` e não derruba a prontidão da API.

| Job | Rota | Agenda no GitHub Actions | Depende de |
| --- | --- | --- | --- |
| generate-invoices | `GET /api/cron/generate-invoices` | 05:00 UTC (`.github/workflows/cron-billing.yml`) | `PLATFORM_DATABASE_URL` |
| charge-open-invoices | `GET /api/cron/charge-open-invoices` | 06:00 UTC (`.github/workflows/cron-charge.yml`) | Stone configurada por academia |
| recalculate-students | `GET /api/cron/recalculate-students` | 06:15 UTC (`.github/workflows/cron-recalculate.yml`) | só cache; a catraca recalcula na hora |
| reconcile-stone | `GET /api/cron/reconcile-stone` | a cada 15 min (`.github/workflows/cron-reconcile-stone.yml`) | `externalId` já gravado |

O worker (`npm run worker`) grava heartbeat no Redis a cada 10s, com expiração de 30s. `processing.worker` é `active`, `absent` ou `stale`. Falha do worker não reinicia a API.

## Catraca e Stone

- Catraca: `POST /api/turnstile/v1/access` com `x-tenant-device-token`. Sem HTTP 200 `{open:true}` a porta não abre por este handler. Homologação com equipamento real ainda não foi feita.
- Stone Connect é Pagar.me Core v5 (`POST /orders`, `GET /charges/{id}`). Cobrança, recusa, timeout e evento repetido foram testados com mock, não com a Stone.
- A chave da tentativa fica no banco antes do HTTP. O header `Idempotency-Key` não é enviado. Resposta perdida não gera segundo POST: a fatura permanece pendente e a tela recebe 409 até conferência na maquininha.

## Backup

- Agende `npm run db:backup` diário, fora do disco da aplicação. `BACKUP_KEEP` padrão é 14. Falha do `pg_dump` encerra com código diferente de zero; não apague o backup anterior.
- Ensaio, em banco vazio e diferente de `DATABASE_URL`:

```
CONFIRM_RESTORE=yes RESTORE_DATABASE_URL=postgresql://ensaio... npm run db:restore -- backups/versatil-YYYYMMDD.dump
```

O script recusa se faltar `CONFIRM_RESTORE=yes`, se faltar o dump, ou se `RESTORE_DATABASE_URL` for igual a `DATABASE_URL`.

Depois do restore: `select count(*)` de tenants, alunos e faturas; conferir `drizzle.__drizzle_migrations`; repetir a prova de RLS do login de runtime.

## Se o deploy falhar

- Health 503 com `database: false` ou `redis: false`: não troque o tráfego.
- Health com `platformDatabase: false`: crons não rodam. Corrija `PLATFORM_DATABASE_URL` sem reaproveitar `DATABASE_URL`.
- `cronFresh: false` depois do horário previsto: leia `cron_runs.error` e o log `cron.tenant_failed` (tem `tenantId`, sem CPF).
- Migration pela metade: restaure o dump anterior no banco de ensaio e só então repita. Não aponte o restore para produção.
