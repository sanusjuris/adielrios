# Stack — o que comprar, o que integrar, o que não comprar

Grupo Nutrindo Emoções · by Adiel Ríos

---

## A regra que economiza mais dinheiro

**Não procure "um software que faça tudo".** Ele não existe em saúde mental high ticket, e as tentativas custam caro de duas formas: o prontuário fica ruim para caber o CRM, ou o CRM fica ruim para caber o prontuário.

Compre bem em três categorias, construa nas outras, e invista o esforço real na integração:

| Categoria | Decisão | Por quê |
|---|---|---|
| **Prontuário eletrônico** | **Comprar** | Certificação, responsabilidade legal, atualização normativa. Não se constrói isso com margem |
| **WhatsApp oficial (API)** | **Comprar** | A API oficial exige provedor homologado. Não há atalho |
| **Financeiro / ERP contábil** | **Comprar** | NF-e, conciliação bancária, obrigações fiscais. Zero diferencial competitivo |
| **CRM** | Comprar **ou** construir | Depende do volume B2B. Ver abaixo |
| **BI / Command Center** | **Construir** | É onde está o diferencial. Nenhum BI genérico conhece "receita por hora instalada" |
| **MBC / Patient 360** | **Construir** | Idem. É o coração clínico do modelo |
| **Motor Next Best Action** | **Construir** | Não existe pronto. É a maior vantagem operacional do desenho |
| **Base de conhecimento** | **Comprar** (camada inicial) | Notion ou equivalente resolve bem por muito tempo |
| **Comunicação interna** | **Comprar** | Slack ou Teams. Ver a seção sobre WhatsApp abaixo |

Este repositório entrega, funcionando, tudo o que está marcado como **construir** — mais as telas de CRM, agenda, prontuário e financeiro, que servem tanto como operação inicial quanto como especificação viva para a integração com os sistemas comprados.

---

## Prontuário eletrônico

Critérios de escolha, em ordem de peso:

1. **API de leitura e escrita.** Sem API, o Patient 360 não existe e você vai digitar tudo duas vezes. Esse é um critério eliminatório, não um diferencial.
2. **Certificação SBIS/CFM** no nível adequado ao que a clínica faz.
3. **Suporte a campos estruturados** para escalas — se só houver texto livre, o MBC morre.
4. **Assinatura digital** e trilha de auditoria própria.
5. **Exportação completa dos dados**, em formato aberto, sem custo de saída. Pergunte isso na negociação, por escrito. É a cláusula que decide se você é cliente ou refém.

No mercado brasileiro, iClinic, Feegow, Ninsaúde e Amplimed são os nomes mais frequentes nesse recorte, com posicionamentos e preços diferentes; para procedimentos como cetamina e EMT, a pergunta decisiva é se o sistema modela **sessão com checklist e sinais vitais** ou se trata tudo como consulta.

> Não tome nenhum desses nomes como recomendação: **peça demonstração com o seu caso de uso** (uma série de EMT, uma sessão de cetamina com intercorrência) e teste a API antes de assinar. Preços e funcionalidades mudam.

---

## WhatsApp — a principal entrada do funil

Como o WhatsApp é o principal canal de entrada, esta é a integração mais crítica do sistema. Três decisões:

**1. API oficial, não automação não oficial.** Automação sobre WhatsApp pessoal ou Business comum é bloqueio na certa e perda do número — que, num negócio high ticket, é perda de base.

**2. Provedor homologado.** No Brasil, Zenvia, Take Blip, Twilio e 360dialog são os caminhos comuns. Critérios: custo por conversa, qualidade do webhook, latência, e se o provedor permite **exportar o histórico**.

**3. Plataforma de atendimento em cima.** Chatwoot (código aberto, pode rodar na infra da clínica — vantagem real de LGPD), Take Blip ou Zenvia. Se o volume ainda é baixo, o módulo Omnichannel deste sistema já resolve o registro; o que ele não faz é receber a mensagem automaticamente.

**O que integrar com o quê:** mensagem recebida no WhatsApp → cria ou atualiza **lead no CRM** com canal preenchido → dispara o relógio do **SLA de primeiro contato** → registro fica no **Omnichannel** com classificação. Quando o lead vira paciente, o vínculo pelo `pacienteId` costura o histórico inteiro.

---

## CRM — comprar ou construir

**Construa (use o módulo deste sistema)** se o volume for majoritariamente B2C, com ciclo curto e time pequeno. O CRM aqui já tem funil de nove estágios, SLA de primeiro contato medido, motivo de perda obrigatório e cálculo de CAC/LTV/ROI por canal — coisas que a maioria dos CRMs genéricos não faz sem customização.

**Compre** se o B2B for relevante — programas de saúde mental corporativa, convênios, parcerias com operadoras. Aí você precisa de pipeline por empresa, múltiplos decisores, propostas, contratos e ciclo longo. HubSpot é a escolha padrão nesse recorte, com integração razoável; RD Station tem vantagem de mercado brasileiro e integração nativa com mídia local.

Se comprar: **o CRM é a fonte da verdade do relacionamento, o prontuário é a fonte da verdade clínica, e o `pacienteId` é o que os une.** Nunca deixe dado clínico entrar no CRM — não é só má prática, é exposição de dado sensível em sistema com controle de acesso desenhado para vendas.

---

## Mídia: Instagram, LinkedIn e TikTok

Como B2C e B2B convivem, a leitura dos canais precisa ser separada — o sistema já separa no funil, e o quadro de retorno por canal mostra CAC, LTV e ROI de cada um.

| Canal | Público | O que medir de verdade |
|---|---|---|
| **Instagram** | B2C | Não seguidores: **custo por lead qualificado** e comparecimento à 1ª consulta. Mídia paga fria tem risco de falta mais alto — o preditor de no-show já pesa isso |
| **TikTok** | B2C, topo | Alcance barato, intenção baixa. Meça **tempo até virar consulta**, não visualização |
| **LinkedIn** | B2B | Ciclo longo. Meça **reuniões com decisor**, não impressões |
| **Indicação médica** | Ambos | Historicamente o canal de melhor LTV. Merece processo próprio, não só gratidão |

O que integrar: exportação de custo de campanha → lançamento de **Despesa** com o campo **Canal** preenchido. É esse preenchimento que faz o indicador *Despesa sem retorno* funcionar. Sem ele, o sistema não consegue confrontar investimento com receita, e o cálculo de ROI fica cego.

Ferramentas de agendamento e relatório (Metricool, mLabs) resolvem publicação; nenhuma delas responde "este canal traz paciente que fica". Essa resposta está no Command Center.

---

## Financeiro e ERP

Compre. Emissão de NF-e, conciliação bancária e obrigações acessórias não têm diferencial competitivo e têm risco fiscal alto. Conta Azul, Omie e Bling cobrem bem a faixa de clínica.

**O que este sistema faz e o ERP não vai fazer:** margem por serviço com custo direto, receita por hora instalada, despesa sem retorno por canal, e ticket médio por paciente distinto. Mantenha o ERP como fonte fiscal e traga o lançamento para cá com `pacienteId`, `servico` e `canal` preenchidos — são esses três campos que transformam contabilidade em gestão.

**O catálogo de custo direto** (Administração → Configuração) é o que separa margem real de margem imaginada. Enquanto ele estiver vazio, o sistema calcula margem com custo zero e **avisa na tela** que o número está superestimado.

---

## Comunicação interna: tire a gestão do WhatsApp

WhatsApp é excelente para relacionamento com paciente. É péssimo como sistema de gestão da empresa: não tem histórico pesquisável confiável, não tem responsável, não tem SLA, não tem trilha, e sai da empresa junto com o celular de quem pediu demissão.

A equipe precisa de Slack ou Teams para operação clínica, financeiro, procedimentos, marketing, gestão, qualidade e incidentes. E a regra que faz diferença:

> **Decisão importante vira tarefa ou registro estruturado.** Não fica enterrada em conversa.

O módulo *Processos & POPs* é o destino dessas decisões: tarefa com dono, prazo, evidência de conclusão e escalonamento.

---

## Base de conhecimento

Notion (ou equivalente) funciona bem como camada inicial: POPs, protocolos, scripts, regras administrativas, FAQs, manuais de equipamento, onboarding, condutas em intercorrência, modelos de consentimento, regras financeiras, treinamento.

O módulo *Conhecimento* deste sistema já entrega o que o Notion não entrega: um **copiloto que responde pelo POP da clínica**, cita título e versão do documento em que se baseou, e — quando não há POP — diz "não há POP registrado para isso" em vez de completar com conhecimento genérico da internet. Essa recusa é o valor do agente.

---

## Ordem de compra

Uma sequência que evita comprar o que ainda não se sabe usar:

**Fase 1 — a base que não dá para improvisar.** Prontuário com API. WhatsApp oficial com provedor. Slack ou Teams. Notion.

**Fase 2 — a costura.** Integrar o `pacienteId` entre prontuário, WhatsApp e este sistema. É aqui que o Patient 360 nasce, e é a fase que dá mais trabalho e mais retorno.

**Fase 3 — o que o volume passar a exigir.** ERP financeiro. CRM comprado, **se** o B2B tiver crescido a ponto de justificar.

**Fase 4 — profundidade.** Automação de escalas, portal do paciente, telemetria de procedimentos.

Não compre nada da fase 3 antes da fase 2 estar de pé. Sistema novo sem integração é mais uma ilha — e ilha é exatamente o problema que este desenho existe para resolver.

---

## Custo de saída — a pergunta que quase ninguém faz

Antes de assinar qualquer contrato, exija por escrito:

1. Consigo exportar **todos** os dados, em formato aberto, a qualquer momento?
2. Isso tem custo?
3. Em quanto tempo?
4. Inclui anexos, documentos e histórico de auditoria?
5. Se eu cancelar, por quanto tempo os dados ficam disponíveis?

Fornecedor que hesita em responder isso por escrito está te dizendo algo importante sobre a relação que pretende ter.
