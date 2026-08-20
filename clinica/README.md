# GNE Clinical OS

Sistema operacional clínico do **Grupo Nutrindo Emoções** · by Adiel Ríos

---

## Como abrir

**Servido por HTTP (recomendado):**

```bash
cd clinica
python3 -m http.server 8080
# abra http://localhost:8080
```

**Ou direto:** abra `clinica/index.html` no navegador. Funciona — os scripts são clássicos, sem módulos ES.

A diferença entre os dois: em `file://` o navegador não oferece contexto seguro, então a derivação de senha cai de PBKDF2-SHA256 para SHA-256 iterado. *Testes & Saúde → Diagnóstico do ambiente* mostra qual está em uso.

---

## Primeiro acesso

Na primeira execução o sistema provisiona o Super Administrador e exibe a credencial na tela de login:

```
adielcarneiro@gmail.com  /  GNE-Clinical-2026!
```

A troca de senha é **obrigatória** e imediata — a senha de instalação deixa de valer e é explicitamente recusada como nova senha. O evento fica na auditoria.

Junto com o provisionamento, o sistema instala em produção: 8 POPs, 5 documentos de conhecimento, 4 modelos de consentimento, catálogo de serviços e retenção de 20 anos. Tudo editável.

---

## Antes de qualquer coisa: popule e teste

*Testes & Saúde* → **Popular demonstração** cria uma clínica fictícia completa (12 pacientes, 14 leads, 46 agendamentos, 32 medições, 60 lançamentos financeiros, procedimentos com e sem intercorrência, reclamações abertas e fechadas). Tudo marcado como massa de teste.

*Testes & Saúde* → **Rodar suíte completa** executa 92 asserções contra o banco real: persistência, auditoria, imutabilidade, permissões, regras de domínio, cálculo dos indicadores, preditores, guardrails de IA, retenção e limpeza. Ao final, remove a própria massa e confere o resíduo.

*Testes & Saúde* → **Apagar massa de teste** remove **exclusivamente** registros com `testData: true`. Dado de produção não é alcançado — a marcação é a única porta.

> Os eventos de auditoria gerados por operações de teste **permanecem**, porque a trilha é append-only. O inventário os reporta separadamente, para que o número de "massa de teste" nunca prometa uma remoção que não vai acontecer.

---

## Módulos

| Grupo | Módulos |
|---|---|
| **Direção** | Command Center · Próxima Ação |
| **Relação** | CRM · Concierge · Omnichannel · Experiência |
| **Assistência** | Agenda · Patient 360 · Prontuário · MBC · Procedimentos |
| **Negócio** | Financeiro · Processos & POPs · Qualidade · Conhecimento |
| **Governança** | Camada de IA · Administração · Testes & Saúde |

---

## Conectar a IA

*Camada de IA* → escolha o modo:

- **Proxy (recomendado):** informe a URL de um endpoint próprio que recebe o mesmo corpo do `/v1/messages` e injeta a chave no servidor. A chave nunca toca o navegador.
- **Direto (piloto apenas):** cole a chave da API Anthropic. Ela vive só em `sessionStorage` e morre ao fechar a aba — mas fica visível a quem tiver acesso ao dispositivo. **Não use com dado de paciente.**

Modelo padrão: `claude-opus-5`. *Testar conexão* faz uma chamada mínima, sem enviar nenhum dado.

A **pseudonimização** vem ativa: nomes viram códigos, CPF/telefone/e-mail são removidos antes de a requisição sair. Deixe assim.

---

## Estrutura

```
clinica/
├── index.html
├── css/brand.css          design system do brandbook (paleta, tipografia, contraste medido)
└── js/
    ├── core.js            utilitários · SHA-256 próprio · IndexedDB · auditoria · RBAC · retenção · backup
    ├── kpi.js             33 indicadores · 3 preditores · 15 regras Next Best Action · briefing
    ├── ia.js              11 agentes · pseudonimização · guardrails · cliente da API
    ├── ui.js              shell · roteador · componentes · motor de CRUD declarativo
    ├── mod-direcao.js     Command Center · Próxima Ação
    ├── mod-relacao.js     CRM · Concierge · Omnichannel · Experiência
    ├── mod-assistencia.js Agenda · Patient 360 · Prontuário · MBC · Procedimentos
    ├── mod-negocio.js     Financeiro · Processos · Qualidade · Conhecimento
    ├── mod-governanca.js  IA · Administração · Testes
    ├── seed.js            POPs e conhecimento (produção) + demonstração (teste)
    ├── testes.js          92 asserções
    └── boot.js            inicialização · login · provisionamento
```

Sem framework, sem CDN de biblioteca. A única requisição externa é a fonte Crimson do Google Fonts, **não bloqueante**: se a rede não alcançar `fonts.googleapis.com`, o sistema inicia igual e usa o fallback serifado.

---

## Como alterar sem quebrar

Rode a suíte **antes**, altere a declaração, rode a suíte **depois**.

| Para adicionar | Edite |
|---|---|
| Indicador | `js/kpi.js` → `KPI.CATALOGO` |
| Regra de próxima ação | `js/kpi.js` → `NBA.REGRAS` |
| Campo de um módulo | `js/mod-*.js` → `campos` |
| Escala clínica | `js/core.js` → `GNE.ESCALAS` |
| Perfil de acesso | `js/core.js` → `GNE.PAPEIS` |
| Agente de IA | `js/ia.js` → `IA.AGENTES` |

Listagem, formulário, validação, permissão e auditoria são derivados da declaração. Não há tela para reescrever.

---

## Limitação que decide o próximo passo

Os dados vivem no **IndexedDB deste navegador**. Não sincronizam entre dispositivos, não têm backup gerenciado, e somem se o perfil do navegador for apagado. A autenticação é uma porta, não um cofre: quem tem acesso ao dispositivo tem acesso ao banco.

**Use com dado fictício.** Para operar com dado real de paciente, a Fase 1 de [`../docs/IMPLANTACAO.md`](../docs/IMPLANTACAO.md) é obrigatória — backend próprio no Brasil, criptografia em repouso, backup testado e contrato de tratamento de dados.

A troca é menor do que parece: toda escrita passa por `DB.salvar`/`DB.remover`, então a persistência é **um** objeto em `core.js`. E a suíte de 92 asserções serve como teste de contrato do novo backend.

---

## Documentação

| Documento | O que traz |
|---|---|
| [`ARQUITETURA.md`](../docs/ARQUITETURA.md) | Os 12 sistemas, as 5 camadas, a jornada, o ID único, o que ainda não é |
| [`ENCANTAMENTO.md`](../docs/ENCANTAMENTO.md) | O modelo Disney adaptado, com a hierarquia corrigida para saúde |
| [`PROCESSOS.md`](../docs/PROCESSOS.md) | Os 8 POPs, ponta a ponta |
| [`INDICADORES.md`](../docs/INDICADORES.md) | Os 33 indicadores: fórmula, dono, meta, fonte |
| [`NEXT-BEST-ACTION.md`](../docs/NEXT-BEST-ACTION.md) | As 15 regras e os 3 preditores |
| [`PERMISSOES-E-AUDITORIA.md`](../docs/PERMISSOES-E-AUDITORIA.md) | Matriz de 9 perfis × 18 módulos, e como a trilha funciona |
| [`IA-E-CONFORMIDADE.md`](../docs/IA-E-CONFORMIDADE.md) | Os 11 agentes, guardrails, LGPD, CFM, retenção |
| [`STACK.md`](../docs/STACK.md) | O que comprar, o que construir, o que integrar com o quê |
| [`IMPLANTACAO.md`](../docs/IMPLANTACAO.md) | Da situação atual à operação com dado real |
