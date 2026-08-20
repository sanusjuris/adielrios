# Arquitetura — o sistema operacional da clínica

Grupo Nutrindo Emoções · by Adiel Ríos

---

## A tese

Uma clínica de saúde mental high ticket não deveria funcionar como um conjunto de agendas, WhatsApps, planilhas e profissionais isolados. Deveria funcionar como **um sistema operacional clínico**, no qual experiência, segurança assistencial, gestão, dados e relacionamento estão conectados por um mesmo eixo.

O eixo é este:

### ID único do paciente

Sem ele, João no CRM, João no prontuário, João no financeiro e João no WhatsApp viram quatro pessoas diferentes — e a clínica passa a operar sobre uma ficção. Neste sistema, o `pacienteId` é chave estrangeira obrigatória em agenda, prontuário, MBC, procedimentos, financeiro, interações e experiência. Um lead do CRM só "vira" paciente quando é vinculado a esse ID. É a única forma de o Patient 360 existir de verdade.

---

## Cinco camadas, doze sistemas

| Camada | Sistemas | Pergunta que responde |
|---|---|---|
| **Experience OS** | CRM · Concierge · Omnichannel · Experiência | Onde essa pessoa está na jornada, e como ela está sendo tratada? |
| **Clinical OS** | Agenda · Patient 360 · Prontuário · MBC · Procedimentos | Como está o paciente, e o que o cuidado dele exige agora? |
| **Operations OS** | Processos & POPs · Qualidade | Quem faz o quê, em quanto tempo, com que evidência? |
| **Business OS** | Financeiro · Command Center | Isso é sustentável? Onde ganhamos e onde perdemos dinheiro? |
| **AI OS** | Camada de IA (11 agentes) | O que os dados estão tentando nos dizer que ninguém teve tempo de ler? |

### Os doze sistemas centrais

| # | Sistema | O que controla | Onde a IA entra |
|---|---|---|---|
| 1 | **CRM** | Leads B2C e B2B, médicos parceiros, empresas, indicações, pacientes inativos | Prioriza leads, classifica intenção, aponta o parado |
| 2 | **Concierge** | Toda a experiência antes, durante e depois | Personaliza comunicação, identifica atrito |
| 3 | **Agenda** | Profissionais, salas, confirmação, encaixe, no-show | Prevê falta, aponta ociosidade cara |
| 4 | **Prontuário** | Evolução, prescrição, documentos, consentimentos | Rascunha, resume, organiza — sempre revisado |
| 5 | **MBC** | Sintomas, funcionalidade, sono, risco, qualidade de vida | Detecta piora longitudinal e mudança de padrão |
| 6 | **Procedimentos** | Cetamina, EMT, infusão, neuromodulação | Checklist inteligente, dado faltante, resumo pré-sessão |
| 7 | **Financeiro** | Receita, custo, margem, inadimplência | Anomalias, margem por serviço, despesa sem retorno |
| 8 | **Command Center** | KPIs operacionais, clínicos, financeiros e de experiência | Briefing executivo diário |
| 9 | **Processos & POPs** | Responsáveis, tarefas, SLA, produtividade | Encontra gargalo e tarefa órfã |
| 10 | **Qualidade** | POPs, consentimentos, LGPD, incidentes, risco | Auditoria assistida, controle de versão |
| 11 | **Omnichannel** | WhatsApp, telefone, e-mail, redes | Sugere resposta, classifica, encaminha |
| 12 | **Conhecimento** | Protocolos, scripts, treinamento | Copiloto que responde **pelos POPs da clínica** |

Além destes, dois módulos de eixo — **Próxima Ação** (o motor que costura tudo) e **Administração** (usuários, permissões, auditoria, retenção) — e um de garantia: **Testes & Saúde**.

---

## A jornada, e por que cada etapa gera a próxima

```
Lead → CRM → Concierge → Pré-consulta → Agenda → Prontuário → Consulta →
Plano terapêutico → Procedimentos / multiprofissional → Monitoramento
longitudinal → Follow-up → Reavaliação → Fidelização
```

O diferencial não está em comprar doze softwares. Está em fazer as etapas **se dispararem umas às outras**. Alguns encadeamentos que o sistema já executa sozinho:

| Quando isso acontece | O sistema faz isso, sem ninguém pedir |
|---|---|
| Escala de triagem de risco vem positiva | Abre tarefa **crítica** para o médico, com prazo imediato e a evidência anexada |
| Procedimento registra intercorrência | Abre follow-up obrigatório para a enfermagem em 24 h |
| Procedimento tenta concluir sem consentimento | **Recusa a gravação** — não é aviso, é bloqueio |
| Procedimento tenta concluir com checklist incompleto | Recusa e diz exatamente quais itens faltam |
| Exame solicitado passa de 14 dias sem resultado | Entra na fila de Próxima Ação, dono Concierge |
| Paciente ativo passa do limite sem revisão e sem retorno | Entra na fila com os dias contados |
| Lead ultrapassa o SLA de primeiro contato | Sobe para prioridade máxima na fila |
| Paciente falta e não é reagendado em 14 dias | Gera contato de recuperação |
| NPS ≤ 6 ou reclamação sem tratativa | Gera ligação de recuperação por quem tem autonomia |

**Nada disso depende de alguém lembrar.** É essa a diferença entre um software e um sistema operacional.

---

## O motor: Next Best Action

Para cada paciente e cada lead, o sistema responde uma pergunta só:

> **Qual é a próxima coisa que a clínica precisa fazer?**

São 15 regras determinísticas (catálogo completo em [`NEXT-BEST-ACTION.md`](NEXT-BEST-ACTION.md)). Cada uma devolve três coisas: **o que fazer**, **quem é o dono** e **a evidência** — o registro concreto que a acionou. Um clique transforma qualquer linha em tarefa com prazo.

Isso acaba com a maior parte das falhas silenciosas de acompanhamento — que em saúde mental são as mais caras, clínica e comercialmente.

---

## Patient 360

Uma tela, e nela: última consulta · situação · próxima consulta · trajetória das escalas com valores e datas · procedimentos e intercorrências · contatos recentes · pendências administrativas · risco de abandono com os fatores que o compõem · situação financeira · responsável pelo caso · linha do tempo unificada de todos os módulos.

É isso que impede a fragmentação. E é a partir daí que o Copiloto Clínico monta o resumo de preparo para a consulta — organizando, nunca concluindo.

---

## Measurement-Based Care

A clínica sai de:

> consulta → silêncio → consulta

e entra em:

> consulta → acompanhamento → dado → intervenção → consulta

Sete escalas validadas com faixas e pontos de corte configurados (PHQ-9, GAD-7, WHODAS 2.0, PSQI, WHO-5, CGI-S, C-SSRS). O sistema classifica cada medição, detecta **piora relevante entre medições consecutivas** e calcula **resposta ao tratamento** (melhora ≥ 30% entre primeira e última medição, só para quem tem série de dois pontos ou mais — o denominador é honesto).

A triagem de risco (C-SSRS) é tratada como **crítica**: resultado positivo abre protocolo automaticamente e a classificação definitiva do risco é sempre do profissional, nunca do sistema nem da IA.

---

## Onde o dinheiro aparece — e onde some

Três leituras que a maioria das clínicas não tem:

**Margem por serviço.** Receita menos custo direto, por serviço, ordenada da pior margem para a melhor. Um serviço que enche a agenda e come a margem é um problema, não um sucesso. Sem custo direto cadastrado, o sistema avisa que a margem está superestimada.

**Retorno por canal.** CAC, LTV, ROI e conversão por origem, com veredito aritmético: escalar, manter, ajustar ou cortar. Como o funil separa B2C de B2B, dá para ver que o ciclo é diferente antes de tratar os dois com a mesma régua.

**Despesa sem retorno.** Soma das despesas cujo canal ou centro de custo **não gerou nenhuma receita atribuída** no período. É a linha onde o dinheiro sai e não volta.

E o indicador que mais dói: **receita por hora instalada**. Receita ÷ (salas × horas úteis × dias). Ociosidade cara não aparece na agenda — aparece aqui.

---

## Arquitetura técnica desta implementação

```
index.html
├── css/brand.css        design system derivado do brandbook
└── js/
    ├── core.js          utilitários · SHA-256 · IndexedDB · auditoria · RBAC · retenção · backup
    ├── kpi.js           33 indicadores · 3 preditores · motor Next Best Action · briefing
    ├── ia.js            11 agentes · pseudonimização · guardrails · cliente da API
    ├── ui.js            shell · roteador · componentes · MOTOR DE CRUD DECLARATIVO
    ├── mod-*.js         as telas dos 12 sistemas
    ├── seed.js          POPs e base de conhecimento (produção) + demonstração (teste)
    ├── testes.js        92 asserções contra o banco real
    └── boot.js          inicialização, login, provisionamento
```

**Por que um motor de CRUD declarativo.** Cada módulo declara seus campos, colunas e regras; listagem, formulário, validação, permissão e auditoria vêm de graça. Mudar um módulo é mudar uma declaração — não reescrever tela. É isso que torna o sistema **editável e não rígido**, e o que impede o mesmo bug de existir em doze lugares.

**Persistência.** IndexedDB, com queda automática para memória se o navegador bloquear armazenamento — e aviso explícito quando isso acontece, porque nesse modo os dados somem ao recarregar. Retenção configurada em **20 anos**; `prontuario` e `auditoria` são append-only e não expõem caminho de exclusão.

**Sem dependências externas.** Nenhum framework, nenhum CDN de biblioteca. A única requisição externa é a fonte Crimson do Google Fonts, carregada de forma **não bloqueante**: se a rede da clínica não alcançar `fonts.googleapis.com`, o sistema inicia igual e cai no fallback serifado.

---

## O que esta implementação ainda não é

Sendo direto, porque isso muda o que você pode fazer com ela amanhã:

Este é um **sistema operacional completo e funcional rodando inteiramente no navegador**. Todos os dados vivem no IndexedDB do dispositivo. Isso significa:

- **Não há sincronização entre dispositivos.** Cada navegador tem sua própria base.
- **Não há servidor.** Backup é exportação manual de JSON.
- **A autenticação é uma porta, não um cofre.** As senhas são derivadas com PBKDF2-SHA256 e nunca ficam em claro, mas quem tem acesso ao dispositivo tem acesso ao banco.
- **Retenção de 20 anos é uma regra do sistema, não uma garantia de infraestrutura.** Ela impede exclusão indevida; ela não impede alguém apagar o perfil do navegador.

Para operar com dado real de paciente, o passo obrigatório é migrar a persistência para um backend próprio, hospedado no Brasil, com criptografia em repouso, backup gerenciado e contrato de tratamento de dados. O caminho está desenhado em [`IMPLANTACAO.md`](IMPLANTACAO.md) — e a arquitetura já foi feita para isso: toda escrita passa por `DB.salvar`/`DB.remover`, então trocar a camada de persistência é trocar **um** arquivo, não o sistema.

Até lá, use com **dado fictício** — o botão *Popular demonstração* cria uma clínica inteira, e *Apagar massa de teste* remove tudo.
