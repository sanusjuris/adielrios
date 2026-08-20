import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve(new URL('../clinica', import.meta.url).pathname);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const s=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; const f=path.join(ROOT,p);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); r.end(fs.readFileSync(f));});
await new Promise(r=>s.listen(4181,r));
const b=await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
const pg=await b.newPage();
await pg.goto('http://localhost:4181/',{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>window.GNE && GNE.KPI);
const d = await pg.evaluate(()=>({
  kpis: GNE.KPI.CATALOGO.map(k=>({id:k.id,nome:k.nome,bloco:k.bloco,dono:k.dono,unidade:k.unidade,
        direcao:k.direcao,meta:k.meta===undefined?null:k.meta,fonte:k.fonte,desc:k.desc})),
  modulos: GNE.MODULOS,
  papeis: Object.keys(GNE.PAPEIS).map(k=>({id:k,nome:GNE.PAPEIS[k].nome,desc:GNE.PAPEIS[k].desc,
        todos:!!GNE.PAPEIS[k].todos, perm:GNE.PAPEIS[k].perm||null})),
  regras: GNE.NBA.REGRAS.map(r=>({id:r.id,rotulo:r.rotulo,prioridade:r.prioridade,dono:r.dono,modulo:r.modulo,desc:r.desc}))
          .concat(GNE.NBA.REGRAS_LEAD.map(r=>({id:r.id,rotulo:r.rotulo,prioridade:r.prioridade,dono:r.dono,modulo:r.modulo,desc:'Aplica-se a leads ainda não convertidos em paciente.'}))),
  agentes: GNE.IA.AGENTES.map(a=>({id:a.id,nome:a.nome,modulo:a.modulo,papel:a.papel,resumo:a.resumo})),
  escalas: Object.keys(GNE.ESCALAS).map(k=>({id:k,...GNE.ESCALAS[k]})),
  pops: GNE.Seed.POPS.map(p=>({titulo:p.titulo,area:p.area,gatilho:p.gatilho,responsavel:p.responsavel,
        sla:p.sla,etapas:p.etapas.split('\n'),evidencia:p.evidencia,escalonamento:p.escalonamento,indicador:p.indicador})),
  stores: Object.keys(GNE.STORES),
  imutaveis: Object.keys(GNE.IMUTAVEIS)
}));
fs.writeFileSync(new URL('./catalogo.json', import.meta.url), JSON.stringify(d, null, 1));
console.log('kpis',d.kpis.length,'| regras',d.regras.length,'| agentes',d.agentes.length,'| pops',d.pops.length,'| papeis',d.papeis.length);
await b.close(); s.close();
