/* =============================================================================
   GNE Clinical OS — Direção: Command Center e Next Best Action
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  /* ===========================================================================
     COMMAND CENTER
     ======================================================================== */
  UI.registrar('command', async function (host) {
    var d = await GNE.Dados.carregar(true);
    var kpis = await GNE.KPI.calcularTudo(d);
    var nba = await GNE.NBA.calcular(d);

    var criticos = kpis.filter(function (k) { return k.situacao === 'risco'; });
    var urgentes = nba.filter(function (a) { return a.prioridade >= 85; });

    host.innerHTML = UI.cabecalho('command');

    /* — faixa de topo — */
    var topo = '';
    if (urgentes.length) {
      topo += UI.aviso('<strong>' + urgentes.length + ' ação(ões) de prioridade máxima na fila.</strong> ' +
        'Envolvem risco, intercorrência ou consentimento ausente. Abra <em>Próxima Ação</em>.', 'risco');
    }
    if (criticos.length) {
      topo += UI.aviso('<strong>' + criticos.length + ' indicador(es) fora da meta:</strong> ' +
        U.esc(criticos.map(function (k) { return k.nome + ' (' + k.texto + ')'; }).join(' · ')), 'alerta');
    }
    if (!urgentes.length && !criticos.length) {
      topo += UI.aviso('Nenhum indicador em risco e nenhuma ação de prioridade máxima pendente no momento.', 'ok');
    }
    host.insertAdjacentHTML('beforeend', topo);

    /* — blocos de KPI — */
    GNE.KPI.BLOCOS.forEach(function (bloco) {
      var lista = kpis.filter(function (k) { return k.bloco === bloco; });
      if (!lista.length) return;
      var sec = document.createElement('section');
      sec.style.marginBottom = '22px';
      sec.innerHTML =
        '<p class="eyebrow" style="margin-bottom:2px">' + U.esc(bloco) + '</p>' +
        '<div class="filete-curto"></div>' +
        '<div class="grade grade--4">' + lista.map(UI.kpiCard).join('') + '</div>';
      host.appendChild(sec);
    });

    /* — economia por canal — */
    var canais = GNE.Preditores.economiaPorCanal(d).filter(function (c) { return c.leads || c.pacientes || c.investimento; });
    if (canais.length && Auth.pode('financeiro', 'ver')) {
      var cCanal = document.createElement('div');
      cCanal.className = 'card';
      cCanal.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Aquisição</p>' +
        '<h3>Retorno por canal</h3><p class="ajuda">CAC, LTV e ROI por origem. O veredito é aritmética, não opinião.</p></div></div>';
      cCanal.appendChild(UI.tabela({
        colunas: [
          { campo: 'canal', rot: 'Canal' },
          { campo: 'leads', rot: 'Leads', num: true },
          { campo: 'pacientes', rot: 'Pacientes', num: true },
          { campo: 'conversao', rot: 'Conversão', num: true, fmt: function (v) { return v === null ? '—' : (v * 100).toFixed(0) + '%'; } },
          { campo: 'investimento', rot: 'Investido', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'receita', rot: 'Receita', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'cac', rot: 'CAC', num: true, fmt: function (v) { return v === null ? '—' : U.brl(v); } },
          { campo: 'ltv', rot: 'LTV', num: true, fmt: function (v) { return v === null ? '—' : U.brl(v); } },
          { campo: 'roi', rot: 'ROI', num: true, fmt: function (v) { return v === null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(0) + '%'; } },
          { campo: 'veredito', rot: 'Veredito', fmt: function (v) {
              var t = v === 'escalar' ? 'ok' : v === 'cortar' ? 'risco' : v === 'ajustar' ? 'alerta' : 'info';
              return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
            } }
        ],
        dados: canais, vazio: 'Sem dados de aquisição ainda.'
      }));
      host.appendChild(cCanal);
    }

    /* — margem por serviço — */
    var servicos = GNE.Preditores.margemPorServico(d);
    if (servicos.length && Auth.pode('financeiro', 'ver')) {
      var cServ = document.createElement('div');
      cServ.className = 'card';
      cServ.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Rentabilidade</p>' +
        '<h3>Margem por serviço</h3><p class="ajuda">Ordenado da menor margem para a maior. Custo direto vem do catálogo em Administração — sem ele, a margem fica superestimada.</p></div></div>';
      cServ.appendChild(UI.tabela({
        colunas: [
          { campo: 'servico', rot: 'Serviço' },
          { campo: 'n', rot: 'Atend.', num: true },
          { campo: 'ticket', rot: 'Ticket', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'receita', rot: 'Receita', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'custo', rot: 'Custo direto', num: true, fmt: function (v) { return U.brl(v); } },
          { campo: 'margemPct', rot: 'Margem', num: true, fmt: function (v) {
              if (v === null) return '—';
              var t = v < 20 ? 'risco' : v < 45 ? 'alerta' : 'ok';
              return '<span class="tag tag--' + t + '">' + v + '%</span>';
            } },
          { campo: 'veredito', rot: 'Leitura' }
        ],
        dados: servicos, vazio: 'Sem receitas registradas.'
      }));
      host.appendChild(cServ);
    }

    /* — IA executiva — */
    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('executiva', { rotulo: 'Gerar briefing do dia' }));

    host.insertAdjacentHTML('beforeend',
      '<p class="faixa-lgpd">Todos os números acima são calculados pelo próprio sistema, de forma determinística, ' +
      'a partir dos registros do banco. A camada de IA lê esses números já prontos — ela não os produz nem os corrige. ' +
      'Passe o cursor sobre um indicador para ver sua definição e fonte.</p>');
  });

  /* ===========================================================================
     NEXT BEST ACTION
     ======================================================================== */
  UI.registrar('nba', async function (host) {
    var d = await GNE.Dados.carregar(true);
    var todas = await GNE.NBA.calcular(d);
    var filtroDono = '', filtroRegra = '';

    host.innerHTML = UI.cabecalho('nba',
      '<div class="aviso aviso--info" style="margin-top:12px">Cada linha é uma regra determinística ' +
      'que disparou sobre um registro real. A coluna <em>Evidência</em> mostra exatamente o que fez a regra disparar — ' +
      'nenhuma priorização aqui vem de modelo de linguagem.</div>');

    var barra = document.createElement('div');
    barra.className = 'card';
    barra.style.marginBottom = '14px';
    var donos = Object.keys(U.agrupar(todas, 'dono')).sort();
    var regras = Object.keys(U.agrupar(todas, 'rotulo')).sort();
    barra.innerHTML =
      '<div class="linha-campos">' +
      '<div class="campo" style="margin:0"><label>Responsável</label><select class="sel" id="nba-dono">' +
        '<option value="">Todos</option>' + donos.map(function (x) { return '<option>' + U.esc(x) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="campo" style="margin:0"><label>Tipo de ação</label><select class="sel" id="nba-regra">' +
        '<option value="">Todas</option>' + regras.map(function (x) { return '<option>' + U.esc(x) + '</option>'; }).join('') +
      '</select></div></div>';
    host.appendChild(barra);

    var resumo = document.createElement('div');
    resumo.className = 'grade grade--4';
    resumo.style.marginBottom = '14px';
    host.appendChild(resumo);

    var alvo = document.createElement('div');
    host.appendChild(alvo);

    function faixaTag(p) {
      var t = p >= 85 ? 'risco' : p >= 60 ? 'alerta' : 'info';
      var r = p >= 85 ? 'Máxima' : p >= 60 ? 'Alta' : 'Normal';
      return '<span class="tag tag--' + t + '">' + r + '</span>';
    }

    function desenhar() {
      var lista = todas.filter(function (a) {
        return (!filtroDono || a.dono === filtroDono) && (!filtroRegra || a.rotulo === filtroRegra);
      });
      resumo.innerHTML =
        '<div class="kpi kpi--risco"><span class="kpi__rot">Prioridade máxima</span><span class="kpi__val risco">' +
          lista.filter(function (a) { return a.prioridade >= 85; }).length + '</span><span class="kpi__nota">risco, intercorrência, consentimento</span></div>' +
        '<div class="kpi kpi--alerta"><span class="kpi__rot">Prioridade alta</span><span class="kpi__val alerta">' +
          lista.filter(function (a) { return a.prioridade >= 60 && a.prioridade < 85; }).length + '</span><span class="kpi__nota">acompanhamento e recuperação</span></div>' +
        '<div class="kpi kpi--neutro"><span class="kpi__rot">Normal</span><span class="kpi__val">' +
          lista.filter(function (a) { return a.prioridade < 60; }).length + '</span><span class="kpi__nota">rotina e reativação</span></div>' +
        '<div class="kpi kpi--neutro"><span class="kpi__rot">Total na fila</span><span class="kpi__val">' + lista.length + '</span>' +
          '<span class="kpi__nota">de ' + todas.length + ' geradas</span></div>';

      alvo.innerHTML = '';
      alvo.appendChild(UI.tabela({
        colunas: [
          { campo: 'prioridade', rot: 'Prior.', fmt: function (v) { return faixaTag(v); }, largura: '90px' },
          { campo: 'alvoNome', rot: 'Quem', fmt: function (v, l) {
              return U.esc(v || '—') + '<br><span class="ajuda">' + (l.alvoTipo === 'lead' ? 'lead' : 'paciente') + '</span>';
            } },
          { campo: 'rotulo', rot: 'Ação necessária', fmt: function (v, l) {
              return '<strong>' + U.esc(v) + '</strong><br><span class="ajuda">' + U.esc(l.acao) + '</span>';
            } },
          { campo: 'evidencia', rot: 'Evidência', fmt: function (v) { return '<span class="ajuda">' + U.esc(v) + '</span>'; } },
          { campo: 'dono', rot: 'Dono', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } }
        ],
        dados: lista,
        acoes: Auth.pode('processos', 'editar') ? [{
          rot: 'Virar tarefa',
          fn: async function (a) {
            await DB.salvar('tarefas', {
              titulo: a.rotulo + ' — ' + a.alvoNome,
              processo: 'Next Best Action',
              responsavel: a.dono,
              status: 'Aberta',
              critica: a.prioridade >= 85,
              prazo: U.somaDias(new Date(), a.prioridade >= 85 ? 0 : 2),
              pacienteId: a.alvoTipo === 'paciente' ? a.alvoId : null,
              evidencia: a.evidencia,
              descricao: a.acao,
              origem: 'nba:' + a.regraId
            }, { acao: 'criar_tarefa_nba' });
            GNE.Dados.invalidar();
            UI.toast('Tarefa criada para ' + a.dono + '.', 'ok');
            UI.atualizarBadges();
          }
        }] : null,
        vazio: 'Nada pendente com este filtro. Isso é um bom sinal — ou um sinal de que faltam dados.'
      }));
    }

    document.getElementById('nba-dono').onchange = function () { filtroDono = this.value; desenhar(); };
    document.getElementById('nba-regra').onchange = function () { filtroRegra = this.value; desenhar(); };
    desenhar();

    /* — catálogo de regras, para transparência e edição futura — */
    var cat = document.createElement('details');
    cat.style.marginTop = '20px';
    cat.innerHTML = '<summary style="cursor:pointer;font-family:var(--sans);font-size:.75rem;letter-spacing:.08em;' +
      'text-transform:uppercase;color:var(--txt-3);padding:8px 0">Ver as ' +
      (GNE.NBA.REGRAS.length + GNE.NBA.REGRAS_LEAD.length) + ' regras do motor</summary>';
    var tabRegras = UI.tabela({
      colunas: [
        { campo: 'prioridade', rot: 'Prior.', num: true },
        { campo: 'rotulo', rot: 'Regra' },
        { campo: 'desc', rot: 'Quando dispara' },
        { campo: 'dono', rot: 'Dono padrão' }
      ],
      dados: U.ordenarPor(GNE.NBA.REGRAS.concat(GNE.NBA.REGRAS_LEAD.map(function (r) {
        return { prioridade: r.prioridade, rotulo: r.rotulo, dono: r.dono, desc: 'Aplica-se a leads no funil.' };
      })), 'prioridade', true)
    });
    tabRegras.style.marginTop = '8px';
    cat.appendChild(tabRegras);
    host.appendChild(cat);
  });

})(typeof window !== 'undefined' ? window : globalThis);
