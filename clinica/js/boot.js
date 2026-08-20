/* =============================================================================
   GNE Clinical OS — inicialização, login e provisionamento
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, UI = GNE.UI, DB = GNE.DB, Auth = GNE.Auth;

  /* Credencial de instalação. Existe apenas até o primeiro acesso: o sistema
     obriga a troca imediata e registra tudo na auditoria. */
  var INSTALACAO = { email: 'adielcarneiro@gmail.com', senha: 'GNE-Clinical-2026!' };

  function el(id) { return document.getElementById(id); }

  async function iniciar() {
    /* tema */
    try {
      var t = localStorage.getItem('gne_tema');
      if (t) document.documentElement.setAttribute('data-tema', t);
      else if (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-tema', 'escuro');
      }
    } catch (e) {}

    await DB.abrir();

    if (DB.modoMemoria) {
      UI.toast('IndexedDB indisponível: os dados não vão persistir ao recarregar. Verifique se o navegador está em modo anônimo.', 'risco', 12000);
    }

    var novo = await Auth.semear(INSTALACAO.email, INSTALACAO.senha);
    if (novo) {
      await GNE.Seed.instalarPadroes();
      el('login-instalacao').innerHTML =
        'Primeira execução. Acesso do Super Administrador: <strong>' + U.esc(novo.email) + '</strong> · ' +
        'senha <strong>' + U.esc(novo.senha) + '</strong>. Você será obrigado a trocá-la agora.';
      el('login-instalacao').hidden = false;
    }
    await GNE.IA.carregarCfg();

    var restaurado = await Auth.restaurar();
    if (restaurado && !restaurado.trocarSenha) return entrarNoApp();

    el('login').hidden = false;
    el('login-email').focus();
  }

  async function tentarLogin(e) {
    if (e) e.preventDefault();
    var erro = el('login-erro');
    erro.textContent = '';
    var btn = el('login-btn');
    btn.disabled = true; btn.textContent = 'Verificando…';

    var r = await Auth.entrar(el('login-email').value, el('login-senha').value);

    btn.disabled = false; btn.textContent = 'Entrar';
    if (!r.ok) { erro.textContent = r.erro; el('login-senha').value = ''; el('login-senha').focus(); return; }
    if (r.trocarSenha) return pedirTrocaSenha(r.usuario);
    entrarNoApp();
  }

  function pedirTrocaSenha(u) {
    var f = UI.form([
      { id: 'nova', rot: 'Nova senha', tipo: 'senha', obrigatorio: true,
        ajuda: 'Mínimo de 10 caracteres. Use algo que só você saiba — esta conta enxerga tudo.' },
      { id: 'conf', rot: 'Repita a nova senha', tipo: 'senha', obrigatorio: true }
    ], {});
    UI.modal({
      titulo: 'Defina sua senha',
      corpo: (function () {
        var d = document.createElement('div');
        d.innerHTML = UI.aviso('Este acesso ainda usa a senha de instalação. Troque agora — a senha antiga deixa de valer.', 'alerta');
        d.appendChild(f.el);
        return d;
      })(),
      acoes: [{
        rot: 'Salvar e entrar', fn: async function () {
          var d = f.ler();
          if (d.nova !== d.conf) throw new Error('As senhas não conferem.');
          if (d.nova === INSTALACAO.senha) throw new Error('Escolha uma senha diferente da senha de instalação.');
          await Auth.trocarSenha(u.id, d.nova, u);
          UI.toast('Senha definida.', 'ok');
          entrarNoApp();
        }
      }],
      aoFechar: function () {
        if (Auth.atual() && Auth.atual().trocarSenha) { Auth.limparSessao(); location.reload(); }
      }
    });
  }

  async function entrarNoApp() {
    el('login').hidden = true;
    el('app').classList.add('ativo');
    UI.montarShell();

    var inicial = 'command';
    try {
      var h = (location.hash || '').replace('#', '');
      if (h && GNE.moduloPorId(h) && Auth.pode(h, 'ver')) inicial = h;
    } catch (e) {}
    if (!Auth.pode(inicial, 'ver')) {
      var primeiro = GNE.MODULOS.filter(function (m) { return Auth.pode(m.id, 'ver'); })[0];
      inicial = primeiro ? primeiro.id : 'command';
    }
    await UI.ir(inicial);
  }

  /* Nenhum erro deve derrubar a aplicação em silêncio. */
  global.addEventListener('error', function (ev) {
    try {
      GNE.Auditoria.registrar({ acao: 'erro_js', modulo: 'sistema',
        detalhe: String(ev.message) + ' @ ' + (ev.filename || '') + ':' + (ev.lineno || '') });
    } catch (e) {}
  });
  global.addEventListener('unhandledrejection', function (ev) {
    try {
      GNE.Auditoria.registrar({ acao: 'promessa_rejeitada', modulo: 'sistema',
        detalhe: String(ev.reason && ev.reason.message || ev.reason).slice(0, 300) });
    } catch (e) {}
  });

  global.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (h && h !== UI.atual && GNE.moduloPorId(h) && Auth.atual()) UI.ir(h);
  });

  document.addEventListener('DOMContentLoaded', function () {
    el('login-form').addEventListener('submit', tentarLogin);
    el('login-marca').innerHTML = UI.simbolo(64);
    iniciar().catch(function (e) {
      el('login').hidden = false;
      el('login-erro').textContent = 'Falha na inicialização: ' + (e.message || e);
    });
  });

  GNE.INSTALACAO = INSTALACAO;

})(typeof window !== 'undefined' ? window : globalThis);
