/* =============================================================================
   GNE Clinical OS — sementes

   Duas coisas diferentes, deliberadamente separadas:

   1. instalarPadroes()  → POPs, base de conhecimento, catálogo de serviços e
      consentimentos. São TEMPLATES da clínica, não dados de paciente. Entram
      como produção e ficam. São editáveis em cada módulo.

   2. popular()          → clínica fictícia completa para demonstração e teste.
      TUDO marcado com testData:true, e por isso removível com um clique.
   ========================================================================== */
(function (global) {
  'use strict';
  var GNE = global.GNE, U = GNE.util, DB = GNE.DB;

  var Seed = GNE.Seed = {};

  /* ===========================================================================
     1. PADRÕES DE PRODUÇÃO
     ======================================================================== */
  Seed.POPS = [
    {
      titulo: 'Primeira consulta — do contato ao plano terapêutico', area: 'Concierge', versao: '1.0',
      gatilho: 'Mensagem, ligação ou formulário de alguém que ainda não é paciente',
      responsavel: 'Concierge', sla: '15 minutos em horário comercial; 1ª hora do expediente seguinte fora dele',
      etapas: ['Registrar no CRM com canal de origem correto',
               'Qualificar: demanda, urgência percebida, quem decide, forma de pagamento',
               'Apresentar a clínica e a proposta de cuidado',
               'Agendar e registrar a garantia de reserva',
               'Enviar orientações de preparo e o formulário de pré-consulta',
               'Colher consentimentos aplicáveis',
               'Confirmar 48 h e 24 h antes',
               'Preparar a nota de preparo para o profissional',
               'Consulta',
               'Registrar plano terapêutico',
               'Enviar orientações combinadas',
               'Contato pós-consulta em até 72 h',
               'Programar escalas e o retorno'].join('\n'),
      evidencia: 'Lead com primeiroContatoEm preenchido, agendamento criado, consentimento vinculado e registro de contato pós-consulta',
      escalonamento: 'SLA estourado → alerta ao coordenador em 30 min. Duas ocorrências no mesmo dia → revisão da escala de plantão do concierge.',
      indicador: 'cm_sla_1o_contato', ativo: true
    },
    {
      titulo: 'Confirmação ativa e recuperação de falta', area: 'Agenda', versao: '1.0',
      gatilho: 'Agendamento a 48 h de acontecer, ou status alterado para Faltou',
      responsavel: 'Concierge', sla: 'Confirmação até 24 h antes; recuperação em até 24 h após a falta',
      etapas: ['Consultar o score de risco de falta na Agenda',
               'Score alto → contato humano, não mensagem automática',
               'Registrar a confirmação no sistema',
               'Se faltou: contato de recuperação sem tom de cobrança',
               'Oferecer duas alternativas concretas de horário',
               'Se não houver resposta em 48 h, registrar tentativa e reavaliar em 7 dias'].join('\n'),
      evidencia: 'Status do agendamento atualizado e interação registrada no Omnichannel',
      escalonamento: 'Duas faltas seguidas do mesmo paciente → caso vai para a reunião clínica semanal.',
      indicador: 'op_noshow', ativo: true
    },
    {
      titulo: 'Sessão de cetamina — elegibilidade à alta', area: 'Procedimentos', versao: '1.0',
      gatilho: 'Indicação médica de sessão de cetamina',
      responsavel: 'Enfermagem', sla: 'Follow-up em até 24 h após a sessão',
      etapas: ['Confirmar elegibilidade clínica com o médico responsável',
               'Colher e vincular o consentimento específico',
               'Orientar jejum e acompanhante',
               'Checklist pré-sessão completo no sistema',
               'Registrar sinais vitais basais',
               'Aplicar escala pré-sessão',
               'Conduzir a sessão com monitorização',
               'Registrar sinais vitais de saída',
               'Registrar intercorrências, se houver',
               'Alta com acompanhante e orientações escritas',
               'Follow-up em 24 h e registro do desfecho'].join('\n'),
      evidencia: 'Procedimento com etapa "Concluído", consentimento vinculado, checklist completo e sinais vitais de saída',
      escalonamento: 'Qualquer intercorrência → tarefa crítica automática para a enfermagem e comunicação ao médico responsável no mesmo dia.',
      indicador: 'cl_eventos_adversos', ativo: true
    },
    {
      titulo: 'Triagem de risco positiva', area: 'Assistencial', versao: '1.0',
      gatilho: 'Escala de triagem de risco com resultado positivo, ou relato de risco em qualquer canal',
      responsavel: 'Médico(a)', sla: 'Contato assistencial no mesmo turno',
      etapas: ['O sistema abre tarefa crítica automaticamente',
               'Quem recebeu o relato NÃO avalia gravidade nem orienta conduta',
               'Acionar imediatamente o profissional de plantão',
               'Contato assistencial e avaliação por profissional habilitado',
               'Registrar a avaliação e a conduta no prontuário',
               'Definir plano de segurança e rede de apoio',
               'Reavaliação programada'].join('\n'),
      evidencia: 'Tarefa crítica concluída com evidência e registro de avaliação no prontuário',
      escalonamento: 'Sem contato em 2 h → direção clínica é acionada. A classificação definitiva do risco é sempre do profissional, nunca do sistema nem da IA.',
      indicador: 'cl_risco_alto', ativo: true
    },
    {
      titulo: 'Measurement-Based Care — ciclo de medição', area: 'Assistencial', versao: '1.0',
      gatilho: 'Início de tratamento e a cada 30 dias',
      responsavel: 'Concierge', sla: 'Escala enviada em D+0 e cobrada em D+3 se não respondida',
      etapas: ['Definir com o profissional quais escalas se aplicam ao caso',
               'Enviar a escala pelo canal de preferência do paciente',
               'Registrar a resposta no módulo MBC',
               'O sistema classifica frente ao ponto de corte',
               'Alerta de trajetória → o caso vai para revisão do profissional',
               'O profissional decide sobre antecipar retorno'].join('\n'),
      evidencia: 'Medição registrada no MBC com data e origem da coleta',
      escalonamento: 'Paciente ativo com mais de 45 dias sem medição → aparece na fila de Próxima Ação.',
      indicador: 'cl_adesao_escalas', ativo: true
    },
    {
      titulo: 'Reclamação e recuperação de experiência', area: 'Qualidade', versao: '1.0',
      gatilho: 'Reclamação em qualquer canal, ou NPS ≤ 6',
      responsavel: 'Concierge', sla: 'Primeiro retorno em 4 h; tratativa concluída em 5 dias úteis',
      etapas: ['Registrar em Experiência com a etapa da jornada em que ocorreu',
               'Ligar — não responder por mensagem',
               'Ouvir sem justificar',
               'Resolver o que é resolvível no mesmo contato',
               'Se exigir decisão de terceiros, dar prazo e cumprir',
               'Registrar a tratativa e fechar',
               'Levar a causa raiz à reunião de qualidade'].join('\n'),
      evidencia: 'Registro em Experiência com resolvido=true e a tratativa descrita',
      escalonamento: 'Sem tratativa em 5 dias úteis → direção. Três reclamações da mesma causa raiz → abertura de não conformidade.',
      indicador: 'ex_reclamacoes', ativo: true
    },
    {
      titulo: 'Cobrança e regularização', area: 'Financeiro', versao: '1.0',
      gatilho: 'Receita vencida há mais de 5 dias',
      responsavel: 'Financeiro', sla: 'Primeiro contato em D+5; segundo em D+15',
      etapas: ['Conferir se houve falha de emissão ou de conciliação antes de cobrar',
               'Contato pelo canal preferido do paciente',
               'Oferecer alternativa de regularização',
               'Registrar o combinado no lançamento',
               'Se não houver acordo em 30 dias, levar à direção'].join('\n'),
      evidencia: 'Lançamento com status atualizado e interação registrada',
      escalonamento: 'Nunca condicionar atendimento assistencial em curso à regularização financeira sem decisão explícita da direção clínica.',
      indicador: 'fi_inadimplencia', ativo: true
    },
    {
      titulo: 'Aprovação de comunicação gerada por IA', area: 'Gestão', versao: '1.0',
      gatilho: 'Rascunho de mensagem produzido por qualquer agente de IA',
      responsavel: 'Concierge', sla: 'Aprovar ou descartar em 4 h',
      etapas: ['Ler o rascunho integralmente',
               'Verificar se há qualquer conteúdo clínico — se houver, encaminhar ao profissional',
               'Conferir se o fato citado existe mesmo no sistema',
               'Ajustar o tom ao paciente específico',
               'Aprovar, enviar e registrar a interação'].join('\n'),
      evidencia: 'Tarefa de aprovação concluída e interação registrada no Omnichannel',
      escalonamento: 'Rascunho com conteúdo clínico → obrigatoriamente para profissional habilitado. Nenhuma mensagem sai sem aprovação humana identificada.',
      indicador: 'ex_tempo_resposta', ativo: true
    }
  ];

  Seed.CONHECIMENTO = [
    {
      titulo: 'Fronteira entre concierge e assistência', categoria: 'Regra administrativa', versao: '1.0',
      tags: 'concierge, fronteira, conduta',
      conteudo: 'O concierge conhece: preferências, agenda, pendências administrativas, procedimentos previstos, ' +
        'exames pendentes, experiência relatada e próximo ponto de contato.\n\n' +
        'O concierge NÃO: interpreta sintoma, estima gravidade, orienta conduta, sugere ajuste de medicação ou ' +
        'decide sobre urgência.\n\n' +
        'Quando o paciente traz conteúdo clínico, a resposta correta é uma só: acolher, informar que o profissional ' +
        'será acionado e registrar a interação como "Conteúdo clínico" com encaminhamento marcado.\n\n' +
        'Se houver qualquer sinal de risco à vida, aciona-se o POP de triagem de risco positiva imediatamente, ' +
        'sem avaliar gravidade.'
    },
    {
      titulo: 'Cancelamento de sessão de EMT', categoria: 'Conduta em intercorrência', versao: '1.0',
      tags: 'EMT, cancelamento, reagendamento',
      conteudo: 'Cancelamento com mais de 24 h de antecedência: reagendar dentro da mesma semana sempre que ' +
        'possível, para não quebrar a sequência do protocolo. Registrar o motivo.\n\n' +
        'Cancelamento com menos de 24 h: aplicar a política de reserva vigente, registrar em Agenda como Cancelado ' +
        'e abrir contato de recuperação.\n\n' +
        'Interrupção de série: qualquer intervalo maior que o previsto no protocolo exige comunicação ao médico ' +
        'responsável antes do reagendamento — a decisão sobre retomar, ajustar ou reiniciar a série é dele.\n\n' +
        'Sempre registrar no prontuário a interrupção e a orientação recebida.'
    },
    {
      titulo: 'Preparo do paciente para sessão de cetamina', categoria: 'Protocolo clínico', versao: '1.0',
      tags: 'cetamina, preparo, jejum, acompanhante',
      conteudo: 'Orientações padrão a serem enviadas 48 h antes:\n\n' +
        '1. Jejum conforme orientação médica individual.\n' +
        '2. Acompanhante maior de idade é obrigatório para a alta.\n' +
        '3. Não dirigir nem operar máquinas no dia.\n' +
        '4. Roupas confortáveis.\n' +
        '5. Manter a medicação de uso contínuo, salvo orientação médica em contrário.\n' +
        '6. Trazer a lista atualizada de medicações.\n\n' +
        'A confirmação de jejum e de acompanhante é item obrigatório do checklist e o sistema não permite ' +
        'concluir a sessão sem ele.'
    },
    {
      titulo: 'O que é encantamento nesta clínica', categoria: 'Treinamento', versao: '1.0',
      tags: 'experiência, encantamento, comunicação',
      conteudo: 'Encantamento não é mandar muitas mensagens. É demonstrar que a clínica prestou atenção.\n\n' +
        'A diferença é concreta: "Como você está?" é genérico. "Como foi sua primeira noite depois da mudança do ' +
        'tratamento?" prova que alguém olhou o caso.\n\n' +
        'Regra prática: toda mensagem precisa citar um fato específico daquele paciente — o exame que falta, o ' +
        'retorno combinado, a preferência registrada, a mudança recente. Sem fato específico, a mensagem não sai.\n\n' +
        'Encantamento também é ausência de atrito: o paciente não deveria precisar perguntar o que fazer em ' +
        'seguida, porque a clínica já sabe e já disse.'
    },
    {
      titulo: 'Uso de IA na clínica — o que pode e o que não pode', categoria: 'Regra administrativa', versao: '1.0',
      tags: 'IA, CFM, LGPD, governança',
      conteudo: 'A IA pode: resumir, organizar, identificar padrões, lembrar, classificar, priorizar, redigir ' +
        'rascunhos e sugerir.\n\n' +
        'A IA não pode: diagnosticar, alterar medicação, decidir internação, classificar risco suicida de forma ' +
        'definitiva, liberar procedimento ou enviar orientação clínica sem governança humana.\n\n' +
        'A Res. CFM 2.454/2026 regulamenta o uso de IA na medicina e mantém diagnóstico, prognóstico e decisão ' +
        'terapêutica sob responsabilidade do médico.\n\n' +
        'Dados de saúde são dados pessoais sensíveis na LGPD (art. 11) e seu tratamento depende de hipótese legal ' +
        'específica — tutela da saúde é uma delas, quando realizada nos termos da lei. A ANPD trata tecnologias ' +
        'emergentes, decisões automatizadas e dados sensíveis como elementos de tratamento de alto risco.\n\n' +
        'Antes de colocar prontuário em qualquer IA comercial, avalie: controlador e operador, contrato, retenção, ' +
        'localização dos dados, acesso, logs, criptografia, finalidade, subcontratados e uso para treinamento do modelo.'
    }
  ];

  Seed.CONSENTIMENTOS = [
    { titulo: 'Consentimento — sessão de cetamina', conteudo: 'Termo de consentimento livre e esclarecido para administração de cetamina em ambiente ambulatorial, com descrição de indicação, alternativas, efeitos esperados, efeitos adversos possíveis, necessidade de acompanhante e critérios de alta. [Texto a ser validado pela direção clínica e pelo jurídico da clínica antes do uso.]' },
    { titulo: 'Consentimento — estimulação magnética transcraniana', conteudo: 'Termo de consentimento livre e esclarecido para EMT, com descrição de indicação, contraindicações, número previsto de sessões, efeitos esperados e adversos. [Texto a ser validado pela direção clínica e pelo jurídico da clínica antes do uso.]' },
    { titulo: 'Consentimento — tratamento de dados pessoais sensíveis', conteudo: 'Informação ao titular sobre quais dados de saúde são tratados, com que finalidade, por quanto tempo, com quem são compartilhados e quais são seus direitos. Hipótese legal aplicável registrada no campo próprio. [Texto a ser validado pelo encarregado de dados.]' },
    { titulo: 'Consentimento — uso de ferramentas de apoio por inteligência artificial', conteudo: 'Informação ao paciente de que a clínica utiliza ferramentas de apoio à organização de informações, que não substituem decisão profissional, e de como os dados são minimizados antes de qualquer processamento externo. [Texto a ser validado pelo encarregado de dados e pela direção clínica.]' }
  ];

  Seed.SERVICOS_PADRAO = {
    'Primeira consulta psiquiátrica': 180,
    'Retorno psiquiátrico': 120,
    'Psicoterapia (sessão)': 150,
    'Sessão de cetamina EV': 620,
    'Sessão de EMT': 210,
    'Avaliação neuropsicológica': 480,
    'Programa B2B — saúde mental corporativa': 900
  };

  /** Instala templates de produção. Idempotente: não duplica. */
  Seed.instalarPadroes = async function () {
    var criados = 0;

    var pops = await DB.listar('processos');
    for (var i = 0; i < Seed.POPS.length; i++) {
      var p = Seed.POPS[i];
      if (pops.some(function (x) { return x.titulo === p.titulo; })) continue;
      await DB.salvar('processos', Object.assign({}, p), { acao: 'instalar_pop_padrao' });
      criados++;
    }

    var con = await DB.listar('conhecimento');
    for (i = 0; i < Seed.CONHECIMENTO.length; i++) {
      var c = Seed.CONHECIMENTO[i];
      if (con.some(function (x) { return x.titulo === c.titulo; })) continue;
      await DB.salvar('conhecimento', Object.assign({ autor: 'Direção clínica' }, c), { acao: 'instalar_conhecimento_padrao' });
      criados++;
    }

    var qual = await DB.listar('qualidade');
    for (i = 0; i < Seed.CONSENTIMENTOS.length; i++) {
      var t = Seed.CONSENTIMENTOS[i];
      if (qual.some(function (x) { return x.titulo === t.titulo; })) continue;
      await DB.salvar('qualidade', {
        tipo: 'Consentimento', titulo: t.titulo, versao: '1.0', conteudo: t.conteudo,
        baseLegal: 'LGPD art. 11, II, "a" — tutela da saúde',
        responsavel: 'Direção clínica', status: 'Vigente',
        revisaoEm: U.dataISO(new Date(Date.now() + 365 * 86400000))
      }, { acao: 'instalar_consentimento_padrao' });
      criados++;
    }

    var custos = await DB.cfg('custos_servico', null);
    if (!custos || !Object.keys(custos).length) {
      await DB.setCfg('custos_servico', Seed.SERVICOS_PADRAO, { acao: 'instalar_catalogo_padrao' });
      criados++;
    }
    if ((await DB.cfg('retencao_anos', null)) === null) {
      await DB.setCfg('retencao_anos', GNE.Retencao.ANOS_PADRAO, { acao: 'definir_retencao_inicial' });
    }
    return criados;
  };

  /* ===========================================================================
     2. DEMONSTRAÇÃO — tudo marcado como massa de teste
     ======================================================================== */
  var NOMES = ['Helena Vasconcelos', 'Rafael Monteiro', 'Beatriz Almeida Cruz', 'Tomás Ferreira',
               'Luciana Prado', 'Marcelo Andrade', 'Sofia Bastos', 'Eduardo Lima Rocha',
               'Carolina Nunes', 'Vicente Barros', 'Isabel Moreira', 'André Sampaio'];

  function dAtras(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

  Seed.popular = async function () {
    var resumo = { total: 0, porStore: {} };
    async function por(store, obj) {
      obj.testData = true;
      await DB.salvar(store, obj, { semAuditoria: true });
      resumo.porStore[store] = (resumo.porStore[store] || 0) + 1;
      resumo.total++;
      return obj;
    }

    var canais = ['WhatsApp', 'Instagram', 'Indicação médica', 'LinkedIn', 'TikTok', 'Empresa (B2B)'];
    var servicos = Object.keys(Seed.SERVICOS_PADRAO);
    var profs = ['Dr. Adiel Ríos', 'Dra. Marina Teixeira', 'Psic. Renata Coelho'];
    var pacientes = [];

    /* pacientes */
    for (var i = 0; i < NOMES.length; i++) {
      var status = i < 8 ? 'Ativo' : i < 10 ? 'Inativo' : i === 10 ? 'Alta' : 'Em avaliação';
      var p = await por('pacientes', {
        nome: NOMES[i],
        nasc: U.dataISO(new Date(1970 + (i * 3) % 35, (i * 5) % 12, 1 + (i * 7) % 27)),
        contato: 'contato' + i + '@exemplo.test',
        origem: canais[i % canais.length],
        status: status,
        responsavelCaso: profs[i % profs.length],
        riscoClinico: i === 0 ? 'Alto' : i < 3 ? 'Moderado' : 'Baixo',
        preferencias: i % 3 === 0 ? 'Prefere horários pela manhã; tratar pelo primeiro nome.'
                    : i % 3 === 1 ? 'Sensível a espera; avisar qualquer atraso com antecedência.'
                    : 'Vem sempre com acompanhante; reservar cadeira extra na sala.',
        convenio: i % 4 === 0 ? 'Reembolso' : i % 5 === 0 ? 'Empresa (B2B)' : 'Particular',
        criadoEm: dAtras(200 - i * 12)
      });
      pacientes.push(p);
    }

    /* leads */
    for (i = 0; i < 14; i++) {
      var virou = i < 6;
      var criado = dAtras(i * 4 + 1);
      var temContato = i !== 2 && i !== 9;   // dois leads propositalmente sem primeiro contato
      await por('leads', {
        nome: virou ? pacientes[i].nome : 'Contato ' + (i + 1) + ' — demonstração',
        tipo: i % 5 === 0 ? 'B2B' : i % 4 === 0 ? 'Indicação médica' : 'B2C',
        empresa: i % 5 === 0 ? 'Empresa Demonstração ' + i : null,
        canal: canais[i % canais.length],
        estagio: virou ? 'Em tratamento' : i === 3 ? 'Perdido' : GNE.ESTAGIOS_CRM[i % 5],
        motivoPerda: i === 3 ? 'Preço acima do orçamento disponível' : null,
        contato: 'lead' + i + '@exemplo.test',
        valorEstimado: 2500 + i * 450,
        dono: 'Concierge',
        criadoEm: criado,
        primeiroContatoEm: temContato ? new Date(new Date(criado).getTime() + (i % 4) * 11 * 60000).toISOString() : null,
        ultimoContatoEm: temContato ? dAtras(i * 2) : null,
        pacienteId: virou ? pacientes[i].id : null
      });
    }

    /* agenda */
    var tipos = ['Primeira consulta', 'Retorno', 'Psicoterapia', 'Procedimento'];
    var salas = ['Consultório 1', 'Consultório 2', 'Sala de Procedimentos'];
    for (i = 0; i < 46; i++) {
      var pac = pacientes[i % 9];
      var diasAtras = 70 - i * 2;                     // vai do passado ao futuro
      var quando = new Date(Date.now() - diasAtras * 86400000);
      quando.setHours(8 + (i % 9), (i % 2) * 30, 0, 0);
      var futuro = quando > new Date();
      var st;
      if (futuro) st = (i % 3 === 0) ? 'Agendado' : 'Confirmado';
      else st = (i % 11 === 0) ? 'Faltou' : (i % 13 === 0) ? 'Cancelado' : 'Compareceu';
      var fim = new Date(quando.getTime() + 50 * 60000);
      await por('agenda', {
        pacienteId: pac.id, tipo: tipos[i % tipos.length],
        profissional: profs[i % profs.length], sala: salas[i % salas.length],
        inicio: quando.toISOString(), fim: fim.toISOString(), status: st,
        valor: [800, 550, 450, 1400][i % 4],
        criadoEm: new Date(quando.getTime() - (7 + (i % 20)) * 86400000).toISOString()
      });
    }

    /* MBC — séries com trajetórias diferentes */
    var perfis = [
      { escala: 'PHQ-9', serie: [21, 19, 17, 18, 20] },     // sem resposta, piorando
      { escala: 'PHQ-9', serie: [22, 16, 11, 8] },          // respondendo bem
      { escala: 'GAD-7', serie: [18, 14, 10, 9] },
      { escala: 'GAD-7', serie: [12, 13, 17] },             // piora
      { escala: 'WHO-5', serie: [24, 32, 44, 56] },
      { escala: 'PSQI', serie: [15, 13, 12, 11] },
      { escala: 'WHODAS', serie: [62, 58, 51] },
      { escala: 'CGI-S', serie: [5, 4, 4, 3] }
    ];
    for (i = 0; i < perfis.length; i++) {
      var perfil = perfis[i];
      for (var j = 0; j < perfil.serie.length; j++) {
        await por('mbc', {
          pacienteId: pacientes[i].id, escala: perfil.escala, score: perfil.serie[j],
          ts: dAtras((perfil.serie.length - j) * 28),
          origem: j % 2 ? 'Aplicada em consulta' : 'Autoaplicada remota'
        });
      }
    }
    // uma triagem de risco positiva, para exercitar o caminho crítico
    await por('mbc', { pacienteId: pacientes[0].id, escala: 'C-SSRS', score: 2, ts: dAtras(4), origem: 'Aplicada em consulta' });

    /* prontuário */
    for (i = 0; i < 16; i++) {
      await por('prontuario', {
        pacienteId: pacientes[i % 8].id,
        tipo: i % 5 === 0 ? 'Solicitação de exame' : i % 3 === 0 ? 'Prescrição' : 'Evolução',
        titulo: i % 5 === 0 ? 'Exames laboratoriais de rotina' : 'Consulta de acompanhamento',
        texto: '[Registro de demonstração] Conteúdo fictício, sem qualquer informação clínica real. ' +
               'Serve apenas para exercitar a estrutura do prontuário e a imutabilidade após assinatura.',
        ts: dAtras(60 - i * 3),
        autor: profs[i % profs.length] + ' — CRM/CRP fictício',
        resultadoRecebido: i % 5 === 0 ? (i > 8) : undefined,
        assinado: i % 4 !== 0
      });
    }

    /* procedimentos */
    var consentimentos = (await DB.listar('qualidade')).filter(function (q) { return q.tipo === 'Consentimento'; });
    for (i = 0; i < 9; i++) {
      var comIntercorrencia = (i === 2);
      await por('procedimentos', {
        pacienteId: pacientes[i % 6].id,
        tipo: i % 3 === 0 ? 'Cetamina EV' : i % 3 === 1 ? 'EMT' : 'Infusão',
        ts: dAtras(40 - i * 4),
        etapa: i === 8 ? 'Agendado' : 'Concluído',
        profissional: profs[i % profs.length],
        consentimentoId: (i === 7) ? null : (consentimentos[i % (consentimentos.length || 1)] || {}).id,
        checklist: (GNE.CHECKLIST_PROC[i % 3 === 0 ? 'Cetamina EV' : i % 3 === 1 ? 'EMT' : 'Infusão'] || []).join('\n'),
        paBasal: '120/80', fcBasal: 72 + i, paFinal: '118/76', fcFinal: 70 + i,
        intercorrencia: comIntercorrencia ? 'Náusea leve ao final da sessão, resolvida com medida de suporte.' : null,
        followUpFeito: false
      });
    }

    /* financeiro */
    for (i = 0; i < 60; i++) {
      var ehReceita = i % 4 !== 0;
      if (ehReceita) {
        var serv = servicos[i % servicos.length];
        var vencR = dAtras(75 - i);
        var pago = i % 9 !== 0;
        await por('financeiro', {
          tipo: 'Receita', descricao: serv, valor: [800, 550, 450, 1400, 620, 2200][i % 6],
          pacienteId: pacientes[i % 10].id, servico: serv,
          profissional: profs[i % profs.length],
          venc: U.dataISO(vencR), status: pago ? 'Pago' : 'Previsto',
          pagoEm: pago ? U.dataISO(vencR) : null
        });
      } else {
        var cats = ['Mídia paga', 'Pessoal', 'Aluguel', 'Insumos', 'Software'];
        await por('financeiro', {
          tipo: 'Despesa', descricao: cats[i % cats.length] + ' — demonstração',
          valor: [3200, 12000, 9000, 1800, 900][i % 5],
          categoria: cats[i % cats.length],
          canal: cats[i % cats.length] === 'Mídia paga' ? canais[i % canais.length] : null,
          venc: U.dataISO(dAtras(70 - i)), status: 'Pago', pagoEm: U.dataISO(dAtras(70 - i))
        });
      }
    }

    /* interações */
    for (i = 0; i < 40; i++) {
      var recebida = i % 2 === 0;
      var ts = dAtras(28 - Math.floor(i / 2));
      await por('interacoes', {
        pacienteId: pacientes[i % 10].id,
        canal: i % 5 === 0 ? 'Telefone' : i % 7 === 0 ? 'E-mail' : 'WhatsApp',
        direcao: recebida ? 'Recebida' : 'Enviada',
        ts: ts,
        classificacao: i % 11 === 0 ? 'Reclamação' : i % 5 === 0 ? 'Financeira' : i % 3 === 0 ? 'Agendamento' : 'Administrativa',
        texto: '[Demonstração] Resumo fictício de interação, sem conteúdo real.',
        responsavel: 'Concierge',
        respondidaEm: recebida ? new Date(new Date(ts).getTime() + (8 + (i % 5) * 14) * 60000).toISOString() : null,
        resolvidoNoPrimeiro: recebida ? (i % 4 !== 0) : undefined
      });
    }

    /* experiência */
    for (i = 0; i < 22; i++) {
      var tipoE = i % 7 === 0 ? 'Reclamação' : i % 3 === 0 ? 'CSAT' : 'NPS';
      await por('experiencia', {
        pacienteId: pacientes[i % 10].id, tipo: tipoE,
        score: tipoE === 'NPS' ? [10, 9, 9, 8, 10, 6, 9, 10, 5, 9][i % 10]
             : tipoE === 'CSAT' ? [5, 4, 5, 3, 5][i % 5] : null,
        etapa: ['Primeiro contato', 'Chegada e recepção', 'Consulta', 'Procedimento', 'Pós-consulta', 'Financeiro'][i % 6],
        comentario: tipoE === 'Reclamação'
          ? '[Demonstração] Demorou para responder no WhatsApp e precisei perguntar duas vezes.'
          : '[Demonstração] Atendimento acolhedor; a recepção lembrou da minha preferência.',
        ts: dAtras(80 - i * 3),
        resolvido: tipoE === 'Reclamação' ? (i > 14) : undefined,
        tratativa: (tipoE === 'Reclamação' && i > 14) ? '[Demonstração] Contato telefônico, pedido de desculpas e ajuste da escala do plantão.' : null
      });
    }

    /* tarefas */
    for (i = 0; i < 8; i++) {
      await por('tarefas', {
        titulo: ['Enviar escala mensal', 'Conferir recebimento de exame', 'Confirmar sessão de EMT',
                 'Revisar contrato B2B', 'Atualizar POP de cetamina', 'Ligar para paciente detrator',
                 'Conciliar recebimentos da semana', 'Revisar consentimento de IA'][i],
        processo: 'Rotina operacional',
        responsavel: ['Concierge', 'Concierge', 'Concierge', 'Comercial', 'Qualidade', 'Concierge', 'Financeiro', 'Qualidade'][i],
        status: i < 6 ? 'Aberta' : 'Concluída',
        critica: i === 5,
        prazo: dAtras(i < 3 ? 2 : -5),
        pacienteId: i < 3 ? pacientes[i].id : null,
        descricao: '[Demonstração]',
        evidenciaConclusao: i >= 6 ? '[Demonstração] Concluída com registro.' : null
      });
    }

    await GNE.Auditoria.registrar({
      acao: 'popular_demonstracao', modulo: 'testes',
      detalhe: 'Criados ' + resumo.total + ' registros de demonstração, todos marcados como massa de teste.'
    });
    return resumo;
  };

})(typeof window !== 'undefined' ? window : globalThis);
