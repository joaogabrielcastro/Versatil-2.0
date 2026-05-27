# Questionário Versátil Academia — Cobrança, operação e catraca

**Academia:** _________________________________  
**Responsável:** _______________________________  
**Data:** ____ / ____ / ______  
**Preenchido por:** ____________________________

Use este formulário na reunião com o cliente. Marque (X) ou escreva nas linhas. As respostas definem a ordem de implementação no sistema.

---

## 1. Mensalidade e planos

| # | Pergunta | Resposta |
|---|----------|----------|
| 1.1 | Tipos de cobrança: ( ) mensal ( ) anual ( ) pacote ( ) outro: _________ | |
| 1.2 | Valores fixos por plano ou personalizados por aluno? | |
| 1.3 | Existe taxa de matrícula? ( ) sim ( ) não — valor: _________ | |
| 1.4 | Desconto/bolsa? Quem aprova? | |
| 1.5 | Após quantos dias de atraso o aluno fica **inadimplente**? ______ dias | |
| 1.6 | Inadimplente **não passa na catraca**? ( ) sim ( ) não | |

---

## 2. Formas de pagamento desejadas

Marque todas que a academia quer usar no sistema:

| Forma | Desejado | Observação |
|-------|:--------:|------------|
| Dinheiro na recepção | ( ) | |
| Pix na recepção (registro manual) | ( ) | |
| **Pix automático** (link/QR gerado pelo sistema) | ( ) | |
| **Boleto** bancário | ( ) | Vencimento padrão: dia ___ |
| **Cartão na recepção** (maquininha) | ( ) | Marca: _________ |
| **Cartão recorrente** (cobrança automática todo mês) | ( ) | |
| Link de pagamento por WhatsApp/e-mail | ( ) | |

---

## 3. Banco e intermediador de pagamento

No Brasil o sistema integra com um **provedor** (Asaas, Efi, Mercado Pago, Stripe etc.), que envia o valor para a **conta PJ** da academia.

| # | Pergunta | Resposta |
|---|----------|----------|
| 3.1 | Banco da conta PJ da academia | |
| 3.2 | Já usa algum intermediador? ( ) Asaas ( ) Efi ( ) Mercado Pago ( ) Stripe ( ) nenhum ( ) outro: ___ | |
| 3.3 | Aceita abrir conta no provedor que indicarmos? ( ) sim ( ) não | |
| 3.4 | Quem cuida do contrato e taxas com o provedor? | |
| 3.5 | Precisa de **nota fiscal** automática? ( ) sim ( ) não ( ) depois | |

**Sugestão técnica (para alinhar na reunião):** Pix + boleto + recorrência no Brasil → costuma ser **Asaas** ou **Efi**. Cartão simples → **Stripe** (já parcialmente no sistema).

---

## 4. Recorrência e cobrança automática

| # | Pergunta | Resposta |
|---|----------|----------|
| 4.1 | O sistema deve **gerar fatura sozinho** todo mês? ( ) sim ( ) não — recepção cria | |
| 4.2 | Cobrança automática no cartão/Pix agendado? ( ) sim ( ) não | |
| 4.3 | Lembretes antes do vencimento (WhatsApp/e-mail)? ( ) sim ( ) não | |
| 4.4 | Quantas tentativas se o cartão falhar? ______ | |

---

## 5. Operação no balcão

| # | Pergunta | Resposta |
|---|----------|----------|
| 5.1 | Quantas pessoas usam o sistema na recepção? ______ | |
| 5.2 | Precisa de usuário **admin** e usuário comum? ( ) sim ( ) não | |
| 5.3 | Imprimir recibo após pagamento? ( ) sim ( ) não | |
| 5.4 | Importar alunos de planilha? ( ) sim ( ) não | |

---

## 6. Catraca e reconhecimento facial

| # | Pergunta | Resposta |
|---|----------|----------|
| 6.1 | Já escolheu marca/modelo da catraca/facial? ( ) sim: ________ ( ) ainda não | |
| 6.2 | Quantos pontos de entrada (catracas)? ______ | |
| 6.3 | Internet na entrada: ( ) Wi‑Fi ( ) cabo ( ) PC gateway local | |
| 6.4 | Se cair a internet: ( ) bloquear todos ( ) liberar com lista local ( ) outro | |
| 6.5 | Cadastro do rosto: ( ) na recepção ( ) autoatendimento ( ) app do fabricante | |
| 6.6 | Termo LGPD para biometria assinado pelos alunos? ( ) sim ( ) não ( ) vamos fazer | |

**O sistema hoje precisa que o equipamento (ou um programa no PC) informe o **ID do aluno** na nuvem após reconhecer o rosto. Perguntar ao fornecedor: *“Permite HTTP POST para URL nossa após reconhecimento?”***

---

## 7. Infraestrutura (nuvem)

| # | Pergunta | Resposta |
|---|----------|----------|
| 7.1 | Domínio desejado (ex.: app.versatilacademia.com.br) | |
| 7.2 | Quem registra o domínio e DNS? | |
| 7.3 | Servidor na nuvem já contratado? ( ) sim ( ) não — provedor: ______ | |
| 7.4 | Quem terá acesso admin ao servidor (você / cliente / ambos)? | |

---

## 8. Prioridade de entregas (ordene 1 = primeiro)

| Ordem | Entrega |
|:-----:|---------|
| ___ | Sistema no ar na nuvem (balcão, alunos, planos) |
| ___ | Cobrança Pix/boleto/cartão automático |
| ___ | Catraca/facial + presença automática |
| ___ | Terminal do aluno (imprimir treino) — *já disponível* |
| ___ | Relatórios (financeiro + presença) |

---

## 9. Contatos e acessos (pós-reunião)

| Item | Nome / e-mail | Observação |
|------|---------------|------------|
| Decisor na academia | | |
| Contato financeiro | | |
| Acesso sandbox provedor pagamento | | |
| Acesso manual catraca (PDF) | | |

---

## Resumo para o desenvolvedor (preencher após a reunião)

- **Provedor de pagamento escolhido:** _______________________  
- **Formas ativas:** Pix / Boleto / Cartão recorrente / Manual  
- **Dias para inadimplência:** _____  
- **Catraca:** modelo _____________ integração: ( ) HTTP ( ) gateway local ( ) indefinido  
- **Domínio produção:** _______________________  
- **Próxima sprint acordada:** _______________________

---

*Versátil — sistema de gestão. Versão do questionário: maio/2026.*
