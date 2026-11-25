# LGPD — o que o sistema faz e o que ainda falta

Papéis: a **academia** é controladora dos dados dos alunos. O **Versátil** (SaaS) é operador e trata os dados por conta da academia. Isso precisa constar no contrato com cada academia (acordo de tratamento de dados).

## Implementado no sistema

| Direito / princípio | Como | Onde |
|---|---|---|
| Acesso e portabilidade (art. 18, II e V) | Admin exporta um JSON com cadastro, matrículas, faturas, presença e treinos. A exportação fica na auditoria. | Ficha do aluno → Privacidade (LGPD) → Exportar dados. `GET /api/students/:id/data-export` |
| Eliminação (art. 18, VI) | Anonimização irreversível: nome, CPF, e-mail, WhatsApp, nascimento e referência facial/COD são apagados; treinos (podem conter dados de saúde) são excluídos; notas livres e registros antigos da auditoria são limpos. Exige digitar `ANONIMIZAR` e informar o motivo. | Ficha do aluno → Anonimizar aluno. `POST /api/students/:id/anonymize` |
| Guarda legal (art. 16, I) | Faturas, pagamentos e presença permanecem sem identificação. | — |
| Bloqueios | Não anonimiza com matrícula vigente ou fatura em aberto (cancele ou quite antes). Aluno anonimizado não pode ser editado, matriculado nem cobrado, e não aparece na busca do terminal. | — |
| Minimização em logs | A auditoria registra só quais campos do aluno mudaram, não os valores. | — |
| Retenção em fila | Linhas de CSV importado (com CPF) são removidas do Redis ao concluir, ou 24h após falha. | `IMPORT_JOB_OPTS` |
| Segurança (art. 46) | Isolamento por academia no banco (RLS forçado e testado), senhas com bcrypt, credenciais de pagamento cifradas, sessões revogáveis. | `DEPLOY.md` |

## Não implementado — depende de decisão ou de conteúdo externo

- **Termos de uso e política de privacidade** (texto jurídico). Precisam ser publicados antes do lançamento; o sistema ainda não tem página para eles.
- **Acordo de tratamento de dados (DPA)** entre Versátil e cada academia.
- **Encarregado (DPO)** e canal de contato para titulares.
- **Política de retenção**: por quanto tempo guardar faturas, presença e backups depois do fim do contrato. Os backups (`npm run db:backup`) ainda contêm os dados de alunos anonimizados até expirarem pela retenção (`BACKUP_KEEP`).
- **Consentimento / base legal** para dado biométrico (reconhecimento facial na catraca) e dados de saúde em treinos: é dado sensível (art. 11) e exige base legal específica, normalmente consentimento destacado, coletado pela academia.
- **Compartilhamento com a Stone**: ao cobrar na maquininha, nome, e-mail e CPF do aluno são enviados à Stone. Deve constar na política de privacidade. A anonimização no Versátil não apaga dados já enviados à Stone.
- **Exportação pela academia inteira** (fim de contrato) e exclusão de academia: não há rota; hoje seria operação manual no banco.
