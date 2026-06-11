# Roteiro de apresentação — Versátil Academia

Guia para demonstrar o sistema ao cliente (~15 minutos).

---

## Antes da reunião

```bash
# 1. Infra ligada
npm run pilot:infra

# 2. Migrações + seed (inclui alunos de demo)
npm run pilot:setup

# Se já tiver ambiente e faltam alunos de demo:
npm run demo:seed

# Recriar cenários de demo (sobrescreve lógica de skip):
# FORCE_DEMO_SEED=1 npm run demo:seed

# 3. Subir app + worker
npm run dev        # terminal 1
npm run worker     # terminal 2

# 4. Testar
npm run pilot:check
```

**Credenciais demo**

| Campo | Valor |
|-------|--------|
| Slug | `demo` |
| E-mail | `recep@demo.com` |
| Senha | `demo12345678` |

**URL:** http://localhost:3000

---

## Roteiro sugerido (15 min)

### 1. Página inicial (1 min)
- Mostrar identidade **Versátil Academia**
- Destacar os 4 módulos: balcão, cobrança, catraca, treino térmico
- **Entrar com conta demo** (botão já preenche login)

### 2. Painel do balcão (2 min)
- Nome da academia + números: ativos, inadimplentes, entradas hoje
- **Feed da catraca** com nomes dos alunos (Maria Silva, João Gabriel…)
- Frase-chave: *“Quem está inadimplente não passa na catraca.”*

### 3. Alunos (3 min)
- Lista com status em português (Ativo / Inadimplente / Inativo)
- Abrir **Maria Silva** ou **João Gabriel** (ativos, com treino)
- Mostrar: presença, treino atribuído, assinatura, faturas pagas

### 4. Inadimplência (2 min)
- Voltar à lista → **Carlos Eduardo** ou **Ricardo Almeida** (Inadimplente)
- Explicar: fatura vencida → catraca bloqueia
- Ir em **Cobrança** → registrar pagamento → status volta a Ativo

### 5. Cobrança (3 min)
- Faturas em aberto na recepção
- Registrar pagamento: **Pix / Dinheiro / Cartão Stone**
- Explicar: Stone cobra fora; recepção confirma aqui (integração automática depois)

### 6. Presença e relatórios (2 min)
- **Presença** — quem entrou hoje
- **Relatórios** — financeiro + presença por período, exportar CSV

### 7. Terminal do aluno (2 min)
- Abrir **Terminal aluno** (nova aba)
- Buscar aluno com treino → imprimir cupom 80 mm
- Impacto visual forte na apresentação

### 8. Integrações (opcional, 1 min)
- **Integrações** → API da catraca (ativa) + Stone (preparada)
- Mostrar que a arquitetura já prevê as duas conexões

---

## Histórias para contar

| Dor do cliente | O que mostrar |
|----------------|---------------|
| “Quem não pagou entra?” | Status inadimplente + API catraca |
| “Cobrança na Stone” | Cobrança → registrar pagamento Stone |
| “Treino na impressora” | Terminal do aluno + cupom térmico |
| “Planilha de alunos” | Importar CSV + lista com busca |
| “Quanto entrou hoje?” | Painel + Presença + Relatórios |

---

## Alunos de demonstração (após seed)

| Nome | Status | Uso na demo |
|------|--------|-------------|
| Maria Silva | Ativo | Ficha completa + treino |
| João Gabriel | Ativo | Teste catraca |
| Carlos Eduardo | Inadimplente | Bloqueio na catraca |
| Ana Paula Costa | Inativo | Sem plano |
| Pedro Santos | Ativo | Lista geral |
| Fernanda Lima | Ativo | Terminal treino |

**Token catraca demo:** `demo-catraca-token-apresentacao` (criado no seed)

---

## Checklist dia da apresentação

- [ ] Docker Desktop rodando
- [ ] `npm run dev` + `npm run worker` ativos
- [ ] Login demo testado
- [ ] Feed da catraca com nomes visíveis
- [ ] Pelo menos 1 fatura em aberto em Cobrança (Carlos/Ricardo)
- [ ] Terminal do aluno testado (impressão)
- [ ] Notebook conectado ao projetor / internet estável

---

## Perguntas frequentes do cliente

**“Integra com Stone?”**  
Hoje: registro manual na recepção. Webhook Stone já preparado (`INTEGRACOES.md`).

**“E a catraca?”**  
API pronta: após reconhecer o rosto, o equipamento consulta o Versátil e libera ou bloqueia.

**“Fica na nuvem?”**  
Sim — Next.js + PostgreSQL + Redis; deploy em VPS ou cloud (Docker incluído).
