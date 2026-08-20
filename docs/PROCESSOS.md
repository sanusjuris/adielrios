# Processos operacionais padrão (POPs)

> Gerado a partir de `clinica/js/seed.js`. Estes POPs são **instalados como produção** na primeira execução e ficam editáveis no módulo *Processos & POPs*.

Um POP aqui não é PDF numa pasta. Cada um declara sete coisas, e o sistema cobra todas elas:

**gatilho → responsável → SLA → etapas → evidência de conclusão → regra de escalonamento → indicador que o mede.**

Processo sem indicador não é gerenciável. Processo sem evidência não é processo — é intenção.


---

## 1. Primeira consulta — do contato ao plano terapêutico

**Área:** Concierge  
**Gatilho:** Mensagem, ligação ou formulário de alguém que ainda não é paciente  
**Responsável:** Concierge  
**SLA:** 15 minutos em horário comercial; 1ª hora do expediente seguinte fora dele  
**Indicador:** SLA de 1º contato cumprido (`cm_sla_1o_contato`)

**Fluxo:**

1. Registrar no CRM com canal de origem correto
2. Qualificar: demanda, urgência percebida, quem decide, forma de pagamento
3. Apresentar a clínica e a proposta de cuidado
4. Agendar e registrar a garantia de reserva
5. Enviar orientações de preparo e o formulário de pré-consulta
6. Colher consentimentos aplicáveis
7. Confirmar 48 h e 24 h antes
8. Preparar a nota de preparo para o profissional
9. Consulta
10. Registrar plano terapêutico
11. Enviar orientações combinadas
12. Contato pós-consulta em até 72 h
13. Programar escalas e o retorno

**Evidência de conclusão:** Lead com primeiroContatoEm preenchido, agendamento criado, consentimento vinculado e registro de contato pós-consulta

**Se o SLA estourar:** SLA estourado → alerta ao coordenador em 30 min. Duas ocorrências no mesmo dia → revisão da escala de plantão do concierge.


---

## 2. Confirmação ativa e recuperação de falta

**Área:** Agenda  
**Gatilho:** Agendamento a 48 h de acontecer, ou status alterado para Faltou  
**Responsável:** Concierge  
**SLA:** Confirmação até 24 h antes; recuperação em até 24 h após a falta  
**Indicador:** No-show (30d) (`op_noshow`)

**Fluxo:**

1. Consultar o score de risco de falta na Agenda
2. Score alto → contato humano, não mensagem automática
3. Registrar a confirmação no sistema
4. Se faltou: contato de recuperação sem tom de cobrança
5. Oferecer duas alternativas concretas de horário
6. Se não houver resposta em 48 h, registrar tentativa e reavaliar em 7 dias

**Evidência de conclusão:** Status do agendamento atualizado e interação registrada no Omnichannel

**Se o SLA estourar:** Duas faltas seguidas do mesmo paciente → caso vai para a reunião clínica semanal.


---

## 3. Sessão de cetamina — elegibilidade à alta

**Área:** Procedimentos  
**Gatilho:** Indicação médica de sessão de cetamina  
**Responsável:** Enfermagem  
**SLA:** Follow-up em até 24 h após a sessão  
**Indicador:** Eventos adversos (90d) (`cl_eventos_adversos`)

**Fluxo:**

1. Confirmar elegibilidade clínica com o médico responsável
2. Colher e vincular o consentimento específico
3. Orientar jejum e acompanhante
4. Checklist pré-sessão completo no sistema
5. Registrar sinais vitais basais
6. Aplicar escala pré-sessão
7. Conduzir a sessão com monitorização
8. Registrar sinais vitais de saída
9. Registrar intercorrências, se houver
10. Alta com acompanhante e orientações escritas
11. Follow-up em 24 h e registro do desfecho

**Evidência de conclusão:** Procedimento com etapa "Concluído", consentimento vinculado, checklist completo e sinais vitais de saída

**Se o SLA estourar:** Qualquer intercorrência → tarefa crítica automática para a enfermagem e comunicação ao médico responsável no mesmo dia.


---

## 4. Triagem de risco positiva

**Área:** Assistencial  
**Gatilho:** Escala de triagem de risco com resultado positivo, ou relato de risco em qualquer canal  
**Responsável:** Médico(a)  
**SLA:** Contato assistencial no mesmo turno  
**Indicador:** Pacientes em risco alto (`cl_risco_alto`)

**Fluxo:**

1. O sistema abre tarefa crítica automaticamente
2. Quem recebeu o relato NÃO avalia gravidade nem orienta conduta
3. Acionar imediatamente o profissional de plantão
4. Contato assistencial e avaliação por profissional habilitado
5. Registrar a avaliação e a conduta no prontuário
6. Definir plano de segurança e rede de apoio
7. Reavaliação programada

**Evidência de conclusão:** Tarefa crítica concluída com evidência e registro de avaliação no prontuário

**Se o SLA estourar:** Sem contato em 2 h → direção clínica é acionada. A classificação definitiva do risco é sempre do profissional, nunca do sistema nem da IA.


---

## 5. Measurement-Based Care — ciclo de medição

**Área:** Assistencial  
**Gatilho:** Início de tratamento e a cada 30 dias  
**Responsável:** Concierge  
**SLA:** Escala enviada em D+0 e cobrada em D+3 se não respondida  
**Indicador:** Adesão às escalas (60d) (`cl_adesao_escalas`)

**Fluxo:**

1. Definir com o profissional quais escalas se aplicam ao caso
2. Enviar a escala pelo canal de preferência do paciente
3. Registrar a resposta no módulo MBC
4. O sistema classifica frente ao ponto de corte
5. Alerta de trajetória → o caso vai para revisão do profissional
6. O profissional decide sobre antecipar retorno

**Evidência de conclusão:** Medição registrada no MBC com data e origem da coleta

**Se o SLA estourar:** Paciente ativo com mais de 45 dias sem medição → aparece na fila de Próxima Ação.


---

## 6. Reclamação e recuperação de experiência

**Área:** Qualidade  
**Gatilho:** Reclamação em qualquer canal, ou NPS ≤ 6  
**Responsável:** Concierge  
**SLA:** Primeiro retorno em 4 h; tratativa concluída em 5 dias úteis  
**Indicador:** Reclamações abertas (`ex_reclamacoes`)

**Fluxo:**

1. Registrar em Experiência com a etapa da jornada em que ocorreu
2. Ligar — não responder por mensagem
3. Ouvir sem justificar
4. Resolver o que é resolvível no mesmo contato
5. Se exigir decisão de terceiros, dar prazo e cumprir
6. Registrar a tratativa e fechar
7. Levar a causa raiz à reunião de qualidade

**Evidência de conclusão:** Registro em Experiência com resolvido=true e a tratativa descrita

**Se o SLA estourar:** Sem tratativa em 5 dias úteis → direção. Três reclamações da mesma causa raiz → abertura de não conformidade.


---

## 7. Cobrança e regularização

**Área:** Financeiro  
**Gatilho:** Receita vencida há mais de 5 dias  
**Responsável:** Financeiro  
**SLA:** Primeiro contato em D+5; segundo em D+15  
**Indicador:** Inadimplência (`fi_inadimplencia`)

**Fluxo:**

1. Conferir se houve falha de emissão ou de conciliação antes de cobrar
2. Contato pelo canal preferido do paciente
3. Oferecer alternativa de regularização
4. Registrar o combinado no lançamento
5. Se não houver acordo em 30 dias, levar à direção

**Evidência de conclusão:** Lançamento com status atualizado e interação registrada

**Se o SLA estourar:** Nunca condicionar atendimento assistencial em curso à regularização financeira sem decisão explícita da direção clínica.


---

## 8. Aprovação de comunicação gerada por IA

**Área:** Gestão  
**Gatilho:** Rascunho de mensagem produzido por qualquer agente de IA  
**Responsável:** Concierge  
**SLA:** Aprovar ou descartar em 4 h  
**Indicador:** Tempo de resposta (`ex_tempo_resposta`)

**Fluxo:**

1. Ler o rascunho integralmente
2. Verificar se há qualquer conteúdo clínico — se houver, encaminhar ao profissional
3. Conferir se o fato citado existe mesmo no sistema
4. Ajustar o tom ao paciente específico
5. Aprovar, enviar e registrar a interação

**Evidência de conclusão:** Tarefa de aprovação concluída e interação registrada no Omnichannel

**Se o SLA estourar:** Rascunho com conteúdo clínico → obrigatoriamente para profissional habilitado. Nenhuma mensagem sai sem aprovação humana identificada.

