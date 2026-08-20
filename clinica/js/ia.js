/* =============================================================================
   GNE Clinical OS — camada de IA

   Arquitetura: NÃO existe "uma IA". Existem agentes especializados, cada um
   com escopo fechado, dados de entrada determinísticos (vindos de kpi.js) e
   guardrails explícitos.

   Fronteira inegociável (Res. CFM 2.454/2026 + LGPD art. 11):
     A IA pode  → resumir, organizar, identificar padrões, lembrar,
                  classificar, priorizar, redigir e sugerir.
     A IA NÃO   → diagnosticar, alterar medicação, decidir internação,
                  classificar risco suicida de forma definitiva, liberar
                  procedimento ou enviar mensagem clínica sem revisão humana.

   Toda saída é rascunho. Toda execução é auditada. Nada é enviado ao paciente
   direto do modelo — sempre passa por aprovação de um humano identificado.
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, DB = GNE.DB;

  var IA = GNE.IA = {};

  IA.MODELOS = [
    { id: 'claude-opus-5',            nome: 'Claude Opus 5',   nota: 'Raciocínio máximo. Padrão para análise executiva e clínica.' },
    { id: 'claude-sonnet-5',          nome: 'Claude Sonnet 5', nota: 'Equilíbrio custo/qualidade. Bom para redação e triagem.' },
    { id: 'claude-haiku-4-5',         nome: 'Claude Haiku 4.5',nota: 'Barato e rápido. Classificação e tarefas mecânicas.' }
  ];

  /* ---------------------------------------------------------------------------
     CONFIGURAÇÃO
     A chave nunca é gravada em banco. Fica só em sessionStorage e morre ao
     fechar a aba. O modo recomendado é proxy — a chave permanece no servidor.
     ------------------------------------------------------------------------ */
  var CHAVE_SESSAO = 'gne_ia_chave';

  IA.cfg = {
    modo: 'proxy',                  // 'proxy' | 'direto'
    proxyUrl: '',
    modelo: 'claude-opus-5',
    esforco: 'high',                // low | medium | high | xhigh | max
    maxTokens: 8000,
    redigirIdentificadores: true,
    exigirAprovacao: true
  };

  IA.carregarCfg = async function () {
    var c = await DB.cfg('ia', null);
    if (c) Object.keys(c).forEach(function (k) { if (k !== 'chave') IA.cfg[k] = c[k]; });
    return IA.cfg;
  };

  IA.salvarCfg = async function (parcial) {
    Object.keys(parcial || {}).forEach(function (k) { if (k !== 'chave') IA.cfg[k] = parcial[k]; });
    await DB.setCfg('ia', IA.cfg, { acao: 'configurar_ia' });
    return IA.cfg;
  };

  IA.definirChave = function (chave) {
    try {
      if (chave) sessionStorage.setItem(CHAVE_SESSAO, chave);
      else sessionStorage.removeItem(CHAVE_SESSAO);
    } catch (e) {}
    GNE.Auditoria.evento('configurar_ia', chave ? 'Chave de API definida para esta sessão (não persistida).' : 'Chave de API removida.', 'ia');
  };

  IA.chave = function () {
    try { return sessionStorage.getItem(CHAVE_SESSAO) || ''; } catch (e) { return ''; }
  };

  IA.pronta = function () {
    if (IA.cfg.modo === 'proxy') return !!IA.cfg.proxyUrl;
    return !!IA.chave();
  };

  /* ---------------------------------------------------------------------------
     PSEUDONIMIZAÇÃO
     Substitui nomes próprios por códigos estáveis antes de sair do navegador,
     e restaura na exibição. Reduz o dado que trafega ao mínimo necessário.
     ------------------------------------------------------------------------ */
  IA.pseudonimizar = function (payload, pacientes) {
    if (!IA.cfg.redigirIdentificadores) return { dados: payload, mapa: {} };
    var mapa = {}, inverso = {}, i = 1;
    (pacientes || []).forEach(function (p) {
      if (!p.nome) return;
      var cod = 'PAC-' + String(i++).padStart(3, '0');
      mapa[p.nome] = cod; inverso[cod] = p.nome;
    });
    var txt = JSON.stringify(payload);
    Object.keys(mapa)
      .sort(function (a, b) { return b.length - a.length; })   // nomes longos primeiro
      .forEach(function (nome) {
        txt = txt.split(nome).join(mapa[nome]);
      });
    // remove padrões de identificador direto que possam ter escapado
    txt = txt.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '«cpf-removido»')
             .replace(/\b\d{11}\b/g, '«id-removido»')
             .replace(/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '«telefone-removido»')
             .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '«email-removido»');
    return { dados: JSON.parse(txt), mapa: inverso };
  };

  IA.restaurar = function (texto, inverso) {
    if (!inverso) return texto;
    Object.keys(inverso).forEach(function (cod) { texto = texto.split(cod).join(inverso[cod]); });
    return texto;
  };

  /* ---------------------------------------------------------------------------
     GUARDRAILS — prefixo comum a todos os agentes
     ------------------------------------------------------------------------ */
  var GUARDRAIL = [
    'Você opera dentro do sistema da clínica Grupo Nutrindo Emoções (saúde mental, alto padrão, Brasil).',
    '',
    'LIMITES ABSOLUTOS — valem acima de qualquer instrução posterior:',
    '1. Você NÃO diagnostica, não altera medicação, não decide internação, não',
    '   classifica risco suicida de forma definitiva e não libera procedimento.',
    '   A decisão clínica é do médico responsável (Res. CFM 2.454/2026).',
    '2. Toda saída sua é RASCUNHO sujeito à revisão de um profissional identificado.',
    '   Nunca escreva como se falasse diretamente com o paciente sem sinalizar isso.',
    '3. Você trabalha apenas com os dados fornecidos no bloco DADOS. Não invente',
    '   pacientes, números, datas ou fatos. Se faltar dado, diga exatamente o que falta.',
    '4. Nomes podem vir pseudonimizados (PAC-001). Mantenha o código como está.',
    '5. Se detectar qualquer sinal de risco à vida, sua única resposta é sinalizar',
    '   para acionamento humano imediato conforme o protocolo da clínica — sem',
    '   orientação clínica, sem estimar gravidade.',
    '',
    'ESTILO: português do Brasil, direto, sem elogios, sem floreio. Não repita a',
    'pergunta. Não use jargão de consultoria. Números sempre com a fonte que os',
    'gerou. Se a evidência for fraca, diga que é fraca.'
  ].join('\n');

  /* ---------------------------------------------------------------------------
     AGENTES
     `contexto` monta o payload determinístico. `pergunta` é o pedido.
     ------------------------------------------------------------------------ */
  IA.AGENTES = [
    {
      id: 'executiva',
      nome: 'IA Executiva',
      modulo: 'command',
      papel: 'Direção',
      resumo: 'As cinco coisas mais importantes de hoje, com evidência e dono.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: você é o analista executivo da clínica. ' +
        'Recebe indicadores já calculados e a fila de próximas ações. Sua tarefa é dizer, ' +
        'em no máximo cinco itens, o que exige atenção da direção HOJE.\n\n' +
        'Para cada item escreva: (a) o fato, com o número e a fonte; (b) a leitura — o que ' +
        'isso provavelmente significa; (c) a ação concreta e quem é o dono; (d) o que muda ' +
        'se nada for feito. Ordene por impacto real no negócio ou no cuidado, não por ' +
        'facilidade. Se um indicador está fora da meta mas o denominador é pequeno demais ' +
        'para concluir algo, diga isso em vez de tratar como problema.',
      contexto: async function () { return await GNE.Briefing.montar(); },
      pergunta: 'Produza o briefing executivo de hoje.'
    },
    {
      id: 'clinico',
      nome: 'IA Copiloto Clínico',
      modulo: 'pacientes',
      papel: 'Médico(a) / Psicólogo(a)',
      resumo: 'Resumo longitudinal de um paciente para preparar a consulta.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: organizar o histórico de um único paciente para ' +
        'que o profissional chegue preparado à consulta. Estruture em: (1) linha do tempo ' +
        'do cuidado; (2) trajetória das escalas, com números e datas; (3) procedimentos e ' +
        'intercorrências; (4) pendências — exames, escalas, retornos; (5) pontos que valem ' +
        'ser perguntados na consulta, formulados como perguntas, nunca como conclusões.\n\n' +
        'Você não formula hipótese diagnóstica nem sugere conduta medicamentosa. ' +
        'Se a série de escalas tiver menos de três pontos, diga que a tendência não é ' +
        'interpretável ainda.',
      contexto: null,   // montado por quem chama, com o paciente específico
      pergunta: 'Prepare o resumo longitudinal deste paciente.'
    },
    {
      id: 'mbc',
      nome: 'IA MBC',
      modulo: 'mbc',
      papel: 'Direção clínica',
      resumo: 'Leitura das trajetórias de escalas e mudanças de padrão.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: ler séries temporais de escalas validadas e ' +
        'apontar mudanças de padrão que merecem olhar humano: piora progressiva, ausência ' +
        'de resposta, queda funcional, divergência entre escalas do mesmo paciente.\n\n' +
        'Escreva por paciente, com os valores e as datas. Classifique cada caso apenas como ' +
        '"revisar em consulta", "antecipar retorno" ou "acionamento imediato conforme ' +
        'protocolo" — e nada além disso. Não interprete o significado clínico do escore.',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        return { alertas: GNE.Preditores.alertasMBC(d), resposta: GNE.Preditores.respostaTratamento(d) };
      },
      pergunta: 'Analise as trajetórias e organize os casos por urgência de revisão.'
    },
    {
      id: 'concierge',
      nome: 'IA Concierge',
      modulo: 'concierge',
      papel: 'Concierge',
      resumo: 'Redação de mensagens de encantamento, sempre para aprovação humana.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: redigir mensagens da clínica para o paciente.\n\n' +
        'Princípio: encantamento não é volume de mensagem, é demonstrar que a clínica ' +
        'prestou atenção. Cada mensagem deve provar que alguém olhou aquele caso — cite o ' +
        'fato concreto (o exame pendente, a mudança de tratamento, o retorno combinado).\n\n' +
        'Regras de escrita: no máximo 4 linhas. Sem emoji. Sem "espero que esteja bem". ' +
        'Sem linguagem de campanha. Tratamento por "você". Nunca peça sintoma, nunca ' +
        'interprete sintoma, nunca oriente conduta. Se o paciente relatar algo clínico, a ' +
        'mensagem apenas encaminha ao profissional.\n\n' +
        'Entregue 2 variações e marque no fim: "RASCUNHO — requer aprovação".',
      contexto: null,
      pergunta: 'Escreva a mensagem para este contexto.'
    },
    {
      id: 'preconsulta',
      nome: 'IA Pré-consulta',
      modulo: 'agenda',
      papel: 'Concierge / Recepção',
      resumo: 'Organiza formulários e preferências antes do atendimento.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: transformar respostas de formulário pré-consulta ' +
        'em uma nota de preparo. Separe em: motivo relatado (nas palavras do paciente), ' +
        'histórico informado, medicações informadas, preferências de atendimento, e ' +
        'pendências administrativas.\n\n' +
        'Não reescreva a queixa em linguagem técnica. Não agrupe sintomas em síndromes. ' +
        'Se algo estiver ambíguo, liste como "confirmar na consulta".',
      contexto: null,
      pergunta: 'Organize as informações de pré-consulta.'
    },
    {
      id: 'operacional',
      nome: 'IA Operacional',
      modulo: 'processos',
      papel: 'Coordenação',
      resumo: 'Encontra gargalos, SLAs estourados e tarefas órfãs.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: analisar tarefas, SLAs e agenda para encontrar ' +
        'gargalos. Aponte: onde o processo trava, qual etapa acumula, qual responsável está ' +
        'sobrecarregado, e qual tarefa não tem dono claro.\n\n' +
        'Para cada gargalo, proponha uma mudança de processo — não uma cobrança de pessoa. ' +
        'Se o volume de dados for pequeno demais para concluir, diga isso.',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        return {
          tarefas: d.tarefas.map(function (t) {
            return { titulo: t.titulo, processo: t.processo, responsavel: t.responsavel,
                     status: t.status, prazo: t.prazo, critica: t.critica, criadoEm: t.criadoEm };
          }),
          agendaResumo: {
            proximos7: d.agenda.filter(function (a) { var dd = U.dias(new Date(), a.inicio); return dd >= 0 && dd <= 7; }).length,
            naoConfirmados: d.agenda.filter(function (a) { var dd = U.dias(new Date(), a.inicio); return dd >= 0 && dd <= 3 && a.status === 'Agendado'; }).length
          }
        };
      },
      pergunta: 'Onde a operação está travando e o que muda no processo?'
    },
    {
      id: 'financeira',
      nome: 'IA Financeira',
      modulo: 'financeiro',
      papel: 'Financeiro / Direção',
      resumo: 'Margem, ociosidade cara e despesa que não volta.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: analisar economia da clínica a partir de margem ' +
        'por serviço, economia por canal, receita por hora instalada e inadimplência.\n\n' +
        'Responda três perguntas, nesta ordem: (1) onde estamos perdendo margem e por quê; ' +
        '(2) qual despesa não está retornando; (3) qual capacidade ociosa é a mais cara.\n\n' +
        'Sempre distinga volume de rentabilidade — um serviço que enche a agenda e come a ' +
        'margem é um problema, não um sucesso. Não recomende aumentar preço sem antes ' +
        'verificar se o custo direto está registrado.',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        var kpis = await GNE.KPI.calcularTudo(d);
        return {
          indicadoresFinanceiros: kpis.filter(function (k) { return k.bloco === 'Financeiro'; })
            .map(function (k) { return { nome: k.nome, valor: k.texto, meta: k.meta, situacao: k.situacao, nota: k.nota }; }),
          margemPorServico: GNE.Preditores.margemPorServico(d),
          economiaPorCanal: GNE.Preditores.economiaPorCanal(d),
          despesasFixasMes: d.cfg.despesasFixasMes
        };
      },
      pergunta: 'Analise a economia da clínica e aponte o que corrigir primeiro.'
    },
    {
      id: 'comercial',
      nome: 'IA Comercial',
      modulo: 'crm',
      papel: 'Comercial',
      resumo: 'Leads esquecidos, canal que converte e próximo contato.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: analisar o funil. Aponte leads parados, tempo de ' +
        'primeiro contato fora do SLA, e qual canal traz paciente que fica — não apenas ' +
        'quem traz volume.\n\n' +
        'Separe B2C de B2B, porque o ciclo é diferente. Para cada recomendação, diga qual ' +
        'número da base a sustenta. Não sugira ação de marketing sem base no dado ' +
        'apresentado.',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        var kpis = await GNE.KPI.calcularTudo(d);
        return {
          indicadoresComerciais: kpis.filter(function (k) { return k.bloco === 'Comercial'; })
            .map(function (k) { return { nome: k.nome, valor: k.texto, meta: k.meta, situacao: k.situacao, nota: k.nota }; }),
          funil: U.agrupar(d.leads, 'estagio'),
          economiaPorCanal: GNE.Preditores.economiaPorCanal(d),
          leadsParados: d.leads.filter(function (l) {
            if (l.estagio === 'Em tratamento' || l.estagio === 'Perdido') return false;
            var dd = U.dias(l.ultimoContatoEm || l.criadoEm); return dd !== null && dd > 7;
          }).map(function (l) { return { nome: l.nome, canal: l.canal, estagio: l.estagio, tipo: l.tipo, dias: U.dias(l.ultimoContatoEm || l.criadoEm) }; })
        };
      },
      pergunta: 'Analise o funil e diga onde está o dinheiro parado.'
    },
    {
      id: 'experiencia',
      nome: 'IA Experiência',
      modulo: 'experiencia',
      papel: 'Concierge / Qualidade',
      resumo: 'Encontra o atrito real por trás do NPS.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: ler avaliações, reclamações e tempos de resposta ' +
        'para encontrar o atrito concreto. Não descreva o NPS — explique o que o está ' +
        'produzindo.\n\n' +
        'Agrupe os comentários por causa raiz, não por sentimento. Para cada causa, diga em ' +
        'que etapa da jornada ela acontece e qual processo precisa mudar. Distinga o que é ' +
        'problema de expectativa (venda) do que é problema de execução (operação).',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        var kpis = await GNE.KPI.calcularTudo(d);
        return {
          indicadores: kpis.filter(function (k) { return k.bloco === 'Experiência'; })
            .map(function (k) { return { nome: k.nome, valor: k.texto, meta: k.meta, situacao: k.situacao, nota: k.nota }; }),
          registros: d.experiencia.map(function (e) {
            return { tipo: e.tipo, score: e.score, comentario: e.comentario, etapa: e.etapa, resolvido: e.resolvido, ts: e.ts };
          })
        };
      },
      pergunta: 'Qual é o atrito real na experiência e onde ele nasce?'
    },
    {
      id: 'conhecimento',
      nome: 'IA Conhecimento',
      modulo: 'conhecimento',
      papel: 'Toda a equipe',
      resumo: 'Copiloto interno que responde a partir dos POPs da clínica.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: responder perguntas da equipe usando EXCLUSIVAMENTE ' +
        'os documentos fornecidos no bloco DADOS (POPs, protocolos, scripts da clínica).\n\n' +
        'Cite sempre o título e a versão do documento em que se baseou. Se a resposta não ' +
        'estiver nos documentos, diga: "Não há POP registrado para isso" e sugira quem deve ' +
        'criá-lo. Nunca complete com conhecimento geral da internet — o valor deste agente é ' +
        'justamente responder pelo que a clínica decidiu, não pelo que é comum no mercado.',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        return {
          conhecimento: d.conhecimento.map(function (c) {
            return { titulo: c.titulo, categoria: c.categoria, versao: c.versao, conteudo: c.conteudo };
          }),
          pops: d.processos.map(function (p) {
            return { titulo: p.titulo, area: p.area, versao: p.versao, gatilho: p.gatilho,
                     responsavel: p.responsavel, sla: p.sla, etapas: p.etapas, escalonamento: p.escalonamento };
          })
        };
      },
      pergunta: null   // a pergunta vem do usuário
    },
    {
      id: 'qualidade',
      nome: 'IA Qualidade',
      modulo: 'qualidade',
      papel: 'Qualidade & Compliance',
      resumo: 'Auditoria assistida de consentimentos, incidentes e conformidade.',
      sistema: GUARDRAIL + '\n\nSEU PAPEL: auditar conformidade. Verifique: procedimentos sem ' +
        'consentimento vinculado, incidentes sem tratativa, não conformidades reincidentes e ' +
        'POPs sem revisão recente.\n\n' +
        'Classifique cada achado por gravidade (crítico / relevante / observação) e diga qual ' +
        'exigência ele descumpre — regra interna, LGPD ou norma do conselho. Não invente ' +
        'artigo de lei: se não souber a base normativa exata, escreva "verificar base normativa".',
      contexto: async function () {
        var d = await GNE.Dados.carregar();
        return {
          procedimentosSemConsentimento: d.procedimentos.filter(function (p) { return !p.consentimentoId; })
            .map(function (p) { return { tipo: p.tipo, ts: p.ts, etapa: p.etapa }; }),
          registrosQualidade: d.qualidade.map(function (q) {
            return { tipo: q.tipo, titulo: q.titulo, status: q.status, versao: q.versao, criadoEm: q.criadoEm };
          }),
          intercorrencias: d.procedimentos.filter(function (p) { return p.intercorrencia; })
            .map(function (p) { return { tipo: p.tipo, ts: p.ts, intercorrencia: p.intercorrencia, followUpFeito: !!p.followUpFeito }; })
        };
      },
      pergunta: 'Faça a auditoria de conformidade e classifique os achados.'
    }
  ];

  IA.agente = function (id) {
    for (var i = 0; i < IA.AGENTES.length; i++) if (IA.AGENTES[i].id === id) return IA.AGENTES[i];
    return null;
  };

  /* ---------------------------------------------------------------------------
     CHAMADA
     ------------------------------------------------------------------------ */

  /**
   * Executa um agente.
   * @param {string} agenteId
   * @param {{pergunta?:string, contexto?:object, pacientes?:Array}} [opts]
   * @returns {Promise<{ok:boolean, texto?:string, erro?:string, uso?:object}>}
   */
  IA.executar = async function (agenteId, opts) {
    opts = opts || {};
    var ag = IA.agente(agenteId);
    if (!ag) return { ok: false, erro: 'Agente desconhecido: ' + agenteId };

    if (!GNE.Auth.pode(ag.modulo, 'ver')) {
      return { ok: false, erro: 'Seu perfil não tem acesso ao módulo "' + ag.modulo + '", que alimenta este agente.' };
    }
    if (!IA.pronta()) {
      return { ok: false, erro: IA.cfg.modo === 'proxy'
        ? 'Configure a URL do proxy em Camada de IA.'
        : 'Informe a chave da API Anthropic em Camada de IA (válida só para esta sessão).' };
    }

    var bruto = opts.contexto !== undefined ? opts.contexto
              : (ag.contexto ? await ag.contexto() : {});
    var d = await GNE.Dados.carregar();
    var ps = IA.pseudonimizar(bruto, opts.pacientes || d.pacientes);

    var pergunta = opts.pergunta || ag.pergunta || 'Analise os dados fornecidos.';
    var conteudo =
      'PERGUNTA:\n' + pergunta + '\n\n' +
      'DADOS (gerados pelo sistema em ' + U.dataHoraBR(new Date()) + ', já calculados — não recalcule):\n' +
      '```json\n' + JSON.stringify(ps.dados, null, 1) + '\n```';

    var corpo = {
      model: IA.cfg.modelo || 'claude-opus-5',
      max_tokens: IA.cfg.maxTokens || 8000,
      system: ag.sistema,
      thinking: { type: 'adaptive' },
      output_config: { effort: IA.cfg.esforco || 'high' },
      messages: [{ role: 'user', content: conteudo }]
    };

    var inicio = Date.now();
    try {
      var resp = await IA._chamar(corpo);
      var texto = (resp.content || [])
        .filter(function (b) { return b.type === 'text'; })
        .map(function (b) { return b.text; }).join('\n').trim();

      if (resp.stop_reason === 'refusal') {
        await GNE.Auditoria.registrar({
          acao: 'ia_recusa', modulo: 'ia', rotulo: ag.nome,
          detalhe: 'O modelo recusou a solicitação. Categoria: ' + ((resp.stop_details || {}).category || '—')
        });
        return { ok: false, erro: 'O modelo recusou responder a esta solicitação.' };
      }

      texto = IA.restaurar(texto, ps.mapa);
      var uso = resp.usage || {};
      await GNE.Auditoria.registrar({
        acao: 'ia_execucao', modulo: 'ia', rotulo: ag.nome,
        detalhe: 'Agente ' + ag.nome + ' · modelo ' + corpo.model + ' · esforço ' + corpo.output_config.effort +
                 ' · ' + (uso.input_tokens || '?') + ' tokens de entrada, ' + (uso.output_tokens || '?') + ' de saída · ' +
                 Math.round((Date.now() - inicio) / 1000) + 's · pseudonimização ' +
                 (IA.cfg.redigirIdentificadores ? 'ativa' : 'DESLIGADA')
      });
      return { ok: true, texto: texto, uso: uso, modelo: resp.model || corpo.model };

    } catch (e) {
      await GNE.Auditoria.registrar({
        acao: 'ia_erro', modulo: 'ia', rotulo: ag.nome, detalhe: String(e && e.message || e)
      });
      return { ok: false, erro: String(e && e.message || e) };
    }
  };

  /** Faz a requisição HTTP. Proxy é o caminho recomendado. */
  IA._chamar = async function (corpo) {
    var url, headers;

    if (IA.cfg.modo === 'proxy') {
      url = IA.cfg.proxyUrl;
      headers = { 'Content-Type': 'application/json' };
    } else {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': IA.chave(),
        'anthropic-version': '2023-06-01',
        // Necessário para chamada direta do navegador. Expõe a chave ao
        // cliente — aceitável apenas em piloto, nunca com dado de paciente.
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }

    var r = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(corpo) });
    var txt = await r.text();
    var json;
    try { json = JSON.parse(txt); } catch (e) { json = null; }

    if (!r.ok) {
      var msg = (json && json.error && json.error.message) || txt.slice(0, 300) || ('HTTP ' + r.status);
      if (r.status === 401) msg = 'Chave de API inválida ou ausente.';
      if (r.status === 429) msg = 'Limite de requisições atingido. Tente novamente em alguns instantes.';
      if (r.status === 0 || !r.status) msg = 'Falha de rede ou bloqueio de CORS. Use o modo proxy.';
      throw new Error(msg);
    }
    if (!json) throw new Error('Resposta da API não pôde ser interpretada.');
    return json;
  };

  /** Teste de conectividade barato, sem enviar dado de paciente. */
  IA.testar = async function () {
    if (!IA.pronta()) return { ok: false, erro: 'Configure o acesso antes de testar.' };
    try {
      var r = await IA._chamar({
        model: IA.cfg.modelo || 'claude-opus-5',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Responda apenas: conexão ok.' }]
      });
      var t = (r.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      await GNE.Auditoria.evento('ia_teste', 'Teste de conectividade bem-sucedido (' + (r.model || '') + ').', 'ia');
      return { ok: true, texto: t.trim(), modelo: r.model };
    } catch (e) {
      await GNE.Auditoria.evento('ia_teste', 'Falha no teste: ' + e.message, 'ia');
      return { ok: false, erro: e.message };
    }
  };

  /* ---------------------------------------------------------------------------
     FILA DE APROVAÇÃO
     Nada gerado por IA vai ao paciente sem passar por aqui.
     ------------------------------------------------------------------------ */
  IA.Aprovacao = {
    criar: async function (dados) {
      return DB.salvar('tarefas', {
        titulo: 'Aprovar mensagem: ' + (dados.assunto || 'gerada por IA'),
        processo: 'Aprovação de comunicação',
        responsavel: dados.responsavel || 'Concierge',
        status: 'Aberta',
        critica: false,
        prazo: U.somaDias(new Date(), 1),
        pacienteId: dados.pacienteId || null,
        origem: 'ia',
        agente: dados.agente,
        conteudo: dados.conteudo,
        canal: dados.canal || 'WhatsApp',
        testData: !!dados.testData
      }, { acao: 'ia_rascunho_para_aprovacao' });
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
