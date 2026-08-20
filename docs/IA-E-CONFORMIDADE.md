# Camada de IA, governança e conformidade

Grupo Nutrindo Emoções · by Adiel Ríos

---

## O princípio de arquitetura

**Não existe "uma IA" neste sistema.** Existem onze agentes especializados, cada um com escopo fechado, entrada determinística e o mesmo bloco de limites.

E existe uma separação que sustenta tudo o mais:

> **Todo número é calculado pelo sistema. O modelo de linguagem apenas lê números prontos.**

Os 33 indicadores, os 3 preditores e as 15 regras do motor Next Best Action são código determinístico e auditável (`clinica/js/kpi.js`). Nenhum score depende de LLM. Quando um agente de IA recebe uma tarefa, ele recebe o resultado já calculado e faz o que modelo de linguagem faz bem: **narrar, priorizar redação, agrupar por causa, explicar**.

Isso não é uma escolha estética. É o que mantém a decisão rastreável — e o que torna possível responder "por que o sistema apontou este paciente?" com uma regra, e não com um encolher de ombros.

---

## A fronteira, escrita e verificada

Todo agente carrega, no início do system prompt, o mesmo bloco de limites absolutos — e a suíte de testes verifica que carrega (asserção *"Todo agente carrega o bloco de limites"* e *"Todo agente proíbe explicitamente diagnosticar"*).

**A IA pode:**
resumir · organizar · identificar padrões · lembrar · classificar · priorizar · redigir rascunho · sugerir.

**A IA não pode, em nenhuma circunstância:**
diagnosticar · alterar medicação · decidir internação · classificar risco suicida de forma definitiva · liberar procedimento · enviar orientação clínica sem governança humana.

Regras adicionais embutidas em todos os agentes:

1. Toda saída é **rascunho** sujeito à revisão de profissional identificado.
2. O agente trabalha **apenas** com os dados do bloco fornecido. Se faltar dado, ele diz o que falta em vez de preencher.
3. Diante de qualquer sinal de risco à vida, a única resposta permitida é sinalizar acionamento humano imediato conforme o protocolo — sem orientação clínica, sem estimar gravidade.
4. Nenhuma mensagem chega ao paciente sem passar pela fila de aprovação, com humano identificado.

A Resolução CFM nº 2.454/2026 regulamenta o uso de IA na medicina e mantém diagnóstico, prognóstico e decisão terapêutica sob responsabilidade do médico. A arquitetura acima é o desenho técnico dessa exigência — não uma promessa no rodapé.

> **Verificação obrigatória:** o texto normativo exato da Res. CFM 2.454/2026 e das orientações vigentes da ANPD deve ser conferido pelo jurídico e pela direção clínica da clínica antes da operação com dado real. Este documento descreve a arquitetura técnica; ele não substitui parecer jurídico.

---

## Os onze agentes

| Agente | Para quem | O que faz | Módulo-fonte |
|---|---|---|---|
| **IA Executiva** | Direção | As cinco coisas mais importantes de hoje, com fato, leitura, ação, dono e custo da inação | Command Center |
| **IA Copiloto Clínico** | Médico(a) / Psicólogo(a) | Resumo longitudinal para preparar a consulta. Termina em **perguntas**, nunca em conclusões | Patient 360 |
| **IA MBC** | Direção clínica | Lê trajetórias e classifica em três níveis: revisar em consulta / antecipar retorno / acionamento imediato | MBC |
| **IA Concierge** | Concierge | Redige mensagens a partir da evidência concreta. Máx. 4 linhas, sem emoji, sem "espero que esteja bem" | Concierge |
| **IA Pré-consulta** | Recepção | Organiza formulários sem traduzir a queixa para linguagem técnica | Agenda |
| **IA Operacional** | Coordenação | Encontra gargalo e propõe mudança de **processo**, não cobrança de pessoa | Processos |
| **IA Financeira** | Financeiro / Direção | Onde perdemos margem · qual despesa não retorna · qual ociosidade é mais cara | Financeiro |
| **IA Comercial** | Comercial | Leads parados, canal que traz paciente que **fica**, separando B2C de B2B | CRM |
| **IA Experiência** | Concierge / Qualidade | Agrupa comentários por **causa raiz**, não por sentimento | Experiência |
| **IA Conhecimento** | Toda a equipe | Responde **só** pelos POPs da clínica. Sem POP, ela diz "não há POP registrado" | Conhecimento |
| **IA Qualidade** | Compliance | Audita consentimentos, incidentes e não conformidades, classificando por gravidade | Qualidade |

O acesso a cada agente segue a permissão do módulo que o alimenta. Um concierge não consegue rodar o Copiloto Clínico, porque não tem acesso ao prontuário — a checagem é feita no código, antes da requisição sair.

### Instruções que valem a pena notar

Algumas linhas dos prompts foram escritas para evitar erros específicos que modelos cometem em contexto clínico e de gestão:

- *"Se um indicador está fora da meta mas o denominador é pequeno demais para concluir algo, diga isso em vez de tratar como problema."* — evita que a direção aja sobre ruído.
- *"Se a série de escalas tiver menos de três pontos, diga que a tendência não é interpretável ainda."* — evita narrativa de melhora ou piora onde há dois pontos.
- *"Não interprete o significado clínico do escore."* — o agente MBC classifica urgência de revisão, não gravidade.
- *"Sempre distinga volume de rentabilidade."* — evita comemorar agenda cheia com margem negativa.
- *"Nunca complete com conhecimento geral da internet."* — o valor do copiloto interno é responder pelo que **a clínica** decidiu.
- *"Não invente artigo de lei: se não souber a base normativa exata, escreva 'verificar base normativa'."*

---

## Minimização antes de sair do navegador

Antes de qualquer requisição, o payload passa por **pseudonimização**:

- Nomes de paciente viram códigos estáveis (`PAC-001`), restaurados só na exibição para o usuário.
- CPF, telefone e e-mail são removidos por padrão, mesmo que tenham escapado para um campo de texto livre.
- Só vai o recorte que o agente precisa — não o registro inteiro.

Quatro asserções da suíte verificam isso a cada execução: substituição do nome, remoção de CPF, de telefone e de e-mail, mais a restauração correta na exibição.

**O que fica registrado na auditoria:** agente, modelo, esforço, tokens de entrada e saída, duração, e **se a pseudonimização estava ativa**. **O que não fica gravado:** o texto enviado e a resposta — de propósito, para reduzir a superfície de dado sensível no banco.

---

## Os dois modos de conexão, e por que um deles é só para piloto

### Modo proxy — o recomendado

A clínica expõe um endpoint próprio que recebe o mesmo corpo do `/v1/messages`, injeta a chave **no servidor** e repassa. A chave nunca toca o navegador.

### Modo direto — piloto apenas

O navegador chama `https://api.anthropic.com/v1/messages` com a chave e o cabeçalho `anthropic-dangerous-direct-browser-access`. O nome do cabeçalho não é acidente: **a chave fica visível a quem tiver acesso ao dispositivo**.

Neste sistema, a chave só vive em `sessionStorage` — nunca no banco, e morre ao fechar a aba. Ainda assim: modo direto é aceitável para piloto com dado fictício, e **inaceitável com dado de paciente**. A tela diz isso, o diagnóstico de ambiente marca como alerta, e uma asserção verifica que a chave não vaza para o banco.

Modelo padrão: **Claude Opus 5** (`claude-opus-5`), com raciocínio adaptativo e esforço configurável. Sonnet 5 e Haiku 4.5 disponíveis para tarefas mais baratas.

> **Para conectar:** gere uma chave em `console.anthropic.com` e cole em *Camada de IA*. Ela vale só para a sessão. Para o modo proxy, informe a URL do seu endpoint. O botão *Testar conexão* faz uma chamada mínima, sem enviar nenhum dado de paciente.

---

## Antes de colocar prontuário em qualquer IA comercial

Dados de saúde são **dados pessoais sensíveis** na LGPD (art. 11) e seu tratamento depende de hipótese legal específica — tutela da saúde é uma delas, quando realizada nos termos da lei. A ANPD trata tecnologias emergentes, decisões automatizadas e dados sensíveis como elementos que caracterizam **tratamento de alto risco**, o que puxa exigência de relatório de impacto (RIPD).

Checklist mínimo antes de qualquer integração, incluindo esta:

| Item | Pergunta que precisa de resposta escrita |
|---|---|
| Papéis | Quem é controlador e quem é operador? |
| Contrato | Existe contrato de tratamento de dados assinado? |
| Retenção | Por quanto tempo o fornecedor retém? Zero data retention está disponível? |
| Localização | Onde os dados são processados e armazenados? Há transferência internacional? |
| Acesso | Quem, do lado do fornecedor, pode ver? Sob que controle? |
| Logs | O que é registrado e por quanto tempo? |
| Criptografia | Em trânsito e em repouso? |
| Finalidade | Está declarada e limitada? |
| Suboperadores | Quem mais toca o dado? |
| **Treinamento** | **As informações são usadas para treinar o modelo?** |
| Base legal | Qual hipótese do art. 11 se aplica a cada finalidade? |
| RIPD | Foi elaborado? Por quem? |

Enquanto essas respostas não existirem por escrito, a postura correta é: **pseudonimização ativa, dado fictício, e nenhum prontuário saindo do perímetro.**

---

## Retenção, imutabilidade e auditoria

**Retenção: 20 anos**, configurável em Administração. Registros só se tornam elegíveis a expurgo depois do prazo — e mesmo então, o expurgo é ato deliberado, não automático.

**Append-only, sem caminho de exclusão nem para o Super Administrador:**

- `auditoria` — a trilha inteira
- `prontuario` — registro assinado é imutável; correção entra como adenda, com autor e data próprios

Ambas as recusas são verificadas por asserção a cada execução da suíte.

**Toda escrita passa pela trilha.** `DB.salvar` e `DB.remover` gravam o evento **antes de retornar**. Não existe caminho de gravação que escape. Cada evento guarda data, hora, usuário, papel, ação, módulo, registro afetado e o estado **antes** e **depois** — com senhas e sais redigidos, e textos longos truncados por minimização.

**Massa de teste é rastreável e removível.** Todo registro criado por demonstração ou pela suíte de testes carrega `testData: true`, e a limpeza remove **exclusivamente** o que tem essa marca. Dado de produção não é alcançado pela limpeza — a marcação é a única porta.

Uma consequência que o sistema declara em vez de esconder: os **eventos de auditoria** de operações de teste permanecem, porque a trilha é append-only. O inventário os reporta separadamente, para que o número de "massa de teste" nunca prometa uma remoção que não vai acontecer.

---

## Como este sistema se desenvolve sozinho

Você pediu um flow com capacidade de se autodesenvolver. Ele existe, e não é mágica — é um ciclo fechado com quatro pontos de realimentação:

**1. O sistema mede a própria operação.** Cada POP declara qual indicador o mede. Quando o indicador piora, você sabe qual processo revisar — não precisa adivinhar.

**2. O sistema audita a si mesmo.** A suíte de 92 asserções roda em *Testes & Saúde*, escreve no banco real, verifica comportamento e limpa a própria massa, conferindo resíduo. Rode antes e depois de cada alteração.

**3. Os agentes propõem a próxima mudança.** A IA Operacional aponta gargalo e propõe mudança de processo. A IA Experiência agrupa reclamação por causa raiz e diz em que etapa da jornada ela nasce. A IA Qualidade encontra o que está fora de conformidade. Isso vira POP novo ou regra nova.

**4. Regra nova é uma linha de código, não um projeto.** Adicionar um indicador ao Command Center é acrescentar um objeto ao catálogo em `kpi.js`. Adicionar uma regra à fila de Próxima Ação é acrescentar um objeto a `NBA.REGRAS`. Adicionar um campo a um módulo é acrescentar um objeto ao array `campos`. A tela, a validação, a permissão e a auditoria se ajustam sozinhas.

O ciclo é: **medir → auditar → a IA propõe → você decide → uma declaração muda → a suíte confirma que nada quebrou.**

O passo que não se automatiza é o quarto ser precedido pelo terceiro e sucedido pela suíte. Um sistema que se altera sozinho sem verificação não é autodesenvolvimento — é deriva.
