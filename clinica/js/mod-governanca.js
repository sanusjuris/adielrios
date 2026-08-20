/* =============================================================================
   GNE Clinical OS — Governança
   Camada de IA · Administração (usuários, permissões, auditoria, configuração,
   retenção) · Testes & Saúde do sistema
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  function abas(host, itens) {
    var barra = document.createElement('div');
    barra.className = 'abas';
    var alvo = document.createElement('div');
    itens.forEach(function (it, i) {
      var b = document.createElement('button');
      b.className = 'aba' + (i === 0 ? ' ativo' : '');
      b.textContent = it.rot;
      b.onclick = async function () {
        Array.prototype.forEach.call(barra.children, function (x) { x.classList.remove('ativo'); });
        b.classList.add('ativo');
        alvo.innerHTML = '<div class="vazio">Carregando…</div>';
        try { await it.render(alvo); }
        catch (e) { alvo.innerHTML = UI.aviso('<strong>Erro:</strong> ' + U.esc(e.message), 'risco'); }
      };
      barra.appendChild(b);
    });
    host.appendChild(barra);
    host.appendChild(alvo);
    itens[0].render(alvo);
  }

  /* ===========================================================================
     CAMADA DE IA
     ======================================================================== */
  UI.registrar('ia', async function (host) {
    await GNE.IA.carregarCfg();
    host.innerHTML = UI.cabecalho('ia');

    host.insertAdjacentHTML('beforeend', UI.aviso(
      '<strong>Fronteira que este sistema não cruza.</strong> A IA resume, organiza, identifica padrões, ' +
      'lembra, classifica, prioriza e redige. Ela não diagnostica, não altera medicação, não decide internação, ' +
      'não classifica risco suicida de forma definitiva, não libera procedimento e não envia mensagem ao paciente ' +
      'sem aprovação humana. A Res. CFM 2.454/2026 mantém diagnóstico, prognóstico e conduta sob ' +
      'responsabilidade do médico.', 'alerta'));

    /* ---- configuração de acesso ---- */
    var cfgCard = document.createElement('div');
    cfgCard.className = 'card';
    cfgCard.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Conexão</p><h3>Acesso à API Anthropic</h3></div></div>';

    var f = UI.form([
      { id: 'modo', rot: 'Modo de conexão', tipo: 'select', obrigatorio: true,
        opcoes: [
          { valor: 'proxy', rot: 'Proxy no servidor (recomendado)' },
          { valor: 'direto', rot: 'Direto do navegador (somente piloto)' }
        ],
        ajuda: 'No modo direto, a chave fica no navegador e é visível a quem tiver acesso ao dispositivo. ' +
               'Aceitável só para piloto com dado fictício. Com dado de paciente, use proxy.' },
      { id: 'proxyUrl', rot: 'URL do proxy', tipo: 'texto',
        placeholder: 'https://api.suaclinica.com.br/ia',
        ajuda: 'Endpoint próprio que recebe o mesmo corpo do /v1/messages, adiciona a chave no servidor e repassa.' },
      { id: 'modelo', rot: 'Modelo', tipo: 'select', obrigatorio: true,
        opcoes: GNE.IA.MODELOS.map(function (m) { return { valor: m.id, rot: m.nome + ' — ' + m.nota }; }) },
      { id: 'esforco', rot: 'Esforço de raciocínio', tipo: 'select',
        opcoes: ['low', 'medium', 'high', 'xhigh', 'max'],
        ajuda: 'Maior esforço custa mais e demora mais. "high" é o equilíbrio para análise executiva.' },
      { id: 'maxTokens', rot: 'Tamanho máximo da resposta (tokens)', tipo: 'numero', min: 500, max: 32000 },
      { id: 'redigirIdentificadores', rot: 'Pseudonimizar antes de enviar (recomendado)', tipo: 'checkbox',
        ajuda: 'Substitui nomes por códigos e remove CPF, telefone e e-mail antes da requisição sair do navegador.' }
    ], GNE.IA.cfg);
    cfgCard.appendChild(f.el);

    var chaveBox = document.createElement('div');
    chaveBox.className = 'campo';
    chaveBox.innerHTML = '<label>Chave da API (somente esta sessão)</label>' +
      '<input class="inp" type="password" id="ia-chave" placeholder="sk-ant-…" autocomplete="off">' +
      '<div class="ajuda">Nunca é gravada no banco. Vive em <code>sessionStorage</code> e some ao fechar a aba. ' +
      'Se você não tem a chave, gere uma em console.anthropic.com e cole aqui.</div>';
    cfgCard.appendChild(chaveBox);

    var botoes = document.createElement('div');
    botoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
    var bSalvar = document.createElement('button');
    bSalvar.className = 'btn'; bSalvar.textContent = 'Salvar configuração';
    var bTestar = document.createElement('button');
    bTestar.className = 'btn btn--linha'; bTestar.textContent = 'Testar conexão';
    botoes.appendChild(bSalvar); botoes.appendChild(bTestar);
    cfgCard.appendChild(botoes);
    var res = document.createElement('div');
    res.style.marginTop = '10px';
    cfgCard.appendChild(res);
    host.appendChild(cfgCard);

    if (GNE.IA.chave()) document.getElementById('ia-chave').value = GNE.IA.chave();

    bSalvar.onclick = async function () {
      try {
        var dados = f.ler();
        if (dados.modo === 'proxy' && !dados.proxyUrl) throw new Error('Informe a URL do proxy.');
        await GNE.IA.salvarCfg(dados);
        GNE.IA.definirChave(document.getElementById('ia-chave').value.trim());
        UI.toast('Configuração salva e auditada.', 'ok');
      } catch (e) { UI.toast(e.message, 'risco', 6000); }
    };
    bTestar.onclick = async function () {
      bTestar.disabled = true; bTestar.textContent = 'Testando…';
      GNE.IA.definirChave(document.getElementById('ia-chave').value.trim());
      var r = await GNE.IA.testar();
      bTestar.disabled = false; bTestar.textContent = 'Testar conexão';
      res.innerHTML = r.ok
        ? UI.aviso('<strong>Conexão estabelecida.</strong> Modelo: ' + U.esc(r.modelo || '') + '. Resposta: ' + U.esc(r.texto), 'ok')
        : UI.aviso('<strong>Falhou.</strong> ' + U.esc(r.erro), 'risco');
    };

    /* ---- catálogo de agentes ---- */
    var cat = document.createElement('div');
    cat.className = 'card';
    cat.innerHTML = '<div class="card__cabeca"><div><p class="eyebrow">Agentes</p>' +
      '<h3>' + GNE.IA.AGENTES.length + ' agentes especializados</h3>' +
      '<p class="ajuda">Cada agente tem escopo fechado, entrada determinística e o mesmo bloco de limites. ' +
      'O acesso segue a permissão do módulo que alimenta o agente.</p></div></div>';
    cat.appendChild(UI.tabela({
      colunas: [
        { campo: 'nome', rot: 'Agente', fmt: function (v, l) {
            return '<strong>' + U.esc(v) + '</strong><br><span class="ajuda">' + U.esc(l.resumo) + '</span>';
          } },
        { campo: 'papel', rot: 'Para quem' },
        { campo: 'modulo', rot: 'Módulo-fonte', fmt: function (v) {
            var m = GNE.moduloPorId(v);
            return '<span class="tag">' + U.esc(m ? m.nome : v) + '</span>';
          } },
        { campo: 'acesso', rot: 'Seu acesso', fmt: function (v, l) {
            return Auth.pode(l.modulo, 'ver')
              ? '<span class="tag tag--ok">liberado</span>'
              : '<span class="tag tag--risco">bloqueado</span>';
          } }
      ],
      dados: GNE.IA.AGENTES
    }));
    host.appendChild(cat);

    host.insertAdjacentHTML('beforeend',
      '<p class="faixa-lgpd">Toda execução de agente é registrada na auditoria com modelo, esforço, consumo de tokens, ' +
      'duração e se a pseudonimização estava ativa. O texto enviado e a resposta não são gravados no banco — ' +
      'apenas o metadado da execução, para reduzir a superfície de dado sensível.</p>');
  });

  /* ===========================================================================
     ADMINISTRAÇÃO
     ======================================================================== */
  UI.registrar('admin', async function (host) {
    if (!Auth.ehSuper()) {
      host.innerHTML = UI.cabecalho('admin') +
        UI.aviso('Administração é exclusiva do Super Administrador.', 'risco');
      return;
    }
    host.innerHTML = UI.cabecalho('admin');
    var corpo = document.createElement('div');
    host.appendChild(corpo);

    abas(corpo, [
      { rot: 'Usuários', render: telaUsuarios },
      { rot: 'Permissões', render: telaPermissoes },
      { rot: 'Auditoria', render: telaAuditoria },
      { rot: 'Configuração', render: telaConfig },
      { rot: 'Retenção e dados', render: telaDados }
    ]);
  });

  /* ---- usuários ---- */
  async function telaUsuarios(alvo) {
    var us = U.ordenarPor(await DB.listar('usuarios'), 'nome', false);
    alvo.innerHTML = '';

    var topo = document.createElement('div');
    topo.className = 'card__cabeca';
    topo.innerHTML = '<div><h3>Usuários do sistema</h3>' +
      '<p class="ajuda">Cada perfil define exatamente o que a pessoa vê e edita. Toda ação fica na auditoria.</p></div>';
    var bNovo = document.createElement('button');
    bNovo.className = 'btn'; bNovo.textContent = '+ Novo usuário';
    bNovo.onclick = function () { formUsuario(null, alvo); };
    var dir = document.createElement('div'); dir.className = 'dir'; dir.appendChild(bNovo);
    topo.appendChild(dir);
    alvo.appendChild(topo);

    alvo.appendChild(UI.tabela({
      colunas: [
        { campo: 'nome', rot: 'Usuário', fmt: function (v, l) {
            return '<strong>' + U.esc(v) + '</strong><br><span class="ajuda">' + U.esc(l.email) + '</span>';
          } },
        { campo: 'papel', rot: 'Perfil', fmt: function (v) {
            var p = GNE.PAPEIS[v];
            return '<span class="tag tag--ouro">' + U.esc(p ? p.nome : v) + '</span>' +
              (p ? '<br><span class="ajuda">' + U.esc(p.desc) + '</span>' : '');
          } },
        { campo: 'permissoes', rot: 'Permissão', fmt: function (v) {
            return v ? '<span class="tag tag--alerta">personalizada</span>' : '<span class="tag">do perfil</span>';
          } },
        { campo: 'ativo', rot: 'Estado', fmt: function (v, l) {
            if (!v) return '<span class="tag tag--risco">inativo</span>';
            if (l.trocarSenha) return '<span class="tag tag--alerta">troca de senha pendente</span>';
            return '<span class="tag tag--ok">ativo</span>';
          } },
        { campo: 'ultimoLogin', rot: 'Último acesso', fmt: function (v) { return v ? U.dataHoraBR(v) : 'nunca'; } }
      ],
      dados: us,
      acoes: [
        { rot: 'Editar', fn: function (l) { formUsuario(l, alvo); } },
        { rot: 'Nova senha', fn: function (l) { formSenha(l, alvo); } },
        { rot: 'Ver trilha', fn: function (l) { trilhaDoUsuario(l); } },
        { rot: 'Ativar', classe: 'btn--linha',
          mostrar: function (l) { return !l.ativo; },
          fn: async function (l) { l.ativo = true; await DB.salvar('usuarios', l, { acao: 'ativar_usuario' }); UI.toast('Usuário ativado.', 'ok'); telaUsuarios(alvo); } },
        { rot: 'Desativar', classe: 'btn--risco',
          mostrar: function (l) { return l.ativo && l.papel !== 'super_admin'; },
          fn: async function (l) {
            var ok = await UI.confirmar('Desativar usuário',
              'O usuário perde o acesso imediatamente. O histórico e a trilha de auditoria permanecem intactos.', 'Desativar');
            if (!ok) return;
            l.ativo = false;
            await DB.salvar('usuarios', l, { acao: 'desativar_usuario' });
            UI.toast('Usuário desativado.', 'ok');
            telaUsuarios(alvo);
          } }
      ],
      vazio: 'Nenhum usuário.'
    }));
  }

  function formUsuario(u, alvo) {
    var campos = [
      { id: 'nome', rot: 'Nome completo', tipo: 'texto', obrigatorio: true },
      { id: 'email', rot: 'E-mail (login)', tipo: 'email', obrigatorio: true, desabilitado: !!u },
      { id: 'papel', rot: 'Perfil', tipo: 'select', obrigatorio: true,
        opcoes: Object.keys(GNE.PAPEIS).map(function (k) { return { valor: k, rot: GNE.PAPEIS[k].nome }; }),
        ajuda: 'O perfil define a matriz de permissões. Ajustes finos ficam na aba Permissões.' }
    ];
    if (!u) {
      campos.push({ id: 'senha', rot: 'Senha inicial', tipo: 'senha', obrigatorio: true,
        ajuda: 'Mínimo de 10 caracteres. O usuário será obrigado a trocar no primeiro acesso.' });
    }
    var f = UI.form(campos, u || {});
    UI.modal({
      titulo: u ? 'Editar usuário' : 'Novo usuário',
      corpo: f.el,
      acoes: [
        { rot: 'Cancelar', classe: 'btn--linha' },
        { rot: 'Salvar', fn: async function () {
            var d = f.ler();
            if (u) {
              if (u.papel === 'super_admin' && d.papel !== 'super_admin') {
                var us = await DB.listar('usuarios');
                var outros = us.filter(function (x) { return x.papel === 'super_admin' && x.id !== u.id && x.ativo; });
                if (!outros.length) throw new Error('Precisa existir ao menos um Super Administrador ativo.');
              }
              u.nome = d.nome; u.papel = d.papel;
              await DB.salvar('usuarios', u, { acao: 'editar_usuario' });
            } else {
              await Auth.criar(d);
            }
            UI.toast('Usuário salvo e auditado.', 'ok');
            telaUsuarios(alvo);
          } }
      ]
    });
  }

  function formSenha(u, alvo) {
    var f = UI.form([
      { id: 'senha', rot: 'Nova senha', tipo: 'senha', obrigatorio: true,
        ajuda: 'Mínimo de 10 caracteres. A redefinição fica registrada na auditoria com seu usuário.' }
    ], {});
    UI.modal({
      titulo: 'Redefinir senha — ' + u.email,
      corpo: f.el,
      acoes: [
        { rot: 'Cancelar', classe: 'btn--linha' },
        { rot: 'Redefinir', classe: 'btn--risco', fn: async function () {
            var d = f.ler();
            await Auth.trocarSenha(u.id, d.senha);
            var novo = await DB.obter('usuarios', u.id);
            novo.trocarSenha = true;
            await DB._por('usuarios', novo);
            UI.toast('Senha redefinida. O usuário terá de trocá-la no próximo acesso.', 'ok');
            telaUsuarios(alvo);
          } }
      ]
    });
  }

  async function trilhaDoUsuario(u) {
    var eventos = (await GNE.Auditoria.listar({ usuarioId: u.id })).slice(0, 200);
    var el = document.createElement('div');
    el.appendChild(UI.tabela({
      colunas: [
        { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
        { campo: 'acao', rot: 'Ação', fmt: function (v) { return '<span class="tag">' + U.esc(v) + '</span>'; } },
        { campo: 'modulo', rot: 'Módulo' },
        { campo: 'rotulo', rot: 'Registro' },
        { campo: 'detalhe', rot: 'Detalhe', fmt: function (v) { return '<span class="ajuda">' + U.esc(v || '') + '</span>'; } }
      ],
      dados: eventos,
      vazio: 'Sem eventos para este usuário.'
    }));
    UI.modal({ titulo: 'Trilha de auditoria — ' + u.nome, largo: true, corpo: el });
  }

  /* ---- permissões ---- */
  async function telaPermissoes(alvo) {
    var us = (await DB.listar('usuarios')).filter(function (u) { return u.papel !== 'super_admin'; });
    alvo.innerHTML = '<div class="card__cabeca"><div><h3>Matriz de permissões</h3>' +
      '<p class="ajuda">Marque o que cada usuário pode ver e editar. O ajuste individual sobrepõe o perfil ' +
      'e fica sinalizado como "personalizada". Alterações são auditadas.</p></div></div>';

    if (!us.length) {
      alvo.insertAdjacentHTML('beforeend', '<div class="vazio">Nenhum usuário além do Super Administrador.</div>');
      return;
    }

    var sel = document.createElement('select');
    sel.className = 'sel'; sel.style.maxWidth = '340px';
    sel.innerHTML = us.map(function (u) {
      return '<option value="' + u.id + '">' + U.esc(u.nome + ' — ' + GNE.PAPEIS[u.papel].nome) + '</option>';
    }).join('');
    alvo.appendChild(sel);

    var grade = document.createElement('div');
    grade.style.marginTop = '14px';
    alvo.appendChild(grade);

    async function desenhar() {
      var u = await DB.obter('usuarios', sel.value);
      if (!u) return;
      var m = Auth.matriz(u);
      var html = '<div class="tab-wrap"><table class="tab"><thead><tr>' +
        '<th>Módulo</th><th style="width:90px">Ver</th><th style="width:90px">Editar</th><th style="width:90px">Excluir</th>' +
        '</tr></thead><tbody>';
      GNE.MODULOS.forEach(function (mod) {
        var p = m[mod.id] || [];
        html += '<tr><td><strong>' + U.esc(mod.nome) + '</strong><br><span class="ajuda">' + U.esc(mod.grupo) + '</span></td>' +
          ['ver', 'editar', 'excluir'].map(function (a) {
            return '<td><input type="checkbox" data-mod="' + mod.id + '" data-acao="' + a + '"' +
              (p.indexOf(a) >= 0 ? ' checked' : '') + '></td>';
          }).join('') + '</tr>';
      });
      html += '</tbody></table></div>';
      grade.innerHTML = html;

      var acoes = document.createElement('div');
      acoes.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
      var bSalvar = document.createElement('button');
      bSalvar.className = 'btn'; bSalvar.textContent = 'Salvar permissões';
      var bReset = document.createElement('button');
      bReset.className = 'btn btn--linha'; bReset.textContent = 'Voltar ao padrão do perfil';
      acoes.appendChild(bSalvar); acoes.appendChild(bReset);
      grade.appendChild(acoes);

      bSalvar.onclick = async function () {
        var novo = {};
        GNE.MODULOS.forEach(function (mod) { novo[mod.id] = []; });
        Array.prototype.forEach.call(grade.querySelectorAll('input[type=checkbox]'), function (cb) {
          if (cb.checked) novo[cb.getAttribute('data-mod')].push(cb.getAttribute('data-acao'));
        });
        // coerência: editar ou excluir sem ver não faz sentido
        Object.keys(novo).forEach(function (k) {
          if (novo[k].length && novo[k].indexOf('ver') < 0) novo[k].unshift('ver');
        });
        u.permissoes = novo;
        await DB.salvar('usuarios', u, { acao: 'alterar_permissoes' });
        UI.toast('Permissões atualizadas e auditadas.', 'ok');
        desenhar();
      };
      bReset.onclick = async function () {
        u.permissoes = null;
        await DB.salvar('usuarios', u, { acao: 'restaurar_permissoes_do_perfil' });
        UI.toast('Permissões voltaram ao padrão do perfil.', 'ok');
        desenhar();
      };
    }
    sel.onchange = desenhar;
    desenhar();
  }

  /* ---- auditoria ---- */
  async function telaAuditoria(alvo) {
    alvo.innerHTML = '<div class="card__cabeca"><div><h3>Trilha de auditoria</h3>' +
      '<p class="ajuda">Append-only. Não há exclusão nem edição — nem para o Super Administrador. ' +
      'Senhas e sais aparecem redigidos; textos longos são truncados por minimização.</p></div></div>' +
      '<div class="linha-campos" style="margin-bottom:12px">' +
        '<div class="campo" style="margin:0"><label>Buscar</label><input class="inp" id="au-busca" placeholder="usuário, ação, registro…"></div>' +
        '<div class="campo" style="margin:0"><label>Módulo</label><select class="sel" id="au-mod"><option value="">Todos</option></select></div>' +
        '<div class="campo" style="margin:0"><label>Ação</label><select class="sel" id="au-acao"><option value="">Todas</option></select></div>' +
      '</div><div id="au-lista"></div>';

    var todos = await GNE.Auditoria.listar({});
    var mods = Object.keys(U.agrupar(todos, 'modulo')).sort();
    var acoes = Object.keys(U.agrupar(todos, 'acao')).sort();
    document.getElementById('au-mod').innerHTML += mods.map(function (m) { return '<option>' + U.esc(m) + '</option>'; }).join('');
    document.getElementById('au-acao').innerHTML += acoes.map(function (a) { return '<option>' + U.esc(a) + '</option>'; }).join('');

    var lista = document.getElementById('au-lista');
    function desenhar() {
      var q = document.getElementById('au-busca').value.toLowerCase().trim();
      var fm = document.getElementById('au-mod').value;
      var fa = document.getElementById('au-acao').value;
      var r = todos.filter(function (a) {
        if (fm && a.modulo !== fm) return false;
        if (fa && a.acao !== fa) return false;
        if (q && JSON.stringify([a.usuarioEmail, a.acao, a.modulo, a.rotulo, a.detalhe]).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      lista.innerHTML = '';
      lista.appendChild(UI.tabela({
        colunas: [
          { campo: 'ts', rot: 'Quando', fmt: function (v) { return U.dataHoraBR(v); } },
          { campo: 'usuarioEmail', rot: 'Quem', fmt: function (v, l) {
              return U.esc(v) + '<br><span class="ajuda">' + U.esc(l.usuarioPapel || '') + '</span>';
            } },
          { campo: 'acao', rot: 'Ação', fmt: function (v, l) {
              var t = /excluir|falha|erro|bloqueado|recusa/.test(v) ? 'risco'
                    : /criar|login|concluir/.test(v) ? 'ok' : '';
              return '<span class="tag' + (t ? ' tag--' + t : '') + '">' + U.esc(v) + '</span>' +
                (l.testData ? ' <span class="tag tag--alerta">teste</span>' : '');
            } },
          { campo: 'modulo', rot: 'Módulo' },
          { campo: 'rotulo', rot: 'Registro' },
          { campo: 'detalhe', rot: 'Detalhe', fmt: function (v, l) {
              if (v) return '<span class="ajuda">' + U.esc(v) + '</span>';
              if (l.antes || l.depois) return '<button class="btn btn--p btn--linha" data-diff="' + l.id + '">ver alteração</button>';
              return '';
            } }
        ],
        dados: r.slice(0, 400),
        vazio: 'Nenhum evento com estes filtros.'
      }));
      lista.querySelectorAll('[data-diff]').forEach(function (b) {
        b.onclick = function () {
          var ev = todos.filter(function (x) { return x.id === b.getAttribute('data-diff'); })[0];
          UI.modal({
            titulo: 'Alteração — ' + ev.acao + ' em ' + ev.modulo,
            largo: true,
            corpo: '<div class="grade grade--2">' +
              '<div><p class="eyebrow">Antes</p><pre class="mono" style="white-space:pre-wrap;font-size:.74rem;background:var(--surface-2);padding:10px;border-radius:4px;overflow:auto">' +
                U.esc(JSON.stringify(ev.antes, null, 1) || '«não existia»') + '</pre></div>' +
              '<div><p class="eyebrow">Depois</p><pre class="mono" style="white-space:pre-wrap;font-size:.74rem;background:var(--surface-2);padding:10px;border-radius:4px;overflow:auto">' +
                U.esc(JSON.stringify(ev.depois, null, 1) || '«removido»') + '</pre></div></div>'
          });
        };
      });
      if (r.length > 400) {
        lista.insertAdjacentHTML('beforeend', '<p class="ajuda" style="margin-top:8px">Mostrando 400 de ' + r.length +
          ' eventos. Refine o filtro ou exporte o backup completo na aba Retenção.</p>');
      }
    }
    document.getElementById('au-busca').oninput = U.debounce(desenhar, 250);
    document.getElementById('au-mod').onchange = desenhar;
    document.getElementById('au-acao').onchange = desenhar;
    desenhar();
  }

  /* ---- configuração ---- */
  async function telaConfig(alvo) {
    alvo.innerHTML = '';

    /* capacidade e SLAs */
    var c1 = document.createElement('div');
    c1.className = 'card';
    c1.innerHTML = '<div class="card__cabeca"><div><h3>Capacidade e SLAs</h3>' +
      '<p class="ajuda">Estes números alimentam ocupação de salas, receita por hora e os SLAs cobrados pelos indicadores.</p></div></div>';
    var f1 = UI.form([
      { id: 'salas', rot: 'Salas (uma por linha)', tipo: 'textarea', obrigatorio: true, altura: '90px' },
      { id: 'horasUteisDia', rot: 'Horas úteis por dia', tipo: 'numero', obrigatorio: true, min: 1, max: 24 },
      { id: 'slaPrimeiroContatoMin', rot: 'SLA de primeiro contato (min)', tipo: 'numero', obrigatorio: true, min: 1 },
      { id: 'slaRespostaMin', rot: 'SLA de resposta em conversa (min)', tipo: 'numero', obrigatorio: true, min: 1 },
      { id: 'diasSemContatoAlerta', rot: 'Dias sem contato que geram alerta', tipo: 'numero', obrigatorio: true, min: 1 },
      { id: 'diasSemRevisaoAlerta', rot: 'Dias sem revisão médica que geram alerta', tipo: 'numero', obrigatorio: true, min: 1 },
      { id: 'despesasFixasMes', rot: 'Despesas fixas mensais (R$)', tipo: 'moeda' }
    ], {
      salas: (await DB.cfg('salas', ['Consultório 1', 'Consultório 2', 'Sala de Procedimentos'])).join('\n'),
      horasUteisDia: await DB.cfg('horas_uteis_dia', 10),
      slaPrimeiroContatoMin: await DB.cfg('sla_primeiro_contato_min', 15),
      slaRespostaMin: await DB.cfg('sla_resposta_min', 30),
      diasSemContatoAlerta: await DB.cfg('dias_sem_contato_alerta', 45),
      diasSemRevisaoAlerta: await DB.cfg('dias_sem_revisao_alerta', 60),
      despesasFixasMes: await DB.cfg('despesas_fixas_mes', 0)
    });
    c1.appendChild(f1.el);
    var b1 = document.createElement('button');
    b1.className = 'btn'; b1.textContent = 'Salvar capacidade e SLAs';
    b1.onclick = async function () {
      try {
        var d = f1.ler();
        await DB.setCfg('salas', d.salas.split('\n').map(function (s) { return s.trim(); }).filter(Boolean));
        await DB.setCfg('horas_uteis_dia', d.horasUteisDia);
        await DB.setCfg('sla_primeiro_contato_min', d.slaPrimeiroContatoMin);
        await DB.setCfg('sla_resposta_min', d.slaRespostaMin);
        await DB.setCfg('dias_sem_contato_alerta', d.diasSemContatoAlerta);
        await DB.setCfg('dias_sem_revisao_alerta', d.diasSemRevisaoAlerta);
        await DB.setCfg('despesas_fixas_mes', d.despesasFixasMes || 0);
        GNE.Dados.invalidar();
        UI.toast('Configuração salva.', 'ok');
      } catch (e) { UI.toast(e.message, 'risco', 6000); }
    };
    c1.appendChild(b1);
    alvo.appendChild(c1);

    /* catálogo de serviços */
    var custos = await DB.cfg('custos_servico', {});
    var c2 = document.createElement('div');
    c2.className = 'card';
    c2.innerHTML = '<div class="card__cabeca"><div><h3>Catálogo de serviços e custo direto</h3>' +
      '<p class="ajuda">Sem custo direto informado, a margem calculada fica superestimada. ' +
      'Um valor por linha, no formato <code>Nome do serviço = custo</code>.</p></div></div>';
    var ta = document.createElement('textarea');
    ta.className = 'txa'; ta.style.minHeight = '150px';
    ta.value = Object.keys(custos).map(function (k) { return k + ' = ' + custos[k]; }).join('\n');
    c2.appendChild(ta);
    var b2 = document.createElement('button');
    b2.className = 'btn'; b2.style.marginTop = '10px'; b2.textContent = 'Salvar catálogo';
    b2.onclick = async function () {
      var novo = {};
      var erro = null;
      ta.value.split('\n').forEach(function (linha, i) {
        if (!linha.trim()) return;
        var p = linha.split('=');
        if (p.length !== 2) { erro = 'Linha ' + (i + 1) + ' fora do formato "Nome = custo".'; return; }
        var nome = p[0].trim(), v = Number(p[1].trim().replace(',', '.'));
        if (!nome) { erro = 'Linha ' + (i + 1) + ': nome vazio.'; return; }
        if (isNaN(v) || v < 0) { erro = 'Linha ' + (i + 1) + ': custo inválido.'; return; }
        novo[nome] = v;
      });
      if (erro) return UI.toast(erro, 'risco', 6000);
      await DB.setCfg('custos_servico', novo);
      GNE.Dados.invalidar();
      UI.toast(Object.keys(novo).length + ' serviço(s) no catálogo.', 'ok');
    };
    c2.appendChild(b2);
    alvo.appendChild(c2);

    /* metas de KPI */
    var metas = await DB.cfg('metas', {});
    var c3 = document.createElement('div');
    c3.className = 'card';
    c3.innerHTML = '<div class="card__cabeca"><div><h3>Metas dos indicadores</h3>' +
      '<p class="ajuda">Deixe em branco para usar a meta padrão do catálogo. A meta muda a cor do indicador, não o cálculo.</p></div></div>';
    var tabMeta = document.createElement('div');
    tabMeta.className = 'tab-wrap';
    tabMeta.innerHTML = '<table class="tab"><thead><tr><th>Indicador</th><th>Bloco</th><th>Direção</th>' +
      '<th style="width:120px">Meta</th><th>Definição</th></tr></thead><tbody>' +
      GNE.KPI.CATALOGO.map(function (k) {
        return '<tr><td><strong>' + U.esc(k.nome) + '</strong></td><td>' + U.esc(k.bloco) + '</td>' +
          '<td>' + (k.direcao === 'maior' ? 'maior é melhor' : k.direcao === 'menor' ? 'menor é melhor' : 'neutro') + '</td>' +
          '<td><input class="inp" type="number" step="0.1" data-meta="' + k.id + '" value="' +
            (metas[k.id] !== undefined ? metas[k.id] : (k.meta !== undefined ? k.meta : '')) + '"></td>' +
          '<td><span class="ajuda">' + U.esc(k.desc) + '</span></td></tr>';
      }).join('') + '</tbody></table>';
    c3.appendChild(tabMeta);
    var b3 = document.createElement('button');
    b3.className = 'btn'; b3.style.marginTop = '10px'; b3.textContent = 'Salvar metas';
    b3.onclick = async function () {
      var novo = {};
      tabMeta.querySelectorAll('[data-meta]').forEach(function (i) {
        if (i.value !== '') novo[i.getAttribute('data-meta')] = Number(i.value);
      });
      await DB.setCfg('metas', novo);
      GNE.Dados.invalidar();
      UI.toast('Metas salvas.', 'ok');
    };
    c3.appendChild(b3);
    alvo.appendChild(c3);
  }

  /* ---- retenção e dados ---- */
  async function telaDados(alvo) {
    var inv = await GNE.Retencao.inventario();
    alvo.innerHTML =
      '<div class="card"><div class="card__cabeca"><div><h3>Retenção</h3>' +
      '<p class="ajuda">Prontuário e trilha de auditoria são imutáveis: o sistema não oferece caminho de exclusão. ' +
      'Registros só se tornam elegíveis a expurgo depois do prazo de retenção configurado.</p></div></div>' +
      '<div class="linha-campos"><div class="campo"><label>Anos de retenção</label>' +
      '<input class="inp" type="number" id="ret-anos" min="1" max="50" value="' + inv.anos + '">' +
      '<div class="ajuda">O padrão do sistema é 20 anos.</div></div></div>' +
      '<button class="btn" id="ret-salvar">Salvar prazo</button></div>';

    document.getElementById('ret-salvar').onclick = async function () {
      var n = Number(document.getElementById('ret-anos').value);
      if (!n || n < 1) return UI.toast('Prazo inválido.', 'risco');
      await DB.setCfg('retencao_anos', n, { acao: 'alterar_retencao' });
      UI.toast('Prazo de retenção definido em ' + n + ' anos.', 'ok');
      telaDados(alvo);
    };

    var cInv = document.createElement('div');
    cInv.className = 'card';
    cInv.innerHTML = '<div class="card__cabeca"><div><h3>Inventário do banco</h3>' +
      '<p class="ajuda">' + inv.totalProducao + ' registro(s) de produção · ' + inv.totalTeste +
      ' de massa de teste removível · ' + inv.totalExpiravel + ' fora do prazo de retenção.' +
      (inv.testeRetidoAuditoria ? '<br>' + inv.testeRetidoAuditoria + ' evento(s) de auditoria referentes a ' +
        'operações de teste permanecem por serem append-only — isso é intencional.' : '') +
      '</p></div></div>';
    cInv.appendChild(UI.tabela({
      colunas: [
        { campo: 'store', rot: 'Coleção' },
        { campo: 'total', rot: 'Total', num: true },
        { campo: 'teste', rot: 'Massa de teste', num: true, fmt: function (v) {
            return v ? '<span class="tag tag--alerta">' + v + '</span>' : '0';
          } },
        { campo: 'expiravel', rot: 'Fora da retenção', num: true },
        { campo: 'imutavel', rot: 'Imutável', fmt: function (v) {
            return v ? '<span class="tag tag--ouro">sim</span>' : '—';
          } },
        { campo: 'removivel', rot: 'Limpeza alcança', fmt: function (v) {
            return v ? 'sim' : '<span class="ajuda">não — append-only</span>';
          } }
      ],
      dados: inv.stores
    }));
    alvo.appendChild(cInv);

    var cAcoes = document.createElement('div');
    cAcoes.className = 'card';
    cAcoes.innerHTML = '<div class="card__cabeca"><div><h3>Backup e restauração</h3>' +
      '<p class="ajuda">O arquivo exportado contém dados de saúde. Trate-o como dado pessoal sensível: ' +
      'guarde criptografado e registre quem teve acesso.</p></div></div>';
    var linha = document.createElement('div');
    linha.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    function botao(rot, classe, fn) {
      var b = document.createElement('button');
      b.className = 'btn ' + (classe || 'btn--linha');
      b.textContent = rot; b.onclick = fn;
      linha.appendChild(b);
      return b;
    }

    botao('Exportar (sem massa de teste)', 'btn--linha', async function () {
      var p = await GNE.Backup.exportar({ semTeste: true });
      U.baixarArquivo('gne-clinical-os_' + U.hoje() + '.json', JSON.stringify(p, null, 1));
      UI.toast('Backup gerado. Guarde com segurança.', 'ok');
    });

    botao('Exportar tudo (com credenciais)', 'btn--linha', async function () {
      var ok = await UI.confirmar('Exportar com credenciais',
        'O arquivo conterá os hashes de senha de todos os usuários. Use apenas para migração de ambiente.', 'Exportar');
      if (!ok) return;
      var p = await GNE.Backup.exportar({ comCredenciais: true });
      U.baixarArquivo('gne-clinical-os_completo_' + U.hoje() + '.json', JSON.stringify(p, null, 1));
    });

    var inpArq = document.createElement('input');
    inpArq.type = 'file'; inpArq.accept = 'application/json'; inpArq.style.display = 'none';
    inpArq.onchange = async function () {
      var arq = inpArq.files[0];
      if (!arq) return;
      var ok = await UI.confirmar('Importar backup',
        'Registros com o mesmo identificador serão sobrescritos. A operação é registrada na auditoria.', 'Importar');
      if (!ok) { inpArq.value = ''; return; }
      try {
        var texto = await arq.text();
        var r = await GNE.Backup.importar(JSON.parse(texto));
        GNE.Dados.invalidar();
        UI.toast(r.importados + ' registro(s) importado(s), ' + r.ignorados + ' ignorado(s).', 'ok', 6000);
        telaDados(alvo);
      } catch (e) { UI.toast('Falha na importação: ' + e.message, 'risco', 7000); }
      inpArq.value = '';
    };
    botao('Importar backup', 'btn--linha', function () { inpArq.click(); });

    botao('Apagar massa de teste', 'btn--risco', async function () {
      var ok = await UI.confirmar('Apagar massa de teste',
        'Remove apenas registros marcados como teste. Dados de produção e a trilha de auditoria permanecem intactos.', 'Apagar');
      if (!ok) return;
      var r = await GNE.Retencao.limparMassaTeste();
      GNE.Dados.invalidar();
      UI.toast(r.total + ' registro(s) de teste removido(s).', 'ok');
      telaDados(alvo);
    });

    cAcoes.appendChild(linha);
    cAcoes.appendChild(inpArq);
    alvo.appendChild(cAcoes);
  }

  /* ===========================================================================
     TESTES & SAÚDE DO SISTEMA
     ======================================================================== */
  UI.registrar('testes', async function (host) {
    host.innerHTML = UI.cabecalho('testes');

    var podeEscrever = Auth.ehSuper();

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card__cabeca"><div><h3>Suíte de autoteste</h3>' +
      '<p class="ajuda">Executa asserções reais contra o banco: permissões, imutabilidade, validações de domínio, ' +
      'cálculo de indicadores, motor de próxima ação, retenção e limpeza. Toda a massa criada é marcada como ' +
      'teste e removida ao final.</p></div></div>';

    var acoes = document.createElement('div');
    acoes.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px';

    var bRodar = document.createElement('button');
    bRodar.className = 'btn btn--ouro';
    bRodar.textContent = 'Rodar suíte completa';
    bRodar.disabled = !podeEscrever;

    var bSeed = document.createElement('button');
    bSeed.className = 'btn btn--linha';
    bSeed.textContent = 'Popular demonstração';
    bSeed.disabled = !podeEscrever;

    var bLimpar = document.createElement('button');
    bLimpar.className = 'btn btn--risco';
    bLimpar.textContent = 'Apagar massa de teste';
    bLimpar.disabled = !podeEscrever;

    acoes.appendChild(bRodar); acoes.appendChild(bSeed); acoes.appendChild(bLimpar);
    card.appendChild(acoes);
    if (!podeEscrever) {
      card.insertAdjacentHTML('beforeend', UI.aviso('Apenas o Super Administrador executa testes que escrevem no banco.', 'alerta'));
    }

    var saida = document.createElement('div');
    card.appendChild(saida);
    host.appendChild(card);

    bRodar.onclick = async function () {
      bRodar.disabled = true; bRodar.textContent = 'Executando…';
      saida.innerHTML = '<div class="vazio">Rodando asserções…</div>';
      var r = await GNE.Testes.rodar();
      bRodar.disabled = false; bRodar.textContent = 'Rodar suíte completa';
      renderResultado(r, saida);
    };

    bSeed.onclick = async function () {
      var ok = await UI.confirmar('Popular demonstração',
        'Cria uma clínica fictícia completa, marcada como massa de teste. Nenhum dado real é tocado, ' +
        'e tudo pode ser removido com um clique.', 'Popular');
      if (!ok) return;
      bSeed.disabled = true; bSeed.textContent = 'Criando…';
      var r = await GNE.Seed.popular();
      bSeed.disabled = false; bSeed.textContent = 'Popular demonstração';
      GNE.Dados.invalidar();
      UI.toast(r.total + ' registro(s) de demonstração criados.', 'ok');
      saida.innerHTML = UI.aviso('<strong>Demonstração criada.</strong> ' + U.esc(JSON.stringify(r.porStore)) +
        '<br>Navegue pelos módulos e depois use "Apagar massa de teste".', 'ok');
    };

    bLimpar.onclick = async function () {
      var ok = await UI.confirmar('Apagar massa de teste',
        'Remove apenas os registros marcados como teste. Nada de produção é afetado.', 'Apagar');
      if (!ok) return;
      var r = await GNE.Retencao.limparMassaTeste();
      GNE.Dados.invalidar();
      saida.innerHTML = UI.aviso('<strong>' + r.total + ' registro(s) removido(s).</strong> ' +
        'A trilha de auditoria dessas operações permanece, por definição.', 'ok');
      UI.toast('Massa de teste apagada.', 'ok');
    };

    /* diagnóstico do ambiente */
    var diag = document.createElement('div');
    diag.className = 'card';
    var temSubtle = !!(global.crypto && global.crypto.subtle);
    diag.innerHTML = '<div class="card__cabeca"><div><h3>Diagnóstico do ambiente</h3></div></div>' +
      '<div class="tab-wrap"><table class="tab"><tbody>' +
      linhaDiag('Persistência', DB.modoMemoria ? 'Memória (volátil)' : 'IndexedDB', !DB.modoMemoria,
        DB.modoMemoria ? 'IndexedDB indisponível — os dados somem ao recarregar. Verifique modo anônimo ou bloqueio de armazenamento.' : 'Dados persistem entre sessões neste navegador.') +
      linhaDiag('Derivação de senha', temSubtle ? 'PBKDF2-SHA256 (WebCrypto)' : 'SHA-256 iterado (fallback)', temSubtle,
        temSubtle ? 'Contexto seguro disponível.' : 'Sem contexto seguro (file://). Sirva por HTTPS para usar PBKDF2.') +
      linhaDiag('Camada de IA', GNE.IA.pronta() ? (GNE.IA.cfg.modo === 'proxy' ? 'Proxy configurado' : 'Chave direta na sessão') : 'Não configurada',
        GNE.IA.pronta() && GNE.IA.cfg.modo === 'proxy',
        GNE.IA.cfg.modo === 'direto' ? 'Modo direto expõe a chave ao navegador. Use apenas em piloto sem dado real.' : 'Chave permanece no servidor.') +
      linhaDiag('Origem', location.protocol, location.protocol === 'https:',
        location.protocol === 'https:' ? 'Transporte cifrado.' : 'Sem HTTPS. Obrigatório antes de qualquer dado de paciente.') +
      '</tbody></table></div>';
    host.appendChild(diag);

    function linhaDiag(nome, valor, ok, nota) {
      return '<tr><td style="width:170px"><strong>' + U.esc(nome) + '</strong></td>' +
        '<td style="width:210px"><span class="tag tag--' + (ok ? 'ok' : 'alerta') + '">' + U.esc(valor) + '</span></td>' +
        '<td><span class="ajuda">' + U.esc(nota) + '</span></td></tr>';
    }
  });

  function renderResultado(r, alvo) {
    var falhas = r.resultados.filter(function (x) { return !x.ok; });
    alvo.innerHTML =
      '<div class="grade grade--4" style="margin-bottom:14px">' +
      '<div class="kpi kpi--' + (falhas.length ? 'risco' : 'ok') + '"><span class="kpi__rot">Resultado</span>' +
        '<span class="kpi__val ' + (falhas.length ? 'risco' : 'ok') + '">' + (falhas.length ? 'FALHOU' : 'PASSOU') + '</span>' +
        '<span class="kpi__nota">' + r.passou + ' de ' + r.total + ' asserções</span></div>' +
      '<div class="kpi kpi--neutro"><span class="kpi__rot">Duração</span><span class="kpi__val">' + r.ms + 'ms</span>' +
        '<span class="kpi__nota">execução completa</span></div>' +
      '<div class="kpi kpi--' + (r.limpeza.total >= 0 ? 'ok' : 'alerta') + '"><span class="kpi__rot">Massa removida</span>' +
        '<span class="kpi__val">' + r.limpeza.total + '</span><span class="kpi__nota">registros de teste apagados</span></div>' +
      '<div class="kpi kpi--' + (r.residuo === 0 ? 'ok' : 'risco') + '"><span class="kpi__rot">Resíduo</span>' +
        '<span class="kpi__val ' + (r.residuo === 0 ? 'ok' : 'risco') + '">' + r.residuo + '</span>' +
        '<span class="kpi__nota">deve ser zero</span></div></div>';

    var grupos = U.agrupar(r.resultados, 'grupo');
    Object.keys(grupos).forEach(function (g) {
      var lista = grupos[g];
      var nFalha = lista.filter(function (x) { return !x.ok; }).length;
      alvo.insertAdjacentHTML('beforeend',
        '<p class="eyebrow" style="margin-top:14px">' + U.esc(g) +
        ' — ' + (lista.length - nFalha) + '/' + lista.length + '</p><div class="filete-curto"></div>');
      var t = UI.tabela({
        colunas: [
          { campo: 'ok', rot: '', largura: '46px', fmt: function (v) {
              return v ? '<span class="tag tag--ok">ok</span>' : '<span class="tag tag--risco">falha</span>';
            } },
          { campo: 'nome', rot: 'Asserção' },
          { campo: 'detalhe', rot: 'Detalhe', fmt: function (v) { return '<span class="ajuda">' + U.esc(v || '') + '</span>'; } }
        ],
        dados: lista
      });
      alvo.appendChild(t);
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
