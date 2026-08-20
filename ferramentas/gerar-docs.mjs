import fs from 'node:fs';
const doc = n => new URL('../docs/' + n, import.meta.url);
const d = JSON.parse(fs.readFileSync(new URL('./catalogo.json', import.meta.url), 'utf8'));
const esc = s => String(s??'').replace(/\|/g,'\\|');
let o = [];

o.push('# Dicionário de indicadores\n');
o.push('> Gerado a partir do catálogo do sistema (`clinica/js/kpi.js`). Se o código mudar, este arquivo é regerado — ele nunca é escrito à mão, justamente para não divergir do que a tela mostra.\n');
o.push(`São **${d.kpis.length} indicadores**, todos calculados de forma determinística sobre os registros do banco. Nenhum depende de modelo de linguagem.\n`);
o.push('**Como ler a coluna Direção:** `maior` = maior é melhor; `menor` = menor é melhor; `neutro` = é uma contagem, não uma nota.\n');
o.push('**Regra de honestidade embutida:** indicador com denominador zero aparece como `—` em cinza, nunca como 0% em vermelho. Ausência de base não é mau desempenho.\n');
const blocos = [...new Set(d.kpis.map(k=>k.bloco))];
for (const b of blocos) {
  o.push(`\n## ${b}\n`);
  o.push('| Indicador | Dono | Direção | Meta | Fonte | O que mede exatamente |');
  o.push('|---|---|---|---|---|---|');
  d.kpis.filter(k=>k.bloco===b).forEach(k=>{
    o.push(`| **${esc(k.nome)}**<br>\`${k.id}\` | ${esc(k.dono)} | ${k.direcao} | ${k.meta===null?'—':esc(k.meta)+(k.unidade==='%'?'%':'')} | ${esc(k.fonte)} | ${esc(k.desc)} |`);
  });
}
fs.writeFileSync(doc('INDICADORES.md'), o.join('\n')+'\n');

// ---- Next Best Action
o = [];
o.push('# Motor Next Best Action — catálogo de regras\n');
o.push('> Gerado a partir de `clinica/js/kpi.js`. São as regras que respondem, para cada paciente e cada lead: **qual é a próxima coisa que a clínica precisa fazer?**\n');
o.push('Cada regra é determinística. Quando dispara, ela devolve a **evidência** — o registro concreto que a acionou — e o **dono** da ação. Nada aqui vem de modelo de linguagem: a IA só entra depois, para redigir a mensagem, e sempre com aprovação humana.\n');
o.push(`Faixas: prioridade **≥ 85 = máxima** (risco, intercorrência, consentimento), **60–84 = alta** (acompanhamento e recuperação), **< 60 = normal** (rotina e reativação).\n`);
o.push('| Prior. | Regra | Dispara quando | Dono | Módulo |');
o.push('|---:|---|---|---|---|');
d.regras.sort((a,b)=>b.prioridade-a.prioridade).forEach(r=>{
  o.push(`| ${r.prioridade} | **${esc(r.rotulo)}** | ${esc(r.desc)} | ${esc(r.dono)} | ${esc(r.modulo)} |`);
});
o.push('\n## Preditores que alimentam as regras\n');
o.push('Três scorecards, todos com pesos explícitos e motivos legíveis na tela:\n');
o.push('- **Risco de falta (no-show)** — histórico de faltas, confirmação pendente, antecedência do agendamento, primeira consulta, origem de mídia fria, silêncio recente, pendência financeira vencida. Serve para priorizar confirmação ativa, nunca para julgar o paciente.');
o.push('- **Risco de abandono** — dias sem consulta, ausência de retorno agendado, faltas recentes, silêncio, inadimplência, alerta MBC ativo, detrator no último NPS.');
o.push('- **Economia por canal** — CAC, LTV, ROI e conversão por origem, com veredito aritmético: escalar / manter / ajustar / cortar.\n');
o.push('Nenhum deles é diagnóstico nem estatística oculta: são somas de fatores declarados, e a interface mostra cada parcela.\n');
fs.writeFileSync(doc('NEXT-BEST-ACTION.md'), o.join('\n')+'\n');

// ---- POPs
o = [];
o.push('# Processos operacionais padrão (POPs)\n');
o.push('> Gerado a partir de `clinica/js/seed.js`. Estes POPs são **instalados como produção** na primeira execução e ficam editáveis no módulo *Processos & POPs*.\n');
o.push('Um POP aqui não é PDF numa pasta. Cada um declara sete coisas, e o sistema cobra todas elas:\n');
o.push('**gatilho → responsável → SLA → etapas → evidência de conclusão → regra de escalonamento → indicador que o mede.**\n');
o.push('Processo sem indicador não é gerenciável. Processo sem evidência não é processo — é intenção.\n');
d.pops.forEach((p,i)=>{
  const kpi = d.kpis.find(k=>k.id===p.indicador);
  o.push(`\n---\n\n## ${i+1}. ${p.titulo}\n`);
  o.push(`**Área:** ${p.area}  \n**Gatilho:** ${p.gatilho}  \n**Responsável:** ${p.responsavel}  \n**SLA:** ${p.sla}  \n**Indicador:** ${kpi?kpi.nome+' (`'+kpi.id+'`)':'—'}\n`);
  o.push('**Fluxo:**\n');
  p.etapas.forEach((e,j)=>o.push(`${j+1}. ${e}`));
  o.push(`\n**Evidência de conclusão:** ${p.evidencia}\n`);
  o.push(`**Se o SLA estourar:** ${p.escalonamento}\n`);
});
fs.writeFileSync(doc('PROCESSOS.md'), o.join('\n')+'\n');

// ---- RBAC
o = [];
o.push('# Perfis, permissões e auditoria\n');
o.push('> Gerado a partir de `clinica/js/core.js`. São os perfis-semente; a matriz é editável por usuário em *Administração → Permissões*, e cada alteração é auditada.\n');
o.push('## Módulos\n');
o.push('| Módulo | Grupo | Sistema | O que controla |');
o.push('|---|---|---|---|');
d.modulos.forEach(m=>o.push(`| **${esc(m.nome)}** \`${m.id}\` | ${m.grupo} | ${m.sistema||'—'} | ${esc(m.desc)} |`));
o.push('\n## Matriz de permissões por perfil\n');
o.push('`V` = pode ver · `E` = pode editar · `—` = sem acesso\n');
const cols = d.modulos.map(m=>m.id);
o.push('| Perfil | ' + d.modulos.map(m=>m.nome.replace(/ /g,'&nbsp;')).join(' | ') + ' |');
o.push('|---|' + cols.map(()=>':--:').join('|') + '|');
d.papeis.forEach(p=>{
  const cel = cols.map(c=>{
    if (p.todos) return 'V E';
    const perm = (p.perm||{})[c] || [];
    if (!perm.length) return '—';
    return perm.includes('editar') ? 'V E' : 'V';
  });
  o.push(`| **${esc(p.nome)}** | ${cel.join(' | ')} |`);
});
o.push('\n### O que cada perfil é\n');
d.papeis.forEach(p=>o.push(`- **${p.nome}** — ${p.desc}`));
o.push('\n## Fronteiras que a matriz protege\n');
o.push('- **Concierge não abre prontuário.** Ele conhece agenda, preferências, pendências e experiência. Não interpreta sintoma nem orienta conduta. Interação com conteúdo clínico só grava se for marcada como encaminhada ao assistencial — o sistema recusa a alternativa.');
o.push('- **Financeiro e Comercial não acessam dado clínico.** Nem prontuário, nem MBC, nem procedimentos.');
o.push('- **Gestão vê tudo, mas não escreve em prontuário.**');
o.push('- **Administração é exclusiva do Super Administrador** — inclusive a trilha de auditoria e o prazo de retenção.');
o.push('- Marcar *editar* ou *excluir* sem *ver* é incoerente; o sistema adiciona *ver* automaticamente ao salvar a matriz.\n');
o.push('## Auditoria\n');
o.push(`Coleções do banco: \`${d.stores.join('`, `')}\`.\n`);
o.push(`**Imutáveis (append-only, sem caminho de exclusão nem para o Super Administrador):** \`${d.imutaveis.join('`, `')}\`.\n`);
o.push('Toda escrita passa por `DB.salvar`/`DB.remover`, e ambos gravam na trilha **antes de retornar**. Não existe caminho de gravação que escape da auditoria. Cada evento guarda: data e hora, usuário, papel, ação, módulo, registro afetado, e o estado **antes** e **depois** — com senhas e sais redigidos e textos longos truncados, por minimização.\n');
o.push('Um registro de prontuário assinado não pode ser alterado nem apagado. Correção entra como **adenda**, com autor e data próprios.\n');
fs.writeFileSync(doc('PERMISSOES-E-AUDITORIA.md'), o.join('\n')+'\n');
console.log('docs gerados');
