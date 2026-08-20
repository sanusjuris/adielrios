# Perfis, permissões e auditoria

> Gerado a partir de `clinica/js/core.js`. São os perfis-semente; a matriz é editável por usuário em *Administração → Permissões*, e cada alteração é auditada.

## Módulos

| Módulo | Grupo | Sistema | O que controla |
|---|---|---|---|
| **Command Center** `command` | Direção | 8 | KPIs de operação, comercial, financeiro, clínica e experiência. |
| **Próxima Ação** `nba` | Direção | — | Motor Next Best Action: o que a clínica precisa fazer, por paciente. |
| **CRM** `crm` | Relação | 1 | Leads B2C e B2B, funil, origem, conversão e reativação. |
| **Concierge** `concierge` | Relação | 2 | Experiência do paciente antes, durante e depois — Customer Success clínico. |
| **Omnichannel** `omni` | Relação | 11 | WhatsApp, telefone, e-mail e Instagram num registro único. |
| **Experiência** `experiencia` | Relação | 2 | NPS, CSAT, reclamações, tempo de resposta e resolução. |
| **Agenda** `agenda` | Assistência | 3 | Profissionais, salas, confirmação, no-show e lista de espera. |
| **Patient 360** `pacientes` | Assistência | 4 | Visão única do paciente: clínica, relacional, financeira e de risco. |
| **Prontuário** `prontuario` | Assistência | 4 | Evoluções, prescrições e documentos — registro append-only. |
| **MBC** `mbc` | Assistência | 5 | Measurement-Based Care: escalas longitudinais e alertas de trajetória. |
| **Procedimentos** `procedimentos` | Assistência | 6 | Cetamina, EMT e infusões: elegibilidade, checklist, sinais e follow-up. |
| **Financeiro** `financeiro` | Negócio | 7 | Receita, custo, margem por serviço, inadimplência e projeção. |
| **Processos & POPs** `processos` | Negócio | 9 | POPs digitais com gatilho, dono, SLA, evidência e escalonamento. |
| **Qualidade** `qualidade` | Negócio | 10 | Consentimentos, incidentes, não conformidades e LGPD. |
| **Conhecimento** `conhecimento` | Negócio | 12 | Cérebro digital da clínica: protocolos, scripts e treinamento. |
| **Camada de IA** `ia` | Governança | — | Agentes especializados, guardrails e conexão com a API Anthropic. |
| **Administração** `admin` | Governança | — | Usuários, permissões, auditoria, retenção e configuração. |
| **Testes & Saúde** `testes` | Governança | — | Suíte de autoteste, integridade dos dados e limpeza de massa de teste. |

## Matriz de permissões por perfil

`V` = pode ver · `E` = pode editar · `—` = sem acesso

| Perfil | Command&nbsp;Center | Próxima&nbsp;Ação | CRM | Concierge | Omnichannel | Experiência | Agenda | Patient&nbsp;360 | Prontuário | MBC | Procedimentos | Financeiro | Processos&nbsp;&&nbsp;POPs | Qualidade | Conhecimento | Camada&nbsp;de&nbsp;IA | Administração | Testes&nbsp;&&nbsp;Saúde |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Super Administrador** | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E | V E |
| **Gestão / Diretoria** | V | V | V E | V E | V | V E | V E | V | — | V | V | V E | V E | V E | V E | V | — | V |
| **Médico(a)** | V | V E | — | V | V E | — | V E | V E | V E | V E | V E | — | V | V E | V | V | — | — |
| **Psicólogo(a)** | — | V E | — | V | V E | — | V E | V E | V E | V E | V | — | V | V | V | V | — | — |
| **Enfermagem** | — | V E | — | V | V | — | V E | V | V E | V E | V E | — | V | V E | V | V | — | — |
| **Concierge** | — | V E | V E | V E | V E | V E | V E | V | — | — | V | — | V E | V | V | V | — | — |
| **Comercial / B2B** | V | — | V E | — | V E | V | V | — | — | — | — | V | V | — | V | V | — | — |
| **Financeiro** | V | — | V | — | — | — | V | — | — | — | — | V E | V | V | V | V | — | — |
| **Qualidade & Compliance** | V | — | — | — | — | V | V | V | V | V | V | — | V E | V E | V E | V | — | V |

### O que cada perfil é

- **Super Administrador** — Acesso total, incluindo auditoria, retenção e gestão de usuários.
- **Gestão / Diretoria** — Vê tudo, edita gestão e negócio. Não escreve em prontuário.
- **Médico(a)** — Responsável pela decisão clínica. Escreve prontuário e prescrição.
- **Psicólogo(a)** — Registro psicoterápico e escalas. Sem prescrição.
- **Enfermagem** — Conduz procedimentos, sinais vitais e checklists assistenciais.
- **Concierge** — Customer Success clínico. Não acessa prontuário nem interpreta sintoma.
- **Comercial / B2B** — Funil, parcerias, empresas e campanhas. Sem dado clínico.
- **Financeiro** — Cobrança, conciliação, margem e inadimplência. Sem dado clínico.
- **Qualidade & Compliance** — POPs, incidentes, LGPD e auditoria assistida.

## Fronteiras que a matriz protege

- **Concierge não abre prontuário.** Ele conhece agenda, preferências, pendências e experiência. Não interpreta sintoma nem orienta conduta. Interação com conteúdo clínico só grava se for marcada como encaminhada ao assistencial — o sistema recusa a alternativa.
- **Financeiro e Comercial não acessam dado clínico.** Nem prontuário, nem MBC, nem procedimentos.
- **Gestão vê tudo, mas não escreve em prontuário.**
- **Administração é exclusiva do Super Administrador** — inclusive a trilha de auditoria e o prazo de retenção.
- Marcar *editar* ou *excluir* sem *ver* é incoerente; o sistema adiciona *ver* automaticamente ao salvar a matriz.

## Auditoria

Coleções do banco: `usuarios`, `auditoria`, `pacientes`, `leads`, `interacoes`, `agenda`, `prontuario`, `mbc`, `procedimentos`, `financeiro`, `tarefas`, `experiencia`, `qualidade`, `conhecimento`, `processos`, `config`.

**Imutáveis (append-only, sem caminho de exclusão nem para o Super Administrador):** `auditoria`, `prontuario`.

Toda escrita passa por `DB.salvar`/`DB.remover`, e ambos gravam na trilha **antes de retornar**. Não existe caminho de gravação que escape da auditoria. Cada evento guarda: data e hora, usuário, papel, ação, módulo, registro afetado, e o estado **antes** e **depois** — com senhas e sais redigidos e textos longos truncados, por minimização.

Um registro de prontuário assinado não pode ser alterado nem apagado. Correção entra como **adenda**, com autor e data próprios.

