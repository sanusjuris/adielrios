# Motor Next Best Action — catálogo de regras

> Gerado a partir de `clinica/js/kpi.js`. São as regras que respondem, para cada paciente e cada lead: **qual é a próxima coisa que a clínica precisa fazer?**

Cada regra é determinística. Quando dispara, ela devolve a **evidência** — o registro concreto que a acionou — e o **dono** da ação. Nada aqui vem de modelo de linguagem: a IA só entra depois, para redigir a mensagem, e sempre com aprovação humana.

Faixas: prioridade **≥ 85 = máxima** (risco, intercorrência, consentimento), **60–84 = alta** (acompanhamento e recuperação), **< 60 = normal** (rotina e reativação).

| Prior. | Regra | Dispara quando | Dono | Módulo |
|---:|---|---|---|---|
| 100 | **Triagem de risco positiva** | Última triagem C-SSRS positiva. Exige contato assistencial imediato conforme protocolo. | Médico(a) | mbc |
| 95 | **Intercorrência sem desfecho** | Procedimento com intercorrência registrada e sem follow-up concluído. | Enfermagem | procedimentos |
| 92 | **Lead sem primeiro contato** | Aplica-se a leads ainda não convertidos em paciente. | Concierge | crm |
| 88 | **Follow-up pós-procedimento** | Sessão realizada nas últimas 72 h sem contato de acompanhamento. | Enfermagem | procedimentos |
| 86 | **Consentimento ausente** | Procedimento agendado ou realizado sem consentimento registrado. | Qualidade | qualidade |
| 82 | **Piora longitudinal** | Escala cruzou o corte ou piorou de forma relevante entre medições. | Médico(a) | mbc |
| 76 | **Sem revisão médica** | Paciente ativo além do limite sem consulta e sem retorno agendado. | Concierge | agenda |
| 70 | **Exame solicitado sem retorno** | Exame solicitado há mais de 14 dias sem resultado recebido. | Concierge | prontuario |
| 66 | **Alto risco de falta** | Agendamento futuro com score de no-show alto — confirmar ativamente. | Concierge | agenda |
| 64 | **Faltou e não foi recuperado** | Falta nos últimos 14 dias sem reagendamento posterior. | Concierge | agenda |
| 58 | **Lead parado no funil** | Aplica-se a leads ainda não convertidos em paciente. | Comercial | crm |
| 55 | **Escala vencida** | Paciente ativo sem medição há mais de 45 dias. | Concierge | mbc |
| 50 | **Pendência financeira** | Receita vencida há mais de 5 dias. | Financeiro | financeiro |
| 48 | **Detrator sem tratativa** | NPS ≤ 6 ou reclamação aberta sem resolução. | Concierge | experiencia |
| 40 | **Silêncio prolongado** | Sem qualquer interação registrada há mais de 90 dias. | Concierge | concierge |

## Preditores que alimentam as regras

Três scorecards, todos com pesos explícitos e motivos legíveis na tela:

- **Risco de falta (no-show)** — histórico de faltas, confirmação pendente, antecedência do agendamento, primeira consulta, origem de mídia fria, silêncio recente, pendência financeira vencida. Serve para priorizar confirmação ativa, nunca para julgar o paciente.
- **Risco de abandono** — dias sem consulta, ausência de retorno agendado, faltas recentes, silêncio, inadimplência, alerta MBC ativo, detrator no último NPS.
- **Economia por canal** — CAC, LTV, ROI e conversão por origem, com veredito aritmético: escalar / manter / ajustar / cortar.

Nenhum deles é diagnóstico nem estatística oculta: são somas de fatores declarados, e a interface mostra cada parcela.

