/* =============================================================================
   GNE Clinical OS — camada de interface

   Contém o shell (topbar, navegação, roteador), os componentes básicos e um
   MOTOR DE CRUD DECLARATIVO. Cada módulo descreve seus campos e colunas; a
   listagem, o formulário, a validação, a permissão e a auditoria vêm de graça.
   É isso que impede o sistema de ser rígido: mudar um módulo é mudar uma
   declaração, não reescrever tela.
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, DB = GNE.DB, Auth = GNE.Auth;

  var UI = GNE.UI = {};
  UI._telas = {};
  UI.atual = null;

  /* ===========================================================================
     MARCA — símbolo das três formas que se fundem (brandbook, p.7)
     ======================================================================== */
  UI.simbolo = function (tam, cor) {
    tam = tam || 30;
    cor = cor || 'currentColor';
    return '<svg class="marca-simbolo" viewBox="0 0 64 64" width="' + tam + '" height="' + tam + '" ' +
      'role="img" aria-label="Grupo Nutrindo Emoções" style="color:' + cor + '">' +
      '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
      '<path d="M32 7c9.5 5.4 15 14.4 15 24.4 0 10.6-6.6 20-15 24.6"/>' +
      '<path d="M32 7c-9.5 5.4-15 14.4-15 24.4 0 10.6 6.6 20 15 24.6"/>' +
      '<path d="M9.5 20.5c6.7-1.4 15 .6 22.5 5.9 7.5-5.3 15.8-7.3 22.5-5.9"/>' +
      '</g>' +
      '<circle cx="32" cy="31.6" r="3.1" fill="currentColor"/>' +
      '</svg>';
  };

  /* ===========================================================================
     COMPONENTES BÁSICOS
     ======================================================================== */
  UI.toast = function (msg, tipo, ms) {
    var cx = document.getElementById('toasts');
    if (!cx) return;
    var el = document.createElement('div');
    el.className = 'toast' + (tipo ? ' toast--' + tipo : '');
    el.setAttribute('role', tipo === 'risco' ? 'alert' : 'status');
    el.innerHTML = U.esc(msg);
    cx.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 3800);
  };

  /**
   * Modal. `acoes` = [{rot, classe, fn, fechar}]. Retorna {fechar()}.
   */
  UI.modal = function (op) {
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    var mod = document.createElement('div');
    mod.className = 'modal' + (op.largo ? ' modal--largo' : '');
    mod.setAttribute('role', 'dialog');
    mod.setAttribute('aria-modal', 'true');
    mod.setAttribute('aria-label', op.titulo || 'Janela');

    var cab = document.createElement('div');
    cab.className = 'modal__cabeca';
    cab.innerHTML = '<h2>' + U.esc(op.titulo || '') + '</h2>';
    var x = document.createElement('button');
    x.className = 'x'; x.innerHTML = '&times;'; x.setAttribute('aria-label', 'Fechar');
    cab.appendChild(x);

    var corpo = document.createElement('div');
    corpo.className = 'modal__corpo';
    if (typeof op.corpo === 'string') corpo.innerHTML = op.corpo;
    else if (op.corpo) corpo.appendChild(op.corpo);

    var pe = document.createElement('div');
    pe.className = 'modal__pe';

    function fechar() {
      document.removeEventListener('keydown', esc);
      fundo.remove();
      if (op.aoFechar) op.aoFechar();
    }
    function esc(e) { if (e.key === 'Escape') fechar(); }

    (op.acoes || [{ rot: 'Fechar', classe: 'btn--linha', fechar: true }]).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.classe || '');
      b.textContent = a.rot;
      b.onclick = async function () {
        if (a.fn) {
          b.disabled = true;
          try { var r = await a.fn(fechar, corpo); if (r === false) { b.disabled = false; return; } }
          catch (e) { UI.toast(e.message || String(e), 'risco', 6000); b.disabled = false; return; }
          b.disabled = false;
        }
        if (a.fechar !== false) fechar();
      };
      pe.appendChild(b);
    });

    x.onclick = fechar;
    fundo.onclick = function (e) { if (e.target === fundo) fechar(); };
    document.addEventListener('keydown', esc);

    mod.appendChild(cab); mod.appendChild(corpo); mod.appendChild(pe);
    fundo.appendChild(mod);
    document.body.appendChild(fundo);
    var primeiro = corpo.querySelector('input,select,textarea,button');
    if (primeiro) setTimeout(function () { primeiro.focus(); }, 40);
    return { fechar: fechar, corpo: corpo };
  };

  UI.confirmar = function (titulo, texto, rotConfirma) {
    return new Promise(function (resolve) {
      var resolvido = false;
      UI.modal({
        titulo: titulo,
        corpo: '<p>' + U.esc(texto) + '</p>',
        acoes: [
          { rot: 'Cancelar', classe: 'btn--linha', fn: function () { resolvido = true; resolve(false); } },
          { rot: rotConfirma || 'Confirmar', classe: 'btn--risco', fn: function () { resolvido = true; resolve(true); } }
        ],
        aoFechar: function () { if (!resolvido) resolve(false); }
      });
    });
  };

  /** Tabela. `colunas` = [{campo, rot, fmt(valor,linha), num, largura}]. */
  UI.tabela = function (op) {
    var wrap = document.createElement('div');
    wrap.className = 'tab-wrap';
    if (!op.dados || !op.dados.length) {
      wrap.innerHTML = '<div class="vazio">' + U.esc(op.vazio || 'Nenhum registro.') + '</div>';
      return wrap;
    }
    var t = document.createElement('table');
    t.className = 'tab';
    var thead = '<thead><tr>' + op.colunas.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + (c.largura ? ' style="width:' + c.largura + '"' : '') + '>' + U.esc(c.rot) + '</th>';
    }).join('') + (op.acoes ? '<th style="width:1%"></th>' : '') + '</tr></thead>';

    var tbody = document.createElement('tbody');
    op.dados.forEach(function (linha) {
      var tr = document.createElement('tr');
      op.colunas.forEach(function (c) {
        var td = document.createElement('td');
        if (c.num) td.className = 'num';
        var v = linha[c.campo];
        if (c.fmt) { var s = c.fmt(v, linha); td.innerHTML = (s === undefined || s === null) ? '' : s; }
        else td.textContent = (v === undefined || v === null || v === '') ? '—' : String(v);
        tr.appendChild(td);
      });
      if (op.acoes) {
        var tdA = document.createElement('td');
        tdA.style.whiteSpace = 'nowrap';
        op.acoes.forEach(function (a) {
          if (a.mostrar && !a.mostrar(linha)) return;
          var b = document.createElement('button');
          b.className = 'btn btn--p ' + (a.classe || 'btn--linha');
          b.textContent = a.rot;
          b.style.marginLeft = '4px';
          b.onclick = function (e) { e.stopPropagation(); a.fn(linha); };
          tdA.appendChild(b);
        });
        tr.appendChild(tdA);
      }
      if (op.aoClicar) { tr.style.cursor = 'pointer'; tr.onclick = function () { op.aoClicar(linha); }; }
      tbody.appendChild(tr);
    });
    t.innerHTML = thead;
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  };

  UI.kpiCard = function (k) {
    var cls = k.situacao === 'ok' ? 'kpi--ok' : k.situacao === 'risco' ? 'kpi--risco'
            : k.situacao === 'alerta' ? 'kpi--alerta' : 'kpi--neutro';
    var meta = (k.meta !== undefined && k.meta !== null && k.direcao !== 'neutro')
      ? ' · meta ' + (k.direcao === 'maior' ? '≥' : '≤') + ' ' + k.meta + (k.unidade === '%' ? '%' : '')
      : '';
    return '<div class="kpi ' + cls + '" title="' + U.esc(k.desc || '') + '">' +
      '<span class="kpi__rot">' + U.esc(k.nome) + '</span>' +
      '<span class="kpi__val ' + (k.situacao === 'neutro' ? '' : k.situacao) + '">' + U.esc(k.texto) + '</span>' +
      '<span class="kpi__nota">' + U.esc(k.nota || '') + U.esc(meta) + '</span></div>';
  };

  UI.cabecalho = function (moduloId, extra) {
    var m = GNE.moduloPorId(moduloId) || {};
    return '<div class="conteudo__cabeca">' +
      '<p class="eyebrow">' + U.esc(m.grupo || '') + (m.sistema ? ' · Sistema ' + m.sistema : '') + '</p>' +
      '<h1>' + U.esc(m.nome || '') + '</h1>' +
      '<p>' + U.esc(m.desc || '') + '</p>' +
      (extra || '') + '</div>';
  };

  UI.aviso = function (texto, tipo) {
    return '<div class="aviso aviso--' + (tipo || 'info') + '">' + texto + '</div>';
  };

  /* ===========================================================================
     FORMULÁRIO DECLARATIVO
     campo = { id, rot, tipo, obrigatorio, opcoes, ajuda, padrao, largura, ler }
     tipos: texto | numero | moeda | data | datahora | hora | select | multi |
            textarea | checkbox | ref
     ======================================================================== */
  UI.form = function (campos, valores, ctx) {
    valores = valores || {};
    ctx = ctx || {};
    var el = document.createElement('div');
    var refs = {};

    campos.forEach(function (c) {
      if (c.mostrar && !c.mostrar(valores, ctx)) return;
      var box = document.createElement('div');
      box.className = 'campo';
      var idEl = 'f_' + c.id + '_' + Math.random().toString(36).slice(2, 7);
      var v = valores[c.id];
      if (v === undefined || v === null) v = (c.padrao !== undefined ? (typeof c.padrao === 'function' ? c.padrao() : c.padrao) : '');

      var lab = document.createElement('label');
      lab.setAttribute('for', idEl);
      lab.textContent = c.rot + (c.obrigatorio ? ' *' : '');
      if (c.tipo !== 'checkbox') box.appendChild(lab);

      var inp;
      if (c.tipo === 'select' || c.tipo === 'ref') {
        inp = document.createElement('select');
        inp.className = 'sel';
        var ops = (c.tipo === 'ref') ? (ctx[c.fonte] || []) : (typeof c.opcoes === 'function' ? c.opcoes(ctx) : (c.opcoes || []));
        if (!c.obrigatorio || v === '') {
          var o0 = document.createElement('option'); o0.value = ''; o0.textContent = c.vazio || '— selecione —';
          inp.appendChild(o0);
        }
        ops.forEach(function (o) {
          var val = (typeof o === 'object') ? o.valor : o;
          var rot = (typeof o === 'object') ? o.rot : o;
          var op = document.createElement('option');
          op.value = val; op.textContent = rot;
          if (String(val) === String(v)) op.selected = true;
          inp.appendChild(op);
        });
      } else if (c.tipo === 'textarea') {
        inp = document.createElement('textarea');
        inp.className = 'txa';
        inp.value = v || '';
        if (c.altura) inp.style.minHeight = c.altura;
      } else if (c.tipo === 'checkbox') {
        inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!v;
        inp.style.marginRight = '8px';
        var wrapCk = document.createElement('label');
        wrapCk.style.cssText = 'display:flex;align-items:center;gap:2px;font-size:.9rem;cursor:pointer;text-transform:none;letter-spacing:0;color:var(--txt);font-family:var(--serif)';
        wrapCk.appendChild(inp);
        wrapCk.appendChild(document.createTextNode(c.rot));
        box.appendChild(wrapCk);
      } else {
        inp = document.createElement('input');
        inp.className = 'inp';
        inp.type = c.tipo === 'numero' || c.tipo === 'moeda' ? 'number'
                 : c.tipo === 'data' ? 'date'
                 : c.tipo === 'datahora' ? 'datetime-local'
                 : c.tipo === 'hora' ? 'time'
                 : c.tipo === 'senha' ? 'password'
                 : c.tipo === 'email' ? 'email' : 'text';
        if (c.tipo === 'moeda') { inp.step = '0.01'; inp.min = '0'; }
        if (c.tipo === 'numero') { if (c.min !== undefined) inp.min = c.min; if (c.max !== undefined) inp.max = c.max; if (c.passo) inp.step = c.passo; }
        if (c.tipo === 'datahora' && v) inp.value = String(v).slice(0, 16);
        else inp.value = (v === null || v === undefined) ? '' : String(v);
        if (c.placeholder) inp.placeholder = c.placeholder;
      }

      inp.id = idEl;
      if (c.obrigatorio) inp.required = true;
      if (c.desabilitado) inp.disabled = true;
      if (c.tipo !== 'checkbox') box.appendChild(inp);
      if (c.ajuda) {
        var a = document.createElement('div');
        a.className = 'ajuda'; a.textContent = c.ajuda;
        box.appendChild(a);
      }
      refs[c.id] = { el: inp, def: c };
      el.appendChild(box);
    });

    /** Lê e valida. Lança Error com a primeira falha encontrada. */
    function ler() {
      var out = {};
      Object.keys(refs).forEach(function (id) {
        var r = refs[id], c = r.def, el2 = r.el, v;
        if (c.tipo === 'checkbox') v = el2.checked;
        else if (c.tipo === 'numero' || c.tipo === 'moeda') v = el2.value === '' ? null : Number(el2.value);
        else v = el2.value;
        if (typeof v === 'string') v = v.trim();
        if (c.obrigatorio && (v === '' || v === null || v === undefined)) {
          el2.focus();
          throw new Error('Preencha o campo obrigatório: ' + c.rot + '.');
        }
        if (c.valida && v !== '' && v !== null) {
          var msg = c.valida(v, out);
          if (msg) { el2.focus(); throw new Error(msg); }
        }
        out[id] = v;
      });
      return out;
    }

    return { el: el, ler: ler, refs: refs };
  };

  /* ===========================================================================
     MOTOR DE CRUD
     ======================================================================== */

  /**
   * Cria uma tela de listagem + edição a partir de uma declaração.
   * @param {object} def
   *   store, modulo, singular, campos, colunas, ordenar, desc, filtros,
   *   antesSalvar(reg, ctx), aposSalvar(reg), extraTopo(ctx), contexto()
   */
  /**
   * Resolve rótulos de chaves estrangeiras para exibição, sem alterar o
   * registro gravado. `_pacienteNome` fica disponível nas colunas.
   */
  function enriquecer(itens, ctx) {
    var mapaPac = {};
    (ctx.pacientes || []).forEach(function (p) { mapaPac[p.id] = p.nome; });
    return itens.map(function (x) {
      var c = Object.assign({}, x);
      if (c.pacienteId) c._pacienteNome = mapaPac[c.pacienteId] || '«registro removido»';
      return c;
    });
  }
  UI.enriquecer = enriquecer;

  UI.crud = function (def) {
    return async function (host) {
      var podeEditar = Auth.pode(def.modulo, 'editar');
      var podeExcluir = Auth.pode(def.modulo, 'excluir') && !GNE.IMUTAVEIS[def.store];
      var ctx = def.contexto ? await def.contexto() : {};
      var itens = await DB.listar(def.store);

      if (def.filtroBase) itens = itens.filter(def.filtroBase);
      itens = enriquecer(itens, ctx);
      itens = U.ordenarPor(itens, def.ordenar || 'criadoEm', def.desc !== false);

      host.innerHTML = UI.cabecalho(def.modulo, def.avisoTopo || '');

      var barra = document.createElement('div');
      barra.className = 'card__cabeca';
      barra.style.marginBottom = '12px';
      var busca = document.createElement('input');
      busca.className = 'inp'; busca.style.maxWidth = '280px';
      busca.placeholder = 'Buscar…';
      busca.setAttribute('aria-label', 'Buscar em ' + (def.singular || def.store));
      barra.appendChild(busca);

      var dir = document.createElement('div');
      dir.className = 'dir';
      if (def.extraTopo) {
        var ex = def.extraTopo(ctx, recarregar);
        if (ex) dir.appendChild(ex);
      }
      if (podeEditar) {
        var bNovo = document.createElement('button');
        bNovo.className = 'btn';
        bNovo.textContent = '+ ' + (def.singular || 'Novo');
        bNovo.onclick = function () { abrir(null); };
        dir.appendChild(bNovo);
      }
      barra.appendChild(dir);
      host.appendChild(barra);

      var alvo = document.createElement('div');
      host.appendChild(alvo);

      var contador = document.createElement('p');
      contador.className = 'ajuda';
      contador.style.marginTop = '8px';
      host.appendChild(contador);

      function desenhar(lista) {
        alvo.innerHTML = '';
        var acoes = [];
        if (def.acoesLinha) acoes = acoes.concat(def.acoesLinha(recarregar, ctx));
        if (podeEditar) acoes.push({ rot: 'Editar', fn: function (l) { abrir(l); } });
        if (podeExcluir) {
          acoes.push({
            rot: 'Excluir', classe: 'btn--linha',
            fn: async function (l) {
              var ok = await UI.confirmar('Excluir registro',
                'Esta ação será registrada na auditoria com seu usuário. Confirma a exclusão?', 'Excluir');
              if (!ok) return;
              await DB.remover(def.store, l[GNE.STORES[def.store].chave]);
              GNE.Dados.invalidar();
              UI.toast('Registro excluído e auditado.', 'ok');
              recarregar();
            }
          });
        }
        alvo.appendChild(UI.tabela({
          colunas: def.colunas, dados: lista, acoes: acoes.length ? acoes : null,
          vazio: def.vazio || 'Nenhum registro ainda.'
        }));
        contador.textContent = lista.length + ' de ' + itens.length + ' registro(s).';
      }

      busca.oninput = U.debounce(function () {
        var q = busca.value.toLowerCase().trim();
        if (!q) return desenhar(itens);
        desenhar(itens.filter(function (x) {
          return JSON.stringify(x).toLowerCase().indexOf(q) >= 0;
        }));
      }, 200);

      async function recarregar() {
        GNE.Dados.invalidar();
        ctx = def.contexto ? await def.contexto() : {};
        itens = await DB.listar(def.store);
        if (def.filtroBase) itens = itens.filter(def.filtroBase);
        itens = enriquecer(itens, ctx);
        itens = U.ordenarPor(itens, def.ordenar || 'criadoEm', def.desc !== false);
        busca.value = '';
        desenhar(itens);
      }

      function abrir(registro) {
        var f = UI.form(def.campos, registro || {}, ctx);
        UI.modal({
          titulo: (registro ? 'Editar ' : 'Novo ') + (def.singular || 'registro').toLowerCase(),
          corpo: f.el,
          largo: def.modalLargo,
          acoes: [
            { rot: 'Cancelar', classe: 'btn--linha' },
            {
              rot: 'Salvar', classe: '',
              fn: async function () {
                Auth.exigir(def.modulo, 'editar');
                var dados = f.ler();
                var reg = Object.assign({}, registro || {}, dados);
                // campos derivados só existem para exibição — nunca são gravados
                Object.keys(reg).forEach(function (k) { if (k.charAt(0) === '_') delete reg[k]; });
                if (def.antesSalvar) {
                  var r = await def.antesSalvar(reg, ctx, registro);
                  if (r === false) return false;
                  if (r && typeof r === 'object') reg = r;
                }
                await DB.salvar(def.store, reg);
                if (def.aposSalvar) await def.aposSalvar(reg, ctx);
                GNE.Dados.invalidar();
                UI.toast((registro ? 'Registro atualizado.' : 'Registro criado.') + ' Auditado.', 'ok');
                recarregar();
              }
            }
          ]
        });
      }

      desenhar(itens);
      host._recarregar = recarregar;
    };
  };

  /* ===========================================================================
     SHELL E ROTEADOR
     ======================================================================== */
  UI.registrar = function (id, fn) { UI._telas[id] = fn; };

  UI.montarShell = function () {
    var u = Auth.atual();
    var top = document.getElementById('topbar');
    top.innerHTML =
      '<button class="menu-btn" id="btn-menu" aria-label="Abrir menu">☰</button>' +
      '<div class="topbar__marca">' + UI.simbolo(28) +
        '<div><div class="topbar__nome">Grupo Nutrindo Emoções</div>' +
        '<div class="topbar__sub">Clinical OS</div></div></div>' +
      '<div class="topbar__dir">' +
        '<span class="tag tag--ouro" id="tag-usuario"></span>' +
        '<button class="btn btn--p btn--linha" id="btn-tema" aria-label="Alternar tema">◐</button>' +
        '<button class="btn btn--p btn--linha" id="btn-sair">Sair</button>' +
      '</div>';

    var papelNome = GNE.PAPEIS[u.papel] ? GNE.PAPEIS[u.papel].nome : u.papel;
    document.getElementById('tag-usuario').textContent =
      (u.nome && u.nome !== papelNome) ? u.nome + ' · ' + papelNome : papelNome;

    document.getElementById('btn-sair').onclick = async function () {
      await Auth.sair();
      location.reload();
    };
    document.getElementById('btn-tema').onclick = function () {
      var atual = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.setAttribute('data-tema', atual);
      try { localStorage.setItem('gne_tema', atual); } catch (e) {}
    };
    document.getElementById('btn-menu').onclick = function () {
      document.getElementById('nav').classList.toggle('aberta');
      var f = document.getElementById('nav-fundo');
      f.hidden = !document.getElementById('nav').classList.contains('aberta');
    };
    document.getElementById('nav-fundo').onclick = function () {
      document.getElementById('nav').classList.remove('aberta');
      this.hidden = true;
    };

    UI.montarNav();
  };

  UI.montarNav = function () {
    var nav = document.getElementById('nav');
    var grupos = {};
    GNE.MODULOS.forEach(function (m) {
      if (!Auth.pode(m.id, 'ver')) return;
      (grupos[m.grupo] = grupos[m.grupo] || []).push(m);
    });
    var html = '';
    ['Direção', 'Relação', 'Assistência', 'Negócio', 'Governança'].forEach(function (g) {
      if (!grupos[g]) return;
      html += '<div class="nav__grupo">' + U.esc(g) + '</div>';
      grupos[g].forEach(function (m) {
        html += '<button class="nav__item" data-mod="' + m.id + '" title="' + U.esc(m.desc) + '">' +
          '<span class="nav__ico" aria-hidden="true">' + m.ico + '</span>' +
          '<span>' + U.esc(m.nome) + '</span>' +
          '<span class="nav__badge" data-badge="' + m.id + '" hidden></span></button>';
      });
    });
    nav.innerHTML = html;
    Array.prototype.forEach.call(nav.querySelectorAll('.nav__item'), function (b) {
      b.onclick = function () { UI.ir(b.getAttribute('data-mod')); };
    });
  };

  UI.badge = function (moduloId, n) {
    var el = document.querySelector('[data-badge="' + moduloId + '"]');
    if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; }
    else el.hidden = true;
  };

  UI.ir = async function (moduloId) {
    if (!Auth.pode(moduloId, 'ver')) {
      UI.toast('Seu perfil não tem acesso a este módulo.', 'risco');
      return;
    }
    var host = document.getElementById('conteudo');
    UI.atual = moduloId;

    Array.prototype.forEach.call(document.querySelectorAll('.nav__item'), function (b) {
      b.classList.toggle('ativo', b.getAttribute('data-mod') === moduloId);
    });
    document.getElementById('nav').classList.remove('aberta');
    document.getElementById('nav-fundo').hidden = true;

    host.innerHTML = '<div class="vazio">Carregando…</div>';
    try {
      var fn = UI._telas[moduloId];
      if (!fn) { host.innerHTML = UI.aviso('Módulo não implementado: ' + U.esc(moduloId), 'alerta'); return; }
      await fn(host);
      host.scrollTop = 0;
      window.scrollTo(0, 0);
      try { location.hash = moduloId; } catch (e) {}
      await GNE.Auditoria.evento('abrir_modulo', 'Acessou ' + moduloId, moduloId);
    } catch (e) {
      host.innerHTML = UI.aviso('<strong>Erro ao abrir o módulo.</strong><br>' + U.esc(e.message || String(e)) +
        '<br><span class="ajuda">O erro foi registrado na auditoria. Nenhum dado foi perdido.</span>', 'risco');
      GNE.Auditoria.registrar({ acao: 'erro_ui', modulo: moduloId, detalhe: String(e && e.stack || e) });
    }
    UI.atualizarBadges();
  };

  UI.atualizarBadges = async function () {
    try {
      var d = await GNE.Dados.carregar();
      if (Auth.pode('nba', 'ver')) {
        var nba = await GNE.NBA.calcular(d);
        UI.badge('nba', nba.filter(function (a) { return a.prioridade >= 80; }).length);
      }
      if (Auth.pode('processos', 'ver')) {
        UI.badge('processos', d.tarefas.filter(function (t) {
          return t.status !== 'Concluída' && t.prazo && new Date(t.prazo) < new Date();
        }).length);
      }
      if (Auth.pode('experiencia', 'ver')) {
        UI.badge('experiencia', d.experiencia.filter(function (e) { return e.tipo === 'Reclamação' && !e.resolvido; }).length);
      }
    } catch (e) { /* badge é acessório; nunca derruba a navegação */ }
  };

  /* ---------------------------------------------------------------------------
     Bloco de saída de IA reutilizável
     ------------------------------------------------------------------------ */
  UI.painelIA = function (agenteId, op) {
    op = op || {};
    var box = document.createElement('div');
    box.className = 'card';
    var ag = GNE.IA.agente(agenteId) || {};
    box.innerHTML =
      '<div class="card__cabeca"><div>' +
        '<p class="eyebrow">Camada de IA</p><h3>' + U.esc(ag.nome || agenteId) + '</h3>' +
        '<p class="ajuda" style="margin-top:2px">' + U.esc(ag.resumo || '') + '</p>' +
      '</div><div class="dir"></div></div>' +
      '<div data-saida></div>';

    var btn = document.createElement('button');
    btn.className = 'btn btn--ouro';
    btn.textContent = op.rotulo || 'Gerar análise';
    box.querySelector('.dir').appendChild(btn);
    var saida = box.querySelector('[data-saida]');

    btn.onclick = async function () {
      btn.disabled = true;
      var antes = btn.textContent;
      btn.textContent = 'Analisando…';
      saida.innerHTML = '<div class="vazio">O modelo está lendo os dados já calculados pelo sistema…</div>';
      var r = await GNE.IA.executar(agenteId, {
        pergunta: op.pergunta,
        contexto: op.contexto ? await op.contexto() : undefined
      });
      btn.disabled = false; btn.textContent = antes;
      if (!r.ok) {
        saida.innerHTML = UI.aviso('<strong>Não foi possível gerar.</strong> ' + U.esc(r.erro), 'alerta');
        return;
      }
      saida.innerHTML =
        '<div class="aviso aviso--info" style="margin-bottom:10px"><strong>Rascunho gerado por IA.</strong> ' +
        'Requer validação de um profissional. Não constitui diagnóstico, prognóstico ou conduta.</div>' +
        '<div style="white-space:pre-wrap;font-size:.93rem;line-height:1.6">' + U.esc(r.texto) + '</div>' +
        '<p class="ajuda" style="margin-top:10px">Modelo ' + U.esc(r.modelo || '') +
        ' · ' + (r.uso && r.uso.output_tokens || '?') + ' tokens de saída · execução registrada na auditoria.</p>';
      if (op.aposGerar) op.aposGerar(r, saida);
    };
    return box;
  };

})(typeof window !== 'undefined' ? window : globalThis);
