# Implantação — do que existe hoje ao que opera com dado real

Grupo Nutrindo Emoções · by Adiel Ríos

---

## Onde você está agora

Um sistema operacional clínico **completo e funcional**, rodando no navegador, com:

- 12 sistemas + Command Center + motor Next Best Action + Administração
- 33 indicadores determinísticos, 3 preditores, 15 regras de próxima ação
- 11 agentes de IA com guardrails verificados por teste
- 9 perfis de acesso com matriz editável por usuário e auditoria completa
- 8 POPs e 5 documentos de conhecimento instalados como produção
- 92 asserções de autoteste que escrevem no banco real e limpam a própria massa
- Retenção de 20 anos, prontuário e auditoria append-only

E uma limitação que decide o próximo passo: **os dados vivem no IndexedDB do navegador.** Não sincronizam, não têm backup gerenciado, e somem se o perfil do navegador for apagado.

> **Portanto: até a Fase 1 estar concluída, opere apenas com dado fictício.** *Testes & Saúde → Popular demonstração* cria uma clínica inteira; *Apagar massa de teste* remove tudo.

---

## Fase 0 — Esta semana (sem custo, sem infraestrutura)

Objetivo: descobrir se o desenho serve à clínica, antes de investir.

1. **Abra o sistema e popule a demonstração.** Navegue pelos 18 módulos com dados dentro.
2. **Rode a suíte de autoteste.** Devem passar 92 de 92, com resíduo zero.
3. **Ajuste a configuração para a realidade da clínica** (Administração → Configuração): salas, horas úteis, SLAs, dias de alerta, despesas fixas.
4. **Preencha o catálogo de serviços com custo direto.** Enquanto estiver vazio, a margem é calculada com custo zero e o sistema avisa que está superestimada. Este é o passo que mais muda a qualidade dos números.
5. **Revise as metas dos 33 indicadores.** As padrão são razoáveis para o segmento; as suas são as que valem.
6. **Leia os 8 POPs e edite-os.** Eles foram escritos como ponto de partida, não como verdade. Ajuste SLA, dono e etapas ao que a clínica realmente faz — ou ao que ela decidiu passar a fazer.
7. **Crie os usuários reais** com os perfis corretos e confira a matriz de permissões.
8. **Apague a massa de teste** e confirme, no inventário, que sobrou zero.

Ao fim da Fase 0 você sabe se o modelo serve. Se não servir, você não gastou nada.

---

## Fase 1 — Backend (o passo que libera dado real)

Sem isto, nada de dado de paciente. Com isto, tudo o mais destrava.

**O que construir:**

| Componente | Requisito |
|---|---|
| Banco | PostgreSQL, hospedado no Brasil, criptografia em repouso |
| API | Espelhando `DB.listar/obter/salvar/remover` — o contrato já existe |
| Autenticação | Servidor, com sessão assinada e expiração; MFA para Super Administrador |
| Auditoria | Tabela append-only, sem `UPDATE` nem `DELETE` concedidos à aplicação |
| Backup | Diário, testado com restauração real — backup não testado não é backup |
| Transporte | HTTPS obrigatório, HSTS |
| Proxy de IA | Endpoint que injeta a chave no servidor, para eliminar o modo direto |

**Por que isso é menor do que parece:** toda escrita da aplicação passa por `DB.salvar` e `DB.remover`. Trocar a persistência é reimplementar **um** arquivo (`core.js`, objeto `DB`) contra a API. Módulos, indicadores, preditores, motor de próxima ação, permissões e agentes não mudam uma linha.

**Como validar que a troca deu certo:** rode a suíte de autoteste contra o novo backend. As 92 asserções verificam persistência, auditoria, imutabilidade, permissões, regras de domínio, cálculo de indicadores, preditores, guardrails de IA, retenção e limpeza. Se passarem, o backend honra o mesmo contrato.

**Entregáveis de conformidade da fase:** contrato de tratamento de dados com cada fornecedor · RIPD elaborado · encarregado de dados nomeado · política de retenção formalizada · plano de resposta a incidente.

---

## Fase 2 — Integrações

**Ordem importa.** Cada integração só entra quando a anterior está estável.

**1. WhatsApp oficial.** É a principal entrada do funil, então é a primeira. Mensagem recebida cria ou atualiza lead com canal preenchido, dispara o relógio do SLA e registra no Omnichannel. Critério de pronto: nenhum lead entra sem canal.

**2. Prontuário eletrônico.** Sincronização bidirecional pelo `pacienteId`. Critério de pronto: abrir o Patient 360 e ver a última evolução real sem digitar nada duas vezes.

**3. Financeiro / ERP.** Lançamentos vêm com `pacienteId`, `servico` e `canal`. Critério de pronto: a margem por serviço bate com a contabilidade.

**4. Mídia paga.** Custo de campanha vira Despesa com Canal preenchido. Critério de pronto: o quadro de retorno por canal mostra ROI real, não estimativa.

**5. Escalas automatizadas.** Envio programado e resposta gravando direto no MBC. Critério de pronto: adesão às escalas acima de 70%.

O erro clássico é integrar tudo em paralelo. Integração parcial em cinco frentes é pior que integração completa em uma, porque produz números que parecem certos e não são.

---

## Fase 3 — Operação

O que muda no dia a dia quando o sistema está de pé:

**Toda manhã.** Alguém da direção abre o Command Center antes de qualquer reunião. Se houver ação de prioridade máxima na fila, ela é tratada antes de qualquer pauta — envolve risco, intercorrência ou consentimento ausente.

**Todo dia.** Cada dono limpa sua fila em *Próxima Ação*. Fila zerada é a meta diária do concierge, não um ideal.

**Toda semana.** Reunião de 30 minutos sobre: indicadores fora da meta, alertas MBC, reclamações abertas, leads parados. Cada item sai com dono e prazo, virando tarefa — não ata.

**Todo mês.** Margem por serviço, retorno por canal, despesa sem retorno, resposta ao tratamento. É aqui que se decide preço, mídia e mix de serviço.

**Todo trimestre.** Revisão dos POPs cujos indicadores não melhoraram. Processo que não move indicador está errado ou não está sendo seguido — e as duas hipóteses exigem ação diferente.

---

## Como evoluir o sistema sem quebrá-lo

O sistema foi feito para ser alterado. O ciclo:

**1. Rode a suíte antes.** 92/92, resíduo zero. Se já estiver vermelho, conserte antes de mexer.

**2. Faça a alteração como declaração, não como tela.**

| Para adicionar | Edite | O que fazer |
|---|---|---|
| Um indicador | `js/kpi.js` → `KPI.CATALOGO` | Um objeto com `id, nome, bloco, dono, direcao, meta, fonte, desc, calc` |
| Uma regra de próxima ação | `js/kpi.js` → `NBA.REGRAS` | Um objeto com `id, rotulo, prioridade, dono, modulo, desc, avaliar` |
| Um campo num módulo | `js/mod-*.js` → `campos` | Um objeto com `id, rot, tipo` e o que mais precisar |
| Uma escala clínica | `js/core.js` → `GNE.ESCALAS` | Faixa, cortes e regra de alerta |
| Um perfil de acesso | `js/core.js` → `GNE.PAPEIS` | Nome, descrição e matriz por módulo |
| Um agente de IA | `js/ia.js` → `IA.AGENTES` | Módulo-fonte, resumo, system prompt (herdando o bloco de limites) e a função de contexto |

Tela, validação, permissão e auditoria se ajustam sozinhas. É isso que impede o mesmo bug de nascer em doze lugares.

**3. Rode a suíte depois.** Se algo quebrou, o teste diz o quê.

**4. Regenere a documentação de referência.** `INDICADORES.md`, `NEXT-BEST-ACTION.md`, `PROCESSOS.md` e `PERMISSOES-E-AUDITORIA.md` são gerados a partir do código, justamente para nunca divergirem da tela.

**5. Peça aos agentes o próximo passo.** A IA Operacional aponta gargalo, a de Experiência agrupa reclamação por causa raiz, a de Qualidade encontra não conformidade. As três produzem candidatos a POP novo ou regra nova. Você decide qual entra.

---

## Riscos reais, e o que fazer com cada um

| Risco | Consequência | Mitigação |
|---|---|---|
| Dado só no navegador | Perda total dos dados | **Fase 1 antes de qualquer dado real.** Enquanto isso, exporte backup ao fim de cada sessão |
| Catálogo de custo vazio | Margem superestimada, preço errado | Preencher antes de decidir preço. O sistema avisa, mas não impede |
| Canal não preenchido | ROI por canal inútil | Tornar obrigatório na integração do WhatsApp |
| Equipe não registra interação | Tempo de resposta e FCR viram ficção | Medir cobertura de registro antes de confiar no indicador |
| Modo direto de IA com dado real | Exposição de chave e de dado sensível | Proxy na Fase 1. Até lá, pseudonimização ativa e dado fictício |
| POP que ninguém segue | Indicador não melhora e ninguém entende por quê | Revisão trimestral obrigatória dos POPs sem melhora |
| Excesso de confiança na IA | Decisão clínica delegada a rascunho | Os guardrails estão no código e nos testes. O que eles não cobrem é cultura — isso é trabalho da direção clínica |

---

## O critério de sucesso

Não é "o sistema está no ar". É a clínica conseguir responder, com número e sem hesitar:

1. Quantos contatos chegaram, quantos marcaram, quantos compareceram, quantos iniciaram tratamento — e por qual canal?
2. Quantos pacientes ativos estão sem revisão médica agora?
3. Qual serviço tem a pior margem, e por quê?
4. Qual despesa dos últimos 90 dias não gerou nenhuma receita?
5. Qual percentual dos pacientes melhorou de forma mensurável?
6. Quantas ações pendentes existem hoje, e quem é o dono de cada uma?

Se essas seis respostas saem em menos de dois minutos, o sistema operacional existe. Se não saem, ainda é um conjunto de softwares.
