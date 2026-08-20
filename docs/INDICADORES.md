# Dicionário de indicadores

> Gerado a partir do catálogo do sistema (`clinica/js/kpi.js`). Se o código mudar, este arquivo é regerado — ele nunca é escrito à mão, justamente para não divergir do que a tela mostra.

São **33 indicadores**, todos calculados de forma determinística sobre os registros do banco. Nenhum depende de modelo de linguagem.

**Como ler a coluna Direção:** `maior` = maior é melhor; `menor` = menor é melhor; `neutro` = é uma contagem, não uma nota.

**Regra de honestidade embutida:** indicador com denominador zero aparece como `—` em cinza, nunca como 0% em vermelho. Ausência de base não é mau desempenho.


## Operação

| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |
|---|---|---|---|---|---|
| **Pacientes hoje**<br>`op_pacientes_dia` | Coordenação | neutro | — | agenda | Agendamentos com início na data de hoje, excluindo cancelados. |
| **Taxa de confirmação**<br>`op_confirmacao` | Concierge | maior | 85% | agenda | Confirmados ÷ agendados para os próximos 3 dias. Mede a disciplina de confirmação ativa. |
| **No-show (30d)**<br>`op_noshow` | Concierge | menor | 8% | agenda | Faltas ÷ (comparecimentos + faltas) nos últimos 30 dias. Cancelamento avisado não conta como falta. |
| **Cancelamentos (30d)**<br>`op_cancelamento` | Coordenação | menor | 12% | agenda | Cancelados ÷ total agendado no período. Alto índice pode indicar falha na qualificação ou no preço. |
| **Ocupação de salas (7d)**<br>`op_ocupacao` | Coordenação | maior | 70% | agenda + configuração | Horas ocupadas ÷ horas disponíveis (salas × horas úteis × 7). Capacidade ociosa é margem perdida. |
| **Pendências críticas**<br>`op_pendencias` | Coordenação | menor | 0 | tarefas | Tarefas em aberto, marcadas como críticas ou com prazo vencido. |
| **Procedimentos hoje**<br>`op_procedimentos_hoje` | Enfermagem | neutro | — | procedimentos | Sessões de cetamina, EMT, infusão ou neuromodulação agendadas para hoje. |

## Comercial

| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |
|---|---|---|---|---|---|
| **Leads novos (30d)**<br>`cm_leads_novos` | Comercial | maior | — | CRM | Leads criados nos últimos 30 dias, em todos os canais. |
| **Tempo até 1º contato**<br>`cm_tempo_1o_contato` | Concierge | menor | 15 | CRM | Mediana entre a chegada do lead e o primeiro contato registrado. É o indicador que mais move conversão em high ticket. |
| **SLA de 1º contato cumprido**<br>`cm_sla_1o_contato` | Concierge | maior | 90% | CRM + configuração | Percentual de leads contactados dentro do SLA definido em Administração. |
| **Conversão lead → tratamento**<br>`cm_conversao` | Comercial | maior | 25% | CRM | Leads que chegaram a "Em tratamento" ÷ leads criados nos últimos 90 dias. |
| **Comparecimento à 1ª consulta**<br>`cm_comparecimento_1a` | Concierge | maior | 88% | agenda | Primeiras consultas com comparecimento ÷ primeiras consultas realizadas ou faltadas (90d). |
| **Follow-ups atrasados**<br>`cm_followups_atrasados` | Comercial | menor | 0 | CRM | Leads ativos sem interação há mais de 7 dias e ainda não perdidos. |

## Financeiro

| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |
|---|---|---|---|---|---|
| **Receita do mês (realizada)**<br>`fi_receita_mes` | Financeiro | maior | — | financeiro | Lançamentos de receita com status "Pago" no mês corrente. |
| **Receita prevista (mês)**<br>`fi_receita_prevista` | Financeiro | maior | — | financeiro | Realizado + previsto a vencer no mês. Base da projeção de caixa. |
| **Ticket médio**<br>`fi_ticket` | Financeiro | maior | — | financeiro | Receita paga nos últimos 90 dias ÷ número de pacientes distintos que geraram receita. |
| **Inadimplência**<br>`fi_inadimplencia` | Financeiro | menor | 5% | financeiro | Receita vencida e não paga ÷ receita vencida total. Vencimento futuro não entra no cálculo. |
| **Margem de contribuição**<br>`fi_margem` | Financeiro | maior | 55% | financeiro + custos | (Receita paga − custo direto do serviço) ÷ receita paga, últimos 90 dias. Custo direto vem do catálogo em Administração. |
| **Receita por hora disponível**<br>`fi_receita_hora` | Direção | maior | — | financeiro + capacidade | Receita paga nos últimos 30 dias ÷ horas de capacidade instalada (salas × horas úteis × 30). É o indicador que revela ociosidade cara. |
| **Despesa sem retorno (90d)**<br>`fi_despesa_sem_retorno` | Direção | menor | 0 | financeiro | Soma das despesas cujo canal/centro de custo não gerou nenhuma receita atribuída no período. É onde o dinheiro sai sem voltar. |

## Clínica

| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |
|---|---|---|---|---|---|
| **Pacientes ativos**<br>`cl_ativos` | Direção clínica | maior | — | pacientes | Pacientes com status "Ativo" no cadastro. |
| **Ativos sem revisão**<br>`cl_sem_acompanhamento` | Direção clínica | menor | 0 | agenda + prontuário | Pacientes ativos sem consulta realizada há mais que o limite configurado e sem retorno agendado. É a falha silenciosa mais cara em saúde mental. |
| **Alertas MBC abertos**<br>`cl_alertas_mbc` | Direção clínica | menor | 0 | MBC | Pacientes cuja última medição cruzou o ponto de corte da escala ou piorou de forma relevante. |
| **Pacientes em risco alto**<br>`cl_risco_alto` | Direção clínica | menor | 0 | pacientes + MBC | Marcados com risco clínico alto no cadastro ou com triagem C-SSRS positiva na última medição. |
| **Eventos adversos (90d)**<br>`cl_eventos_adversos` | Qualidade | menor | 0 | procedimentos + qualidade | Intercorrências registradas em procedimentos somadas a incidentes assistenciais. |
| **Abandono (90d)**<br>`cl_abandono` | Direção clínica | menor | 15% | pacientes | Pacientes que passaram a "Inativo" nos últimos 90 dias ÷ (ativos + inativos no período). |
| **Resposta ao tratamento**<br>`cl_resposta_mbc` | Direção clínica | maior | 50% | MBC | Pacientes com ≥2 medições da mesma escala e melhora ≥30% entre a primeira e a última. É o desfecho que sustenta o preço premium. |
| **Adesão às escalas (60d)**<br>`cl_adesao_escalas` | Concierge | maior | 70% | MBC | Pacientes ativos com ao menos uma medição nos últimos 60 dias. Sem isso o MBC não existe na prática. |

## Experiência

| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |
|---|---|---|---|---|---|
| **NPS (90d)**<br>`ex_nps` | Concierge | maior | 70 | experiência | % promotores (9-10) − % detratores (0-6). Escala 0 a 10. |
| **CSAT (90d)**<br>`ex_csat` | Concierge | maior | 4.5 | experiência | Média das avaliações de satisfação pontual, escala 1 a 5. |
| **Reclamações abertas**<br>`ex_reclamacoes` | Qualidade | menor | 0 | experiência | Reclamações registradas e ainda não resolvidas. |
| **Tempo de resposta**<br>`ex_tempo_resposta` | Concierge | menor | 30 | omnichannel | Mediana entre mensagem recebida do paciente e a primeira resposta da clínica (30d). |
| **Resolvido no 1º contato**<br>`ex_fcr` | Concierge | maior | 75% | omnichannel | Interações recebidas marcadas como resolvidas sem reabertura, nos últimos 30 dias. |
