# Importar alunos (relatório Tecnofit)

Como colocar no Versátil os alunos exportados do sistema antigo (Tecnofit).
O relatório vem como `.xls`, mas na verdade é uma **tabela HTML**.

## Visão geral

O processo tem 2 passos:

1. **Parse** — lê o `.xls` e gera um JSON limpo em `scripts/data/`.
2. **Import** — grava no banco (aluno + assinatura + fatura com valor e vencimento reais),
   e o status (ativo/inadimplente) é calculado pela data de vencimento.

> O JSON em `scripts/data/` contém **dados pessoais reais (CPF, e-mail, telefone)** e por isso
> está no `.gitignore` — **nunca é enviado ao git nem ao servidor pelo deploy**.
> Por isso a importação em produção é feita da sua máquina apontando para o banco de produção.

---

## 1. Gerar o JSON a partir do relatório

```powershell
node scripts/parse-tecnofit-report.mjs "C:\caminho\relatorio.xls" --json scripts/data/alunos-versatil.json
```

O comando mostra um resumo (total de alunos, quantos ativos/inadimplentes, etc.).

---

## 2a. Importar no ambiente LOCAL (teste/demo)

Pré-requisitos: Docker Desktop aberto + Postgres local no ar (`docker compose up -d postgres redis`)
e migrações aplicadas (`node scripts/pre-start.mjs` com `DATABASE_URL` local).

```powershell
$env:DATABASE_URL="postgresql://app:app@localhost:5432/tecnofit"
$env:NODE_ENV="development"
$env:IMPORT_TENANT_SLUG="colombo"
$env:IMPORT_TENANT_NAME="Versátil Colombo"
$env:IMPORT_CREATE_TENANT="1"
$env:IMPORT_ADMIN_EMAIL="recep@colombo.com"
$env:IMPORT_ADMIN_PASSWORD="troque-esta-senha"
npm run import:students
```

Login local: http://localhost:3000/login?slug=colombo

---

## 2b. Importar em PRODUÇÃO (Coolify)

Como o banco de produção só é acessível dentro da rede do Coolify, exponha a porta
do Postgres **temporariamente** e rode a importação da sua máquina.

### Passo 1 — Expor o Postgres no Coolify (temporário)
No Coolify → recurso **PostgreSQL** → habilite a porta pública (Public Port).
Anote o **host público** e a **porta** que o Coolify mostrar.

### Passo 2 — Rodar a importação apontando para produção
```powershell
# Use o host/porta PÚBLICOS do Coolify (não o host interno z8cjbhz...)
$env:DATABASE_URL="postgresql://postgres:SENHA@HOST_PUBLICO:PORTA_PUBLICA/saas_versatil"
$env:NODE_ENV="production"
$env:IMPORT_TENANT_SLUG="colombo"
$env:IMPORT_TENANT_NAME="Versátil Colombo"
$env:IMPORT_CREATE_TENANT="1"
$env:IMPORT_ADMIN_EMAIL="recep@colombo.com"
$env:IMPORT_ADMIN_PASSWORD="senha-forte-de-producao"
npm run import:students
```

### Passo 3 — Fechar a porta pública
Volte ao Coolify e **desabilite** a porta pública do Postgres.

Depois, o login em produção fica em `https://SEU_DOMINIO/login?slug=colombo`
(ou, se configurar subdomínio `colombo.SEU_DOMINIO`, sem precisar do slug).

---

## Reimportar / atualizar (idempotente)

Rodar de novo **não duplica**: atualiza contato dos alunos existentes (por CPF)
e cria apenas faturas de vencimentos ainda não importados.

## Variáveis do importador

| Variável | Padrão | Função |
|----------|--------|--------|
| `IMPORT_TENANT_SLUG` | `demo` | Slug da academia de destino |
| `IMPORT_TENANT_NAME` | `Versátil Academia` | Nome (ao criar tenant) |
| `IMPORT_CREATE_TENANT` | — | `1` cria o tenant + admin + modelos se não existir |
| `IMPORT_ADMIN_EMAIL` | `recep@<slug>.com` | E-mail do admin criado |
| `IMPORT_ADMIN_PASSWORD` | `versatil12345678` | Senha do admin criado |
| `IMPORT_WITH_BILLING` | `1` (ligado) | `0` importa só cadastro, sem assinatura/fatura |
| `IMPORT_FILE` | `scripts/data/alunos-versatil.json` | Caminho do JSON |
| `IMPORT_DRY_RUN` | — | `1` só simula, não grava nada |

## Segurança

- Troque a **senha do admin** logo após o primeiro login.
- A senha do Postgres de produção já foi exposta em conversas — **rotacione-a** no Coolify.
- Não deixe a porta pública do Postgres habilitada após a importação.
