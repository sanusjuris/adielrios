/* =============================================================================
   GNE Clinical OS — Relação: CRM, Concierge, Omnichannel e Experiência
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  function opcoesPacientes(ctx) {
    return (ctx.pacientes || []).map(function (p) { return { valor: p.id, rot: p.nome }; });
  }

  /* ===========================================================================
     1. CRM
     ======================================================================== */
  var crmCrud = UI.crud({
    store: 'leads', modulo: 'crm', singular: 'Lead',
    ordenar: 'criadoEm',
    contexto: async function () { return { pacientes: await DB.listar('pacientes') }; },
    campos: [
      { id: 'nome', rot: 'Nome do contato', tipo: 'texto', obrigatorio: true },
      { id: 'tipo', rot: 'Natureza', tipo: 'select', obrigatorio: true, padrao: 'B2C',
        opcoes: ['B2C', 'B2B', 'Indicação médica'],
        ajuda: 'B2B tem ciclo mais longo e decisor diferente — o funil precisa distinguir.' },
      { id: 'empresa', rot: 'Empresa / origem institucional', tipo: 'texto',
        mostrar: function (v) { return v.tipo !== 'B2C'; } },
      { id: 'canal', rot: 'Canal de entrada', tipo: 'select', obrigatorio: true, padrao: 'WhatsApp',
        opcoes: function () { return GNE.CANAIS; },
        ajuda: 'É por aqui que o retorno por canal é calculado. Preencher errado distorce a decisão de mídia.' },
      { id: 'estagio', rot: 'Estágio', tipo: 'select', obrigatorio: true, padrao: 'Novo contato',
        opcoes: function () { return GNE.ESTAGIOS_CRM; } },
      { id: 'contato', rot: 'Telefone ou e-mail', tipo: 'texto' },
      { id: 'valorEstimado', rot: 'Valor estimado do tratamento (R$)', tipo: 'moeda' },
      { id: 'dono', rot: 'Responsável', tipo: 'texto', padrao: 'Concierge' },
      { id: 'primeiroContatoEm', rot: 'Primeiro contato em', tipo: 'datahora',
        ajuda: 'Deixe em branco enquanto não houver contato. É o que mede o SLA.' },
      { id: 'ultimoContatoEm', rot: 'Último contato em', tipo: 'datahora' },
      { id: 'motivoPerda', rot: 'Motivo da perda', tipo: 'texto',
        mostrar: function (v) { return v.estagio === 'Perdido'; },
        ajuda: 'Funil sem motivo de perda não ensina nada.' },
      { id: 'pacienteId', rot: 'Paciente vinculado', tipo: 'ref', fonte: 'pacientes',
        opcoes: opcoesPacientes, vazio: '— ainda não é paciente —',
        ajuda: 'Vincular aqui é o que garante ID único entre CRM, prontuário e financeiro.' },
      { id: 'observacoes', rot: 'Observações', tipo: 'textarea' }
    ],
    colunas: [
      { campo: 'nome', rot: 'Contato', fmt: function (v, l) {
          return U.esc(v) + '<br><span class="ajuda">' + U.esc(l.tipo || '') + (l.empresa ? ' · ' + U.esc(l.empresa) : '') + '</span>';
        } },
      { campo: 'canal', rot: 'Canal', fmt: function (v) { return '<span class="tag">' + U.esc(v || '—') + '</span>'; } },
      { campo: 'estagio', rot: 'Estágio', fmt: function (v) {
          var t = v === 'Em tratamento' ? 'ok' : v === 'Perdido' ? 'risco' : v === 'Novo contato' ? 'info' : 'alerta';
          return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'primeiroContatoEm', rot: 'SLA 1º contato', fmt: function (v, l) {
          if (!v) {
            return '<span class="tag tag--risco">aguardando ' + U.duracao(U.horas(l.criadoEm) * 60) + '</span>';
          }
          var min = U.horas(l.criadoEm, v) * 60;
          return '<span class="tag tag--' + (min <= 15 ? 'ok' : min <= 60 ? 'alerta' : 'risco') + '">' +
            U.duracao(min) + '</span>';
        } },
      { campo: 'valorEstimado', rot: 'Valor', num: true, fmt: function (v) { return v ? U.brl(v) : '—'; } },
      { campo: 'dono', rot: 'Dono' },
      { campo: 'ultimoContatoEm', rot: 'Últ. contato', fmt: function (v, l) {
          var base = v || l.criadoEm, dd = U.dias(base);
          if (dd === null) return '—';
          return U.dataBR(base) + '<br><span class="ajuda">' + dd + ' dia(s)</span>';
        } }
    ],
    antesSalvar: function (reg) {
      if (reg.estagio === 'Perdido' && !reg.motivoPerda) {
        throw new Error('Registre o motivo da perda. Sem isso, o funil não gera aprendizado.');
      }
      if (reg.primeiroContatoEm && !reg.ultimoContatoEm) reg.ultimoContatoEm = reg.primeiroContatoEm;
      return reg;
    },
    acoesLinha: function (recarregar) {
      return [{
        rot: 'Contato agora',
        mostrar: function (l) { return !l.primeiroContatoEm && Auth.pode('crm', 'editar'); },
        fn: async function (l) {
          l.primeiroContatoEm = new Date().toISOString();
          l.ultimoContatoEm = l.primeiroContatoEm;
          if (l.estagio === 'Novo contato') l.estagio = 'Qualificado';
          await DB.salvar('leads', l, { acao: 'registrar_primeiro_contato' });
          GNE.Dados.invalidar();
          UI.toast('Primeiro contato registrado. SLA fechado.', 'ok');
          recarregar();
        }
      }];
    }
  });

  UI.registrar('crm', async function (host) {
    await crmCrud(host);
    var d = await GNE.Dados.carregar(true);

    /* funil */
    var funil = document.createElement('div');
    funil.className = 'card';
    var grupos = U.agrupar(d.leads, 'estagio');
    var total = d.leads.length || 1;
    funil.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Funil</p><h3>Distribuição por estágio</h3>' +
      '<p class="ajuda">Onde os contatos param é onde o processo falha.</p></div></div>' +
      GNE.ESTAGIOS_CRM.map(function (e) {
        var n = (grupos[e] || []).length;
        var pct = Math.round(n / total * 100);
        return '<div style="margin-bottom:9px">' +
          '<div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:3px">' +
          '<span>' + U.esc(e) + '</span><span class="ajuda">' + n + ' · ' + pct + '%</span></div>' +
          '<div class="barra"><i style="width:' + Math.max(pct, n ? 2 : 0) + '%" class="' +
          (e === 'Perdido' ? 'risco' : e === 'Em tratamento' ? 'ok' : '') + '"></i></div></div>';
      }).join('');
    host.appendChild(funil);

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('comercial', { rotulo: 'Analisar funil' }));
  });

  /* ===========================================================================
     2. CONCIERGE — Customer Success clínico
     ======================================================================== */
  UI.registrar('concierge', async function (host) {
    var d = await GNE.Dados.carregar(true);
    var nba = await GNE.NBA.calcular(d);

    host.innerHTML = UI.cabecalho('concierge',
      '<div class="aviso aviso--alerta" style="margin-top:12px"><strong>Fronteira do papel.</strong> ' +
      'O concierge conhece preferências, agenda, pendências e experiência. Não interpreta sintoma, ' +
      'não decide conduta e não substitui profissional de saúde. Conteúdo clínico recebido é encaminhado, nunca respondido.</div>');

    var ativos = d.pacientes.filter(function (p) { return p.status === 'Ativo'; });

    var linhas = ativos.map(function (p) {
      var prox = U.ordenarPor(d.agenda.filter(function (a) {
        return a.pacienteId === p.id && new Date(a.inicio) > new Date() && a.status !== 'Cancelado';
      }), 'inicio')[0];
      var ultInt = U.ordenarPor(d.interacoes.filter(function (i) { return i.pacienteId === p.id; }), 'ts', true)[0];
      var pend = nba.filter(function (a) { return a.alvoId === p.id; });
      var risco = GNE.Preditores.riscoAbandono(p, d);
      return {
        id: p.id, nome: p.nome, preferencias: p.preferencias, responsavelCaso: p.responsavelCaso,
        prox: prox ? prox.inicio : null, proxTipo: prox ? prox.tipo : null,
        ultInt: ultInt ? ultInt.ts : null,
        pendencias: pend.length, topo: pend[0] ? pend[0].rotulo : null,
        risco: risco.score, riscoFaixa: risco.faixa, riscoMotivos: risco.motivos
      };
    });
    linhas.sort(function (a, b) { return b.risco - a.risco || (b.pendencias - a.pendencias); });

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Carteira ativa</p>' +
      '<h3>' + ativos.length + ' paciente(s) sob cuidado</h3>' +
      '<p class="ajuda">Ordenado por risco de abandono. O score é somatório de fatores explícitos — clique para ver quais.</p></div></div>';
    card.appendChild(UI.tabela({
      colunas: [
        { campo: 'nome', rot: 'Paciente', fmt: function (v, l) {
            return U.esc(v) + (l.responsavelCaso ? '<br><span class="ajuda">resp.: ' + U.esc(l.responsavelCaso) + '</span>' : '');
          } },
        { campo: 'prox', rot: 'Próxima consulta', fmt: function (v, l) {
            if (!v) return '<span class="tag tag--risco">sem retorno</span>';
            return U.dataBR(v) + '<br><span class="ajuda">' + U.esc(l.proxTipo || '') + '</span>';
          } },
        { campo: 'ultInt', rot: 'Último contato', fmt: function (v) {
            if (!v) return '<span class="tag tag--alerta">nenhum</span>';
            var dd = U.dias(v);
            return U.dataBR(v) + '<br><span class="ajuda">' + dd + ' dia(s)</span>';
          } },
        { campo: 'preferencias', rot: 'Preferências', fmt: function (v) {
            return v ? '<span class="ajuda">' + U.esc(v) + '</span>' : '<span class="ajuda">—</span>';
          } },
        { campo: 'pendencias', rot: 'Pendências', num: true, fmt: function (v, l) {
            if (!v) return '<span class="tag tag--ok">em dia</span>';
            return '<span class="tag tag--alerta">' + v + '</span><br><span class="ajuda">' + U.esc(l.topo || '') + '</span>';
          } },
        { campo: 'risco', rot: 'Risco abandono', num: true, fmt: function (v, l) {
            var t = l.riscoFaixa === 'Alto' ? 'risco' : l.riscoFaixa === 'Médio' ? 'alerta' : 'ok';
            return '<span class="tag tag--' + t + '" title="' + U.esc(l.riscoMotivos.join(' | ')) + '">' + v + ' · ' + l.riscoFaixa + '</span>';
          } }
      ],
      dados: linhas,
      acoes: [{
        rot: 'Ver motivos',
        fn: function (l) {
          UI.modal({
            titulo: 'Score de abandono — ' + l.nome,
            corpo: '<p class="ajuda">Score ' + l.risco + '/100 (' + l.riscoFaixa + '). ' +
              'Cada linha é um fator somado, com o peso entre parênteses. Nada aqui vem de modelo estatístico opaco.</p>' +
              '<ul style="margin-top:10px;padding-left:18px;font-size:.9rem">' +
              (l.riscoMotivos.length ? l.riscoMotivos.map(function (m) { return '<li>' + U.esc(m) + '</li>'; }).join('')
                                     : '<li>Nenhum fator de risco identificado.</li>') + '</ul>'
          });
        }
      }],
      vazio: 'Nenhum paciente ativo.'
    }));
    host.appendChild(card);

    if (Auth.pode('ia', 'ver')) {
      var painel = UI.painelIA('concierge', {
        rotulo: 'Redigir mensagens do dia',
        pergunta: 'Para cada pessoa abaixo, escreva a mensagem de acompanhamento adequada. ' +
                  'Use o fato concreto listado como evidência — é isso que faz a mensagem parecer atenção e não automação.',
        contexto: async function () {
          return {
            acoesDeContato: nba.filter(function (a) { return a.dono === 'Concierge'; }).slice(0, 8)
              .map(function (a) { return { paciente: a.alvoNome, situacao: a.rotulo, evidencia: a.evidencia, acaoEsperada: a.acao }; })
          };
        }
      });
      host.appendChild(painel);
    }
  });

  /* ===========================================================================
     3. OMNICHANNEL
     ======================================================================== */
  UI.registrar('omni', UI.crud({
    store: 'interacoes', modulo: 'omni', singular: 'Interação', ordenar: 'ts',
    avisoTopo: '<div class="aviso aviso--info" style="margin-top:12px">WhatsApp é excelente para o paciente e ' +
      'péssimo como sistema de gestão. Aqui a conversa vira registro: com dono, classificação e continuidade. ' +
      'A comunicação interna da equipe deve viver em Slack ou Teams, não em grupo de WhatsApp.</div>',
    contexto: async function () { return { pacientes: await DB.listar('pacientes') }; },
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes, obrigatorio: true },
      { id: 'canal', rot: 'Canal', tipo: 'select', obrigatorio: true, padrao: 'WhatsApp',
        opcoes: ['WhatsApp', 'Telefone', 'E-mail', 'Instagram', 'Presencial', 'LinkedIn', 'TikTok'] },
      { id: 'direcao', rot: 'Direção', tipo: 'select', obrigatorio: true, padrao: 'Recebida', opcoes: ['Recebida', 'Enviada'] },
      { id: 'ts', rot: 'Quando', tipo: 'datahora', obrigatorio: true, padrao: function () { return new Date().toISOString().slice(0, 16); } },
      { id: 'classificacao', rot: 'Classificação', tipo: 'select', padrao: 'Administrativa',
        opcoes: ['Administrativa', 'Agendamento', 'Financeira', 'Conteúdo clínico', 'Elogio', 'Reclamação', 'Comercial'],
        ajuda: '"Conteúdo clínico" obriga encaminhamento assistencial — o concierge não responde.' },
      { id: 'texto', rot: 'Resumo da interação', tipo: 'textarea', obrigatorio: true,
        ajuda: 'Registre o essencial, não a conversa inteira. Minimização de dado é obrigação da LGPD.' },
      { id: 'responsavel', rot: 'Quem atendeu', tipo: 'texto', padrao: 'Concierge' },
      { id: 'respondidaEm', rot: 'Respondida em', tipo: 'datahora',
        mostrar: function (v) { return v.direcao === 'Recebida'; },
        ajuda: 'Alimenta o indicador de tempo de resposta.' },
      { id: 'resolvidoNoPrimeiro', rot: 'Resolvida no primeiro contato', tipo: 'checkbox',
        mostrar: function (v) { return v.direcao === 'Recebida'; } },
      { id: 'encaminhado', rot: 'Encaminhado para assistencial', tipo: 'checkbox' }
    ],
    colunas: [
      { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
      { campo: '_pacienteNome', rot: 'Paciente' },
      { campo: 'canal', rot: 'Canal', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } },
      { campo: 'direcao', rot: 'Direção' },
      { campo: 'classificacao', rot: 'Classificação', fmt: function (v, l) {
          var t = v === 'Reclamação' ? 'risco' : v === 'Conteúdo clínico' ? 'alerta' : v === 'Elogio' ? 'ok' : 'info';
          return '<span class="tag tag--' + t + '">' + U.esc(v || '—') + '</span>' +
            (l.encaminhado ? ' <span class="tag tag--info">encaminhada</span>' : '');
        } },
      { campo: 'texto', rot: 'Resumo', fmt: function (v) {
          return '<span class="ajuda">' + U.esc(String(v || '').slice(0, 110)) + (String(v || '').length > 110 ? '…' : '') + '</span>';
        } },
      { campo: 'responsavel', rot: 'Quem' }
    ],
    antesSalvar: function (reg) {
      if (reg.classificacao === 'Conteúdo clínico' && !reg.encaminhado) {
        throw new Error('Interação com conteúdo clínico exige marcação de encaminhamento assistencial. Essa é a fronteira do concierge.');
      }
      return reg;
    }
  }));

  /* ===========================================================================
     4. EXPERIÊNCIA
     ======================================================================== */
  var expCrud = UI.crud({
    store: 'experiencia', modulo: 'experiencia', singular: 'Registro', ordenar: 'ts',
    contexto: async function () { return { pacientes: await DB.listar('pacientes') }; },
    campos: [
      { id: 'pacienteId', rot: 'Paciente', tipo: 'ref', fonte: 'pacientes', opcoes: opcoesPacientes },
      { id: 'tipo', rot: 'Tipo', tipo: 'select', obrigatorio: true, padrao: 'NPS',
        opcoes: ['NPS', 'CSAT', 'Reclamação', 'Elogio'] },
      { id: 'score', rot: 'Nota', tipo: 'numero', min: 0, max: 10,
        mostrar: function (v) { return v.tipo === 'NPS' || v.tipo === 'CSAT'; },
        ajuda: 'NPS de 0 a 10. CSAT de 1 a 5.',
        valida: function (v, todos) { return (v < 0 || v > 10) ? 'Nota fora da escala.' : null; } },
      { id: 'etapa', rot: 'Etapa da jornada', tipo: 'select', padrao: 'Pós-consulta',
        opcoes: ['Primeiro contato', 'Agendamento', 'Chegada e recepção', 'Consulta', 'Procedimento',
                 'Pós-consulta', 'Financeiro', 'Acompanhamento'],
        ajuda: 'Sem a etapa, o NPS vira um número sem endereço.' },
      { id: 'comentario', rot: 'O que a pessoa disse', tipo: 'textarea' },
      { id: 'ts', rot: 'Quando', tipo: 'datahora', obrigatorio: true, padrao: function () { return new Date().toISOString().slice(0, 16); } },
      { id: 'resolvido', rot: 'Tratativa concluída', tipo: 'checkbox' },
      { id: 'tratativa', rot: 'O que foi feito', tipo: 'textarea', mostrar: function (v) { return v.resolvido; } }
    ],
    colunas: [
      { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataBR(v); } },
      { campo: 'tipo', rot: 'Tipo', fmt: function (v) {
          var t = v === 'Reclamação' ? 'risco' : v === 'Elogio' ? 'ok' : 'info';
          return '<span class="tag tag--' + t + '">' + U.esc(v) + '</span>';
        } },
      { campo: 'score', rot: 'Nota', num: true, fmt: function (v, l) {
          if (v === null || v === undefined || v === '') return '—';
          if (l.tipo === 'NPS') {
            var t = v >= 9 ? 'ok' : v >= 7 ? 'alerta' : 'risco';
            var r = v >= 9 ? 'promotor' : v >= 7 ? 'neutro' : 'detrator';
            return '<span class="tag tag--' + t + '">' + v + ' · ' + r + '</span>';
          }
          return String(v);
        } },
      { campo: 'etapa', rot: 'Etapa' },
      { campo: 'comentario', rot: 'Comentário', fmt: function (v) {
          return '<span class="ajuda">' + U.esc(String(v || '').slice(0, 100)) + '</span>';
        } },
      { campo: 'resolvido', rot: 'Tratativa', fmt: function (v) {
          return v ? '<span class="tag tag--ok">concluída</span>' : '<span class="tag tag--alerta">aberta</span>';
        } }
    ],
    antesSalvar: function (reg) {
      if (reg.tipo === 'CSAT' && reg.score !== null && (reg.score < 1 || reg.score > 5)) {
        throw new Error('CSAT usa escala de 1 a 5.');
      }
      if (reg.resolvido && !reg.tratativa) throw new Error('Descreva o que foi feito antes de marcar como concluída.');
      return reg;
    }
  });

  UI.registrar('experiencia', async function (host) {
    await expCrud(host);
    var d = await GNE.Dados.carregar(true);
    var kpis = await GNE.KPI.calcularTudo(d);
    var bloco = kpis.filter(function (k) { return k.bloco === 'Experiência'; });

    var res = document.createElement('div');
    res.innerHTML = '<p class="eyebrow" style="margin-top:20px">Indicadores de experiência</p>' +
      '<div class="filete-curto"></div><div class="grade grade--3">' + bloco.map(UI.kpiCard).join('') + '</div>';
    host.appendChild(res);

    if (Auth.pode('ia', 'ver')) host.appendChild(UI.painelIA('experiencia', { rotulo: 'Encontrar a causa raiz' }));
  });

})(typeof window !== 'undefined' ? window : globalThis);
