/* =============================================================================
   GNE Clinical OS — indicadores, preditores e Next Best Action

   Regra de ouro deste arquivo: TUDO aqui é determinístico e auditável.
   Nenhum score depende de LLM. O modelo de linguagem entra depois, apenas
   para narrar, priorizar redação e explicar — nunca para produzir o número.
   Isso mantém a decisão rastreável e compatível com a Res. CFM 2.454/2026.
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, DB = GNE.DB;

  /* ===========================================================================
     SNAPSHOT — uma leitura, muitos cálculos
     ======================================================================== */
  var Dados = GNE.Dados = {
    _cache: null,
    _ts: 0,

    invalidar: function () { Dados._cache = null; },

    carregar: async function (forcar) {
      if (!forcar && Dados._cache && (Date.now() - Dados._ts) < 1500) return Dados._cache;
      var stores = ['pacientes', 'leads', 'interacoes', 'agenda', 'prontuario', 'mbc',
                    'procedimentos', 'financeiro', 'tarefas', 'experiencia', 'qualidade',
                    'conhecimento', 'processos', 'usuarios'];
      var d = {};
      for (var i = 0; i < stores.length; i++) d[stores[i]] = await DB.listar(stores[i]);
      d.cfg = {
        salas: await DB.cfg('salas', ['Consultório 1', 'Consultório 2', 'Sala de Procedimentos']),
        horasUteisDia: await DB.cfg('horas_uteis_dia', 10),
        metas: await DB.cfg('metas', {}),
        custos: await DB.cfg('custos_servico', {}),
        despesasFixasMes: await DB.cfg('despesas_fixas_mes', 0),
        slaPrimeiroContatoMin: await DB.cfg('sla_primeiro_contato_min', 15),
        slaRespostaMin: await DB.cfg('sla_resposta_min', 30),
        diasSemContatoAlerta: await DB.cfg('dias_sem_contato_alerta', 45),
        diasSemRevisaoAlerta: await DB.cfg('dias_sem_revisao_alerta', 60)
      };
      Dados._cache = d; Dados._ts = Date.now();
      return d;
    }
  };

  /* --------------------------- auxiliares de recorte --------------------- */
  function ehHoje(iso) { return iso && U.dataISO(iso) === U.hoje(); }
  function noMes(iso, ref) {
    if (!iso) return false;
    var d = new Date(iso), r = ref ? new Date(ref) : new Date();
    return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth();
  }
  function ultimosDias(iso, n) {
    var d = U.dias(iso);
    return d !== null && d >= 0 && d <= n;
  }
  GNE._recorte = { ehHoje: ehHoje, noMes: noMes, ultimosDias: ultimosDias };

  /* ===========================================================================
     DICIONÁRIO DE INDICADORES
     Cada entrada declara: o que mede, como calcula, quem é o dono, qual a
     direção desejada e a meta. `calc` recebe o snapshot e devolve
     { valor, texto, nota, denominador }.
     ======================================================================== */
  var KPI = GNE.KPI = {};

  KPI.CATALOGO = [

    /* ------------------------------ OPERAÇÃO ---------------------------- */
    { id:'op_pacientes_dia', bloco:'Operação', nome:'Pacientes hoje', dono:'Coordenação', unidade:'n',
      direcao:'neutro', fonte:'agenda',
      desc:'Agendamentos com início na data de hoje, excluindo cancelados.',
      calc:function(d){ var v=d.agenda.filter(function(a){return ehHoje(a.inicio)&&a.status!=='Cancelado';}).length;
        return {valor:v,texto:String(v)}; } },

    { id:'op_confirmacao', bloco:'Operação', nome:'Taxa de confirmação', dono:'Concierge', unidade:'%',
      direcao:'maior', meta:85, fonte:'agenda',
      desc:'Confirmados ÷ agendados para os próximos 3 dias. Mede a disciplina de confirmação ativa.',
      calc:function(d){
        var jan=d.agenda.filter(function(a){var dd=U.dias(new Date(),a.inicio);return dd!==null&&dd>=0&&dd<=3&&a.status!=='Cancelado';});
        var c=jan.filter(function(a){return a.status==='Confirmado'||a.status==='Compareceu';}).length;
        return {valor:U.pct(c,jan.length),texto:U.pct(c,jan.length)+'%',nota:c+' de '+jan.length,denominador:jan.length}; } },

    { id:'op_noshow', bloco:'Operação', nome:'No-show (30d)', dono:'Concierge', unidade:'%',
      direcao:'menor', meta:8, fonte:'agenda',
      desc:'Faltas ÷ (comparecimentos + faltas) nos últimos 30 dias. Cancelamento avisado não conta como falta.',
      calc:function(d){
        var j=d.agenda.filter(function(a){return ultimosDias(a.inicio,30)&&(a.status==='Compareceu'||a.status==='Faltou');});
        var f=j.filter(function(a){return a.status==='Faltou';}).length;
        return {valor:U.pct(f,j.length),texto:U.pct(f,j.length)+'%',nota:f+' faltas em '+j.length,denominador:j.length}; } },

    { id:'op_cancelamento', bloco:'Operação', nome:'Cancelamentos (30d)', dono:'Coordenação', unidade:'%',
      direcao:'menor', meta:12, fonte:'agenda',
      desc:'Cancelados ÷ total agendado no período. Alto índice pode indicar falha na qualificação ou no preço.',
      calc:function(d){
        var j=d.agenda.filter(function(a){return ultimosDias(a.inicio,30);});
        var c=j.filter(function(a){return a.status==='Cancelado';}).length;
        return {valor:U.pct(c,j.length),texto:U.pct(c,j.length)+'%',nota:c+' de '+j.length,denominador:j.length}; } },

    { id:'op_ocupacao', bloco:'Operação', nome:'Ocupação de salas (7d)', dono:'Coordenação', unidade:'%',
      direcao:'maior', meta:70, fonte:'agenda + configuração',
      desc:'Horas ocupadas ÷ horas disponíveis (salas × horas úteis × 7). Capacidade ociosa é margem perdida.',
      calc:function(d){
        var salas=(d.cfg.salas||[]).length||1, hd=d.cfg.horasUteisDia||10;
        var disp=salas*hd*7;
        var oc=d.agenda.filter(function(a){return ultimosDias(a.inicio,7)&&a.status!=='Cancelado';})
          .reduce(function(s,a){var h=U.horas(a.inicio,a.fim);return s+(h&&h>0&&h<12?h:1);},0);
        return {valor:U.pct(oc,disp),texto:U.pct(oc,disp)+'%',nota:Math.round(oc)+'h de '+disp+'h',denominador:disp}; } },

    { id:'op_pendencias', bloco:'Operação', nome:'Pendências críticas', dono:'Coordenação', unidade:'n',
      direcao:'menor', meta:0, fonte:'tarefas',
      desc:'Tarefas em aberto, marcadas como críticas ou com prazo vencido.',
      calc:function(d){
        var v=d.tarefas.filter(function(t){
          if(t.status==='Concluída') return false;
          return t.critica===true || (t.prazo && new Date(t.prazo)<new Date());
        }).length;
        return {valor:v,texto:String(v)}; } },

    { id:'op_procedimentos_hoje', bloco:'Operação', nome:'Procedimentos hoje', dono:'Enfermagem', unidade:'n',
      direcao:'neutro', fonte:'procedimentos',
      desc:'Sessões de cetamina, EMT, infusão ou neuromodulação agendadas para hoje.',
      calc:function(d){ var v=d.procedimentos.filter(function(p){return ehHoje(p.ts)&&p.etapa!=='Cancelado';}).length;
        return {valor:v,texto:String(v)}; } },

    /* ------------------------------ COMERCIAL --------------------------- */
    { id:'cm_leads_novos', bloco:'Comercial', nome:'Leads novos (30d)', dono:'Comercial', unidade:'n',
      direcao:'maior', fonte:'CRM',
      desc:'Leads criados nos últimos 30 dias, em todos os canais.',
      calc:function(d){ var v=d.leads.filter(function(l){return ultimosDias(l.criadoEm,30);}).length;
        return {valor:v,texto:String(v)}; } },

    { id:'cm_tempo_1o_contato', bloco:'Comercial', nome:'Tempo até 1º contato', dono:'Concierge', unidade:'min',
      direcao:'menor', meta:15, fonte:'CRM',
      desc:'Mediana entre a chegada do lead e o primeiro contato registrado. É o indicador que mais move conversão em high ticket.',
      calc:function(d){
        var v=d.leads.filter(function(l){return l.primeiroContatoEm&&ultimosDias(l.criadoEm,30);})
          .map(function(l){return U.horas(l.criadoEm,l.primeiroContatoEm)*60;})
          .filter(function(x){return x!==null&&x>=0;}).sort(function(a,b){return a-b;});
        if(!v.length) return {valor:null,texto:'—',nota:'sem leads contactados no período'};
        var med=v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;
        return {valor:Math.round(med),texto:Math.round(med)+' min',nota:'mediana de '+v.length+' leads',denominador:v.length}; } },

    { id:'cm_sla_1o_contato', bloco:'Comercial', nome:'SLA de 1º contato cumprido', dono:'Concierge', unidade:'%',
      direcao:'maior', meta:90, fonte:'CRM + configuração',
      desc:'Percentual de leads contactados dentro do SLA definido em Administração.',
      calc:function(d){
        var sla=d.cfg.slaPrimeiroContatoMin||15;
        var j=d.leads.filter(function(l){return ultimosDias(l.criadoEm,30);});
        var ok=j.filter(function(l){ if(!l.primeiroContatoEm) return false;
          var m=U.horas(l.criadoEm,l.primeiroContatoEm)*60; return m!==null&&m<=sla;}).length;
        return {valor:U.pct(ok,j.length),texto:U.pct(ok,j.length)+'%',nota:ok+' de '+j.length+' em até '+sla+' min',denominador:j.length}; } },

    { id:'cm_conversao', bloco:'Comercial', nome:'Conversão lead → tratamento', dono:'Comercial', unidade:'%',
      direcao:'maior', meta:25, fonte:'CRM',
      desc:'Leads que chegaram a "Em tratamento" ÷ leads criados nos últimos 90 dias.',
      calc:function(d){
        var j=d.leads.filter(function(l){return ultimosDias(l.criadoEm,90);});
        var c=j.filter(function(l){return l.estagio==='Em tratamento';}).length;
        return {valor:U.pct(c,j.length),texto:U.pct(c,j.length)+'%',nota:c+' de '+j.length,denominador:j.length}; } },

    { id:'cm_comparecimento_1a', bloco:'Comercial', nome:'Comparecimento à 1ª consulta', dono:'Concierge', unidade:'%',
      direcao:'maior', meta:88, fonte:'agenda',
      desc:'Primeiras consultas com comparecimento ÷ primeiras consultas realizadas ou faltadas (90d).',
      calc:function(d){
        var j=d.agenda.filter(function(a){return a.tipo==='Primeira consulta'&&ultimosDias(a.inicio,90)&&(a.status==='Compareceu'||a.status==='Faltou');});
        var c=j.filter(function(a){return a.status==='Compareceu';}).length;
        return {valor:U.pct(c,j.length),texto:U.pct(c,j.length)+'%',nota:c+' de '+j.length,denominador:j.length}; } },

    { id:'cm_followups_atrasados', bloco:'Comercial', nome:'Follow-ups atrasados', dono:'Comercial', unidade:'n',
      direcao:'menor', meta:0, fonte:'CRM',
      desc:'Leads ativos sem interação há mais de 7 dias e ainda não perdidos.',
      calc:function(d){
        var v=d.leads.filter(function(l){
          if(l.estagio==='Em tratamento'||l.estagio==='Perdido') return false;
          var base=l.ultimoContatoEm||l.criadoEm;
          var dd=U.dias(base); return dd!==null&&dd>7;
        }).length;
        return {valor:v,texto:String(v)}; } },

    /* ------------------------------ FINANCEIRO -------------------------- */
    { id:'fi_receita_mes', bloco:'Financeiro', nome:'Receita do mês (realizada)', dono:'Financeiro', unidade:'R$',
      direcao:'maior', fonte:'financeiro',
      desc:'Lançamentos de receita com status "Pago" no mês corrente.',
      calc:function(d){
        var v=U.somaBy(d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status==='Pago'&&noMes(f.pagoEm||f.venc);}),'valor');
        return {valor:v,texto:U.brl(v)}; } },

    { id:'fi_receita_prevista', bloco:'Financeiro', nome:'Receita prevista (mês)', dono:'Financeiro', unidade:'R$',
      direcao:'maior', fonte:'financeiro',
      desc:'Realizado + previsto a vencer no mês. Base da projeção de caixa.',
      calc:function(d){
        var v=U.somaBy(d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status!=='Cancelado'&&noMes(f.pagoEm||f.venc);}),'valor');
        return {valor:v,texto:U.brl(v)}; } },

    { id:'fi_ticket', bloco:'Financeiro', nome:'Ticket médio', dono:'Financeiro', unidade:'R$',
      direcao:'maior', fonte:'financeiro',
      desc:'Receita paga nos últimos 90 dias ÷ número de pacientes distintos que geraram receita.',
      calc:function(d){
        var j=d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status==='Pago'&&ultimosDias(f.pagoEm||f.venc,90);});
        var pac={}; j.forEach(function(f){ if(f.pacienteId) pac[f.pacienteId]=1; });
        var n=Object.keys(pac).length;
        if(!n) return {valor:null,texto:'—'};
        var v=U.somaBy(j,'valor')/n;
        return {valor:v,texto:U.brl(v),nota:n+' pacientes',denominador:n}; } },

    { id:'fi_inadimplencia', bloco:'Financeiro', nome:'Inadimplência', dono:'Financeiro', unidade:'%',
      direcao:'menor', meta:5, fonte:'financeiro',
      desc:'Receita vencida e não paga ÷ receita vencida total. Vencimento futuro não entra no cálculo.',
      calc:function(d){
        var venc=d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status!=='Cancelado'&&f.venc&&new Date(f.venc)<new Date();});
        var mau=venc.filter(function(f){return f.status!=='Pago';});
        var vv=U.somaBy(venc,'valor'), vm=U.somaBy(mau,'valor');
        return {valor:U.pct(vm,vv),texto:U.pct(vm,vv)+'%',nota:U.brl(vm)+' em atraso',denominador:vv}; } },

    { id:'fi_margem', bloco:'Financeiro', nome:'Margem de contribuição', dono:'Financeiro', unidade:'%',
      direcao:'maior', meta:55, fonte:'financeiro + custos',
      desc:'(Receita paga − custo direto do serviço) ÷ receita paga, últimos 90 dias. Custo direto vem do catálogo em Administração.',
      calc:function(d){
        var j=d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status==='Pago'&&ultimosDias(f.pagoEm||f.venc,90);});
        var rec=U.somaBy(j,'valor');
        if(!rec) return {valor:null,texto:'—'};
        var custo=j.reduce(function(s,f){
          var c=d.cfg.custos[f.servico];
          return s+(c!==undefined?Number(c):(Number(f.custoDireto)||0));
        },0);
        return {valor:U.pct(rec-custo,rec),texto:U.pct(rec-custo,rec)+'%',nota:U.brl(rec-custo)+' de margem',denominador:rec}; } },

    { id:'fi_receita_hora', bloco:'Financeiro', nome:'Receita por hora disponível', dono:'Direção', unidade:'R$/h',
      direcao:'maior', fonte:'financeiro + capacidade',
      desc:'Receita paga nos últimos 30 dias ÷ horas de capacidade instalada (salas × horas úteis × 30). É o indicador que revela ociosidade cara.',
      calc:function(d){
        var salas=(d.cfg.salas||[]).length||1, hd=d.cfg.horasUteisDia||10;
        var horas=salas*hd*30;
        var rec=U.somaBy(d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status==='Pago'&&ultimosDias(f.pagoEm||f.venc,30);}),'valor');
        return {valor:rec/horas,texto:U.brl(rec/horas)+'/h',nota:horas+'h instaladas',denominador:horas}; } },

    { id:'fi_despesa_sem_retorno', bloco:'Financeiro', nome:'Despesa sem retorno (90d)', dono:'Direção', unidade:'R$',
      direcao:'menor', meta:0, fonte:'financeiro',
      desc:'Soma das despesas cujo canal/centro de custo não gerou nenhuma receita atribuída no período. É onde o dinheiro sai sem voltar.',
      calc:function(d){
        var desp=d.financeiro.filter(function(f){return f.tipo==='Despesa'&&ultimosDias(f.pagoEm||f.venc,90);});
        var receitaPorCanal={};
        d.financeiro.filter(function(f){return f.tipo==='Receita'&&f.status==='Pago'&&ultimosDias(f.pagoEm||f.venc,90);})
          .forEach(function(f){
            var p=d.pacientes.filter(function(x){return x.id===f.pacienteId;})[0];
            var canal=(p&&p.origem)||'—';
            receitaPorCanal[canal]=(receitaPorCanal[canal]||0)+(Number(f.valor)||0);
          });
        var perdida=desp.filter(function(f){
          if(!f.canal) return false;
          return !receitaPorCanal[f.canal];
        });
        var v=U.somaBy(perdida,'valor');
        return {valor:v,texto:U.brl(v),nota:perdida.length+' lançamentos sem receita atribuída'}; } },

    /* ------------------------------ CLÍNICA ----------------------------- */
    { id:'cl_ativos', bloco:'Clínica', nome:'Pacientes ativos', dono:'Direção clínica', unidade:'n',
      direcao:'maior', fonte:'pacientes',
      desc:'Pacientes com status "Ativo" no cadastro.',
      calc:function(d){ var v=d.pacientes.filter(function(p){return p.status==='Ativo';}).length;
        return {valor:v,texto:String(v)}; } },

    { id:'cl_sem_acompanhamento', bloco:'Clínica', nome:'Ativos sem revisão', dono:'Direção clínica', unidade:'n',
      direcao:'menor', meta:0, fonte:'agenda + prontuário',
      desc:'Pacientes ativos sem consulta realizada há mais que o limite configurado e sem retorno agendado. É a falha silenciosa mais cara em saúde mental.',
      calc:function(d){
        var lim=d.cfg.diasSemRevisaoAlerta||60;
        var v=d.pacientes.filter(function(p){
          if(p.status!=='Ativo') return false;
          var cons=d.agenda.filter(function(a){return a.pacienteId===p.id&&a.status==='Compareceu';});
          var ult=cons.length?U.ordenarPor(cons,'inicio',true)[0].inicio:p.criadoEm;
          var futuro=d.agenda.some(function(a){return a.pacienteId===p.id&&new Date(a.inicio)>new Date()&&a.status!=='Cancelado';});
          var dd=U.dias(ult);
          return !futuro && dd!==null && dd>lim;
        }).length;
        return {valor:v,texto:String(v)}; } },

    { id:'cl_alertas_mbc', bloco:'Clínica', nome:'Alertas MBC abertos', dono:'Direção clínica', unidade:'n',
      direcao:'menor', meta:0, fonte:'MBC',
      desc:'Pacientes cuja última medição cruzou o ponto de corte da escala ou piorou de forma relevante.',
      calc:function(d){ return {valor:GNE.Preditores.alertasMBC(d).length,texto:String(GNE.Preditores.alertasMBC(d).length)}; } },

    { id:'cl_risco_alto', bloco:'Clínica', nome:'Pacientes em risco alto', dono:'Direção clínica', unidade:'n',
      direcao:'menor', meta:0, fonte:'pacientes + MBC',
      desc:'Marcados com risco clínico alto no cadastro ou com triagem C-SSRS positiva na última medição.',
      calc:function(d){
        var ids={};
        d.pacientes.forEach(function(p){ if(p.riscoClinico==='Alto') ids[p.id]=1; });
        GNE.Preditores.alertasMBC(d).forEach(function(a){ if(a.critico) ids[a.pacienteId]=1; });
        var v=Object.keys(ids).length;
        return {valor:v,texto:String(v)}; } },

    { id:'cl_eventos_adversos', bloco:'Clínica', nome:'Eventos adversos (90d)', dono:'Qualidade', unidade:'n',
      direcao:'menor', meta:0, fonte:'procedimentos + qualidade',
      desc:'Intercorrências registradas em procedimentos somadas a incidentes assistenciais.',
      calc:function(d){
        var a=d.procedimentos.filter(function(p){return ultimosDias(p.ts,90)&&p.intercorrencia&&String(p.intercorrencia).trim();}).length;
        var b=d.qualidade.filter(function(q){return q.tipo==='Incidente'&&ultimosDias(q.criadoEm,90);}).length;
        return {valor:a+b,texto:String(a+b),nota:a+' em procedimento · '+b+' assistenciais'}; } },

    { id:'cl_abandono', bloco:'Clínica', nome:'Abandono (90d)', dono:'Direção clínica', unidade:'%',
      direcao:'menor', meta:15, fonte:'pacientes',
      desc:'Pacientes que passaram a "Inativo" nos últimos 90 dias ÷ (ativos + inativos no período).',
      calc:function(d){
        var inat=d.pacientes.filter(function(p){return p.status==='Inativo'&&ultimosDias(p.atualizadoEm,90);}).length;
        var base=d.pacientes.filter(function(p){return p.status==='Ativo';}).length+inat;
        return {valor:U.pct(inat,base),texto:U.pct(inat,base)+'%',nota:inat+' de '+base,denominador:base}; } },

    { id:'cl_resposta_mbc', bloco:'Clínica', nome:'Resposta ao tratamento', dono:'Direção clínica', unidade:'%',
      direcao:'maior', meta:50, fonte:'MBC',
      desc:'Pacientes com ≥2 medições da mesma escala e melhora ≥30% entre a primeira e a última. É o desfecho que sustenta o preço premium.',
      calc:function(d){
        var r=GNE.Preditores.respostaTratamento(d);
        if(!r.avaliaveis) return {valor:null,texto:'—',nota:'sem série longitudinal suficiente'};
        return {valor:U.pct(r.responderam,r.avaliaveis),texto:U.pct(r.responderam,r.avaliaveis)+'%',
          nota:r.responderam+' de '+r.avaliaveis+' pacientes',denominador:r.avaliaveis}; } },

    { id:'cl_adesao_escalas', bloco:'Clínica', nome:'Adesão às escalas (60d)', dono:'Concierge', unidade:'%',
      direcao:'maior', meta:70, fonte:'MBC',
      desc:'Pacientes ativos com ao menos uma medição nos últimos 60 dias. Sem isso o MBC não existe na prática.',
      calc:function(d){
        var at=d.pacientes.filter(function(p){return p.status==='Ativo';});
        var com=at.filter(function(p){return d.mbc.some(function(m){return m.pacienteId===p.id&&ultimosDias(m.ts,60);});}).length;
        return {valor:U.pct(com,at.length),texto:U.pct(com,at.length)+'%',nota:com+' de '+at.length,denominador:at.length}; } },

    /* ------------------------------ EXPERIÊNCIA -------------------------- */
    { id:'ex_nps', bloco:'Experiência', nome:'NPS (90d)', dono:'Concierge', unidade:'pts',
      direcao:'maior', meta:70, fonte:'experiência',
      desc:'% promotores (9-10) − % detratores (0-6). Escala 0 a 10.',
      calc:function(d){
        var j=d.experiencia.filter(function(e){return e.tipo==='NPS'&&ultimosDias(e.ts,90)&&typeof e.score==='number';});
        if(!j.length) return {valor:null,texto:'—',nota:'sem respostas no período'};
        var p=j.filter(function(e){return e.score>=9;}).length, det=j.filter(function(e){return e.score<=6;}).length;
        var v=Math.round((p-det)/j.length*100);
        return {valor:v,texto:String(v),nota:j.length+' respostas',denominador:j.length}; } },

    { id:'ex_csat', bloco:'Experiência', nome:'CSAT (90d)', dono:'Concierge', unidade:'/5',
      direcao:'maior', meta:4.5, fonte:'experiência',
      desc:'Média das avaliações de satisfação pontual, escala 1 a 5.',
      calc:function(d){
        var j=d.experiencia.filter(function(e){return e.tipo==='CSAT'&&ultimosDias(e.ts,90)&&typeof e.score==='number';});
        var m=U.media(j.map(function(e){return e.score;}));
        if(m===null) return {valor:null,texto:'—'};
        return {valor:Number(m.toFixed(2)),texto:m.toFixed(2)+' / 5',nota:j.length+' respostas',denominador:j.length}; } },

    { id:'ex_reclamacoes', bloco:'Experiência', nome:'Reclamações abertas', dono:'Qualidade', unidade:'n',
      direcao:'menor', meta:0, fonte:'experiência',
      desc:'Reclamações registradas e ainda não resolvidas.',
      calc:function(d){ var v=d.experiencia.filter(function(e){return e.tipo==='Reclamação'&&!e.resolvido;}).length;
        return {valor:v,texto:String(v)}; } },

    { id:'ex_tempo_resposta', bloco:'Experiência', nome:'Tempo de resposta', dono:'Concierge', unidade:'min',
      direcao:'menor', meta:30, fonte:'omnichannel',
      desc:'Mediana entre mensagem recebida do paciente e a primeira resposta da clínica (30d).',
      calc:function(d){
        var ent=U.ordenarPor(d.interacoes.filter(function(i){return ultimosDias(i.ts,30);}),'ts');
        var tempos=[];
        ent.forEach(function(i,idx){
          if(i.direcao!=='Recebida'||i.respondidaEm) {
            if(i.direcao==='Recebida'&&i.respondidaEm){var m0=U.horas(i.ts,i.respondidaEm)*60;if(m0>=0)tempos.push(m0);}
            return;
          }
          for(var k=idx+1;k<ent.length;k++){
            if(ent[k].pacienteId===i.pacienteId&&ent[k].direcao==='Enviada'){
              var m=U.horas(i.ts,ent[k].ts)*60; if(m>=0) tempos.push(m); break;
            }
          }
        });
        if(!tempos.length) return {valor:null,texto:'—',nota:'sem pares recebida/respondida'};
        tempos.sort(function(a,b){return a-b;});
        var med=tempos.length%2?tempos[(tempos.length-1)/2]:(tempos[tempos.length/2-1]+tempos[tempos.length/2])/2;
        return {valor:Math.round(med),texto:Math.round(med)+' min',nota:'mediana de '+tempos.length+' conversas',denominador:tempos.length}; } },

    { id:'ex_fcr', bloco:'Experiência', nome:'Resolvido no 1º contato', dono:'Concierge', unidade:'%',
      direcao:'maior', meta:75, fonte:'omnichannel',
      desc:'Interações recebidas marcadas como resolvidas sem reabertura, nos últimos 30 dias.',
      calc:function(d){
        var j=d.interacoes.filter(function(i){return i.direcao==='Recebida'&&ultimosDias(i.ts,30);});
        var ok=j.filter(function(i){return i.resolvidoNoPrimeiro===true;}).length;
        return {valor:U.pct(ok,j.length),texto:U.pct(ok,j.length)+'%',nota:ok+' de '+j.length,denominador:j.length}; } }
  ];

  KPI.porId = function (id) {
    for (var i = 0; i < KPI.CATALOGO.length; i++) if (KPI.CATALOGO[i].id === id) return KPI.CATALOGO[i];
    return null;
  };

  KPI.BLOCOS = ['Operação', 'Comercial', 'Financeiro', 'Clínica', 'Experiência'];

  /** Situação frente à meta: 'ok' | 'alerta' | 'risco' | 'neutro'. */
  KPI.situacao = function (def, valor, metaCfg) {
    if (valor === null || valor === undefined) return 'neutro';
    var meta = (metaCfg !== undefined && metaCfg !== null && metaCfg !== '') ? Number(metaCfg) : def.meta;
    if (meta === undefined || meta === null || def.direcao === 'neutro') return 'neutro';
    if (def.direcao === 'maior') {
      if (valor >= meta) return 'ok';
      return valor >= meta * 0.85 ? 'alerta' : 'risco';
    }
    if (def.direcao === 'menor') {
      if (valor <= meta) return 'ok';
      return valor <= meta * 1.3 || valor <= meta + 2 ? 'alerta' : 'risco';
    }
    return 'neutro';
  };

  /**
   * Calcula todo o catálogo. Um KPI que quebra não derruba os demais.
   *
   * REGRA DE HONESTIDADE: um indicador cujo denominador é zero NÃO é uma
   * taxa de 0% — é a ausência de base para calcular. Pintá-lo de vermelho
   * inventaria um problema que não existe e faria a direção agir sobre
   * ruído. Nesses casos o indicador vira "—", situação neutra, com a nota
   * dizendo que falta base.
   */
  KPI.calcularTudo = async function (dados) {
    var d = dados || await Dados.carregar();
    var metas = d.cfg.metas || {};
    return KPI.CATALOGO.map(function (def) {
      var r;
      try { r = def.calc(d) || {}; }
      catch (e) { r = { valor: null, texto: '—', nota: 'erro no cálculo: ' + e.message, erro: true }; }

      var semBase = (r.denominador === 0);
      var metaEfetiva = metas[def.id] !== undefined ? metas[def.id] : def.meta;
      return {
        id: def.id, nome: def.nome, bloco: def.bloco, unidade: def.unidade, dono: def.dono,
        desc: def.desc, fonte: def.fonte, direcao: def.direcao, meta: metaEfetiva,
        valor: semBase ? null : (r.valor === undefined ? null : r.valor),
        texto: semBase ? '—' : (r.texto || '—'),
        nota: semBase ? 'sem base de cálculo no período' : (r.nota || ''),
        denominador: r.denominador,
        semBase: semBase,
        situacao: (r.erro || semBase) ? 'neutro' : KPI.situacao(def, r.valor, metaEfetiva),
        erro: !!r.erro
      };
    });
  };

  /* ===========================================================================
     PREDITORES
     Scorecards ponderados, com pesos explícitos e motivos legíveis.
     Não são diagnóstico. São priorização operacional.
     ======================================================================== */
  var Pred = GNE.Preditores = {};

  /** Classificação da última medição de cada escala por paciente. */
  Pred.alertasMBC = function (d) {
    var out = [];
    var porPac = U.agrupar(d.mbc, 'pacienteId');
    Object.keys(porPac).forEach(function (pid) {
      var porEsc = U.agrupar(porPac[pid], 'escala');
      Object.keys(porEsc).forEach(function (nome) {
        var def = GNE.ESCALAS[nome];
        if (!def) return;
        var serie = U.ordenarPor(porEsc[nome], 'ts');
        var ult = serie[serie.length - 1];
        var pen = serie.length > 1 ? serie[serie.length - 2] : null;
        var motivos = [], critico = false;

        if (def.alertaAcima !== undefined && ult.score > def.alertaAcima) {
          motivos.push('acima do corte de ' + def.alertaAcima + ' (' + ult.score + ')');
          if (def.critica) critico = true;
        }
        if (def.alertaAbaixo !== undefined && ult.score < def.alertaAbaixo) {
          motivos.push('abaixo do corte de ' + def.alertaAbaixo + ' (' + ult.score + ')');
        }
        if (pen) {
          var delta = ult.score - pen.score;
          var amp = def.max - def.min || 1;
          var piorou = def.pior === 'alto' ? delta > 0 : delta < 0;
          if (piorou && Math.abs(delta) / amp >= 0.15) {
            motivos.push('piora de ' + Math.abs(delta) + ' pontos desde ' + U.dataBR(pen.ts));
          }
        }
        if (motivos.length) {
          out.push({
            pacienteId: pid, escala: nome, score: ult.score, ts: ult.ts,
            motivos: motivos, critico: critico, medicoes: serie.length
          });
        }
      });
    });
    return out;
  };

  /** Resposta ao tratamento: melhora ≥30% entre primeira e última medição. */
  Pred.respostaTratamento = function (d) {
    var avaliaveis = 0, responderam = 0, detalhe = [];
    var porPac = U.agrupar(d.mbc, 'pacienteId');
    Object.keys(porPac).forEach(function (pid) {
      var porEsc = U.agrupar(porPac[pid], 'escala');
      var melhor = null;
      Object.keys(porEsc).forEach(function (nome) {
        var def = GNE.ESCALAS[nome];
        if (!def || def.critica) return;
        var s = U.ordenarPor(porEsc[nome], 'ts');
        if (s.length < 2) return;
        var ini = s[0].score, fim = s[s.length - 1].score;
        var ganho = def.pior === 'alto'
          ? (ini ? (ini - fim) / ini : 0)
          : (def.max - ini ? (fim - ini) / (def.max - ini) : 0);
        if (melhor === null || ganho > melhor.ganho) melhor = { escala: nome, ganho: ganho, ini: ini, fim: fim };
      });
      if (melhor) {
        avaliaveis++;
        if (melhor.ganho >= 0.30) responderam++;
        detalhe.push({ pacienteId: pid, escala: melhor.escala, ganhoPct: Math.round(melhor.ganho * 100), de: melhor.ini, para: melhor.fim });
      }
    });
    return { avaliaveis: avaliaveis, responderam: responderam, detalhe: detalhe };
  };

  /**
   * Risco de falta em um agendamento futuro. 0–100.
   * Pesos declarados; cada ponto somado registra o motivo.
   */
  Pred.riscoNoShow = function (ag, d) {
    var pts = 0, motivos = [];
    var hist = d.agenda.filter(function (a) { return a.pacienteId === ag.pacienteId && a.id !== ag.id; });
    var f = hist.filter(function (a) { return a.status === 'Faltou'; }).length;
    var c = hist.filter(function (a) { return a.status === 'Compareceu'; }).length;

    if (f > 0) {
      var taxa = f / (f + c || 1);
      var p = Math.min(40, Math.round(taxa * 55));
      pts += p; motivos.push('histórico: ' + f + ' falta(s) em ' + (f + c) + ' (+' + p + ')');
    }
    if (ag.status !== 'Confirmado') { pts += 20; motivos.push('ainda não confirmado (+20)'); }

    var ante = U.dias(ag.criadoEm || ag.inicio, ag.inicio);
    if (ante !== null && ante > 21) { pts += 12; motivos.push('agendado com ' + ante + ' dias de antecedência (+12)'); }

    if (ag.tipo === 'Primeira consulta') { pts += 10; motivos.push('primeira consulta (+10)'); }

    var pac = d.pacientes.filter(function (p) { return p.id === ag.pacienteId; })[0];
    if (pac && (pac.origem === 'Instagram' || pac.origem === 'TikTok')) {
      pts += 8; motivos.push('origem de mídia paga fria (+8)');
    }
    var ultInt = U.ordenarPor(d.interacoes.filter(function (i) { return i.pacienteId === ag.pacienteId; }), 'ts', true)[0];
    var dd = ultInt ? U.dias(ultInt.ts) : null;
    if (dd === null || dd > 14) { pts += 10; motivos.push('sem contato recente (+10)'); }

    var venc = d.financeiro.some(function (x) {
      return x.pacienteId === ag.pacienteId && x.tipo === 'Receita' && x.status !== 'Pago' &&
             x.venc && new Date(x.venc) < new Date();
    });
    if (venc) { pts += 10; motivos.push('pendência financeira vencida (+10)'); }

    pts = Math.min(100, pts);
    return { score: pts, faixa: pts >= 55 ? 'Alto' : pts >= 30 ? 'Médio' : 'Baixo', motivos: motivos };
  };

  /** Risco de abandono do tratamento. 0–100. */
  Pred.riscoAbandono = function (pac, d) {
    var pts = 0, motivos = [];
    if (pac.status !== 'Ativo') return { score: 0, faixa: 'N/A', motivos: ['paciente não está ativo'] };

    var cons = d.agenda.filter(function (a) { return a.pacienteId === pac.id && a.status === 'Compareceu'; });
    var ult = cons.length ? U.ordenarPor(cons, 'inicio', true)[0].inicio : pac.criadoEm;
    var dSemConsulta = U.dias(ult);
    if (dSemConsulta > 90) { pts += 30; motivos.push(dSemConsulta + ' dias sem consulta (+30)'); }
    else if (dSemConsulta > 45) { pts += 18; motivos.push(dSemConsulta + ' dias sem consulta (+18)'); }

    var futuro = d.agenda.some(function (a) {
      return a.pacienteId === pac.id && new Date(a.inicio) > new Date() && a.status !== 'Cancelado';
    });
    if (!futuro) { pts += 22; motivos.push('sem retorno agendado (+22)'); }

    var faltas = d.agenda.filter(function (a) {
      return a.pacienteId === pac.id && a.status === 'Faltou' && ultimosDias(a.inicio, 90);
    }).length;
    if (faltas) { pts += Math.min(20, faltas * 10); motivos.push(faltas + ' falta(s) em 90 dias (+' + Math.min(20, faltas * 10) + ')'); }

    var ultInt = U.ordenarPor(d.interacoes.filter(function (i) { return i.pacienteId === pac.id; }), 'ts', true)[0];
    var dInt = ultInt ? U.dias(ultInt.ts) : null;
    if (dInt === null || dInt > (d.cfg.diasSemContatoAlerta || 45)) {
      pts += 12; motivos.push('sem interação registrada há ' + (dInt === null ? 'nenhum registro' : dInt + ' dias') + ' (+12)');
    }

    var inad = d.financeiro.some(function (x) {
      return x.pacienteId === pac.id && x.tipo === 'Receita' && x.status !== 'Pago' &&
             x.venc && U.dias(x.venc) > 15;
    });
    if (inad) { pts += 10; motivos.push('parcela vencida há mais de 15 dias (+10)'); }

    var alertas = Pred.alertasMBC(d).filter(function (a) { return a.pacienteId === pac.id; });
    if (alertas.length) { pts += 8; motivos.push('alerta MBC ativo (+8)'); }

    var nps = U.ordenarPor(d.experiencia.filter(function (e) { return e.pacienteId === pac.id && e.tipo === 'NPS'; }), 'ts', true)[0];
    if (nps && typeof nps.score === 'number' && nps.score <= 6) { pts += 12; motivos.push('detrator no último NPS (+12)'); }

    pts = Math.min(100, pts);
    return { score: pts, faixa: pts >= 55 ? 'Alto' : pts >= 30 ? 'Médio' : 'Baixo', motivos: motivos };
  };

  /** Margem e retorno por canal de aquisição — o teste do dinheiro. */
  Pred.economiaPorCanal = function (d) {
    var canais = {};
    function slot(c) {
      c = c || '—';
      if (!canais[c]) canais[c] = { canal: c, investimento: 0, receita: 0, leads: 0, pacientes: 0, custoDireto: 0 };
      return canais[c];
    }
    d.leads.forEach(function (l) { slot(l.canal).leads++; });
    d.pacientes.forEach(function (p) { if (p.status !== 'Perdido') slot(p.origem).pacientes++; });
    d.financeiro.filter(function (f) { return f.tipo === 'Despesa' && f.canal; })
      .forEach(function (f) { slot(f.canal).investimento += Number(f.valor) || 0; });
    d.financeiro.filter(function (f) { return f.tipo === 'Receita' && f.status === 'Pago'; })
      .forEach(function (f) {
        var p = d.pacientes.filter(function (x) { return x.id === f.pacienteId; })[0];
        var s = slot(p && p.origem);
        s.receita += Number(f.valor) || 0;
        var c = d.cfg.custos[f.servico];
        s.custoDireto += (c !== undefined ? Number(c) : (Number(f.custoDireto) || 0));
      });

    return Object.keys(canais).map(function (k) {
      var c = canais[k];
      c.cac = c.pacientes ? c.investimento / c.pacientes : null;
      c.ltv = c.pacientes ? c.receita / c.pacientes : null;
      c.margem = c.receita - c.custoDireto;
      c.roi = c.investimento ? (c.receita - c.investimento - c.custoDireto) / c.investimento : null;
      c.conversao = c.leads ? c.pacientes / c.leads : null;
      c.veredito = c.investimento === 0 ? 'orgânico'
        : (c.roi === null ? 'sem base'
          : c.roi >= 2 ? 'escalar'
          : c.roi >= 0.5 ? 'manter'
          : c.roi > 0 ? 'ajustar'
          : 'cortar');
      return c;
    }).sort(function (a, b) { return (b.receita || 0) - (a.receita || 0); });
  };

  /** Margem por serviço — onde o preço não cobre o custo. */
  Pred.margemPorServico = function (d) {
    var m = {};
    d.financeiro.filter(function (f) { return f.tipo === 'Receita' && f.status === 'Pago'; })
      .forEach(function (f) {
        var k = f.servico || '—';
        if (!m[k]) m[k] = { servico: k, n: 0, receita: 0, custo: 0 };
        m[k].n++;
        m[k].receita += Number(f.valor) || 0;
        var c = d.cfg.custos[k];
        m[k].custo += (c !== undefined ? Number(c) : (Number(f.custoDireto) || 0));
      });
    return Object.keys(m).map(function (k) {
      var x = m[k];
      x.margem = x.receita - x.custo;
      x.margemPct = x.receita ? U.pct(x.margem, x.receita) : null;
      x.ticket = x.n ? x.receita / x.n : 0;
      x.veredito = x.margemPct === null ? 'sem base'
        : x.margemPct < 20 ? 'revisar preço ou custo'
        : x.margemPct < 45 ? 'atenção'
        : 'saudável';
      return x;
    }).sort(function (a, b) { return (a.margemPct === null ? 999 : a.margemPct) - (b.margemPct === null ? 999 : b.margemPct); });
  };

  /* ===========================================================================
     NEXT BEST ACTION
     Para cada paciente/lead, qual é a próxima coisa que a clínica deve fazer.
     Cada regra declara: gatilho, prioridade, dono sugerido e evidência.
     ======================================================================== */
  var NBA = GNE.NBA = {};

  NBA.REGRAS = [
    {
      id: 'risco_critico', rotulo: 'Triagem de risco positiva', prioridade: 100, dono: 'Médico(a)',
      modulo: 'mbc',
      desc: 'Última triagem C-SSRS positiva. Exige contato assistencial imediato conforme protocolo.',
      avaliar: function (ctx) {
        var a = ctx.alertasMBC.filter(function (x) { return x.pacienteId === ctx.pac.id && x.critico; })[0];
        if (!a) return null;
        return { evidencia: a.escala + ' = ' + a.score + ' em ' + U.dataBR(a.ts), acao: 'Acionar protocolo de risco e contato médico hoje.' };
      }
    },
    {
      id: 'intercorrencia_aberta', rotulo: 'Intercorrência sem desfecho', prioridade: 95, dono: 'Enfermagem',
      modulo: 'procedimentos',
      desc: 'Procedimento com intercorrência registrada e sem follow-up concluído.',
      avaliar: function (ctx) {
        var p = ctx.d.procedimentos.filter(function (x) {
          return x.pacienteId === ctx.pac.id && x.intercorrencia && String(x.intercorrencia).trim() && !x.followUpFeito;
        })[0];
        if (!p) return null;
        return { evidencia: p.tipo + ' em ' + U.dataBR(p.ts) + ': ' + String(p.intercorrencia).slice(0, 90),
                 acao: 'Registrar follow-up da intercorrência e fechar o caso.' };
      }
    },
    {
      id: 'pos_procedimento', rotulo: 'Follow-up pós-procedimento', prioridade: 88, dono: 'Enfermagem',
      modulo: 'procedimentos',
      desc: 'Sessão realizada nas últimas 72 h sem contato de acompanhamento.',
      avaliar: function (ctx) {
        var p = ctx.d.procedimentos.filter(function (x) {
          if (x.pacienteId !== ctx.pac.id || x.followUpFeito) return false;
          var dd = U.horas(x.ts); return dd !== null && dd >= 12 && dd <= 96 && x.etapa === 'Concluído';
        })[0];
        if (!p) return null;
        return { evidencia: p.tipo + ' concluído em ' + U.dataHoraBR(p.ts), acao: 'Contato de acompanhamento em até 24 h e registro do desfecho.' };
      }
    },
    {
      id: 'mbc_piora', rotulo: 'Piora longitudinal', prioridade: 82, dono: 'Médico(a)',
      modulo: 'mbc',
      desc: 'Escala cruzou o corte ou piorou de forma relevante entre medições.',
      avaliar: function (ctx) {
        var a = ctx.alertasMBC.filter(function (x) { return x.pacienteId === ctx.pac.id && !x.critico; })[0];
        if (!a) return null;
        return { evidencia: a.escala + ': ' + a.motivos.join('; '), acao: 'Revisar caso e decidir sobre antecipação de retorno.' };
      }
    },
    {
      id: 'sem_revisao', rotulo: 'Sem revisão médica', prioridade: 76, dono: 'Concierge',
      modulo: 'agenda',
      desc: 'Paciente ativo além do limite sem consulta e sem retorno agendado.',
      avaliar: function (ctx) {
        if (ctx.pac.status !== 'Ativo') return null;
        var lim = ctx.d.cfg.diasSemRevisaoAlerta || 60;
        var cons = ctx.d.agenda.filter(function (a) { return a.pacienteId === ctx.pac.id && a.status === 'Compareceu'; });
        var ult = cons.length ? U.ordenarPor(cons, 'inicio', true)[0].inicio : ctx.pac.criadoEm;
        var dd = U.dias(ult);
        var futuro = ctx.d.agenda.some(function (a) {
          return a.pacienteId === ctx.pac.id && new Date(a.inicio) > new Date() && a.status !== 'Cancelado';
        });
        if (futuro || dd === null || dd <= lim) return null;
        return { evidencia: dd + ' dias desde a última consulta, sem retorno agendado', acao: 'Oferecer retorno e registrar tentativa de contato.' };
      }
    },
    {
      id: 'exame_pendente', rotulo: 'Exame solicitado sem retorno', prioridade: 70, dono: 'Concierge',
      modulo: 'prontuario',
      desc: 'Exame solicitado há mais de 14 dias sem resultado recebido.',
      avaliar: function (ctx) {
        var e = ctx.d.prontuario.filter(function (x) {
          if (x.pacienteId !== ctx.pac.id || x.tipo !== 'Solicitação de exame' || x.resultadoRecebido) return false;
          var dd = U.dias(x.ts); return dd !== null && dd > 14;
        })[0];
        if (!e) return null;
        return { evidencia: 'Solicitado em ' + U.dataBR(e.ts) + ', ' + U.dias(e.ts) + ' dias sem resultado',
                 acao: 'Perguntar ao paciente se precisa de ajuda para realizar o exame.' };
      }
    },
    {
      id: 'noshow_alto', rotulo: 'Alto risco de falta', prioridade: 66, dono: 'Concierge',
      modulo: 'agenda',
      desc: 'Agendamento futuro com score de no-show alto — confirmar ativamente.',
      avaliar: function (ctx) {
        var prox = U.ordenarPor(ctx.d.agenda.filter(function (a) {
          return a.pacienteId === ctx.pac.id && new Date(a.inicio) > new Date() && a.status !== 'Cancelado';
        }), 'inicio')[0];
        if (!prox) return null;
        var r = Pred.riscoNoShow(prox, ctx.d);
        if (r.score < 55) return null;
        return { evidencia: 'Score ' + r.score + '/100 — ' + r.motivos.slice(0, 2).join('; '),
                 acao: 'Confirmação ativa com contato humano e reforço da preparação.' };
      }
    },
    {
      id: 'faltou', rotulo: 'Faltou e não foi recuperado', prioridade: 64, dono: 'Concierge',
      modulo: 'agenda',
      desc: 'Falta nos últimos 14 dias sem reagendamento posterior.',
      avaliar: function (ctx) {
        var f = ctx.d.agenda.filter(function (a) {
          return a.pacienteId === ctx.pac.id && a.status === 'Faltou' && ultimosDias(a.inicio, 14);
        })[0];
        if (!f) return null;
        var reag = ctx.d.agenda.some(function (a) {
          return a.pacienteId === ctx.pac.id && new Date(a.inicio) > new Date(f.inicio) && a.status !== 'Cancelado';
        });
        if (reag) return null;
        return { evidencia: 'Falta em ' + U.dataBR(f.inicio) + ' sem reagendamento', acao: 'Contato de recuperação em até 24 h, sem tom de cobrança.' };
      }
    },
    {
      id: 'escala_vencida', rotulo: 'Escala vencida', prioridade: 55, dono: 'Concierge',
      modulo: 'mbc',
      desc: 'Paciente ativo sem medição há mais de 45 dias.',
      avaliar: function (ctx) {
        if (ctx.pac.status !== 'Ativo') return null;
        var m = U.ordenarPor(ctx.d.mbc.filter(function (x) { return x.pacienteId === ctx.pac.id; }), 'ts', true)[0];
        var dd = m ? U.dias(m.ts) : null;
        if (dd !== null && dd <= 45) return null;
        return { evidencia: m ? 'Última medição em ' + U.dataBR(m.ts) : 'Nenhuma medição registrada',
                 acao: 'Enviar escala e registrar a resposta.' };
      }
    },
    {
      id: 'inadimplencia', rotulo: 'Pendência financeira', prioridade: 50, dono: 'Financeiro',
      modulo: 'financeiro',
      desc: 'Receita vencida há mais de 5 dias.',
      avaliar: function (ctx) {
        var f = ctx.d.financeiro.filter(function (x) {
          return x.pacienteId === ctx.pac.id && x.tipo === 'Receita' && x.status !== 'Pago' && x.status !== 'Cancelado' &&
                 x.venc && U.dias(x.venc) > 5;
        })[0];
        if (!f) return null;
        return { evidencia: U.brl(f.valor) + ' vencido em ' + U.dataBR(f.venc), acao: 'Contato de regularização pelo canal preferido do paciente.' };
      }
    },
    {
      id: 'detrator', rotulo: 'Detrator sem tratativa', prioridade: 48, dono: 'Concierge',
      modulo: 'experiencia',
      desc: 'NPS ≤ 6 ou reclamação aberta sem resolução.',
      avaliar: function (ctx) {
        var r = ctx.d.experiencia.filter(function (e) {
          return e.pacienteId === ctx.pac.id && !e.resolvido &&
                 (e.tipo === 'Reclamação' || (e.tipo === 'NPS' && typeof e.score === 'number' && e.score <= 6));
        })[0];
        if (!r) return null;
        return { evidencia: r.tipo + (typeof r.score === 'number' ? ' (' + r.score + ')' : '') + ' em ' + U.dataBR(r.ts),
                 acao: 'Ligação de recuperação por quem tem autonomia para resolver.' };
      }
    },
    {
      id: 'silencio', rotulo: 'Silêncio prolongado', prioridade: 40, dono: 'Concierge',
      modulo: 'concierge',
      desc: 'Sem qualquer interação registrada há mais de 90 dias.',
      avaliar: function (ctx) {
        var i = U.ordenarPor(ctx.d.interacoes.filter(function (x) { return x.pacienteId === ctx.pac.id; }), 'ts', true)[0];
        var base = i ? i.ts : ctx.pac.criadoEm;
        var dd = U.dias(base);
        if (dd === null || dd <= 90) return null;
        return { evidencia: dd + ' dias sem contato', acao: ctx.pac.status === 'Ativo' ? 'Contato de cuidado.' : 'Avaliar reativação com convite genuíno, não campanha.' };
      }
    },
    {
      id: 'consentimento', rotulo: 'Consentimento ausente', prioridade: 86, dono: 'Qualidade',
      modulo: 'qualidade',
      desc: 'Procedimento agendado ou realizado sem consentimento registrado.',
      avaliar: function (ctx) {
        var p = ctx.d.procedimentos.filter(function (x) { return x.pacienteId === ctx.pac.id && !x.consentimentoId; })[0];
        if (!p) return null;
        return { evidencia: p.tipo + ' em ' + U.dataBR(p.ts) + ' sem consentimento vinculado',
                 acao: 'Colher e vincular o termo antes de nova sessão. Bloqueio de compliance.' };
      }
    }
  ];

  /** Regras que se aplicam a leads (ainda não pacientes). */
  NBA.REGRAS_LEAD = [
    {
      id: 'lead_sem_contato', rotulo: 'Lead sem primeiro contato', prioridade: 92, dono: 'Concierge', modulo: 'crm',
      avaliar: function (l, d) {
        if (l.primeiroContatoEm || l.estagio === 'Perdido') return null;
        var min = U.horas(l.criadoEm) * 60;
        var sla = d.cfg.slaPrimeiroContatoMin || 15;
        if (min === null || min <= sla) return null;
        return { evidencia: 'Aguardando há ' + U.duracao(min) + ' (SLA ' + sla + ' min)',
                 acao: 'Primeiro contato agora, pelo canal de origem.' };
      }
    },
    {
      id: 'lead_parado', rotulo: 'Lead parado no funil', prioridade: 58, dono: 'Comercial', modulo: 'crm',
      avaliar: function (l, d) {
        if (l.estagio === 'Em tratamento' || l.estagio === 'Perdido') return null;
        var base = l.ultimoContatoEm || l.criadoEm;
        var dd = U.dias(base);
        if (dd === null || dd <= 7) return null;
        return { evidencia: dd + ' dias em "' + l.estagio + '" sem avanço', acao: 'Retomar ou marcar como perdido com o motivo. Funil limpo é funil confiável.' };
      }
    }
  ];

  /**
   * Roda o motor. Retorna a lista priorizada.
   * @param {object} [dados] snapshot
   * @param {{limite?:number, dono?:string}} [opts]
   */
  NBA.calcular = async function (dados, opts) {
    opts = opts || {};
    var d = dados || await Dados.carregar();
    var alertasMBC = Pred.alertasMBC(d);
    var out = [];

    d.pacientes.forEach(function (pac) {
      if (pac.status === 'Arquivado') return;
      var ctx = { pac: pac, d: d, alertasMBC: alertasMBC };
      NBA.REGRAS.forEach(function (r) {
        var res;
        try { res = r.avaliar(ctx); } catch (e) { res = null; }
        if (!res) return;
        out.push({
          chave: r.id + ':' + pac.id,
          regraId: r.id, rotulo: r.rotulo, prioridade: r.prioridade, dono: r.dono, modulo: r.modulo,
          alvoTipo: 'paciente', alvoId: pac.id, alvoNome: pac.nome,
          evidencia: res.evidencia, acao: res.acao
        });
      });
    });

    d.leads.forEach(function (l) {
      if (l.pacienteId) return; // já virou paciente, tratado acima
      NBA.REGRAS_LEAD.forEach(function (r) {
        var res;
        try { res = r.avaliar(l, d); } catch (e) { res = null; }
        if (!res) return;
        out.push({
          chave: r.id + ':' + l.id,
          regraId: r.id, rotulo: r.rotulo, prioridade: r.prioridade, dono: r.dono, modulo: r.modulo,
          alvoTipo: 'lead', alvoId: l.id, alvoNome: l.nome,
          evidencia: res.evidencia, acao: res.acao
        });
      });
    });

    out.sort(function (a, b) { return b.prioridade - a.prioridade || String(a.alvoNome).localeCompare(String(b.alvoNome)); });
    if (opts.dono) out = out.filter(function (x) { return x.dono === opts.dono; });
    if (opts.limite) out = out.slice(0, opts.limite);
    return out;
  };

  /* ===========================================================================
     BRIEFING EXECUTIVO — determinístico, para a IA apenas redigir depois
     ======================================================================== */
  GNE.Briefing = {
    montar: async function () {
      var d = await Dados.carregar(true);
      var kpis = await KPI.calcularTudo(d);
      var nba = await NBA.calcular(d, { limite: 40 });
      var foraDaMeta = kpis.filter(function (k) { return k.situacao === 'risco'; });
      var atencao = kpis.filter(function (k) { return k.situacao === 'alerta'; });
      return {
        geradoEm: new Date().toISOString(),
        totais: {
          pacientesAtivos: d.pacientes.filter(function (p) { return p.status === 'Ativo'; }).length,
          leadsAbertos: d.leads.filter(function (l) { return l.estagio !== 'Em tratamento' && l.estagio !== 'Perdido'; }).length,
          acoesPendentes: nba.length,
          tarefasAbertas: d.tarefas.filter(function (t) { return t.status !== 'Concluída'; }).length
        },
        foraDaMeta: foraDaMeta.map(function (k) { return { nome: k.nome, valor: k.texto, meta: k.meta, bloco: k.bloco, dono: k.dono }; }),
        atencao: atencao.map(function (k) { return { nome: k.nome, valor: k.texto, meta: k.meta, bloco: k.bloco }; }),
        topAcoes: nba.slice(0, 12).map(function (a) {
          return { prioridade: a.prioridade, tipo: a.rotulo, alvo: a.alvoNome, dono: a.dono, evidencia: a.evidencia, acao: a.acao };
        }),
        canais: Pred.economiaPorCanal(d).slice(0, 8).map(function (c) {
          return { canal: c.canal, leads: c.leads, pacientes: c.pacientes, investimento: c.investimento,
                   receita: c.receita, cac: c.cac, ltv: c.ltv, roi: c.roi, veredito: c.veredito };
        }),
        servicos: Pred.margemPorServico(d).slice(0, 8)
      };
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
