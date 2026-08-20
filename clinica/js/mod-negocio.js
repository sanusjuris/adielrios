/* =============================================================================
   GNE Clinical OS — Negócio
   Financeiro · Processos & POPs · Qualidade · Conhecimento
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  function opcoesPacientes(ctx) {
    return (ctx.pacientes || []).map(function (p) { return { valor: p.id, rot: p.nome }; });
  }

  /* ===========================================================================
     1. FINANCEIRO
     ======================================================================== */
  var finCrud = UI.crud({
    store: 'financeiro', modulo: 'financeiro', singular: 'Lançamento', ordenar: 'venc',
    contexto: async function () {
      return {
        pacientes: await DB.listar('pacientes'),
        servicos: Object.keys(await DB.cfg('custos_servico', {}))
      };
    },
    campos: [
      { id: 'tipo', rot: 'Natureza', tipo: 'select', obrigatorio: true, padrao: 'Receita', opcoes: ['Receita', 'Despesa'] },
      { id: 'descricao', rot: 'Descrição', tipo: 'texto', obrigatorio: true },
      { id: 'valor', rot: 'Valor (R$)', tipo: 'moeda', obrigatorio: true,
        valida: function (v) { return v <= 0 ? 'O valor precisa ser maior que zero.' : null; } },
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes,
        mostrar: function (v) { return v.tipo === 'Receita'; },
        ajuda: 'Sem o vínculo, este valor não entra no ticket médio nem no LTV por canal.' },
      { id: 'servico', rot: 'Serviço', tipo: 'select',
        mostrar: function (v) { return v.tipo === 'Receita'; },
        opcoes: function (ctx) { return ctx.servicos || []; },
        ajuda: 'Cadastre o catálogo e o custo direto em Administração — é o que permite calcular margem real.' },
      { id: 'categoria', rot: 'Categoria de despesa', tipo: 'select',
        mostrar: function (v) { return v.tipo === 'Despesa'; },
        opcoes: ['Mídia paga', 'Pessoal', 'Aluguel', 'Insumos', 'Equipamento', 'Software', 'Impostos', 'Outras'] },
      { id: 'canal', rot: 'Canal / centro de custo', tipo: 'select',
        mostrar: function (v) { return v.tipo === 'Despesa'; },
        opcoes: function () { return GNE.CANAIS; },
        ajuda: 'Despesa de mídia sem canal não pode ser confrontada com receita. É assim que dinheiro some sem explicação.' },
      { id: 'profissional', rot: 'Profissional', tipo: 'texto', mostrar: function (v) { return v.tipo === 'Receita'; } },
      { id: 'venc', rot: 'Vencimento', tipo: 'data', obrigatorio: true, padrao: function () { return U.hoje(); } },
      { id: 'status', rot: 'Situação', tipo: 'select', obrigatorio: true, padrao: 'Previsto',
        opcoes: ['Previsto', 'Pago', 'Cancelado'] },
      { id: 'pagoEm', rot: 'Pago em', tipo: 'data', mostrar: function (v) { return v.status === 'Pago'; } },
      { id: 'custoDireto', rot: 'Custo direto deste atendimento (R$)', tipo: 'moeda',
        mostrar: function (v) { return v.tipo === 'Receita'; },
        ajuda: 'Opcional. Se preenchido, sobrepõe o custo do catálogo para este lançamento.' }
    ],
    colunas: [
      { campo: 'venc', rot: 'Vencimento', fmt: function (v, l) {
          var atrasado = l.tipo === 'Receita' && l.status !== 'Pago' && l.status !== 'Cancelado' && new Date(v) < new Date();
          return U.dataBR(v) + (atrasado ? '<br><span class="tag tag--risco">' + U.dias(v) + 'd em atraso</span>' : '');
        } },
      { campo: 'tipo', rot: 'Natureza', fmt: function (v) {
          return '<span class="tag tag--' + (v === 'Receita' ? 'ok' : 'alerta') + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'descricao', rot: 'Descrição', fmt: function (v, l) {
          return U.esc(v) + '<br><span class="ajuda">' + U.esc(l.servico || l.categoria || '') +
            (l._pacienteNome ? ' · ' + U.esc(l._pacienteNome) : '') + '</span>';
        } },
      { campo: 'valor', rot: 'Valor', num: true, fmt: function (v, l) {
          return '<strong>' + (l.tipo === 'Despesa' ? '−' : '') + U.brl(v) + '</strong>';
        } },
      { campo: 'status', rot: 'Situação', fmt: function (v) {
          var t = v === 'Pago' ? 'ok' : v === 'Cancelado' ? '' : 'alerta';
          return '<span class="tag' + (t ? ' tag--' + t : '') + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'canal', rot: 'Canal / prof.', fmt: function (v, l) { return U.esc(v || l.profissional || '—'); } }
    ],
    antesSalvar: function (reg) {
      if (reg.status === 'Pago' && !reg.pagoEm) reg.pagoEm = U.hoje();
      if (reg.status !== 'Pago') reg.pagoEm = null;
      if (reg.tipo === 'Despesa') { reg.pacienteId = null; reg.servico = null; }
      return reg;
    },
    acoesLinha: function (recarregar) {
      if (!Auth.pode('financeiro', 'editar')) return [];
      return [{
        rot: 'Baixar', mostrar: function (l) { return l.status === 'Previsto'; },
        fn: async function (l) {
          var reg = await DB.obter('financeiro', l.id);
          reg.status = 'Pago'; reg.pagoEm = U.hoje();
          await DB.salvar('financeiro', reg, { acao: 'baixar_lancamento' });
          GNE.Dados.invalidar();
          UI.toast('Baixa registrada e auditada.', 'ok');
          recarregar();
        }
      }];
    }
  });

  UI.registrar('financeiro', async function (host) {
    await finCrud(host);
    var d = await GNE.Dados.carregar(true);
    var kpis = await GNE.KPI.calcularTudo(d);
    var bloco = kpis.filter(function (k) { return k.bloco === 'Financeiro'; });

    var res = document.createElement('div');
    res.innerHTML = '<p class="eyebrow" style="margin-top:20px">Indicadores financeiros</p><div class="filete-curto"></div>' +
      '<div class="grade grade--3">' + bloco.map(UI.kpiCard).join('') + '</div>';
    host.appendChild(res);

    var servicos = GNE.Preditores.margemPorServico(d);
    if (servicos.length) {
      var c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Rentabilidade</p><h3>Margem por serviço</h3>' +
        '<p class="ajuda">Um serviço que enche a agenda e come a margem é um problema, não um sucesso.</p></div></div>';
      c.appendChild(UI.tabela({
        colunas: [
          { campo: 'servico', rot: 'Serviço' },
          { campo: 'n', rot: 'Atend.', num: true },
          { campo: 'ticket', rot: 'Ticket', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'receita', rot: 'Receita', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'custo', rot: 'Custo', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'margem', rot: 'Margem R$', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'margemPct', rot: 'Margem %', num: true, fmt: function (v) {
              if (v === null) return '—';
              return '<span class="tag tag--' + (v < 20 ? 'risco' : v < 45 ? 'alerta' : 'ok') + '">' + v + '%</span>';
            } },
          { campo: 'veredito', rot: 'Leitura' }
        ],
        dados: servicos
      }));
      host.appendChild(c);
    }

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('financeira', { rotulo: 'Analisar a economia' }));
  });

  /* ===========================================================================
     2. PROCESSOS & POPs
     Um POP aqui não é PDF: é gatilho → dono → SLA → etapas → evidência →
     escalonamento → indicador.
     ======================================================================== */
  var popCrud = UI.crud({
    store: 'processos', modulo: 'processos', singular: 'POP', ordenar: 'titulo', desc: false,
    modalLargo: true,
    campos: [
      { id: 'titulo', rot: 'Nome do processo', tipo: 'texto', obrigatorio: true },
      { id: 'area', rot: 'Área', tipo: 'select', obrigatorio: true,
        opcoes: ['Comercial', 'Concierge', 'Agenda', 'Assistencial', 'Procedimentos', 'Financeiro', 'Qualidade', 'Gestão'] },
      { id: 'versao', rot: 'Versão', tipo: 'texto', padrao: '1.0' },
      { id: 'gatilho', rot: 'Gatilho — o que faz o processo começar', tipo: 'texto', obrigatorio: true },
      { id: 'responsavel', rot: 'Responsável (papel, não pessoa)', tipo: 'texto', obrigatorio: true,
        ajuda: 'Papel, não nome. Pessoa sai de férias; papel permanece.' },
      { id: 'sla', rot: 'SLA', tipo: 'texto', obrigatorio: true, placeholder: 'ex.: 15 minutos em horário comercial' },
      { id: 'etapas', rot: 'Etapas (uma por linha, na ordem)', tipo: 'textarea', obrigatorio: true, altura: '170px' },
      { id: 'evidencia', rot: 'Evidência de conclusão', tipo: 'texto', obrigatorio: true,
        ajuda: 'O que prova que foi feito. Sem evidência, não há processo — há intenção.' },
      { id: 'escalonamento', rot: 'Regra de escalonamento', tipo: 'textarea', obrigatorio: true,
        ajuda: 'O que acontece se o SLA estourar, e para quem sobe.' },
      { id: 'indicador', rot: 'Indicador que mede este processo', tipo: 'select',
        opcoes: function () {
          return GNE.KPI.CATALOGO.map(function (k) { return { valor: k.id, rot: k.nome + ' (' + k.bloco + ')' }; });
        },
        ajuda: 'Processo sem indicador não é gerenciável.' },
      { id: 'ativo', rot: 'Processo em vigor', tipo: 'checkbox', padrao: true }
    ],
    colunas: [
      { campo: 'titulo', rot: 'Processo', fmt: function (v, l) {
          return '<strong>' + U.esc(v) + '</strong> <span class="ajuda">v' + U.esc(l.versao || '1.0') + '</span>' +
            '<br><span class="ajuda">gatilho: ' + U.esc(l.gatilho || '') + '</span>';
        } },
      { campo: 'area', rot: 'Área', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } },
      { campo: 'responsavel', rot: 'Dono' },
      { campo: 'sla', rot: 'SLA' },
      { campo: 'indicador', rot: 'Indicador', fmt: function (v) {
          var k = v && GNE.KPI.porId(v);
          return k ? '<span class="tag tag--ouro">' + U.esc(k.nome) + '</span>' : '<span class="tag tag--alerta">sem indicador</span>';
        } },
      { campo: 'ativo', rot: 'Estado', fmt: function (v) {
          return v ? '<span class="tag tag--ok">em vigor</span>' : '<span class="tag">suspenso</span>';
        } }
    ],
    acoesLinha: function () {
      return [{
        rot: 'Ver fluxo',
        fn: function (l) {
          var etapas = String(l.etapas || '').split('\n').filter(function (s) { return s.trim(); });
          UI.modal({
            titulo: l.titulo + ' — v' + (l.versao || '1.0'),
            largo: true,
            corpo:
              '<div class="grade grade--2" style="margin-bottom:14px">' +
                '<div><p class="eyebrow">Gatilho</p><p>' + U.esc(l.gatilho) + '</p>' +
                '<p class="eyebrow" style="margin-top:10px">Responsável</p><p>' + U.esc(l.responsavel) + '</p></div>' +
                '<div><p class="eyebrow">SLA</p><p>' + U.esc(l.sla) + '</p>' +
                '<p class="eyebrow" style="margin-top:10px">Evidência de conclusão</p><p>' + U.esc(l.evidencia) + '</p></div>' +
              '</div>' +
              '<p class="eyebrow">Fluxo</p><div class="filete-curto"></div>' +
              '<ul class="linha-tempo">' + etapas.map(function (e, i) {
                return '<li><span class="quando">Etapa ' + (i + 1) + '</span>' + U.esc(e) + '</li>';
              }).join('') + '</ul>' +
              '<p class="eyebrow" style="margin-top:12px">Se o SLA estourar</p>' +
              '<div class="aviso aviso--alerta">' + U.esc(l.escalonamento) + '</div>'
          });
        }
      }];
    }
  });

  UI.registrar('processos', async function (host) {
    await popCrud(host);
    var d = await GNE.Dados.carregar(true);

    /* tarefas */
    var abertas = U.ordenarPor(d.tarefas.filter(function (t) { return t.status !== 'Concluída'; }), 'prazo');
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Execução</p>' +
      '<h3>Tarefas abertas (' + abertas.length + ')</h3>' +
      '<p class="ajuda">Geradas pelo motor de Próxima Ação, por gatilhos do sistema ou manualmente. ' +
      'Nenhuma decisão importante deve viver apenas numa conversa.</p></div></div>';

    var mapaPac = {};
    d.pacientes.forEach(function (p) { mapaPac[p.id] = p.nome; });

    card.appendChild(UI.tabela({
      colunas: [
        { campo: 'prazo', rot: 'Prazo', fmt: function (v) {
            if (!v) return '—';
            var vencido = new Date(v) < new Date();
            return U.dataBR(v) + (vencido ? ' <span class="tag tag--risco">vencida</span>' : '');
          } },
        { campo: 'titulo', rot: 'Tarefa', fmt: function (v, l) {
            return (l.critica ? '<span class="tag tag--risco">crítica</span> ' : '') + U.esc(v) +
              (l.evidencia ? '<br><span class="ajuda">' + U.esc(l.evidencia) + '</span>' : '');
          } },
        { campo: 'pacienteId', rot: 'Paciente', fmt: function (v) { return U.esc(mapaPac[v] || '—'); } },
        { campo: 'responsavel', rot: 'Dono', fmt: function (v) { return '<span class="tag">' + U.esc(v || '—') + '</span>'; } },
        { campo: 'processo', rot: 'Processo' }
      ],
      dados: abertas,
      acoes: Auth.pode('processos', 'editar') ? [{
        rot: 'Concluir',
        fn: async function (t) {
          var f = UI.form([
            { id: 'evidenciaConclusao', rot: 'Evidência de conclusão', tipo: 'textarea', obrigatorio: true,
              ajuda: 'O que foi feito, concretamente. Sem isso a tarefa não fecha.' }
          ], {});
          UI.modal({
            titulo: 'Concluir: ' + t.titulo,
            corpo: f.el,
            acoes: [
              { rot: 'Cancelar', classe: 'btn--linha' },
              { rot: 'Concluir', fn: async function () {
                  var dados = f.ler();
                  var reg = await DB.obter('tarefas', t.id);
                  reg.status = 'Concluída';
                  reg.evidenciaConclusao = dados.evidenciaConclusao;
                  reg.concluidaEm = new Date().toISOString();
                  await DB.salvar('tarefas', reg, { acao: 'concluir_tarefa' });
                  GNE.Dados.invalidar();
                  UI.toast('Tarefa concluída com evidência registrada.', 'ok');
                  UI.ir('processos');
                } }
            ]
          });
        }
      }] : null,
      vazio: 'Nenhuma tarefa aberta.'
    }));
    host.appendChild(card);

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('operacional', { rotulo: 'Encontrar gargalos' }));
  });

  /* ===========================================================================
     3. QUALIDADE E COMPLIANCE
     ======================================================================== */
  var qualCrud = UI.crud({
    store: 'qualidade', modulo: 'qualidade', singular: 'Registro', ordenar: 'criadoEm',
    modalLargo: true,
    campos: [
      { id: 'tipo', rot: 'Tipo', tipo: 'select', obrigatorio: true, padrao: 'Consentimento',
        opcoes: ['Consentimento', 'Incidente', 'Não conformidade', 'Documento normativo', 'Registro LGPD'] },
      { id: 'titulo', rot: 'Título', tipo: 'texto', obrigatorio: true },
      { id: 'versao', rot: 'Versão', tipo: 'texto', padrao: '1.0' },
      { id: 'gravidade', rot: 'Gravidade', tipo: 'select', padrao: 'Observação',
        mostrar: function (v) { return v.tipo === 'Incidente' || v.tipo === 'Não conformidade'; },
        opcoes: ['Observação', 'Relevante', 'Crítica'] },
      { id: 'conteudo', rot: 'Conteúdo / descrição', tipo: 'textarea', obrigatorio: true, altura: '170px' },
      { id: 'baseLegal', rot: 'Base legal / normativa', tipo: 'select',
        mostrar: function (v) { return v.tipo === 'Consentimento' || v.tipo === 'Registro LGPD'; },
        opcoes: ['LGPD art. 11, II, "a" — tutela da saúde', 'LGPD art. 11, I — consentimento específico e destacado',
                 'LGPD art. 7, II — obrigação legal', 'Res. CFM 2.454/2026 — uso de IA na medicina', 'Outra'],
        ajuda: 'Dado de saúde é dado sensível. Tratamento sem hipótese legal identificada é tratamento irregular.' },
      { id: 'responsavel', rot: 'Responsável', tipo: 'texto', obrigatorio: true },
      { id: 'status', rot: 'Situação', tipo: 'select', obrigatorio: true, padrao: 'Vigente',
        opcoes: ['Vigente', 'Em análise', 'Tratada', 'Substituída', 'Suspensa'] },
      { id: 'acaoCorretiva', rot: 'Ação corretiva', tipo: 'textarea',
        mostrar: function (v) { return v.tipo === 'Incidente' || v.tipo === 'Não conformidade'; } },
      { id: 'revisaoEm', rot: 'Próxima revisão', tipo: 'data' }
    ],
    colunas: [
      { campo: 'tipo', rot: 'Tipo', fmt: function (v) {
          var t = v === 'Incidente' ? 'risco' : v === 'Não conformidade' ? 'alerta' : v === 'Consentimento' ? 'ok' : 'info';
          return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'titulo', rot: 'Título', fmt: function (v, l) {
          return '<strong>' + U.esc(v) + '</strong> <span class="ajuda">v' + U.esc(l.versao || '1.0') + '</span>' +
            (l.baseLegal ? '<br><span class="ajuda">' + U.esc(l.baseLegal) + '</span>' : '');
        } },
      { campo: 'gravidade', rot: 'Gravidade', fmt: function (v) {
          if (!v) return '—';
          return '<span class="tag tag--' + (v === 'Crítica' ? 'risco' : v === 'Relevante' ? 'alerta' : '') + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'responsavel', rot: 'Responsável' },
      { campo: 'status', rot: 'Situação' },
      { campo: 'revisaoEm', rot: 'Revisão', fmt: function (v) {
          if (!v) return '—';
          var atrasada = new Date(v) < new Date();
          return U.dataBR(v) + (atrasada ? ' <span class="tag tag--alerta">vencida</span>' : '');
        } }
    ],
    antesSalvar: function (reg) {
      if ((reg.tipo === 'Incidente' || reg.tipo === 'Não conformidade') && reg.status === 'Tratada' && !reg.acaoCorretiva) {
        throw new Error('Registre a ação corretiva antes de marcar como tratada.');
      }
      return reg;
    }
  });

  UI.registrar('qualidade', async function (host) {
    await qualCrud(host);
    var d = await GNE.Dados.carregar(true);

    var semConsent = d.procedimentos.filter(function (p) { return !p.consentimentoId; });
    var interc = d.procedimentos.filter(function (p) { return p.intercorrencia && !p.followUpFeito; });
    var revVencida = d.qualidade.filter(function (q) { return q.revisaoEm && new Date(q.revisaoEm) < new Date(); });

    var painel = document.createElement('div');
    painel.innerHTML = '<p class="eyebrow" style="margin-top:20px">Verificações automáticas</p><div class="filete-curto"></div>' +
      '<div class="grade grade--3">' +
      '<div class="kpi kpi--' + (semConsent.length ? 'risco' : 'ok') + '"><span class="kpi__rot">Procedimentos sem consentimento</span>' +
        '<span class="kpi__val ' + (semConsent.length ? 'risco' : 'ok') + '">' + semConsent.length + '</span>' +
        '<span class="kpi__nota">bloqueia conclusão da sessão</span></div>' +
      '<div class="kpi kpi--' + (interc.length ? 'alerta' : 'ok') + '"><span class="kpi__rot">Intercorrências sem follow-up</span>' +
        '<span class="kpi__val ' + (interc.length ? 'alerta' : 'ok') + '">' + interc.length + '</span>' +
        '<span class="kpi__nota">gera tarefa crítica automática</span></div>' +
      '<div class="kpi kpi--' + (revVencida.length ? 'alerta' : 'ok') + '"><span class="kpi__rot">Documentos com revisão vencida</span>' +
        '<span class="kpi__val ' + (revVencida.length ? 'alerta' : 'ok') + '">' + revVencida.length + '</span>' +
        '<span class="kpi__nota">controle documental</span></div></div>';
    host.appendChild(painel);

    host.insertAdjacentHTML('beforeend',
      '<p class="faixa-lgpd"><strong>Antes de colocar prontuário em qualquer IA comercial</strong>, avalie: quem é controlador ' +
      'e quem é operador, o contrato de tratamento, prazo de retenção, localização dos dados, controle de acesso, logs, ' +
      'criptografia, finalidade declarada, subcontratados e se as informações são usadas para treinar o modelo. ' +
      'A ANPD considera tecnologias emergentes, decisões automatizadas e dados sensíveis elementos que caracterizam ' +
      'tratamento de alto risco — o que puxa exigência de relatório de impacto (RIPD).</p>');

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('qualidade', { rotulo: 'Auditoria assistida' }));
  });

  /* ===========================================================================
     4. CONHECIMENTO — o cérebro digital da clínica
     ======================================================================== */
  var conCrud = UI.crud({
    store: 'conhecimento', modulo: 'conhecimento', singular: 'Documento', ordenar: 'titulo', desc: false,
    modalLargo: true,
    campos: [
      { id: 'titulo', rot: 'Título', tipo: 'texto', obrigatorio: true },
      { id: 'categoria', rot: 'Categoria', tipo: 'select', obrigatorio: true,
        opcoes: ['Protocolo clínico', 'Script de atendimento', 'Regra administrativa', 'FAQ',
                 'Manual de equipamento', 'Onboarding', 'Conduta em intercorrência', 'Regra financeira', 'Treinamento'] },
      { id: 'versao', rot: 'Versão', tipo: 'texto', padrao: '1.0' },
      { id: 'tags', rot: 'Palavras-chave', tipo: 'texto', placeholder: 'cetamina, cancelamento, EMT' },
      { id: 'conteudo', rot: 'Conteúdo', tipo: 'textarea', obrigatorio: true, altura: '260px' },
      { id: 'autor', rot: 'Autor', tipo: 'texto' }
    ],
    colunas: [
      { campo: 'titulo', rot: 'Documento', fmt: function (v, l) {
          return '<strong>' + U.esc(v) + '</strong> <span class="ajuda">v' + U.esc(l.versao || '1.0') + '</span>' +
            (l.tags ? '<br><span class="ajuda">' + U.esc(l.tags) + '</span>' : '');
        } },
      { campo: 'categoria', rot: 'Categoria', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } },
      { campo: 'autor', rot: 'Autor' },
      { campo: 'atualizadoEm', rot: 'Atualizado', fmt: function (v) { return U.dataBR(v); } }
    ],
    acoesLinha: function () {
      return [{
        rot: 'Ler',
        fn: function (l) {
          UI.modal({
            titulo: l.titulo + ' — v' + (l.versao || '1.0'),
            largo: true,
            corpo: '<p class="ajuda">' + U.esc(l.categoria) + (l.autor ? ' · ' + U.esc(l.autor) : '') + '</p>' +
                   '<hr><div style="white-space:pre-wrap;font-size:.94rem;line-height:1.65">' + U.esc(l.conteudo) + '</div>'
          });
        }
      }];
    }
  });

  UI.registrar('conhecimento', async function (host) {
    await conCrud(host);

    if (Auth.pode('ia', 'ver')) {
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Copiloto interno</p>' +
        '<h3>Perguntar aos POPs da clínica</h3>' +
        '<p class="ajuda">Responde <strong>apenas</strong> com base nos documentos acima e nos POPs cadastrados. ' +
        'Se não houver POP para o assunto, o agente diz isso em vez de inventar.</p></div></div>';
      var inp = document.createElement('input');
      inp.className = 'inp';
      inp.placeholder = 'Ex.: qual é o procedimento quando um paciente cancela uma sessão de EMT?';
      inp.setAttribute('aria-label', 'Pergunta para o copiloto');
      card.appendChild(inp);
      var saida = document.createElement('div');
      saida.style.marginTop = '12px';
      var btn = document.createElement('button');
      btn.className = 'btn btn--ouro';
      btn.style.marginTop = '10px';
      btn.textContent = 'Perguntar';
      card.appendChild(btn);
      card.appendChild(saida);

      async function perguntar() {
        var q = inp.value.trim();
        if (!q) return UI.toast('Escreva a pergunta.', 'alerta');
        btn.disabled = true; btn.textContent = 'Consultando…';
        saida.innerHTML = '<div class="vazio">Lendo os documentos da clínica…</div>';
        var r = await GNE.IA.executar('conhecimento', { pergunta: q });
        btn.disabled = false; btn.textContent = 'Perguntar';
        saida.innerHTML = r.ok
          ? '<div style="white-space:pre-wrap;font-size:.93rem;line-height:1.6">' + U.esc(r.texto) + '</div>'
          : UI.aviso(U.esc(r.erro), 'alerta');
      }
      btn.onclick = perguntar;
      inp.onkeydown = function (e) { if (e.key === 'Enter') perguntar(); };
      host.appendChild(card);
    }
  });

})(typeof window !== 'undefined' ? window : globalThis);
