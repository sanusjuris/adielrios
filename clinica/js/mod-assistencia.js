/* =============================================================================
   GNE Clinical OS — Assistência
   Agenda · Patient 360 · Prontuário · MBC · Procedimentos
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  function opcoesPacientes(ctx) {
    return (ctx.pacientes || []).map(function (p) { return { valor: p.id, rot: p.nome }; });
  }
  async function ctxPacientes() { return { pacientes: await DB.listar('pacientes') }; }

  /* ===========================================================================
     1. AGENDA
     ======================================================================== */
  var agendaCrud = UI.crud({
    store: 'agenda', modulo: 'agenda', singular: 'Agendamento', ordenar: 'inicio', desc: false,
    contexto: async function () {
      return { pacientes: await DB.listar('pacientes'), salas: await DB.cfg('salas', ['Consultório 1']) };
    },
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes, obrigatorio: true },
      { id: 'tipo', rot: 'Tipo de atendimento', tipo: 'select', obrigatorio: true, padrao: 'Retorno',
        opcoes: ['Primeira consulta', 'Retorno', 'Psicoterapia', 'Procedimento', 'Avaliação multiprofissional', 'Teleconsulta'] },
      { id: 'profissional', rot: 'Profissional', tipo: 'texto', obrigatorio: true },
      { id: 'sala', rot: 'Sala', tipo: 'select', opcoes: function (ctx) { return ctx.salas || []; } },
      { id: 'inicio', rot: 'Início', tipo: 'datahora', obrigatorio: true },
      { id: 'fim', rot: 'Fim', tipo: 'datahora', obrigatorio: true },
      { id: 'status', rot: 'Situação', tipo: 'select', obrigatorio: true, padrao: 'Agendado',
        opcoes: function () { return GNE.STATUS_AGENDA; } },
      { id: 'valor', rot: 'Valor combinado (R$)', tipo: 'moeda' },
      { id: 'observacoes', rot: 'Observações operacionais', tipo: 'textarea',
        ajuda: 'Preparo, preferências, acompanhante. Não é lugar de conteúdo clínico — isso vai no prontuário.' }
    ],
    colunas: [
      { campo: 'inicio', rot: 'Quando', fmt: function (v, l) {
          var dd = U.dias(new Date(), v);
          var marca = dd === 0 ? ' <span class="tag tag--ouro">hoje</span>' : '';
          return U.dataHoraBR(v) + marca + '<br><span class="ajuda">' + U.esc(l.sala || '—') + '</span>';
        } },
      { campo: '_pacienteNome', rot: 'Paciente' },
      { campo: 'tipo', rot: 'Tipo' },
      { campo: 'profissional', rot: 'Profissional' },
      { campo: 'status', rot: 'Situação', fmt: function (v) {
          var t = v === 'Compareceu' ? 'ok' : v === 'Faltou' ? 'risco' : v === 'Confirmado' ? 'info'
                : v === 'Cancelado' ? 'alerta' : '';
          return '<span class="tag' + (t ? ' tag--' + t : '') + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'valor', rot: 'Valor', num: true, fmt: function (v) { return v ? U.brl(v) : '—'; } }
    ],
    antesSalvar: function (reg) {
      if (new Date(reg.fim) <= new Date(reg.inicio)) throw new Error('O fim precisa ser depois do início.');
      var h = U.horas(reg.inicio, reg.fim);
      if (h > 12) throw new Error('Duração acima de 12 horas — verifique as datas.');
      return reg;
    },
    acoesLinha: function (recarregar) {
      if (!Auth.pode('agenda', 'editar')) return [];
      return [
        { rot: 'Confirmar', mostrar: function (l) { return l.status === 'Agendado'; },
          fn: async function (l) { await mudarStatus(l, 'Confirmado', recarregar); } },
        { rot: 'Compareceu', mostrar: function (l) { return l.status === 'Confirmado' || l.status === 'Agendado'; },
          fn: async function (l) { await mudarStatus(l, 'Compareceu', recarregar); } },
        { rot: 'Faltou', mostrar: function (l) { return l.status === 'Confirmado' || l.status === 'Agendado'; },
          fn: async function (l) { await mudarStatus(l, 'Faltou', recarregar); } }
      ];
    }
  });

  async function mudarStatus(linha, status, recarregar) {
    var reg = await DB.obter('agenda', linha.id);
    if (!reg) return;
    reg.status = status;
    await DB.salvar('agenda', reg, { acao: 'mudar_status_agenda' });
    GNE.Dados.invalidar();
    UI.toast('Situação atualizada para "' + status + '".', 'ok');
    recarregar();
  }

  UI.registrar('agenda', async function (host) {
    await agendaCrud(host);
    // enriquece com score de no-show, calculado após a montagem
    var d = await GNE.Dados.carregar(true);
    var kpis = await GNE.KPI.calcularTudo(d);
    var op = kpis.filter(function (k) { return k.bloco === 'Operação'; });
    var res = document.createElement('div');
    res.innerHTML = '<p class="eyebrow" style="margin-top:20px">Operação da agenda</p><div class="filete-curto"></div>' +
      '<div class="grade grade--4">' + op.map(UI.kpiCard).join('') + '</div>';
    host.appendChild(res);

    var futuros = U.ordenarPor(d.agenda.filter(function (a) {
      return new Date(a.inicio) > new Date() && a.status !== 'Cancelado';
    }), 'inicio').slice(0, 25).map(function (a) {
      var r = GNE.Preditores.riscoNoShow(a, d);
      var p = d.pacientes.filter(function (x) { return x.id === a.pacienteId; })[0];
      return { inicio: a.inicio, nome: p ? p.nome : '—', tipo: a.tipo, status: a.status, score: r.score, faixa: r.faixa, motivos: r.motivos };
    }).filter(function (x) { return x.score >= 30; });

    if (futuros.length) {
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Preditor</p><h3>Agendamentos com risco de falta</h3>' +
        '<p class="ajuda">Score somado a partir de histórico, confirmação, antecedência, origem e pendência financeira. ' +
        'Serve para priorizar a confirmação ativa — não para julgar o paciente.</p></div></div>';
      card.appendChild(UI.tabela({
        colunas: [
          { campo: 'inicio', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
          { campo: 'nome', rot: 'Paciente' },
          { campo: 'tipo', rot: 'Tipo' },
          { campo: 'status', rot: 'Situação' },
          { campo: 'score', rot: 'Score', num: true, fmt: function (v, l) {
              var t = l.faixa === 'Alto' ? 'risco' : 'alerta';
              return '<span class="tag tag--' + t + '">' + v + ' · ' + l.faixa + '</span>';
            } },
          { campo: 'motivos', rot: 'Por quê', fmt: function (v) {
              return '<span class="ajuda">' + U.esc(v.join(' · ')) + '</span>';
            } }
        ],
        dados: futuros
      }));
      host.appendChild(card);
    }
  });

  /* ===========================================================================
     2. PATIENT 360
     ======================================================================== */
  var pacCrud = UI.crud({
    store: 'pacientes', modulo: 'pacientes', singular: 'Paciente', ordenar: 'nome', desc: false,
    campos: [
      { id: 'nome', rot: 'Nome completo', tipo: 'texto', obrigatorio: true },
      { id: 'nasc', rot: 'Nascimento', tipo: 'data' },
      { id: 'contato', rot: 'Contato preferencial', tipo: 'texto' },
      { id: 'origem', rot: 'Origem', tipo: 'select', obrigatorio: true, opcoes: function () { return GNE.CANAIS; },
        ajuda: 'Origem errada quebra o cálculo de CAC e LTV por canal.' },
      { id: 'status', rot: 'Situação', tipo: 'select', obrigatorio: true, padrao: 'Ativo',
        opcoes: ['Ativo', 'Em avaliação', 'Inativo', 'Alta', 'Arquivado'] },
      { id: 'responsavelCaso', rot: 'Responsável pelo caso', tipo: 'texto',
        ajuda: 'Um caso sem responsável nomeado é um caso que ninguém acompanha.' },
      { id: 'riscoClinico', rot: 'Risco clínico', tipo: 'select', padrao: 'Baixo', opcoes: ['Baixo', 'Moderado', 'Alto'],
        ajuda: 'Classificação registrada por profissional habilitado. O sistema nunca preenche este campo sozinho.' },
      { id: 'preferencias', rot: 'Preferências de atendimento', tipo: 'textarea',
        ajuda: 'Horário, forma de tratamento, acompanhante, sensibilidades. É daqui que nasce o encantamento verdadeiro.' },
      { id: 'convenio', rot: 'Forma de pagamento', tipo: 'select', padrao: 'Particular',
        opcoes: ['Particular', 'Reembolso', 'Empresa (B2B)', 'Convênio'] },
      { id: 'observacoes', rot: 'Notas administrativas', tipo: 'textarea' }
    ],
    colunas: [
      { campo: 'nome', rot: 'Paciente', fmt: function (v, l) {
          return '<strong>' + U.esc(v) + '</strong><br><span class="ajuda">' +
            (l.nasc ? U.dias(l.nasc) !== null ? Math.floor(U.dias(l.nasc) / 365.25) + ' anos · ' : '' : '') +
            U.esc(l.origem || '') + '</span>';
        } },
      { campo: 'status', rot: 'Situação', fmt: function (v) {
          var t = v === 'Ativo' ? 'ok' : v === 'Inativo' ? 'risco' : v === 'Alta' ? 'info' : 'alerta';
          return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'riscoClinico', rot: 'Risco', fmt: function (v) {
          var t = v === 'Alto' ? 'risco' : v === 'Moderado' ? 'alerta' : 'ok';
          return '<span class="tag tag--' + t + '">' + U.esc(v || '—') + '</span>';
        } },
      { campo: 'responsavelCaso', rot: 'Responsável' },
      { campo: 'convenio', rot: 'Pagamento' }
    ],
    acoesLinha: function () {
      return [{ rot: 'Abrir 360', classe: '', fn: function (l) { abrir360(l.id); } }];
    }
  });

  UI.registrar('pacientes', async function (host) { await pacCrud(host); });

  async function abrir360(pacienteId) {
    var d = await GNE.Dados.carregar(true);
    var p = d.pacientes.filter(function (x) { return x.id === pacienteId; })[0];
    if (!p) return UI.toast('Paciente não encontrado.', 'risco');

    var agenda = U.ordenarPor(d.agenda.filter(function (a) { return a.pacienteId === p.id; }), 'inicio', true);
    var mbc = U.ordenarPor(d.mbc.filter(function (m) { return m.pacienteId === p.id; }), 'ts', true);
    var proc = U.ordenarPor(d.procedimentos.filter(function (x) { return x.pacienteId === p.id; }), 'ts', true);
    var fin = d.financeiro.filter(function (f) { return f.pacienteId === p.id; });
    var inter = U.ordenarPor(d.interacoes.filter(function (i) { return i.pacienteId === p.id; }), 'ts', true);
    var pront = U.ordenarPor(d.prontuario.filter(function (x) { return x.pacienteId === p.id; }), 'ts', true);
    var exp = U.ordenarPor(d.experiencia.filter(function (e) { return e.pacienteId === p.id; }), 'ts', true);
    var acoes = (await GNE.NBA.calcular(d)).filter(function (a) { return a.alvoId === p.id; });
    var abandono = GNE.Preditores.riscoAbandono(p, d);

    var prox = U.ordenarPor(agenda.filter(function (a) { return new Date(a.inicio) > new Date() && a.status !== 'Cancelado'; }), 'inicio')[0];
    var ultCons = agenda.filter(function (a) { return a.status === 'Compareceu'; })[0];
    var receita = U.somaBy(fin.filter(function (f) { return f.tipo === 'Receita' && f.status === 'Pago'; }), 'valor');
    var aberto = U.somaBy(fin.filter(function (f) { return f.tipo === 'Receita' && f.status !== 'Pago' && f.status !== 'Cancelado'; }), 'valor');

    var el = document.createElement('div');

    /* faixa de indicadores */
    el.innerHTML =
      '<div class="grade grade--4" style="margin-bottom:16px">' +
        '<div class="kpi kpi--neutro"><span class="kpi__rot">Situação</span><span class="kpi__val" style="font-size:1.1rem">' +
          U.esc(p.status) + '</span><span class="kpi__nota">' + U.esc(p.responsavelCaso || 'sem responsável') + '</span></div>' +
        '<div class="kpi kpi--' + (prox ? 'ok' : 'risco') + '"><span class="kpi__rot">Próxima consulta</span>' +
          '<span class="kpi__val" style="font-size:1.1rem">' + (prox ? U.dataBR(prox.inicio) : 'nenhuma') + '</span>' +
          '<span class="kpi__nota">' + (ultCons ? 'última em ' + U.dataBR(ultCons.inicio) : 'nunca compareceu') + '</span></div>' +
        '<div class="kpi kpi--' + (abandono.faixa === 'Alto' ? 'risco' : abandono.faixa === 'Médio' ? 'alerta' : 'ok') + '">' +
          '<span class="kpi__rot">Risco de abandono</span><span class="kpi__val">' + abandono.score + '</span>' +
          '<span class="kpi__nota">' + U.esc(abandono.faixa) + '</span></div>' +
        '<div class="kpi kpi--' + (aberto > 0 ? 'alerta' : 'neutro') + '"><span class="kpi__rot">Financeiro</span>' +
          '<span class="kpi__val" style="font-size:1.1rem">' + U.brl(receita) + '</span>' +
          '<span class="kpi__nota">' + (aberto > 0 ? U.brl(aberto) + ' em aberto' : 'sem pendência') + '</span></div>' +
      '</div>';

    if (p.preferencias) {
      el.insertAdjacentHTML('beforeend', UI.aviso('<strong>Preferências:</strong> ' + U.esc(p.preferencias), 'info'));
    }
    if (acoes.length) {
      el.insertAdjacentHTML('beforeend', UI.aviso('<strong>' + acoes.length + ' ação(ões) pendente(s):</strong> ' +
        U.esc(acoes.map(function (a) { return a.rotulo; }).join(' · ')), acoes[0].prioridade >= 85 ? 'risco' : 'alerta'));
    }

    /* MBC — série */
    if (mbc.length) {
      var porEsc = U.agrupar(mbc, 'escala');
      var htmlMbc = '<p class="eyebrow" style="margin-top:16px">Trajetória das escalas</p><div class="filete-curto"></div>';
      Object.keys(porEsc).forEach(function (nome) {
        var def = GNE.ESCALAS[nome] || { min: 0, max: 100, pior: 'alto' };
        var serie = U.ordenarPor(porEsc[nome], 'ts');
        htmlMbc += '<div style="margin-bottom:14px"><div style="font-size:.88rem;margin-bottom:5px"><strong>' +
          U.esc(def.nome || nome) + '</strong></div>' +
          serie.map(function (m) {
            var pct = Math.round((m.score - def.min) / ((def.max - def.min) || 1) * 100);
            var ruim = def.pior === 'alto' ? pct > 55 : pct < 45;
            return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">' +
              '<span class="ajuda" style="width:76px;flex:none">' + U.dataBR(m.ts) + '</span>' +
              '<div class="barra" style="flex:1"><i class="' + (ruim ? 'risco' : 'ok') + '" style="width:' + Math.max(pct, 2) + '%"></i></div>' +
              '<span class="ajuda" style="width:34px;text-align:right;flex:none">' + m.score + '</span></div>';
          }).join('') + '</div>';
      });
      el.insertAdjacentHTML('beforeend', htmlMbc);
    }

    /* linha do tempo unificada */
    var eventos = [];
    agenda.slice(0, 10).forEach(function (a) { eventos.push({ ts: a.inicio, txt: a.tipo + ' — ' + a.status + ' (' + (a.profissional || '') + ')', tipo: 'Agenda' }); });
    pront.slice(0, 10).forEach(function (x) { eventos.push({ ts: x.ts, txt: x.tipo + (x.titulo ? ': ' + x.titulo : ''), tipo: 'Prontuário' }); });
    proc.slice(0, 10).forEach(function (x) { eventos.push({ ts: x.ts, txt: x.tipo + ' — ' + x.etapa + (x.intercorrencia ? ' · INTERCORRÊNCIA' : ''), tipo: 'Procedimento' }); });
    inter.slice(0, 10).forEach(function (i) { eventos.push({ ts: i.ts, txt: i.canal + ' ' + i.direcao.toLowerCase() + ' — ' + (i.classificacao || ''), tipo: 'Contato' }); });
    exp.slice(0, 6).forEach(function (e) { eventos.push({ ts: e.ts, txt: e.tipo + (e.score !== undefined && e.score !== null ? ' ' + e.score : '') + (e.comentario ? ': ' + String(e.comentario).slice(0, 70) : ''), tipo: 'Experiência' }); });
    eventos = U.ordenarPor(eventos, 'ts', true).slice(0, 26);

    el.insertAdjacentHTML('beforeend',
      '<p class="eyebrow" style="margin-top:18px">Linha do tempo</p><div class="filete-curto"></div>' +
      (eventos.length
        ? '<ul class="linha-tempo">' + eventos.map(function (e) {
            return '<li><span class="quando">' + U.dataHoraBR(e.ts) + ' · ' + U.esc(e.tipo) + '</span>' + U.esc(e.txt) + '</li>';
          }).join('') + '</ul>'
        : '<div class="vazio">Sem eventos registrados.</div>'));

    var m = UI.modal({
      titulo: 'Patient 360 — ' + p.nome,
      largo: true,
      corpo: el,
      acoes: [{ rot: 'Fechar', classe: 'btn--linha' }]
    });

    if (Auth.pode('ia', 'ver') && Auth.pode('prontuario', 'ver')) {
      var painel = UI.painelIA('clinico', {
        rotulo: 'Preparar resumo para a consulta',
        contexto: async function () {
          return {
            paciente: { nome: p.nome, status: p.status, origem: p.origem, riscoClinico: p.riscoClinico, desde: p.criadoEm },
            consultas: agenda.slice(0, 15).map(function (a) { return { data: a.inicio, tipo: a.tipo, status: a.status, profissional: a.profissional }; }),
            escalas: mbc.map(function (x) { return { escala: x.escala, score: x.score, data: x.ts }; }),
            procedimentos: proc.map(function (x) { return { tipo: x.tipo, data: x.ts, etapa: x.etapa, intercorrencia: x.intercorrencia || null, followUpFeito: !!x.followUpFeito }; }),
            registrosClinicos: pront.slice(0, 12).map(function (x) { return { tipo: x.tipo, data: x.ts, titulo: x.titulo, texto: x.texto, resultadoRecebido: !!x.resultadoRecebido }; }),
            pendenciasDoSistema: acoes.map(function (a) { return { tipo: a.rotulo, evidencia: a.evidencia }; })
          };
        }
      });
      painel.style.marginTop = '18px';
      m.corpo.appendChild(painel);
    }
  }
  GNE.abrir360 = abrir360;

  /* ===========================================================================
     3. PRONTUÁRIO — append-only
     ======================================================================== */
  UI.registrar('prontuario', UI.crud({
    store: 'prontuario', modulo: 'prontuario', singular: 'Registro clínico', ordenar: 'ts',
    avisoTopo: '<div class="aviso aviso--alerta" style="margin-top:12px"><strong>Registro append-only.</strong> ' +
      'Uma vez assinado, o registro não pode ser alterado nem excluído — correções entram como adenda, ' +
      'com autor e data próprios. É assim que o prontuário mantém valor probatório.</div>',
    contexto: ctxPacientes,
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes, obrigatorio: true },
      { id: 'tipo', rot: 'Tipo de registro', tipo: 'select', obrigatorio: true, padrao: 'Evolução',
        opcoes: ['Evolução', 'Anamnese', 'Prescrição', 'Solicitação de exame', 'Resultado de exame',
                 'Atestado', 'Encaminhamento', 'Adenda', 'Registro psicoterápico'] },
      { id: 'titulo', rot: 'Título', tipo: 'texto' },
      { id: 'texto', rot: 'Conteúdo', tipo: 'textarea', obrigatorio: true, altura: '180px' },
      { id: 'ts', rot: 'Data e hora', tipo: 'datahora', obrigatorio: true, padrao: function () { return new Date().toISOString().slice(0, 16); } },
      { id: 'autor', rot: 'Autor (nome e registro profissional)', tipo: 'texto', obrigatorio: true,
        ajuda: 'A responsabilidade pelo registro é de quem assina. Res. CFM 2.454/2026: a decisão clínica é do médico.' },
      { id: 'resultadoRecebido', rot: 'Resultado recebido', tipo: 'checkbox',
        mostrar: function (v) { return v.tipo === 'Solicitação de exame'; },
        ajuda: 'Enquanto desmarcado, o motor de Próxima Ação cobra o exame após 14 dias.' },
      { id: 'assinado', rot: 'Assinar e travar este registro', tipo: 'checkbox',
        ajuda: 'Depois de assinado, nem o Super Administrador consegue editar. Só cabe adenda.' }
    ],
    colunas: [
      { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
      { campo: '_pacienteNome', rot: 'Paciente' },
      { campo: 'tipo', rot: 'Tipo', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } },
      { campo: 'titulo', rot: 'Título' },
      { campo: 'autor', rot: 'Autor' },
      { campo: 'assinado', rot: 'Estado', fmt: function (v) {
          return v ? '<span class="tag tag--ok">assinado</span>' : '<span class="tag tag--alerta">rascunho</span>';
        } }
    ],
    antesSalvar: function (reg, ctx, original) {
      if (original && original.assinado) {
        throw new Error('Registro assinado é imutável. Crie uma adenda referenciando este registro.');
      }
      return reg;
    }
  }));

  /* ===========================================================================
     4. MBC
     ======================================================================== */
  var mbcCrud = UI.crud({
    store: 'mbc', modulo: 'mbc', singular: 'Medição', ordenar: 'ts',
    avisoTopo: '<div class="aviso aviso--info" style="margin-top:12px">O modelo é ' +
      '<strong>consulta → acompanhamento → dado → intervenção → consulta</strong>, não consulta → silêncio → consulta. ' +
      'Os alertas abaixo são sistema de apoio à decisão: apontam mudança de padrão, nunca diagnóstico.</div>',
    contexto: ctxPacientes,
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes, obrigatorio: true },
      { id: 'escala', rot: 'Escala', tipo: 'select', obrigatorio: true,
        opcoes: function () {
          return Object.keys(GNE.ESCALAS).map(function (k) { return { valor: k, rot: GNE.ESCALAS[k].nome }; });
        } },
      { id: 'score', rot: 'Escore', tipo: 'numero', obrigatorio: true,
        ajuda: 'O sistema valida contra a faixa da escala selecionada.' },
      { id: 'ts', rot: 'Data da medição', tipo: 'datahora', obrigatorio: true, padrao: function () { return new Date().toISOString().slice(0, 16); } },
      { id: 'origem', rot: 'Como foi coletada', tipo: 'select', padrao: 'Autoaplicada remota',
        opcoes: ['Autoaplicada remota', 'Aplicada em consulta', 'Aplicada por telefone'] },
      { id: 'observacao', rot: 'Observação', tipo: 'textarea' }
    ],
    colunas: [
      { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataBR(v); } },
      { campo: '_pacienteNome', rot: 'Paciente' },
      { campo: 'escala', rot: 'Escala', fmt: function (v) {
          return '<span class="tag">' + U.esc(v) + '</span>';
        } },
      { campo: 'score', rot: 'Escore', num: true, fmt: function (v, l) {
          var def = GNE.ESCALAS[l.escala];
          if (!def) return String(v);
          var rot = '';
          for (var i = 0; i < def.cortes.length; i++) { if (v <= def.cortes[i].ate) { rot = def.cortes[i].rot; break; } }
          var alerta = (def.alertaAcima !== undefined && v > def.alertaAcima) ||
                       (def.alertaAbaixo !== undefined && v < def.alertaAbaixo);
          return '<strong>' + v + '</strong> <span class="tag tag--' + (alerta ? (def.critica ? 'risco' : 'alerta') : 'ok') + '">' + U.esc(rot) + '</span>';
        } },
      { campo: 'origem', rot: 'Coleta' }
    ],
    antesSalvar: function (reg) {
      var def = GNE.ESCALAS[reg.escala];
      if (!def) throw new Error('Escala não reconhecida.');
      if (reg.score < def.min || reg.score > def.max) {
        throw new Error(def.nome + ' aceita escore entre ' + def.min + ' e ' + def.max + '.');
      }
      return reg;
    },
    aposSalvar: async function (reg) {
      var def = GNE.ESCALAS[reg.escala];
      if (def && def.critica && reg.score > (def.alertaAcima || 0)) {
        await DB.salvar('tarefas', {
          titulo: 'PROTOCOLO DE RISCO — triagem positiva',
          processo: 'Protocolo de risco',
          responsavel: 'Médico(a)',
          status: 'Aberta', critica: true,
          prazo: new Date().toISOString(),
          pacienteId: reg.pacienteId,
          evidencia: reg.escala + ' = ' + reg.score + ' em ' + U.dataBR(reg.ts),
          descricao: 'Triagem de risco positiva registrada. Acionar protocolo da clínica e contato médico imediato. ' +
                     'A classificação definitiva do risco é do profissional, nunca do sistema.',
          origem: 'mbc:critica'
        }, { acao: 'abrir_protocolo_risco' });
        UI.toast('Triagem de risco positiva: tarefa crítica criada para o médico responsável.', 'risco', 9000);
      }
    }
  });

  UI.registrar('mbc', async function (host) {
    await mbcCrud(host);
    var d = await GNE.Dados.carregar(true);
    var alertas = GNE.Preditores.alertasMBC(d);
    var mapa = {};
    d.pacientes.forEach(function (p) { mapa[p.id] = p.nome; });

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Apoio à decisão</p>' +
      '<h3>Alertas de trajetória (' + alertas.length + ')</h3>' +
      '<p class="ajuda">Disparados por ponto de corte da escala ou por piora relevante entre medições consecutivas.</p></div></div>';
    card.appendChild(UI.tabela({
      colunas: [
        { campo: 'pacienteId', rot: 'Paciente', fmt: function (v) { return U.esc(mapa[v] || '—'); } },
        { campo: 'escala', rot: 'Escala' },
        { campo: 'score', rot: 'Último escore', num: true },
        { campo: 'ts', rot: 'Em', fmt: function (v) { return U.dataBR(v); } },
        { campo: 'motivos', rot: 'Por quê', fmt: function (v, l) {
            return (l.critico ? '<span class="tag tag--risco">crítico</span> ' : '') +
              '<span class="ajuda">' + U.esc(v.join(' · ')) + '</span>';
          } },
        { campo: 'medicoes', rot: 'Medições', num: true }
      ],
      dados: U.ordenarPor(alertas, 'critico', true),
      vazio: 'Nenhum alerta de trajetória no momento.'
    }));
    host.appendChild(card);

    var resp = GNE.Preditores.respostaTratamento(d);
    if (resp.avaliaveis) {
      host.insertAdjacentHTML('beforeend',
        '<p class="eyebrow" style="margin-top:18px">Desfecho</p><div class="filete-curto"></div>' +
        '<div class="aviso aviso--info"><strong>' + resp.responderam + ' de ' + resp.avaliaveis +
        '</strong> pacientes com série longitudinal apresentam melhora ≥ 30% entre a primeira e a última medição. ' +
        'Pacientes com apenas uma medição ficam de fora — o denominador é honesto.</div>');
    }

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('mbc', { rotulo: 'Ler as trajetórias' }));
  });

  /* ===========================================================================
     5. PROCEDIMENTOS
     ======================================================================== */
  var CHECKLIST = {
    'Cetamina EV': ['Jejum confirmado', 'Consentimento assinado', 'Acompanhante presente', 'Acesso venoso', 'Monitor multiparamétrico', 'Escala pré-sessão aplicada', 'Plano de alta combinado'],
    'Cetamina IN': ['Consentimento assinado', 'Acompanhante presente', 'Sinais vitais basais', 'Escala pré-sessão aplicada', 'Plano de alta combinado'],
    'EMT': ['Consentimento assinado', 'Triagem de contraindicações', 'Parâmetros de estimulação conferidos', 'Posicionamento validado', 'Protetor auricular'],
    'Infusão': ['Consentimento assinado', 'Jejum confirmado', 'Acesso venoso', 'Sinais vitais basais', 'Bomba de infusão conferida'],
    'Neuromodulação': ['Consentimento assinado', 'Triagem de contraindicações', 'Parâmetros conferidos'],
    'Outro': ['Consentimento assinado', 'Sinais vitais basais']
  };

  UI.registrar('procedimentos', UI.crud({
    store: 'procedimentos', modulo: 'procedimentos', singular: 'Procedimento', ordenar: 'ts',
    modalLargo: true,
    avisoTopo: '<div class="aviso aviso--risco" style="margin-top:12px"><strong>Bloqueio de compliance.</strong> ' +
      'Nenhum procedimento pode ser marcado como concluído sem consentimento vinculado e checklist completo. ' +
      'O sistema recusa a gravação — não é aviso, é impedimento.</div>',
    contexto: async function () {
      return {
        pacientes: await DB.listar('pacientes'),
        consentimentos: (await DB.listar('qualidade')).filter(function (q) { return q.tipo === 'Consentimento'; })
      };
    },
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes, obrigatorio: true },
      { id: 'tipo', rot: 'Procedimento', tipo: 'select', obrigatorio: true, opcoes: function () { return GNE.TIPOS_PROC; } },
      { id: 'ts', rot: 'Data e hora', tipo: 'datahora', obrigatorio: true, padrao: function () { return new Date().toISOString().slice(0, 16); } },
      { id: 'etapa', rot: 'Etapa', tipo: 'select', obrigatorio: true, padrao: 'Agendado',
        opcoes: ['Agendado', 'Elegibilidade confirmada', 'Em sessão', 'Concluído', 'Cancelado'] },
      { id: 'profissional', rot: 'Profissional responsável', tipo: 'texto', obrigatorio: true },
      { id: 'consentimentoId', rot: 'Consentimento vinculado', tipo: 'select',
        opcoes: function (ctx) {
          return (ctx.consentimentos || []).map(function (c) {
            return { valor: c.id, rot: c.titulo + ' (v' + (c.versao || '1') + ')' };
          });
        },
        ajuda: 'Cadastre os termos em Qualidade. Sem vínculo, o procedimento não conclui.' },
      { id: 'checklist', rot: 'Checklist cumprido (um item por linha)', tipo: 'textarea', altura: '110px',
        ajuda: 'O sistema sugere o checklist do tipo escolhido ao abrir. Marque apenas o que de fato foi feito.' },
      { id: 'paBasal', rot: 'PA basal (mmHg)', tipo: 'texto' },
      { id: 'fcBasal', rot: 'FC basal (bpm)', tipo: 'numero' },
      { id: 'paFinal', rot: 'PA final (mmHg)', tipo: 'texto' },
      { id: 'fcFinal', rot: 'FC final (bpm)', tipo: 'numero' },
      { id: 'intercorrencia', rot: 'Intercorrência', tipo: 'textarea',
        ajuda: 'Se houver qualquer registro aqui, o sistema abre pendência de follow-up automaticamente.' },
      { id: 'followUpFeito', rot: 'Follow-up realizado e registrado', tipo: 'checkbox' },
      { id: 'observacoes', rot: 'Observações da sessão', tipo: 'textarea' }
    ],
    colunas: [
      { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
      { campo: '_pacienteNome', rot: 'Paciente' },
      { campo: 'tipo', rot: 'Procedimento', fmt: function (v) { return '<span class="tag tag--ouro">' + U.esc(v) + '</span>'; } },
      { campo: 'etapa', rot: 'Etapa', fmt: function (v) {
          var t = v === 'Concluído' ? 'ok' : v === 'Cancelado' ? 'risco' : 'alerta';
          return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'consentimentoId', rot: 'Consentimento', fmt: function (v) {
          return v ? '<span class="tag tag--ok">vinculado</span>' : '<span class="tag tag--risco">ausente</span>';
        } },
      { campo: 'intercorrencia', rot: 'Intercorrência', fmt: function (v, l) {
          if (!v) return '<span class="ajuda">—</span>';
          return '<span class="tag tag--risco">sim</span> ' +
            (l.followUpFeito ? '<span class="tag tag--ok">follow-up ok</span>' : '<span class="tag tag--alerta">follow-up pendente</span>');
        } },
      { campo: 'profissional', rot: 'Responsável' }
    ],
    antesSalvar: function (reg) {
      if (!reg.checklist && CHECKLIST[reg.tipo]) {
        reg.checklist = CHECKLIST[reg.tipo].join('\n');
      }
      if (reg.etapa === 'Concluído') {
        if (!reg.consentimentoId) {
          throw new Error('Procedimento não pode ser concluído sem consentimento vinculado. Cadastre o termo em Qualidade e vincule aqui.');
        }
        var esperado = CHECKLIST[reg.tipo] || [];
        var feitos = String(reg.checklist || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        var faltando = esperado.filter(function (e) { return feitos.indexOf(e) < 0; });
        if (faltando.length) {
          throw new Error('Checklist incompleto para ' + reg.tipo + '. Faltam: ' + faltando.join('; ') + '.');
        }
        if (!reg.paFinal && !reg.fcFinal) {
          throw new Error('Registre ao menos um sinal vital de saída antes de concluir a sessão.');
        }
      }
      return reg;
    },
    aposSalvar: async function (reg) {
      if (reg.intercorrencia && String(reg.intercorrencia).trim() && !reg.followUpFeito) {
        var tarefas = await DB.listar('tarefas');
        var existe = tarefas.some(function (t) {
          return t.origem === 'proc:' + reg.id && t.status !== 'Concluída';
        });
        if (!existe) {
          await DB.salvar('tarefas', {
            titulo: 'Follow-up de intercorrência — ' + reg.tipo,
            processo: 'Gestão de procedimentos',
            responsavel: 'Enfermagem',
            status: 'Aberta', critica: true,
            prazo: U.somaDias(new Date(), 1),
            pacienteId: reg.pacienteId,
            evidencia: String(reg.intercorrencia).slice(0, 160),
            descricao: 'Contatar o paciente, registrar o desfecho e marcar o follow-up como realizado no procedimento.',
            origem: 'proc:' + reg.id
          }, { acao: 'abrir_followup_intercorrencia' });
          UI.toast('Intercorrência registrada: follow-up obrigatório criado para a enfermagem.', 'alerta', 7000);
        }
      }
    }
  }));

  GNE.CHECKLIST_PROC = CHECKLIST;

})(typeof window !== 'undefined' ? window : globalThis);
