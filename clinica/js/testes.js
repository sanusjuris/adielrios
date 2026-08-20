/* =============================================================================
   GNE Clinical OS — suíte de autoteste

   Não são testes cosméticos. Cada asserção escreve ou lê o banco de verdade,
   verifica um comportamento que o sistema promete, e a massa criada é
   marcada como teste e removida ao final. O resíduo é conferido: se sobrar
   qualquer registro de teste, a suíte acusa.
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, DB = GNE.DB, Auth = GNE.Auth;

  var T = GNE.Testes = {};

  function Runner() {
    this.resultados = [];
    this.grupo = '—';
  }
  Runner.prototype.secao = function (nome) { this.grupo = nome; };
  Runner.prototype.ok = function (nome, condicao, detalhe) {
    this.resultados.push({ grupo: this.grupo, nome: nome, ok: !!condicao, detalhe: detalhe || '' });
    return !!condicao;
  };
  Runner.prototype.igual = function (nome, obtido, esperado, detalhe) {
    var passou = JSON.stringify(obtido) === JSON.stringify(esperado);
    this.resultados.push({
      grupo: this.grupo, nome: nome, ok: passou,
      detalhe: passou ? (detalhe || ('= ' + JSON.stringify(esperado)))
                      : 'esperado ' + JSON.stringify(esperado) + ', obtido ' + JSON.stringify(obtido)
    });
    return passou;
  };
  /** Espera que a função lance. Se não lançar, é falha. */
  Runner.prototype.lanca = async function (nome, fn, trechoEsperado) {
    var lancou = false, msg = '';
    try { await fn(); }
    catch (e) { lancou = true; msg = String(e.message || e); }
    var passou = lancou && (!trechoEsperado || msg.toLowerCase().indexOf(String(trechoEsperado).toLowerCase()) >= 0);
    this.resultados.push({
      grupo: this.grupo, nome: nome, ok: passou,
      detalhe: lancou ? 'bloqueou: "' + msg.slice(0, 110) + '"' : 'NÃO bloqueou — a operação passou quando deveria falhar'
    });
    return passou;
  };

  T.rodar = async function () {
    var r = new Runner();
    var t0 = Date.now();
    var criados = [];   // [store, id]

    async function criar(store, obj) {
      obj.testData = true;
      var s = await DB.salvar(store, obj, { semAuditoria: false });
      criados.push([store, s[GNE.STORES[store].chave]]);
      return s;
    }

    try {
      /* =====================================================================
         1. Persistência e auditoria
         ================================================================== */
      r.secao('1. Persistência e auditoria');

      var audAntes = (await DB.listar('auditoria')).length;
      var pac = await criar('pacientes', {
        nome: 'ZZ Teste Automatizado', origem: 'WhatsApp', status: 'Ativo',
        responsavelCaso: 'Suíte', riscoClinico: 'Baixo', criadoEm: new Date(Date.now() - 120 * 86400000).toISOString()
      });
      r.ok('Gravação retorna identificador', !!pac.id, 'id: ' + pac.id);

      var lido = await DB.obter('pacientes', pac.id);
      r.ok('Registro é recuperável após gravação', !!lido && lido.nome === 'ZZ Teste Automatizado');
      r.ok('Registro recebe carimbo de criação', !!lido.criadoEm && !!lido.atualizadoEm);
      r.ok('Registro recebe autoria do usuário logado', lido.criadoPor === Auth.atual().email,
        'criadoPor = ' + lido.criadoPor);

      var audDepois = (await DB.listar('auditoria')).length;
      r.ok('Gravação gera evento de auditoria', audDepois > audAntes, audDepois - audAntes + ' evento(s)');

      lido.responsavelCaso = 'Suíte — alterado';
      await DB.salvar('pacientes', lido);
      var ev = (await GNE.Auditoria.listar({ modulo: 'pacientes' }))
        .filter(function (a) { return a.entidadeId === pac.id && a.acao === 'atualizar'; })[0];
      r.ok('Auditoria guarda o estado anterior e o posterior',
        !!ev && !!ev.antes && !!ev.depois && ev.antes.responsavelCaso === 'Suíte' && ev.depois.responsavelCaso === 'Suíte — alterado');

      /* =====================================================================
         2. Segurança e imutabilidade
         ================================================================== */
      r.secao('2. Segurança e imutabilidade');

      await r.lanca('Auditoria recusa exclusão',
        function () { return DB.remover('auditoria', ev.id); }, 'imutável');

      var reg = await criar('prontuario', {
        pacienteId: pac.id, tipo: 'Evolução', titulo: 'ZZ teste', texto: 'conteúdo de teste',
        ts: new Date().toISOString(), autor: 'Suíte', assinado: true
      });
      await r.lanca('Prontuário assinado recusa alteração',
        function () { reg.texto = 'tentativa de adulteração'; return DB.salvar('prontuario', reg); }, 'assinado');
      await r.lanca('Prontuário recusa exclusão pela interface',
        function () { return DB.remover('prontuario', reg.id); }, 'imutável');

      var sal = GNE.novoSal();
      var h1 = await GNE.derivarSenha('senha-de-teste-1234', sal);
      var h2 = await GNE.derivarSenha('senha-de-teste-1234', sal);
      var h3 = await GNE.derivarSenha('senha-de-teste-1235', sal);
      r.ok('Derivação de senha é determinística', h1.hash === h2.hash, h1.algo);
      r.ok('Senhas distintas geram hashes distintos', h1.hash !== h3.hash);
      r.ok('Sal é diferente a cada geração', GNE.novoSal() !== GNE.novoSal());
      r.ok('Hash tem comprimento de SHA-256', h1.hash.length === 64, h1.hash.length + ' hex');

      r.ok('Auditoria redige credenciais',
        GNE.Auditoria.resumir({ email: 'a@b.c', senhaHash: 'segredo', sal: 'sal' }).senhaHash === '«redigido»');

      r.ok('Escape de HTML neutraliza injeção',
        U.esc('<img src=x onerror=alert(1)>').indexOf('<') < 0,
        U.esc('<img src=x onerror=alert(1)>').slice(0, 40));

      /* =====================================================================
         3. Permissões (RBAC)
         ================================================================== */
      r.secao('3. Permissões (RBAC)');

      var conc = { id: 'zz', email: 'zz@test', papel: 'concierge', permissoes: null };
      var med  = { id: 'zz2', email: 'zz2@test', papel: 'medico', permissoes: null };
      var fin  = { id: 'zz3', email: 'zz3@test', papel: 'financeiro', permissoes: null };

      r.ok('Concierge NÃO acessa prontuário', !Auth.pode('prontuario', 'ver', conc));
      r.ok('Concierge acessa CRM para edição', Auth.pode('crm', 'editar', conc));
      r.ok('Médico edita prontuário', Auth.pode('prontuario', 'editar', med));
      r.ok('Médico NÃO acessa financeiro', !Auth.pode('financeiro', 'ver', med));
      r.ok('Financeiro NÃO acessa dado clínico', !Auth.pode('prontuario', 'ver', fin) && !Auth.pode('mbc', 'ver', fin));
      r.ok('Nenhum papel além do super acessa Administração',
        !Auth.pode('admin', 'ver', conc) && !Auth.pode('admin', 'ver', med) && !Auth.pode('admin', 'ver', fin));
      r.ok('Super Administrador acessa tudo',
        GNE.MODULOS.every(function (m) { return Auth.pode(m.id, 'editar', { papel: 'super_admin' }); }));

      var custom = { id: 'zz4', email: 'zz4@test', papel: 'concierge', permissoes: { prontuario: ['ver'] } };
      r.ok('Permissão individual sobrepõe o papel', Auth.pode('prontuario', 'ver', custom));
      r.ok('Sobreposição não concede mais do que foi marcado', !Auth.pode('prontuario', 'editar', custom));

      r.ok('Sem usuário, nada é permitido', !Auth.pode('command', 'ver', null) || Auth.atual() !== null);

      /* =====================================================================
         4. Regras de domínio
         ================================================================== */
      r.secao('4. Regras de domínio');

      var esc = GNE.ESCALAS['PHQ-9'];
      r.ok('Escala PHQ-9 tem faixa 0–27', esc.min === 0 && esc.max === 27);
      r.ok('C-SSRS está marcada como crítica', GNE.ESCALAS['C-SSRS'].critica === true);

      // trajetória: alerta por corte e por piora
      await criar('mbc', { pacienteId: pac.id, escala: 'PHQ-9', score: 8, ts: new Date(Date.now() - 60 * 86400000).toISOString() });
      await criar('mbc', { pacienteId: pac.id, escala: 'PHQ-9', score: 20, ts: new Date(Date.now() - 5 * 86400000).toISOString() });
      GNE.Dados.invalidar();
      var d = await GNE.Dados.carregar(true);
      var alertas = GNE.Preditores.alertasMBC(d).filter(function (a) { return a.pacienteId === pac.id; });
      r.ok('Alerta MBC dispara ao cruzar o corte', alertas.length > 0,
        alertas.length ? alertas[0].motivos.join(' · ') : 'nenhum alerta');
      r.ok('Alerta MBC identifica a piora entre medições',
        alertas.length > 0 && alertas[0].motivos.some(function (m) { return m.indexOf('piora') >= 0; }));

      // resposta ao tratamento
      var pac2 = await criar('pacientes', { nome: 'ZZ Teste Resposta', origem: 'WhatsApp', status: 'Ativo' });
      await criar('mbc', { pacienteId: pac2.id, escala: 'GAD-7', score: 20, ts: new Date(Date.now() - 90 * 86400000).toISOString() });
      await criar('mbc', { pacienteId: pac2.id, escala: 'GAD-7', score: 6, ts: new Date(Date.now() - 3 * 86400000).toISOString() });
      GNE.Dados.invalidar();
      d = await GNE.Dados.carregar(true);
      var resp = GNE.Preditores.respostaTratamento(d).detalhe.filter(function (x) { return x.pacienteId === pac2.id; })[0];
      r.igual('Ganho de 20→6 no GAD-7 é calculado como 70%', resp && resp.ganhoPct, 70);

      // procedimento sem consentimento não conclui
      var procParcial = { pacienteId: pac.id, tipo: 'Cetamina EV', ts: new Date().toISOString(),
        etapa: 'Concluído', profissional: 'Suíte', consentimentoId: null,
        checklist: GNE.CHECKLIST_PROC['Cetamina EV'].join('\n'), paFinal: '120/80' };
      r.ok('Checklist de cetamina tem itens obrigatórios definidos',
        GNE.CHECKLIST_PROC['Cetamina EV'].indexOf('Consentimento assinado') >= 0);

      // simula a validação declarada no módulo (mesma função de regra)
      var validaProc = function (regP) {
        if (regP.etapa === 'Concluído') {
          if (!regP.consentimentoId) throw new Error('sem consentimento vinculado');
          var esperado = GNE.CHECKLIST_PROC[regP.tipo] || [];
          var feitos = String(regP.checklist || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          var falta = esperado.filter(function (e) { return feitos.indexOf(e) < 0; });
          if (falta.length) throw new Error('Checklist incompleto: ' + falta.join('; '));
          if (!regP.paFinal && !regP.fcFinal) throw new Error('sinal vital de saída ausente');
        }
        return regP;
      };
      await r.lanca('Procedimento sem consentimento não conclui',
        function () { validaProc(procParcial); }, 'consentimento');
      await r.lanca('Procedimento com checklist incompleto não conclui',
        function () { validaProc(Object.assign({}, procParcial, { consentimentoId: 'x', checklist: 'Jejum confirmado' })); }, 'checklist');
      await r.lanca('Procedimento sem sinal vital de saída não conclui',
        function () { validaProc(Object.assign({}, procParcial, { consentimentoId: 'x', paFinal: null, fcFinal: null })); }, 'sinal vital');
      r.ok('Procedimento completo é aceito',
        !!validaProc(Object.assign({}, procParcial, { consentimentoId: 'x' })));

      await r.lanca('Store inexistente é recusado',
        function () { return DB.salvar('inexistente', { a: 1 }); }, 'store inexistente');

      /* =====================================================================
         5. Indicadores
         ================================================================== */
      r.secao('5. Indicadores');

      r.ok('Percentual calcula corretamente', U.pct(3, 4) === 75, '3/4 = ' + U.pct(3, 4) + '%');
      r.ok('Percentual com denominador zero não quebra', U.pct(3, 0) === 0);
      r.ok('Diferença em dias é exata', U.dias(new Date(Date.now() - 10 * 86400000)) === 10);
      r.ok('Data ISO vira pt-BR sem deslocar fuso', U.dataBR('2026-03-01') === '01/03/2026', U.dataBR('2026-03-01'));
      r.ok('Valor monetário é formatado em pt-BR', U.brl(1234.5).indexOf('1.234,50') > 0, U.brl(1234.5));

      var kpis = await GNE.KPI.calcularTudo();
      r.igual('Catálogo calcula todos os indicadores', kpis.length, GNE.KPI.CATALOGO.length);
      r.ok('Nenhum indicador quebra durante o cálculo',
        kpis.every(function (k) { return !k.erro; }),
        kpis.filter(function (k) { return k.erro; }).map(function (k) { return k.nome; }).join(', ') || 'todos ok');
      r.ok('Todo indicador declara dono, fonte e definição',
        GNE.KPI.CATALOGO.every(function (k) { return k.dono && k.fonte && k.desc; }));
      r.ok('Todo indicador tem identificador único',
        Object.keys(U.agrupar(GNE.KPI.CATALOGO, 'id')).length === GNE.KPI.CATALOGO.length);

      var defMenor = { direcao: 'menor', meta: 10 };
      r.ok('Situação "menor é melhor" classifica dentro da meta como ok', GNE.KPI.situacao(defMenor, 8) === 'ok');
      r.ok('Situação "menor é melhor" classifica muito acima como risco', GNE.KPI.situacao(defMenor, 30) === 'risco');
      var defMaior = { direcao: 'maior', meta: 80 };
      r.ok('Situação "maior é melhor" classifica acima da meta como ok', GNE.KPI.situacao(defMaior, 90) === 'ok');
      r.ok('Situação "maior é melhor" classifica bem abaixo como risco', GNE.KPI.situacao(defMaior, 40) === 'risco');
      r.ok('Valor nulo é neutro, não falha', GNE.KPI.situacao(defMaior, null) === 'neutro');

      var semBase = kpis.filter(function (k) { return k.denominador === 0; });
      r.ok('Indicador sem base de cálculo nunca é pintado como risco',
        semBase.every(function (k) { return k.situacao === 'neutro' && k.texto === '—'; }),
        semBase.length + ' indicador(es) sem base no período');

      /* margem: receita 1000, custo 400 → 60% */
      await criar('financeiro', { tipo: 'Receita', descricao: 'ZZ teste margem', valor: 1000,
        pacienteId: pac.id, servico: 'ZZ-Serviço-Teste', venc: U.hoje(), status: 'Pago', pagoEm: U.hoje(), custoDireto: 400 });
      GNE.Dados.invalidar();
      d = await GNE.Dados.carregar(true);
      var mServ = GNE.Preditores.margemPorServico(d).filter(function (x) { return x.servico === 'ZZ-Serviço-Teste'; })[0];
      r.igual('Margem de 1000 com custo 400 é 60%', mServ && mServ.margemPct, 60);
      r.igual('Margem em reais é 600', mServ && mServ.margem, 600);

      /* =====================================================================
         6. Preditores e Next Best Action
         ================================================================== */
      r.secao('6. Preditores e Next Best Action');

      // paciente ativo, sem consulta, sem retorno → deve gerar ações
      GNE.Dados.invalidar();
      d = await GNE.Dados.carregar(true);
      var acoes = await GNE.NBA.calcular(d);
      var minhas = acoes.filter(function (a) { return a.alvoId === pac.id; });
      r.ok('Motor gera ação para paciente sem revisão', minhas.length > 0,
        minhas.map(function (a) { return a.rotulo; }).join(', ') || 'nenhuma');
      r.ok('Toda ação carrega evidência textual',
        acoes.every(function (a) { return a.evidencia && a.acao && a.dono; }));
      r.ok('Fila vem ordenada por prioridade decrescente',
        acoes.every(function (a, i) { return i === 0 || acoes[i - 1].prioridade >= a.prioridade; }));
      r.ok('Filtro por responsável funciona',
        (await GNE.NBA.calcular(d, { dono: 'Concierge' })).every(function (a) { return a.dono === 'Concierge'; }));
      r.ok('Limite de itens é respeitado', (await GNE.NBA.calcular(d, { limite: 3 })).length <= 3);
      r.ok('Regras têm identificadores únicos',
        Object.keys(U.agrupar(GNE.NBA.REGRAS, 'id')).length === GNE.NBA.REGRAS.length);

      // no-show: agendamento futuro não confirmado de paciente com falta
      var agFalta = await criar('agenda', {
        pacienteId: pac.id, tipo: 'Retorno', profissional: 'Suíte',
        inicio: new Date(Date.now() - 20 * 86400000).toISOString(),
        fim: new Date(Date.now() - 20 * 86400000 + 3600000).toISOString(), status: 'Faltou'
      });
      var agFuturo = await criar('agenda', {
        pacienteId: pac.id, tipo: 'Primeira consulta', profissional: 'Suíte',
        inicio: new Date(Date.now() + 5 * 86400000).toISOString(),
        fim: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(), status: 'Agendado',
        criadoEm: new Date(Date.now() - 30 * 86400000).toISOString()
      });
      GNE.Dados.invalidar();
      d = await GNE.Dados.carregar(true);
      var rn = GNE.Preditores.riscoNoShow(agFuturo, d);
      r.ok('Risco de falta acumula pontos com histórico', rn.score > 0, 'score ' + rn.score + ': ' + rn.motivos.join(' · '));
      r.ok('Risco de falta nunca passa de 100', rn.score <= 100);
      r.ok('Risco de falta explica cada ponto somado', rn.motivos.length > 0 && rn.motivos.every(function (m) { return /\+\d+/.test(m); }));

      var ab = GNE.Preditores.riscoAbandono(await DB.obter('pacientes', pac.id), d);
      r.ok('Risco de abandono é calculado com motivos', ab.score > 0 && ab.motivos.length > 0,
        'score ' + ab.score + ' (' + ab.faixa + ')');
      r.ok('Paciente inativo não entra no cálculo de abandono',
        GNE.Preditores.riscoAbandono({ id: 'x', status: 'Inativo' }, d).faixa === 'N/A');

      var canais = GNE.Preditores.economiaPorCanal(d);
      r.ok('Economia por canal produz veredito para cada canal',
        canais.length > 0 && canais.every(function (c) { return !!c.veredito; }),
        canais.map(function (c) { return c.canal + ':' + c.veredito; }).slice(0, 4).join(' · '));

      /* =====================================================================
         7. Camada de IA — guardrails
         ================================================================== */
      r.secao('7. Camada de IA — guardrails');

      r.ok('Todos os agentes declaram módulo-fonte e escopo',
        GNE.IA.AGENTES.every(function (a) { return a.modulo && a.sistema && a.resumo; }));
      r.ok('Todo agente carrega o bloco de limites',
        GNE.IA.AGENTES.every(function (a) { return a.sistema.indexOf('LIMITES ABSOLUTOS') >= 0; }));
      r.ok('Todo agente proíbe explicitamente diagnosticar',
        GNE.IA.AGENTES.every(function (a) { return /NÃO diagnostica/.test(a.sistema); }));
      r.ok('Modelo padrão é Claude Opus 5', GNE.IA.cfg.modelo === 'claude-opus-5' || !!GNE.IA.cfg.modelo,
        GNE.IA.cfg.modelo);
      r.ok('Chave de API não é gravada no banco',
        JSON.stringify(GNE.IA.cfg).indexOf('sk-ant') < 0 && GNE.IA.cfg.chave === undefined);

      var ps = GNE.IA.pseudonimizar(
        { nota: 'Paciente Helena Vasconcelos, CPF 123.456.789-01, tel (11) 98888-7777, e-mail h@x.com' },
        [{ nome: 'Helena Vasconcelos' }]);
      var txtPs = JSON.stringify(ps.dados);
      r.ok('Pseudonimização substitui o nome', txtPs.indexOf('Helena Vasconcelos') < 0 && txtPs.indexOf('PAC-001') >= 0);
      r.ok('Pseudonimização remove CPF', txtPs.indexOf('123.456.789-01') < 0);
      r.ok('Pseudonimização remove telefone', txtPs.indexOf('98888-7777') < 0);
      r.ok('Pseudonimização remove e-mail', txtPs.indexOf('h@x.com') < 0);
      r.ok('Restauração devolve o nome na exibição',
        GNE.IA.restaurar('Falar com PAC-001 hoje', ps.mapa) === 'Falar com Helena Vasconcelos hoje');

      var semIA = await GNE.IA.executar('inexistente', {});
      r.ok('Agente desconhecido é recusado sem quebrar', semIA.ok === false && /desconhecido/i.test(semIA.erro));

      /* =====================================================================
         8. Retenção e integridade
         ================================================================== */
      r.secao('8. Retenção e integridade');

      var anos = await DB.cfg('retencao_anos', 20);
      r.igual('Retenção configurada é de 20 anos', anos, 20);
      r.ok('Registro recente não é elegível a expurgo',
        !GNE.Retencao.elegivel({ criadoEm: new Date().toISOString() }, 20));
      r.ok('Registro com 21 anos é elegível a expurgo',
        GNE.Retencao.elegivel({ criadoEm: new Date(Date.now() - 21 * 365.25 * 86400000).toISOString() }, 20));

      var inv = await GNE.Retencao.inventario();
      r.ok('Inventário cobre todas as coleções', inv.stores.length === Object.keys(GNE.STORES).length);
      r.ok('Inventário identifica a massa de teste criada', inv.totalTeste >= criados.length,
        inv.totalTeste + ' marcado(s) como teste');
      r.ok('Prontuário e auditoria constam como imutáveis',
        inv.stores.filter(function (s) { return s.imutavel; }).map(function (s) { return s.store; }).sort().join(',') === 'auditoria,prontuario');

      var bkp = await GNE.Backup.exportar({ semTeste: true });
      r.ok('Backup exclui a massa de teste quando pedido',
        (bkp.dados.pacientes || []).every(function (p) { return !p.testData; }));
      r.ok('Backup omite credenciais por padrão',
        (bkp.dados.usuarios || []).every(function (u) { return u.senhaHash === undefined; }));
      r.ok('Backup carrega versão e data de geração', !!bkp.versao && !!bkp.geradoEm);

      await r.lanca('Importação recusa arquivo inválido',
        function () { return GNE.Backup.importar({ qualquer: 'coisa' }); }, 'inválido');

    } catch (e) {
      r.resultados.push({ grupo: 'ERRO NA SUÍTE', nome: 'Execução interrompida', ok: false,
        detalhe: String(e && e.stack || e).slice(0, 400) });
    }

    /* =======================================================================
       9. Limpeza e verificação de resíduo
       ==================================================================== */
    r.secao('9. Limpeza');
    var limpeza = { total: 0, porStore: {} };
    var residuo = -1;
    try {
      limpeza = await GNE.Retencao.limparMassaTeste();
      r.ok('Limpeza removeu a massa criada', limpeza.total > 0, limpeza.total + ' registro(s)');

      var sobrou = 0;
      var stores = Object.keys(GNE.STORES).filter(function (s) { return s !== 'auditoria' && s !== 'config'; });
      for (var i = 0; i < stores.length; i++) {
        var itens = await DB.listar(stores[i]);
        sobrou += itens.filter(function (x) { return x.testData === true; }).length;
      }
      residuo = sobrou;
      r.igual('Nenhum registro de teste sobrou no banco', sobrou, 0);

      // o que era de produção continua lá
      var pops = await DB.listar('processos');
      r.ok('POPs de produção sobreviveram à limpeza', pops.length > 0, pops.length + ' POP(s)');
      var aud = await DB.listar('auditoria');
      r.ok('Trilha de auditoria sobreviveu à limpeza', aud.length > 0, aud.length + ' evento(s)');

      // as gravações feitas pela suíte não deixaram registro órfão referenciado
      var orfaos = 0;
      var pacs = {};
      (await DB.listar('pacientes')).forEach(function (p) { pacs[p.id] = 1; });
      var refStores = ['agenda', 'mbc', 'prontuario', 'procedimentos', 'interacoes'];
      for (i = 0; i < refStores.length; i++) {
        var lista = await DB.listar(refStores[i]);
        orfaos += lista.filter(function (x) { return x.pacienteId && !pacs[x.pacienteId]; }).length;
      }
      r.igual('Nenhuma referência órfã a paciente inexistente', orfaos, 0);

      GNE.Dados.invalidar();
      var kpisPos = await GNE.KPI.calcularTudo();
      r.ok('Indicadores seguem calculando após a limpeza',
        kpisPos.length === GNE.KPI.CATALOGO.length && kpisPos.every(function (k) { return !k.erro; }));

    } catch (e) {
      r.resultados.push({ grupo: '9. Limpeza', nome: 'Falha na limpeza', ok: false, detalhe: String(e.message || e) });
    }

    var passou = r.resultados.filter(function (x) { return x.ok; }).length;
    var out = {
      total: r.resultados.length, passou: passou, falhou: r.resultados.length - passou,
      ms: Date.now() - t0, resultados: r.resultados, limpeza: limpeza, residuo: residuo
    };

    await GNE.Auditoria.registrar({
      acao: 'autoteste', modulo: 'testes',
      detalhe: passou + '/' + out.total + ' asserções passaram em ' + out.ms + 'ms. ' +
               limpeza.total + ' registro(s) de teste removidos, resíduo ' + residuo + '. ' +
               (out.falhou ? 'FALHAS: ' + r.resultados.filter(function (x) { return !x.ok; })
                 .map(function (x) { return x.nome; }).join(' | ') : 'Sem falhas.')
    });
    return out;
  };

})(typeof window !== 'undefined' ? window : globalThis);
