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

Informe **pelo menos um** identificador:

```json
{ "studentCode": "76126" }
```

ou

```json
{ "cpf": "10346680999" }
```

ou (UUID do Versátil)

```json
{
  "studentId": "uuid-do-aluno-no-versatil"
}
```

| Campo | Uso |
|--------|------|
| `studentCode` ou `codigo` | **COD Tecnofit** (o mesmo da tela de presença / catraca) |
| `cpf` | CPF do aluno (com ou sem máscara) |
| `studentId` | UUID na ficha `/balcao/alunos/{id}` |

No import de alunos, o COD Tecnofit é gravado automaticamente (`facial_vector_ref = tecnofit:{codigo}`).

### Respostas

| HTTP | Corpo | Significado |
|------|--------|-------------|
| `200` | `{ "open": true }` | Aluno **ativo** — liberar catraca |
| `403` | `{ "open": false, "message": "Aluno inadimplente." }` | Fatura vencida em aberto |
| `403` | `{ "open": false, "message": "Aluno inativo." }` | Sem plano vigente |
| `403` | `{ "open": false, "message": "Aluno não encontrado." }` | COD/CPF/UUID desconhecido |
| `401` | Token inválido ou ausente | Dispositivo não cadastrado |

### Gateway Control iD (academia Versátil Colombo)

Hardware típico: **IdFace** (`192.168.0.76`) em modo On Line apontando para o PC da recepção. O gateway local deve, após o reconhecimento, chamar esta API com o **COD** do aluno e abrir/bloquear conforme `open`.

### Regras de negócio

- Só alunos com status **`active`** passam.
- **Inadimplente** = fatura `open` com vencimento no passado (ou fatura `uncollectible`).
- Presença é registrada automaticamente quando o acesso é **permitido**.

### Cadastro do dispositivo

1. Admin da academia → **Integrações**
2. **Novo dispositivo** → copiar o token (exibido uma vez)
3. Configurar o token no software da catraca / gateway HTTP

---

## 2. Stone Connect (único gateway)

O Versátil é **Stone-only**. Cobrança no balcão e recorrência enviam a fatura à maquininha (POS). Registro manual (dinheiro/Pix/cartão já recebido) continua em **Balcão → Cobrança**.

### 2.1 Pedido no POS (contrato neste repositório)

Implementação: `src/lib/payments/providers/stone/` — **não inventamos outro host**.

| Campo | Valor documentado no código |
|--------|------------------------------|
| Endpoint | `POST https://api.pagar.me/core/v5/orders` |
| Consulta | `GET https://api.pagar.me/core/v5/charges/{id}` |
| Auth | `Authorization: Basic base64(secretKey:)` |
| Header POS | `ServiceRefererName: {id da parceria Stone Partner Program}` |
| Timeout | 20s |
| Payload | `closed: false` + `poi_payment_settings.devices_serial_number` + `payment_setup` + `metadata.invoiceId` |
| Serial | serial do POS (ou o padrão do tenant) |

Este host Core v5 é **infraestrutura do Stone Connect**, não o produto/checkout Pagar.me.

### 2.2 Confirmação — webhook

```
POST {APP_URL}/api/webhooks/stone
```

Dois caminhos **fail-closed** (sem autenticação válida a fatura **não** é marcada paga):

**A — Envelope Core (HMAC), quando a Stone envia `charge.paid`**

| Item | Valor |
|------|--------|
| URL | `/api/webhooks/stone?tenantSlug=SEU_SLUG` (ou `tenantId=uuid`) |
| Header | `X-Hub-Signature` / `X-Hub-Signature-256` (HMAC-SHA256 do body) |
| Segredo | `webhookSecret` do tenant (Pagamentos → Stone Connect) |
| Eventos mapeados | `charge.paid` / `order.paid` → `invoice.paid`; `charge.payment_failed` / `charge.failed` → `invoice.payment_failed` |
| Conferência | fatura do tenant, `stoneChargeId` vs `externalId`, valor vs `amountCents` |

**B — Contrato interno mapeado (integração/gateway local)**

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer {STONE_WEBHOOK_SECRET}` |
| `Content-Type` | `application/json` |

```json
{
  "tenantId": "uuid-da-academia",
  "eventId": "id-unico-do-evento",
  "type": "invoice.paid",
  "invoiceId": "uuid-da-fatura-no-versatil",
  "stoneChargeId": "opcional-id-cobranca",
  "amountCents": 9900,
  "raw": {}
}
```

| `type` | Efeito no Versátil |
|--------|---------------------|
| `invoice.paid` | Fatura → `paid`, `gatewayChargeStatus=succeeded` |
| `invoice.payment_failed` | Mantém aberta e agenda retry 1/3/7 dias; `uncollectible` só após `MAX_CHARGE_ATTEMPTS` (4) |

Não aceite um body `{ invoiceId, status: "paid" }` sem Bearer/HMAC válidos.

Requer `npm run worker` (fila `webhooks`).

### 2.3 Cancelamento e estorno

**BLOQUEIO EXTERNO — necessário para homologação Stone.**

O contrato Connect disponível neste repositório **não documenta** endpoint de void/cancelamento nem refund. O adapter lança `PaymentNotImplementedError` — não inventamos API.

### 2.4 Recorrência

Cron `GET /api/cron/charge-open-invoices` → `chargeDueInvoicesAll` → `chargeInvoiceOnStone` (mesmo POS). Não há cartão salvo / cobrança silenciosa online no contrato Connect deste repo.

POS offline, timeout ou recusa: fatura permanece aberta, backoff 1/3/7, no máximo 4 tentativas. Cobrança `pending` com `externalId` é **reutilizada** (não duplica).

### 2.5 Homologação

Testes unitários/integrados **não** equivalem a homologação Stone. Falta:

- credenciais reais / Partner Program (`ServiceRefererName`);
- POS físico e serial;
- sandbox Stone e registro oficial do webhook;
- documentação oficial de cancelamento/estorno, se existir fora deste repo.

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

## 4. Fluxo operacional

1. Aluno contrata plano → sistema cria **primeira fatura**
2. Cron (ou botão **Gerar faturas**) cria faturas mensais/semestrais/anuais
3. Recepção → **Cobrança** → **Cobrar na maquininha** (Stone) **ou** **Registrar pagamento** (já recebido)
4. Assinatura com renovação automática: cron envia a fatura vencida ao POS padrão
5. Webhook autenticado confirma → fatura `paid`
6. Catraca consulta `/api/turnstile/v1/access` → libera ou bloqueia
