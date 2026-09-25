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
| Idempotência | A chave `stone:{invoiceId}:{tentativa}` é gravada antes do HTTP, mas o header `Idempotency-Key` **não** é enviado. A documentação pública do Pagar.me Core v5 não foi tomada como garantia. Se a resposta se perde, a fatura fica pendente e uma nova cobrança na mesma fatura é recusada (409) até conferência manual na maquininha. |
| Conciliação | `GET /api/cron/reconcile-stone` consulta `GET /charges/{id}`. Só quita se status, id, `amount` e `currency` baterem com a fatura. Após 5 consultas sem confirmação, exige intervenção manual. |
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
| Conferência | fatura do tenant; `data.id` igual a `externalId`; `data.amount` igual a `amountCents`; `data.currency` igual à moeda da fatura. Sem id, valor ou moeda o evento **não** liquida. Moeda ausente não é tratada como BRL. |

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
  "stoneChargeId": "id-da-cobranca-na-stone",
  "amountCents": 9900,
  "currency": "BRL"
}
```

`invoice.paid` sem `stoneChargeId`, `amountCents` ou `currency` responde 400. Valor, moeda ou cobrança divergentes respondem 409 e a fatura permanece aberta. A cobrança precisa ser a mesma já gravada em `invoices.external_id`.

`POST /api/webhooks/gateway` **não liquida faturas** (HTTP 410). O corpo antigo não comprovava pagamento. Não reative esse caminho.

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

POS offline, timeout ou recusa: fatura permanece aberta, backoff 1/3/7, no máximo 4 tentativas. Cobrança `pending` com `externalId` é reutilizada. Cobrança `pending` sem `externalId` não é reenviada.

### 2.5 Homologação na academia

Isto não foi executado. Na academia, com POS e catraca reais:

1. Configure Stone e o serial do POS. Confirme que uma credencial inválida mostra erro na tela, sem gravar a chave em claro.
2. Cobrança aprovada: cobrar uma fatura de teste → a maquininha aprova → webhook ou conciliação grava `paid` → a catraca responde `{open:true}` para esse aluno.
3. Recusa: a fatura continua aberta e a catraca não libera.
4. Timeout ou queda de rede no meio da cobrança: não aperte cobrar de novo na mesma fatura. O sistema responde 409. Confira na maquininha se a venda saiu antes de registrar o pagamento à mão.
5. Evento repetido do webhook: a fatura fica paga uma vez só.
6. Aluno inadimplente ou assinatura inativa: a catraca responde 403 com "Acesso não autorizado." e não abre.
7. Equipamento fora: o handler responde 503 `{open:false}` se o banco falhar. A porta não abre.

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
