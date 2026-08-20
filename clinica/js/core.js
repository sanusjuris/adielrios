/* =============================================================================
   GNE Clinical OS — núcleo
   Grupo Nutrindo Emoções · by Adiel Ríos

   Contém: utilitários, catálogos, camada de persistência (IndexedDB com
   fallback em memória), trilha de auditoria imutável, autenticação e RBAC.

   PRINCÍPIO DE AUDITORIA: nenhuma escrita chega ao banco sem passar por
   DB.salvar/DB.remover, e ambos gravam em `auditoria` antes de retornar.
   O store `auditoria` não expõe API de escrita direta nem de remoção.
   ========================================================================== */
(function (global) {
  'use strict';

  var GNE = global.GNE = global.GNE || {};
  GNE.versao = '1.0.0';

  /* ===========================================================================
     1. UTILITÁRIOS
     ======================================================================== */
  var U = GNE.util = {

    uid: function (prefixo) {
      var n = Date.now().toString(36);
      var r = Math.random().toString(36).slice(2, 10);
      var r2 = Math.random().toString(36).slice(2, 6);
      return (prefixo ? prefixo + '_' : '') + n + r + r2;
    },

    /** Escapa HTML. Toda string vinda de dados do usuário passa por aqui. */
    esc: function (s) {
      if (s === null || s === undefined) return '';
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    hoje: function () { return U.dataISO(new Date()); },

    dataISO: function (d) {
      d = (d instanceof Date) ? d : new Date(d);
      if (isNaN(d.getTime())) return '';
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + dd;
    },

    /** Data em pt-BR. Aceita ISO date (YYYY-MM-DD) sem deslocar fuso. */
    dataBR: function (v) {
      if (!v) return '—';
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      if (m) return m[3] + '/' + m[2] + '/' + m[1];
      var d = new Date(v);
      if (isNaN(d.getTime())) return '—';
      return String(d.getDate()).padStart(2, '0') + '/' +
             String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    },

    dataHoraBR: function (v) {
      if (!v) return '—';
      var d = new Date(v);
      if (isNaN(d.getTime())) return '—';
      return U.dataBR(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
             String(d.getMinutes()).padStart(2, '0');
    },

    /** Diferença em dias inteiros entre duas datas (b - a). */
    dias: function (a, b) {
      var da = new Date(a), db = b ? new Date(b) : new Date();
      if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
      return Math.floor((db - da) / 86400000);
    },

    horas: function (a, b) {
      var da = new Date(a), db = b ? new Date(b) : new Date();
      if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
      return (db - da) / 3600000;
    },

    somaDias: function (base, n) {
      var d = new Date(base || Date.now());
      d.setDate(d.getDate() + n);
      return d.toISOString();
    },

    /** Duração legível a partir de minutos: 12 min · 3 h · 5 dias. */
    duracao: function (min) {
      if (min === null || min === undefined || isNaN(min)) return '—';
      min = Math.round(min);
      if (min < 90) return min + ' min';
      var h = Math.round(min / 60);
      if (h < 48) return h + ' h';
      return Math.round(h / 24) + ' dias';
    },

    brl: function (v) {
      var n = Number(v) || 0;
      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    pct: function (parte, total, casas) {
      if (!total) return 0;
      var p = (Number(parte) / Number(total)) * 100;
      return Number(p.toFixed(casas === undefined ? 1 : casas));
    },

    /** Mascara identificadores diretos para exibição (minimização LGPD). */
    mascara: function (s) {
      s = String(s || '').replace(/\D/g, '');
      if (s.length < 5) return '•••';
      return '•••.' + s.slice(-5, -2) + '.' + s.slice(-2) + '-••';
    },

    /** Iniciais do nome, para uso em listagens compactas. */
    iniciais: function (nome) {
      var p = String(nome || '').trim().split(/\s+/);
      if (!p[0]) return '—';
      return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    },

    somaBy: function (lista, campo) {
      return (lista || []).reduce(function (a, x) { return a + (Number(x[campo]) || 0); }, 0);
    },

    media: function (nums) {
      var v = (nums || []).filter(function (n) { return typeof n === 'number' && !isNaN(n); });
      if (!v.length) return null;
      return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    },

    ordenarPor: function (lista, campo, desc) {
      return (lista || []).slice().sort(function (a, b) {
        var x = a[campo], y = b[campo];
        if (x === y) return 0;
        if (x === undefined || x === null) return 1;
        if (y === undefined || y === null) return -1;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      });
    },

    agrupar: function (lista, campo) {
      var m = {};
      (lista || []).forEach(function (x) {
        var k = typeof campo === 'function' ? campo(x) : x[campo];
        k = (k === undefined || k === null || k === '') ? '—' : String(k);
        (m[k] = m[k] || []).push(x);
      });
      return m;
    },

    debounce: function (fn, ms) {
      var t;
      return function () {
        var ctx = this, a = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, a); }, ms || 250);
      };
    },

    baixarArquivo: function (nome, conteudo, mime) {
      var blob = new Blob([conteudo], { type: mime || 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
  };

  /* ===========================================================================
     2. SHA-256 (implementação própria — funciona em file:// onde
        crypto.subtle não está disponível por não ser contexto seguro)
     ======================================================================== */
  var SHA = (function () {
    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }

    /** @param {number[]} bytes  @returns {number[]} 32 bytes de digest */
    function hashBytes(bytes) {
      var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
      var len = bytes.length;
      var msg = bytes.slice();
      msg.push(0x80);
      while (msg.length % 64 !== 56) msg.push(0);
      var bits = len * 8;
      // comprimento em 64 bits big-endian (suporta até 2^53 bits, suficiente aqui)
      var hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
      msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
      msg.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

      var w = new Array(64);
      for (var i = 0; i < msg.length; i += 64) {
        for (var t = 0; t < 16; t++) {
          w[t] = (msg[i + t * 4] << 24) | (msg[i + t * 4 + 1] << 16) |
                 (msg[i + t * 4 + 2] << 8) | msg[i + t * 4 + 3];
        }
        for (t = 16; t < 64; t++) {
          var s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
          var s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
          w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (t = 0; t < 64; t++) {
          var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
          var ch = (e & f) ^ (~e & g);
          var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
          var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
          var mj = (a & b) ^ (a & c) ^ (b & c);
          var t2 = (S0 + mj) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      var out = [];
      for (i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
      return out;
    }

    function utf8Bytes(str) {
      var out = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
          var c2 = str.charCodeAt(++i);
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return out;
    }

    function hex(bytes) {
      return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    return { hashBytes: hashBytes, utf8Bytes: utf8Bytes, hex: hex };
  })();

  GNE.sha256 = function (texto) { return SHA.hex(SHA.hashBytes(SHA.utf8Bytes(String(texto)))); };

  /**
   * Deriva a chave da senha. Usa PBKDF2-SHA256 via WebCrypto quando há
   * contexto seguro; caso contrário, SHA-256 iterado com sal.
   * O algoritmo usado é gravado junto ao hash, para que a verificação
   * funcione mesmo se o app migrar de file:// para https.
   */
  GNE.derivarSenha = async function (senha, sal, algo) {
    var ITER = 120000, ITER_FB = 20000;
    var temSubtle = !!(global.crypto && global.crypto.subtle && global.crypto.subtle.importKey);
    var usar = algo || (temSubtle ? 'pbkdf2-sha256' : 'sha256-iter');

    if (usar === 'pbkdf2-sha256' && temSubtle) {
      try {
        var enc = new TextEncoder();
        var base = await global.crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
        var bits = await global.crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(sal), iterations: ITER, hash: 'SHA-256' }, base, 256);
        return { algo: 'pbkdf2-sha256', hash: SHA.hex(Array.from(new Uint8Array(bits))) };
      } catch (e) { usar = 'sha256-iter'; }
    }
    var h = sal + ' ' + senha;
    for (var i = 0; i < ITER_FB; i++) h = GNE.sha256(h + i);
    return { algo: 'sha256-iter', hash: h };
  };

  GNE.novoSal = function () {
    var a = [];
    for (var i = 0; i < 16; i++) a.push(Math.floor(Math.random() * 256));
    if (global.crypto && global.crypto.getRandomValues) {
      var u = new Uint8Array(16); global.crypto.getRandomValues(u); a = Array.from(u);
    }
    return SHA.hex(a);
  };

  /* ===========================================================================
     3. CATÁLOGOS — módulos, papéis, escalas, processos
     ======================================================================== */

  /** Os 12 sistemas + governança. Ordem = ordem de navegação. */
  GNE.MODULOS = [
    { id: 'command',    nome: 'Command Center',    ico: '◈', grupo: 'Direção',      sistema: 8,  desc: 'KPIs de operação, comercial, financeiro, clínica e experiência.' },
    { id: 'nba',        nome: 'Próxima Ação',      ico: '➜', grupo: 'Direção',      sistema: 0,  desc: 'Motor Next Best Action: o que a clínica precisa fazer, por paciente.' },
    { id: 'crm',        nome: 'CRM',               ico: '◇', grupo: 'Relação',      sistema: 1,  desc: 'Leads B2C e B2B, funil, origem, conversão e reativação.' },
    { id: 'concierge',  nome: 'Concierge',         ico: '✦', grupo: 'Relação',      sistema: 2,  desc: 'Experiência do paciente antes, durante e depois — Customer Success clínico.' },
    { id: 'omni',       nome: 'Omnichannel',       ico: '✉', grupo: 'Relação',      sistema: 11, desc: 'WhatsApp, telefone, e-mail e Instagram num registro único.' },
    { id: 'experiencia',nome: 'Experiência',       ico: '♡', grupo: 'Relação',      sistema: 2,  desc: 'NPS, CSAT, reclamações, tempo de resposta e resolução.' },
    { id: 'agenda',     nome: 'Agenda',            ico: '▤', grupo: 'Assistência',  sistema: 3,  desc: 'Profissionais, salas, confirmação, no-show e lista de espera.' },
    { id: 'pacientes',  nome: 'Patient 360',       ico: '☉', grupo: 'Assistência',  sistema: 4,  desc: 'Visão única do paciente: clínica, relacional, financeira e de risco.' },
    { id: 'prontuario', nome: 'Prontuário',        ico: '✎', grupo: 'Assistência',  sistema: 4,  desc: 'Evoluções, prescrições e documentos — registro append-only.' },
    { id: 'mbc',        nome: 'MBC',               ico: '∿', grupo: 'Assistência',  sistema: 5,  desc: 'Measurement-Based Care: escalas longitudinais e alertas de trajetória.' },
    { id: 'procedimentos', nome: 'Procedimentos',  ico: '⚕', grupo: 'Assistência',  sistema: 6,  desc: 'Cetamina, EMT e infusões: elegibilidade, checklist, sinais e follow-up.' },
    { id: 'financeiro', nome: 'Financeiro',        ico: '$',  grupo: 'Negócio',      sistema: 7,  desc: 'Receita, custo, margem por serviço, inadimplência e projeção.' },
    { id: 'processos',  nome: 'Processos & POPs',  ico: '⇉', grupo: 'Negócio',      sistema: 9,  desc: 'POPs digitais com gatilho, dono, SLA, evidência e escalonamento.' },
    { id: 'qualidade',  nome: 'Qualidade',         ico: '⚖', grupo: 'Negócio',      sistema: 10, desc: 'Consentimentos, incidentes, não conformidades e LGPD.' },
    { id: 'conhecimento', nome: 'Conhecimento',    ico: '📖', grupo: 'Negócio',     sistema: 12, desc: 'Cérebro digital da clínica: protocolos, scripts e treinamento.' },
    { id: 'ia',         nome: 'Camada de IA',      ico: '◐', grupo: 'Governança',   sistema: 0,  desc: 'Agentes especializados, guardrails e conexão com a API Anthropic.' },
    { id: 'admin',      nome: 'Administração',     ico: '⚙', grupo: 'Governança',   sistema: 0,  desc: 'Usuários, permissões, auditoria, retenção e configuração.' },
    { id: 'testes',     nome: 'Testes & Saúde',    ico: '✓', grupo: 'Governança',   sistema: 0,  desc: 'Suíte de autoteste, integridade dos dados e limpeza de massa de teste.' }
  ];

  GNE.moduloPorId = function (id) {
    for (var i = 0; i < GNE.MODULOS.length; i++) if (GNE.MODULOS[i].id === id) return GNE.MODULOS[i];
    return null;
  };

  /** Papéis-modelo. São editáveis em Administração; isto é apenas a semente. */
  GNE.PAPEIS = {
    super_admin: {
      nome: 'Super Administrador',
      desc: 'Acesso total, incluindo auditoria, retenção e gestão de usuários.',
      todos: true
    },
    gestor: {
      nome: 'Gestão / Diretoria',
      desc: 'Vê tudo, edita gestão e negócio. Não escreve em prontuário.',
      perm: {
        command:['ver'], nba:['ver'], crm:['ver','editar'], concierge:['ver','editar'], omni:['ver'],
        experiencia:['ver','editar'], agenda:['ver','editar'], pacientes:['ver'], prontuario:[],
        mbc:['ver'], procedimentos:['ver'], financeiro:['ver','editar'], processos:['ver','editar'],
        qualidade:['ver','editar'], conhecimento:['ver','editar'], ia:['ver'], admin:[], testes:['ver']
      }
    },
    medico: {
      nome: 'Médico(a)',
      desc: 'Responsável pela decisão clínica. Escreve prontuário e prescrição.',
      perm: {
        command:['ver'], nba:['ver','editar'], crm:[], concierge:['ver'], omni:['ver','editar'],
        experiencia:[], agenda:['ver','editar'], pacientes:['ver','editar'], prontuario:['ver','editar'],
        mbc:['ver','editar'], procedimentos:['ver','editar'], financeiro:[], processos:['ver'],
        qualidade:['ver','editar'], conhecimento:['ver'], ia:['ver'], admin:[], testes:[]
      }
    },
    psicologo: {
      nome: 'Psicólogo(a)',
      desc: 'Registro psicoterápico e escalas. Sem prescrição.',
      perm: {
        command:[], nba:['ver','editar'], crm:[], concierge:['ver'], omni:['ver','editar'],
        experiencia:[], agenda:['ver','editar'], pacientes:['ver','editar'], prontuario:['ver','editar'],
        mbc:['ver','editar'], procedimentos:['ver'], financeiro:[], processos:['ver'],
        qualidade:['ver'], conhecimento:['ver'], ia:['ver'], admin:[], testes:[]
      }
    },
    enfermagem: {
      nome: 'Enfermagem',
      desc: 'Conduz procedimentos, sinais vitais e checklists assistenciais.',
      perm: {
        command:[], nba:['ver','editar'], crm:[], concierge:['ver'], omni:['ver'],
        experiencia:[], agenda:['ver','editar'], pacientes:['ver'], prontuario:['ver','editar'],
        mbc:['ver','editar'], procedimentos:['ver','editar'], financeiro:[], processos:['ver'],
        qualidade:['ver','editar'], conhecimento:['ver'], ia:['ver'], admin:[], testes:[]
      }
    },
    concierge: {
      nome: 'Concierge',
      desc: 'Customer Success clínico. Não acessa prontuário nem interpreta sintoma.',
      perm: {
        command:[], nba:['ver','editar'], crm:['ver','editar'], concierge:['ver','editar'],
        omni:['ver','editar'], experiencia:['ver','editar'], agenda:['ver','editar'],
        pacientes:['ver'], prontuario:[], mbc:[], procedimentos:['ver'], financeiro:[],
        processos:['ver','editar'], qualidade:['ver'], conhecimento:['ver'], ia:['ver'], admin:[], testes:[]
      }
    },
    comercial: {
      nome: 'Comercial / B2B',
      desc: 'Funil, parcerias, empresas e campanhas. Sem dado clínico.',
      perm: {
        command:['ver'], nba:[], crm:['ver','editar'], concierge:[], omni:['ver','editar'],
        experiencia:['ver'], agenda:['ver'], pacientes:[], prontuario:[], mbc:[], procedimentos:[],
        financeiro:['ver'], processos:['ver'], qualidade:[], conhecimento:['ver'], ia:['ver'], admin:[], testes:[]
      }
    },
    financeiro: {
      nome: 'Financeiro',
      desc: 'Cobrança, conciliação, margem e inadimplência. Sem dado clínico.',
      perm: {
        command:['ver'], nba:[], crm:['ver'], concierge:[], omni:[], experiencia:[],
        agenda:['ver'], pacientes:[], prontuario:[], mbc:[], procedimentos:[],
        financeiro:['ver','editar'], processos:['ver'], qualidade:['ver'], conhecimento:['ver'],
        ia:['ver'], admin:[], testes:[]
      }
    },
    qualidade: {
      nome: 'Qualidade & Compliance',
      desc: 'POPs, incidentes, LGPD e auditoria assistida.',
      perm: {
        command:['ver'], nba:[], crm:[], concierge:[], omni:[], experiencia:['ver'],
        agenda:['ver'], pacientes:['ver'], prontuario:['ver'], mbc:['ver'], procedimentos:['ver'],
        financeiro:[], processos:['ver','editar'], qualidade:['ver','editar'],
        conhecimento:['ver','editar'], ia:['ver'], admin:[], testes:['ver']
      }
    }
  };

  /** Escalas MBC. `alerta` define a regra de sinalização por corte. */
  GNE.ESCALAS = {
    'PHQ-9':  { nome: 'PHQ-9 — Depressão', min: 0, max: 27, pior: 'alto', cortes: [{ ate: 4, rot: 'Mínima' }, { ate: 9, rot: 'Leve' }, { ate: 14, rot: 'Moderada' }, { ate: 19, rot: 'Mod. grave' }, { ate: 27, rot: 'Grave' }], alertaAcima: 15 },
    'GAD-7':  { nome: 'GAD-7 — Ansiedade', min: 0, max: 21, pior: 'alto', cortes: [{ ate: 4, rot: 'Mínima' }, { ate: 9, rot: 'Leve' }, { ate: 14, rot: 'Moderada' }, { ate: 21, rot: 'Grave' }], alertaAcima: 15 },
    'WHODAS': { nome: 'WHODAS 2.0 — Funcionalidade', min: 0, max: 100, pior: 'alto', cortes: [{ ate: 20, rot: 'Preservada' }, { ate: 40, rot: 'Leve' }, { ate: 60, rot: 'Moderada' }, { ate: 100, rot: 'Grave' }], alertaAcima: 55 },
    'PSQI':   { nome: 'PSQI — Qualidade do sono', min: 0, max: 21, pior: 'alto', cortes: [{ ate: 5, rot: 'Boa' }, { ate: 10, rot: 'Ruim' }, { ate: 21, rot: 'Muito ruim' }], alertaAcima: 10 },
    'WHO-5':  { nome: 'WHO-5 — Bem-estar', min: 0, max: 100, pior: 'baixo', cortes: [{ ate: 28, rot: 'Muito baixo' }, { ate: 50, rot: 'Baixo' }, { ate: 100, rot: 'Adequado' }], alertaAbaixo: 29 },
    'CGI-S':  { nome: 'CGI-S — Gravidade global', min: 1, max: 7, pior: 'alto', cortes: [{ ate: 2, rot: 'Normal/limítrofe' }, { ate: 4, rot: 'Leve a moderado' }, { ate: 5, rot: 'Acentuado' }, { ate: 7, rot: 'Grave' }], alertaAcima: 5 },
    'C-SSRS': { nome: 'C-SSRS — Triagem de risco', min: 0, max: 5, pior: 'alto', cortes: [{ ate: 0, rot: 'Sem ideação' }, { ate: 2, rot: 'Ideação sem plano' }, { ate: 5, rot: 'Ideação com plano/intenção' }], alertaAcima: 0, critica: true }
  };

  GNE.CANAIS = ['WhatsApp', 'Instagram', 'TikTok', 'LinkedIn', 'Indicação médica', 'Indicação paciente', 'Site', 'Empresa (B2B)', 'Telefone', 'Presencial'];
  GNE.ESTAGIOS_CRM = ['Novo contato', 'Qualificado', 'Consulta apresentada', 'Agendada', 'Compareceu', 'Proposta terapêutica', 'Em tratamento', 'Inativo', 'Perdido'];
  GNE.TIPOS_PROC = ['Cetamina EV', 'Cetamina IN', 'EMT', 'Infusão', 'Neuromodulação', 'Outro'];
  GNE.STATUS_AGENDA = ['Agendado', 'Confirmado', 'Compareceu', 'Faltou', 'Cancelado', 'Reagendado'];

  /* ===========================================================================
     4. PERSISTÊNCIA
     ======================================================================== */
  var STORES = {
    usuarios:      { chave: 'id', indices: ['email'] },
    auditoria:     { chave: 'id', indices: ['ts', 'usuarioId', 'modulo'] },
    pacientes:     { chave: 'id', indices: ['nome', 'status'] },
    leads:         { chave: 'id', indices: ['estagio', 'canal', 'pacienteId'] },
    interacoes:    { chave: 'id', indices: ['pacienteId', 'ts'] },
    agenda:        { chave: 'id', indices: ['pacienteId', 'inicio', 'status'] },
    prontuario:    { chave: 'id', indices: ['pacienteId', 'ts'] },
    mbc:           { chave: 'id', indices: ['pacienteId', 'escala', 'ts'] },
    procedimentos: { chave: 'id', indices: ['pacienteId', 'tipo', 'ts'] },
    financeiro:    { chave: 'id', indices: ['pacienteId', 'status', 'venc'] },
    tarefas:       { chave: 'id', indices: ['responsavel', 'status', 'prazo'] },
    experiencia:   { chave: 'id', indices: ['pacienteId', 'tipo', 'ts'] },
    qualidade:     { chave: 'id', indices: ['tipo', 'status'] },
    conhecimento:  { chave: 'id', indices: ['categoria'] },
    processos:     { chave: 'id', indices: ['area'] },
    config:        { chave: 'chave' }
  };
  GNE.STORES = STORES;

  /** Stores que jamais aceitam remoção pela interface. */
  var IMUTAVEIS = { auditoria: true, prontuario: true };
  GNE.IMUTAVEIS = IMUTAVEIS;

  var DB = GNE.DB = {
    nome: 'gne_clinical_os',
    versao: 1,
    _db: null,
    _mem: null,          // fallback em memória quando IndexedDB indisponível
    modoMemoria: false,

    abrir: function () {
      var self = this;
      if (self._db || self.modoMemoria) return Promise.resolve(self);
      return new Promise(function (resolve) {
        if (!global.indexedDB) { self._iniciarMemoria(); return resolve(self); }
        var req;
        try { req = global.indexedDB.open(self.nome, self.versao); }
        catch (e) { self._iniciarMemoria(); return resolve(self); }

        req.onupgradeneeded = function (ev) {
          var db = ev.target.result;
          Object.keys(STORES).forEach(function (s) {
            if (db.objectStoreNames.contains(s)) return;
            var os = db.createObjectStore(s, { keyPath: STORES[s].chave });
            (STORES[s].indices || []).forEach(function (ix) {
              try { os.createIndex(ix, ix, { unique: false }); } catch (e) {}
            });
          });
        };
        req.onsuccess = function (ev) { self._db = ev.target.result; resolve(self); };
        req.onerror = function () { self._iniciarMemoria(); resolve(self); };
        req.onblocked = function () { self._iniciarMemoria(); resolve(self); };
      });
    },

    _iniciarMemoria: function () {
      this.modoMemoria = true;
      this._mem = {};
      Object.keys(STORES).forEach(function (s) { this._mem[s] = {}; }, this);
    },

    _tx: function (store, modo) {
      return this._db.transaction(store, modo).objectStore(store);
    },

    /** Lista bruta de um store. Não filtra permissão — quem chama decide. */
    listar: function (store) {
      var self = this;
      if (!STORES[store]) return Promise.reject(new Error('Store inexistente: ' + store));
      if (self.modoMemoria) {
        return Promise.resolve(Object.keys(self._mem[store]).map(function (k) { return self._mem[store][k]; }));
      }
      return new Promise(function (resolve, reject) {
        var r = self._tx(store, 'readonly').getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    },

    obter: function (store, id) {
      var self = this;
      if (!STORES[store]) return Promise.reject(new Error('Store inexistente: ' + store));
      if (self.modoMemoria) return Promise.resolve(self._mem[store][id] || null);
      return new Promise(function (resolve, reject) {
        var r = self._tx(store, 'readonly').get(id);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    },

    /** Escrita crua, sem auditoria. Uso interno e da própria trilha. */
    _por: function (store, obj) {
      var self = this;
      if (!STORES[store]) return Promise.reject(new Error('Store inexistente: ' + store));
      if (self.modoMemoria) { self._mem[store][obj[STORES[store].chave]] = obj; return Promise.resolve(obj); }
      return new Promise(function (resolve, reject) {
        var r = self._tx(store, 'readwrite').put(obj);
        r.onsuccess = function () { resolve(obj); };
        r.onerror = function () { reject(r.error); };
      });
    },

    _apagar: function (store, id) {
      var self = this;
      if (self.modoMemoria) { delete self._mem[store][id]; return Promise.resolve(true); }
      return new Promise(function (resolve, reject) {
        var r = self._tx(store, 'readwrite').delete(id);
        r.onsuccess = function () { resolve(true); };
        r.onerror = function () { reject(r.error); };
      });
    },

    /**
     * Escrita auditada. É o único caminho de gravação da aplicação.
     * @param {string} store
     * @param {object} obj
     * @param {{acao?:string, semAuditoria?:boolean, ator?:object}} [op]
     */
    salvar: async function (store, obj, op) {
      op = op || {};
      if (!STORES[store]) throw new Error('Store inexistente: ' + store);
      var chave = STORES[store].chave;
      if (!obj[chave]) obj[chave] = U.uid(store.slice(0, 3));

      var antes = await this.obter(store, obj[chave]);
      var novo = !antes;

      if (!novo && IMUTAVEIS[store] && store === 'prontuario' && antes.assinado) {
        throw new Error('Registro de prontuário assinado não pode ser alterado. Crie uma adenda.');
      }

      var agora = new Date().toISOString();
      if (novo) { obj.criadoEm = obj.criadoEm || agora; }
      obj.atualizadoEm = agora;
      var ator = op.ator || (GNE.Auth && GNE.Auth.atual());
      if (ator) { if (novo && !obj.criadoPor) obj.criadoPor = ator.email; obj.atualizadoPor = ator.email; }

      await this._por(store, obj);

      if (!op.semAuditoria && store !== 'auditoria') {
        await Auditoria.registrar({
          acao: op.acao || (novo ? 'criar' : 'atualizar'),
          modulo: store,
          entidadeId: obj[chave],
          rotulo: obj.nome || obj.titulo || obj.chave || obj[chave],
          antes: novo ? null : Auditoria.resumir(antes),
          depois: Auditoria.resumir(obj),
          testData: !!obj.testData,
          ator: ator
        });
      }
      return obj;
    },

    /** Remoção auditada. Bloqueada em stores imutáveis. */
    remover: async function (store, id, op) {
      op = op || {};
      if (!STORES[store]) throw new Error('Store inexistente: ' + store);
      if (IMUTAVEIS[store] && !op.forcarRetencao) {
        throw new Error('O store "' + store + '" é imutável e não admite exclusão.');
      }
      var antes = await this.obter(store, id);
      if (!antes) return false;
      await this._apagar(store, id);
      if (!op.semAuditoria) {
        await Auditoria.registrar({
          acao: op.acao || 'excluir',
          modulo: store,
          entidadeId: id,
          rotulo: antes.nome || antes.titulo || id,
          antes: Auditoria.resumir(antes),
          depois: null,
          testData: !!antes.testData,
          ator: op.ator
        });
      }
      return true;
    },

    cfg: async function (chave, valorPadrao) {
      var r = await this.obter('config', chave);
      return r ? r.valor : valorPadrao;
    },

    setCfg: async function (chave, valor, op) {
      return this.salvar('config', { chave: chave, valor: valor }, op || { acao: 'configurar' });
    },

    /** Apaga tudo. Só é chamado pelo Super Admin com dupla confirmação. */
    zerar: async function () {
      var self = this;
      var stores = Object.keys(STORES);
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        if (self.modoMemoria) { self._mem[s] = {}; continue; }
        await new Promise(function (resolve, reject) {
          var r = self._tx(s, 'readwrite').clear();
          r.onsuccess = function () { resolve(); };
          r.onerror = function () { reject(r.error); };
        });
      }
      return true;
    }
  };

  /* ===========================================================================
     5. AUDITORIA — append-only
     ======================================================================== */
  var Auditoria = GNE.Auditoria = {

    /** Reduz um objeto ao que é auditável, sem carregar conteúdo clínico livre. */
    resumir: function (obj) {
      if (!obj || typeof obj !== 'object') return null;
      var out = {};
      Object.keys(obj).forEach(function (k) {
        var v = obj[k];
        if (k === 'senhaHash' || k === 'sal') { out[k] = '«redigido»'; return; }
        if (typeof v === 'string' && v.length > 160) { out[k] = v.slice(0, 157) + '…'; return; }
        if (v && typeof v === 'object') { out[k] = Array.isArray(v) ? '«' + v.length + ' itens»' : '«objeto»'; return; }
        out[k] = v;
      });
      return out;
    },

    registrar: async function (ev) {
      var ator = ev.ator || (GNE.Auth && GNE.Auth.atual()) || null;
      var reg = {
        id: U.uid('aud'),
        ts: new Date().toISOString(),
        usuarioId: ator ? ator.id : 'sistema',
        usuarioEmail: ator ? ator.email : 'sistema',
        usuarioPapel: ator ? ator.papel : '—',
        acao: ev.acao || 'evento',
        modulo: ev.modulo || '—',
        entidadeId: ev.entidadeId || null,
        rotulo: ev.rotulo || null,
        antes: ev.antes || null,
        depois: ev.depois || null,
        detalhe: ev.detalhe || null,
        testData: !!ev.testData
      };
      await DB._por('auditoria', reg);
      return reg;
    },

    /** Eventos de sessão/segurança, sem entidade associada. */
    evento: function (acao, detalhe, modulo) {
      return Auditoria.registrar({ acao: acao, detalhe: detalhe, modulo: modulo || 'sessao' });
    },

    listar: async function (filtro) {
      filtro = filtro || {};
      var todos = await DB.listar('auditoria');
      var r = todos;
      if (filtro.usuarioId) r = r.filter(function (a) { return a.usuarioId === filtro.usuarioId; });
      if (filtro.modulo) r = r.filter(function (a) { return a.modulo === filtro.modulo; });
      if (filtro.acao) r = r.filter(function (a) { return a.acao === filtro.acao; });
      if (filtro.desde) r = r.filter(function (a) { return a.ts >= filtro.desde; });
      if (filtro.busca) {
        var q = String(filtro.busca).toLowerCase();
        r = r.filter(function (a) {
          return JSON.stringify([a.usuarioEmail, a.acao, a.modulo, a.rotulo, a.detalhe]).toLowerCase().indexOf(q) >= 0;
        });
      }
      return U.ordenarPor(r, 'ts', true);
    }
  };

  /* ===========================================================================
     6. AUTENTICAÇÃO E RBAC
     ======================================================================== */
  var SESSAO_KEY = 'gne_sessao';

  var Auth = GNE.Auth = {
    _usuario: null,
    MAX_TENTATIVAS: 5,
    JANELA_BLOQUEIO_MIN: 10,

    atual: function () { return Auth._usuario; },

    /** Garante que existe um Super Admin. Retorna a credencial se recém-criada. */
    semear: async function (email, senha) {
      var us = await DB.listar('usuarios');
      if (us.length) return null;
      var sal = GNE.novoSal();
      var d = await GNE.derivarSenha(senha, sal);
      var u = {
        id: U.uid('usr'),
        email: String(email).toLowerCase().trim(),
        nome: 'Super Administrador',
        papel: 'super_admin',
        permissoes: null,        // null = herda do papel
        sal: sal, senhaHash: d.hash, algo: d.algo,
        ativo: true,
        trocarSenha: true,
        tentativas: 0,
        bloqueadoAte: null,
        criadoEm: new Date().toISOString(),
        criadoPor: 'instalação'
      };
      await DB._por('usuarios', u);
      await Auditoria.registrar({
        acao: 'provisionar', modulo: 'usuarios', entidadeId: u.id, rotulo: u.email,
        detalhe: 'Super Administrador criado na instalação inicial.',
        ator: { id: 'sistema', email: 'sistema', papel: 'sistema' }
      });
      return { email: u.email, senha: senha };
    },

    entrar: async function (email, senha) {
      email = String(email || '').toLowerCase().trim();
      var us = await DB.listar('usuarios');
      var u = us.filter(function (x) { return x.email === email; })[0];

      if (!u) {
        await Auditoria.evento('login_falha', 'E-mail não cadastrado: ' + email);
        return { ok: false, erro: 'E-mail ou senha inválidos.' };
      }
      if (!u.ativo) {
        await Auditoria.evento('login_bloqueado', 'Usuário inativo: ' + email);
        return { ok: false, erro: 'Usuário inativo. Procure o Super Administrador.' };
      }
      if (u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date()) {
        var min = Math.ceil(U.horas(new Date(), u.bloqueadoAte) * 60);
        return { ok: false, erro: 'Acesso bloqueado por tentativas. Tente em ' + min + ' min.' };
      }

      var d = await GNE.derivarSenha(senha, u.sal, u.algo);
      if (d.hash !== u.senhaHash) {
        u.tentativas = (u.tentativas || 0) + 1;
        if (u.tentativas >= Auth.MAX_TENTATIVAS) {
          u.bloqueadoAte = U.somaDias(new Date(), 0);
          u.bloqueadoAte = new Date(Date.now() + Auth.JANELA_BLOQUEIO_MIN * 60000).toISOString();
          u.tentativas = 0;
        }
        await DB._por('usuarios', u);
        await Auditoria.evento('login_falha', 'Senha incorreta para ' + email +
          (u.bloqueadoAte ? ' — conta bloqueada temporariamente.' : ''));
        return { ok: false, erro: 'E-mail ou senha inválidos.' };
      }

      u.tentativas = 0; u.bloqueadoAte = null; u.ultimoLogin = new Date().toISOString();
      await DB._por('usuarios', u);
      Auth._usuario = u;
      try { sessionStorage.setItem(SESSAO_KEY, JSON.stringify({ id: u.id, ts: Date.now() })); } catch (e) {}
      await Auditoria.evento('login', 'Sessão iniciada por ' + email + '.');
      return { ok: true, usuario: u, trocarSenha: !!u.trocarSenha };
    },

    /** Restaura sessão da aba. Expira em 12 h. */
    restaurar: async function () {
      var raw;
      try { raw = sessionStorage.getItem(SESSAO_KEY); } catch (e) { return null; }
      if (!raw) return null;
      try {
        var s = JSON.parse(raw);
        if (!s || !s.id || (Date.now() - s.ts) > 12 * 3600000) { Auth.limparSessao(); return null; }
        var u = await DB.obter('usuarios', s.id);
        if (!u || !u.ativo) { Auth.limparSessao(); return null; }
        Auth._usuario = u;
        return u;
      } catch (e) { return null; }
    },

    limparSessao: function () {
      Auth._usuario = null;
      try { sessionStorage.removeItem(SESSAO_KEY); } catch (e) {}
    },

    sair: async function () {
      if (Auth._usuario) await Auditoria.evento('logout', 'Sessão encerrada por ' + Auth._usuario.email + '.');
      Auth.limparSessao();
    },

    trocarSenha: async function (usuarioId, senhaNova, atorForcado) {
      if (String(senhaNova || '').length < 10) throw new Error('A senha precisa de ao menos 10 caracteres.');
      var u = await DB.obter('usuarios', usuarioId);
      if (!u) throw new Error('Usuário não encontrado.');
      var sal = GNE.novoSal();
      var d = await GNE.derivarSenha(senhaNova, sal);
      u.sal = sal; u.senhaHash = d.hash; u.algo = d.algo; u.trocarSenha = false;
      u.tentativas = 0; u.bloqueadoAte = null;
      await DB._por('usuarios', u);
      await Auditoria.registrar({
        acao: 'trocar_senha', modulo: 'usuarios', entidadeId: u.id, rotulo: u.email,
        detalhe: 'Credencial redefinida.', ator: atorForcado || Auth.atual()
      });
      if (Auth._usuario && Auth._usuario.id === u.id) Auth._usuario = u;
      return true;
    },

    criar: async function (dados) {
      var email = String(dados.email || '').toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw new Error('E-mail inválido.');
      if (String(dados.senha || '').length < 10) throw new Error('A senha precisa de ao menos 10 caracteres.');
      if (!dados.nome || !String(dados.nome).trim()) throw new Error('Informe o nome do usuário.');
      if (!GNE.PAPEIS[dados.papel]) throw new Error('Papel inválido.');

      var us = await DB.listar('usuarios');
      if (us.some(function (x) { return x.email === email; })) throw new Error('Já existe usuário com este e-mail.');

      var sal = GNE.novoSal();
      var d = await GNE.derivarSenha(dados.senha, sal);
      var u = {
        id: U.uid('usr'), email: email, nome: String(dados.nome).trim(), papel: dados.papel,
        permissoes: dados.permissoes || null,
        sal: sal, senhaHash: d.hash, algo: d.algo,
        ativo: true, trocarSenha: dados.trocarSenha !== false,
        tentativas: 0, bloqueadoAte: null, testData: !!dados.testData
      };
      await DB.salvar('usuarios', u, { acao: 'criar_usuario' });
      return u;
    },

    /* ---------------- RBAC ---------------- */

    /** Matriz efetiva do usuário: override individual, senão o papel. */
    matriz: function (usuario) {
      var u = usuario || Auth._usuario;
      if (!u) return {};
      var papel = GNE.PAPEIS[u.papel];
      if (papel && papel.todos) {
        var m = {};
        GNE.MODULOS.forEach(function (mod) { m[mod.id] = ['ver', 'editar', 'excluir']; });
        return m;
      }
      var base = (papel && papel.perm) ? papel.perm : {};
      var over = u.permissoes || {};
      var out = {};
      GNE.MODULOS.forEach(function (mod) {
        out[mod.id] = over[mod.id] !== undefined ? over[mod.id] : (base[mod.id] || []);
      });
      return out;
    },

    pode: function (moduloId, acao, usuario) {
      var u = usuario || Auth._usuario;
      if (!u) return false;
      var m = Auth.matriz(u)[moduloId] || [];
      if (acao === 'ver') return m.length > 0;
      return m.indexOf(acao) >= 0;
    },

    ehSuper: function (usuario) {
      var u = usuario || Auth._usuario;
      return !!(u && u.papel === 'super_admin');
    },

    /** Lança se não puder — usado antes de qualquer escrita sensível. */
    exigir: function (moduloId, acao) {
      if (!Auth.pode(moduloId, acao)) {
        var mod = GNE.moduloPorId(moduloId);
        throw new Error('Sem permissão para ' + acao + ' em ' + (mod ? mod.nome : moduloId) + '.');
      }
      return true;
    }
  };

  /* ===========================================================================
     7. RETENÇÃO
     ======================================================================== */
  GNE.Retencao = {
    ANOS_PADRAO: 20,

    /** Só é elegível a expurgo o que ultrapassou a retenção configurada. */
    elegivel: function (registro, anos) {
      var base = registro.criadoEm || registro.ts;
      if (!base) return false;
      var d = U.dias(base);
      return d !== null && d > (anos || 20) * 365.25;
    },

    /**
     * Remove exclusivamente registros marcados testData:true.
     * Nunca toca em dado de produção — a marcação é a única porta.
     */
    limparMassaTeste: async function () {
      var resumo = { total: 0, porStore: {} };
      var stores = Object.keys(STORES).filter(function (s) { return s !== 'auditoria' && s !== 'config'; });
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var itens = await DB.listar(s);
        var alvo = itens.filter(function (x) { return x.testData === true; });
        for (var j = 0; j < alvo.length; j++) {
          await DB._apagar(s, alvo[j][STORES[s].chave]);
        }
        if (alvo.length) { resumo.porStore[s] = alvo.length; resumo.total += alvo.length; }
      }
      await Auditoria.registrar({
        acao: 'limpar_massa_teste', modulo: 'admin',
        detalhe: 'Removidos ' + resumo.total + ' registros marcados como massa de teste. ' +
                 'Dados de produção e trilha de auditoria preservados.'
      });
      return resumo;
    },

    /**
     * Diagnóstico: quanto existe, quanto é massa de teste removível, quanto
     * está fora da retenção.
     *
     * `totalTeste` conta apenas o que a limpeza consegue remover. Eventos de
     * auditoria gerados por operações de teste ficam marcados como teste mas
     * NÃO são removíveis — a trilha é append-only por definição. Eles são
     * reportados à parte, em `testeRetidoAuditoria`, para que o número de
     * "massa de teste" nunca prometa uma remoção que não vai acontecer.
     */
    inventario: async function () {
      var anos = await DB.cfg('retencao_anos', GNE.Retencao.ANOS_PADRAO);
      var out = { anos: anos, stores: [], totalTeste: 0, totalProducao: 0,
                  totalExpiravel: 0, testeRetidoAuditoria: 0 };
      var stores = Object.keys(STORES);
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var removivel = (s !== 'auditoria' && s !== 'config');
        var itens = await DB.listar(s);
        var teste = itens.filter(function (x) { return x.testData === true; }).length;
        var venc = itens.filter(function (x) { return GNE.Retencao.elegivel(x, anos); }).length;
        out.stores.push({
          store: s, total: itens.length, teste: teste, expiravel: venc,
          imutavel: !!IMUTAVEIS[s], removivel: removivel
        });
        if (removivel) { out.totalTeste += teste; out.totalProducao += (itens.length - teste); }
        else { out.testeRetidoAuditoria += teste; out.totalProducao += itens.length; }
        out.totalExpiravel += venc;
      }
      return out;
    }
  };

  /* ===========================================================================
     8. EXPORTAÇÃO / IMPORTAÇÃO
     ======================================================================== */
  GNE.Backup = {
    exportar: async function (opts) {
      opts = opts || {};
      var pacote = { app: 'GNE Clinical OS', versao: GNE.versao, geradoEm: new Date().toISOString(), dados: {} };
      var stores = Object.keys(STORES);
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var itens = await DB.listar(s);
        if (opts.semTeste) itens = itens.filter(function (x) { return !x.testData; });
        if (s === 'usuarios') {
          itens = itens.map(function (u) {
            var c = Object.assign({}, u);
            if (!opts.comCredenciais) { delete c.senhaHash; delete c.sal; }
            return c;
          });
        }
        pacote.dados[s] = itens;
      }
      await Auditoria.registrar({
        acao: 'exportar', modulo: 'admin',
        detalhe: 'Backup gerado' + (opts.semTeste ? ' (sem massa de teste)' : '') +
                 (opts.comCredenciais ? ' COM credenciais' : ' sem credenciais') + '.'
      });
      return pacote;
    },

    importar: async function (pacote, opts) {
      opts = opts || {};
      if (!pacote || !pacote.dados) throw new Error('Arquivo de backup inválido.');
      var resumo = { importados: 0, ignorados: 0 };
      var stores = Object.keys(pacote.dados);
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        if (!STORES[s]) { resumo.ignorados += (pacote.dados[s] || []).length; continue; }
        var itens = pacote.dados[s] || [];
        for (var j = 0; j < itens.length; j++) {
          var it = itens[j];
          if (s === 'usuarios' && !it.senhaHash && !opts.permitirUsuarioSemSenha) { resumo.ignorados++; continue; }
          await DB._por(s, it);
          resumo.importados++;
        }
      }
      await Auditoria.registrar({
        acao: 'importar', modulo: 'admin',
        detalhe: 'Importados ' + resumo.importados + ' registros; ' + resumo.ignorados + ' ignorados.'
      });
      return resumo;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
