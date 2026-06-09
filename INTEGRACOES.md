# Integrações — Stone e Catraca

Este documento descreve as **duas APIs externas** que a academia precisa conectar ao Versátil.

---

## 1. Catraca (ativa)

Após o reconhecimento facial (ou leitura de ID), o equipamento ou um **gateway local** deve chamar:

```
POST {APP_URL}/api/turnstile/v1/access
```

### Autenticação

| Header | Valor |
|--------|--------|
| `x-tenant-device-token` | Token gerado em **Balcão → Integrações → Novo dispositivo** |
| `Content-Type` | `application/json` |

### Corpo

```json
{
  "studentId": "uuid-do-aluno-no-versatil"
}
```

O `studentId` aparece na URL da ficha do aluno: `/balcao/alunos/{studentId}`.

### Respostas

| HTTP | Corpo | Significado |
|------|--------|-------------|
| `200` | `{ "open": true }` | Aluno **ativo** — liberar catraca |
| `403` | `{ "open": false, "message": "Aluno inadimplente." }` | Fatura vencida em aberto |
| `403` | `{ "open": false, "message": "Aluno inativo." }` | Sem plano vigente |
| `401` | Token inválido ou ausente | Dispositivo não cadastrado |

### Regras de negócio

- Só alunos com status **`active`** passam.
- **Inadimplente** = fatura `open` com vencimento no passado (ou fatura `uncollectible`).
- Presença é registrada automaticamente quando o acesso é **permitido**.

### Cadastro do dispositivo

1. Admin da academia → **Integrações**
2. **Novo dispositivo** → copiar o token (exibido uma vez)
3. Configurar o token no software da catraca / gateway HTTP

---

## 2. Stone (webhook — Fase 2)

Enquanto não houver integração Stone, a recepção registra pagamentos em **Balcão → Cobrança** (dinheiro, Pix, cartão Stone).

Quando tiver credenciais Stone, configure o webhook para:

```
POST {APP_URL}/api/webhooks/stone
```

### Autenticação

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer {STONE_WEBHOOK_SECRET}` |
| `Content-Type` | `application/json` |

Defina `STONE_WEBHOOK_SECRET` no `.env` do servidor (mín. 16 caracteres).

### Contrato interno (payload que o Versátil processa)

Após mapear o evento da Stone para este formato:

```json
{
  "tenantId": "uuid-da-academia",
  "eventId": "id-unico-do-evento-na-stone",
  "type": "invoice.paid",
  "invoiceId": "uuid-da-fatura-no-versatil",
  "stoneChargeId": "opcional-id-cobranca-stone",
  "raw": {}
}
```

### Tipos de evento

| `type` | Efeito no Versátil |
|--------|---------------------|
| `invoice.paid` | Fatura → `paid`, aluno recalculado → pode ficar `active` |
| `invoice.payment_failed` | Fatura → `uncollectible`, aluno pode ficar `inadimplente` |

### Associação fatura ↔ Stone

Cada fatura no Versátil tem um `id` (UUID). Ao criar a cobrança na Stone, guarde esse `invoiceId` nos metadados da cobrança Stone para enviar de volta no webhook.

### Teste manual (sem Stone)

```powershell
$base = "http://localhost:3000"
$secret = "SEU_STONE_WEBHOOK_SECRET"
$body = @{
  tenantId = "uuid-tenant"
  eventId = "teste-001"
  type = "invoice.paid"
  invoiceId = "uuid-fatura"
} | ConvertTo-Json

Invoke-WebRequest -Uri "$base/api/webhooks/stone" -Method POST `
  -Headers @{ Authorization = "Bearer $secret"; "Content-Type" = "application/json" } `
  -Body $body
```

Requer `npm run worker` a correr (fila `webhooks`).

---

## 3. Cron — gerar faturas do período

Agende (com `CRON_SECRET`):

```
GET {APP_URL}/api/cron/generate-invoices
Authorization: Bearer {CRON_SECRET}
```

Cria faturas em aberto para assinaturas ativas (até 7 dias antes do vencimento).

Recomendado: diário, antes do horário de cobrança Stone.

Workflow GitHub Actions: `.github/workflows/cron-billing.yml`.

---

## 4. Fluxo operacional (Plano C)

1. Aluno contrata plano → sistema cria **primeira fatura**
2. Cron (ou botão **Gerar faturas**) cria faturas mensais/semestrais/anuais
3. Stone debita cartão (fora do sistema) **ou** aluno paga no balcão
4. Recepção → **Cobrança** → **Registrar pagamento** (forma: Stone / Pix / dinheiro)
5. Catraca consulta `/api/turnstile/v1/access` → libera ou bloqueia
