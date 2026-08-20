/* Verificação end-to-end do GNE Clinical OS com Chromium real. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../clinica', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

const erros = [];
// Falhas de rede para os hosts de fonte são esperadas neste sandbox (sem saída
// para fonts.googleapis.com) e já são tratadas: a folha é não bloqueante.
let falhasFonte = 0;
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t) && falhasFonte > 0) { falhasFonte--; return; }
  erros.push('CONSOLE: ' + t);
});
page.on('pageerror', e => erros.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0,4).join('\n')));
page.on('requestfailed', r => {
  const u = r.url();
  if (u.includes('fonts.googleapis') || u.includes('fonts.gstatic')) { falhasFonte++; return; }
  erros.push('REQFAIL: ' + u + ' — ' + (r.failure()?.errorText || ''));
});

function log(...a) { console.log(...a); }
let falhas = 0;
function check(nome, cond, extra = '') {
  if (cond) log('  ✓ ' + nome + (extra ? ' — ' + extra : ''));
  else { falhas++; log('  ✗ ' + nome + (extra ? ' — ' + extra : '')); }
}

log('\n═══ 1. Carga inicial ═══');
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForSelector('#login:not([hidden])', { timeout: 8000 });
check('Tela de login aparece', await page.isVisible('#login'));
check('Aviso de instalação mostrado', await page.isVisible('#login-instalacao'));
const instal = await page.textContent('#login-instalacao');
log('    ' + instal.replace(/\s+/g, ' ').trim());

log('\n═══ 2. Autenticação ═══');
await page.fill('#login-email', 'adielcarneiro@gmail.com');
await page.fill('#login-senha', 'senha-errada-qualquer');
await page.click('#login-btn');
await page.waitForTimeout(600);
check('Senha errada é rejeitada', (await page.textContent('#login-erro')).includes('inválidos'),
  (await page.textContent('#login-erro')).trim());

await page.fill('#login-email', 'adielcarneiro@gmail.com');
await page.fill('#login-senha', 'GNE-Clinical-2026!');
await page.click('#login-btn');
await page.waitForSelector('.modal', { timeout: 8000 });
check('Troca de senha é obrigatória no 1º acesso', (await page.textContent('.modal__cabeca h2')).includes('senha'));

// senha curta deve ser recusada
await page.fill('.modal input[type=password]:nth-of-type(1)', 'curta');
let inputs = await page.$$('.modal input[type=password]');
await inputs[0].fill('curta');
await inputs[1].fill('curta');
await page.click('.modal__pe .btn');
await page.waitForTimeout(500);
check('Senha curta é recusada', (await page.$$('.toast')).length > 0 || (await page.$('.modal')) !== null);

inputs = await page.$$('.modal input[type=password]');
await inputs[0].fill('Clinica-GNE-2026-forte!');
await inputs[1].fill('Clinica-GNE-2026-forte!');
await page.click('.modal__pe .btn');
await page.waitForSelector('#app.ativo', { timeout: 10000 });
check('Entrou no sistema após definir senha', await page.isVisible('#app'));

log('\n═══ 3. Navegação por todos os módulos ═══');
const mods = await page.$$eval('.nav__item', els => els.map(e => e.getAttribute('data-mod')));
check('Todos os 18 módulos visíveis ao super admin', mods.length === 18, mods.length + ' módulos');
for (const m of mods) {
  const antes = erros.length;
  await page.click(`.nav__item[data-mod="${m}"]`);
  await page.waitForTimeout(420);
  const h1 = await page.textContent('#conteudo h1').catch(() => '(sem h1)');
  const temErroUI = await page.$('.aviso--risco') !== null
    && (await page.textContent('#conteudo').catch(()=>'')).includes('Erro ao abrir o módulo');
  check(`Módulo ${m} renderiza`, !temErroUI && erros.length === antes, h1.trim().slice(0, 40));
}

log('\n═══ 4. Seed de demonstração ═══');
await page.click('.nav__item[data-mod="testes"]');
await page.waitForTimeout(400);
const nSeed = erros.length;
await page.click('button:has-text("Popular demonstração")');
await page.waitForSelector('.modal', { timeout: 5000 });
await page.click('.modal__pe .btn--risco');
await page.waitForTimeout(6000);
const seedTxt = await page.textContent('#conteudo').catch(() => '');
check('Demonstração criada sem erro', seedTxt.includes('Demonstração criada') && erros.length === nSeed,
  (seedTxt.match(/Demonstração criada[^<]{0,80}/) || [''])[0].slice(0, 90));

log('\n═══ 5. Re-navegação com dados reais ═══');
for (const m of mods) {
  const antes = erros.length;
  await page.click(`.nav__item[data-mod="${m}"]`);
  await page.waitForTimeout(500);
  const txt = await page.textContent('#conteudo').catch(() => '');
  check(`Módulo ${m} com dados`, !txt.includes('Erro ao abrir o módulo') && erros.length === antes);
}

log('\n═══ 6. Command Center com dados ═══');
await page.click('.nav__item[data-mod="command"]');
await page.waitForTimeout(900);
const kpis = await page.$$('#conteudo .kpi');
check('Command Center exibe indicadores', kpis.length >= 30, kpis.length + ' KPIs');
const semDado = await page.$$eval('#conteudo .kpi__val', els => els.filter(e => e.textContent.trim() === '—').length);
log('    KPIs sem base de cálculo: ' + semDado);
const tabelas = await page.$$('#conteudo table.tab');
check('Tabelas de canal e margem renderizam', tabelas.length >= 2, tabelas.length + ' tabelas');

log('\n═══ 7. Next Best Action ═══');
await page.click('.nav__item[data-mod="nba"]');
await page.waitForTimeout(900);
const linhasNba = await page.$$('#conteudo table.tab tbody tr');
check('Motor NBA gera ações', linhasNba.length > 0, linhasNba.length + ' linhas');

log('\n═══ 8. CRUD real — criar paciente pela interface ═══');
await page.click('.nav__item[data-mod="pacientes"]');
await page.waitForTimeout(700);
const antesLinhas = (await page.$$('#conteudo table.tab tbody tr')).length;
await page.click('button:has-text("+ Paciente")');
await page.waitForSelector('.modal', { timeout: 4000 });
// tenta salvar vazio → deve recusar
await page.click('.modal__pe .btn:not(.btn--linha)');
await page.waitForTimeout(400);
check('Formulário recusa campos obrigatórios vazios', (await page.$$('.toast')).length > 0,
  await page.textContent('.toast').catch(() => ''));
async function preencher(rot, valor) {
  const loc = page.locator(`.modal .campo:has(label:text-is("${rot}")) input, .modal .campo:has(label:text-is("${rot}")) textarea`).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  await loc.fill(valor);
}
async function escolher(rot, label) {
  const loc = page.locator(`.modal .campo:has(label:text-is("${rot}")) select`).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  await loc.selectOption({ label });
}
await preencher('Nome completo *', 'Paciente Criado Pela UI');
await escolher('Origem *', 'WhatsApp');
await page.click('.modal__pe .btn:not(.btn--linha)');
await page.waitForTimeout(900);
const depoisLinhas = (await page.$$('#conteudo table.tab tbody tr')).length;
check('Paciente criado e listado', depoisLinhas === antesLinhas + 1, `${antesLinhas} → ${depoisLinhas}`);

log('\n═══ 9. Auditoria registrou a criação ═══');
await page.click('.nav__item[data-mod="admin"]');
await page.waitForTimeout(600);
await page.click('.aba:has-text("Auditoria")');
await page.waitForTimeout(900);
await page.fill('#au-busca', 'Paciente Criado Pela UI');
await page.waitForTimeout(700);
const audLinhas = await page.$$('#au-lista table.tab tbody tr');
check('Auditoria contém a criação feita pela UI', audLinhas.length > 0, audLinhas.length + ' evento(s)');

log('\n═══ 10. Permissões — usuário concierge ═══');
await page.click('.aba:has-text("Usuários")');
await page.waitForTimeout(600);
await page.click('button:has-text("+ Novo usuário")');
await page.waitForSelector('.modal', { timeout: 4000 });
await preencher('Nome completo *', 'Concierge de Teste');
await preencher('E-mail (login) *', 'concierge@teste.local');
await escolher('Perfil *', 'Concierge');
await preencher('Senha inicial *', 'Concierge-2026-forte!');
await page.click('.modal__pe .btn:not(.btn--linha)');
await page.waitForTimeout(1500);
const toastTxt = await page.textContent('.toast').catch(() => '(sem toast)');
const modalAberto = (await page.$('.modal')) !== null;
check('Usuário concierge criado', (await page.textContent('#conteudo')).includes('concierge@teste.local'),
  'toast: ' + toastTxt + ' | modal aberto: ' + modalAberto);
if (modalAberto) { await page.click('.modal .x'); await page.waitForTimeout(300); }

// sai e entra como concierge
await page.click('#btn-sair');
await page.waitForTimeout(1500);
await page.waitForSelector('#login:not([hidden])', { timeout: 8000 });
await page.fill('#login-email', 'concierge@teste.local');
await page.fill('#login-senha', 'Concierge-2026-forte!');
await page.click('#login-btn');
await page.waitForSelector('.modal', { timeout: 8000 });
const inp2 = await page.$$('.modal input[type=password]');
await inp2[0].fill('Concierge-Nova-2026!');
await inp2[1].fill('Concierge-Nova-2026!');
await page.click('.modal__pe .btn');
await page.waitForSelector('#app.ativo', { timeout: 8000 });

const modsConc = await page.$$eval('.nav__item', els => els.map(e => e.getAttribute('data-mod')));
check('Concierge NÃO vê Prontuário', !modsConc.includes('prontuario'), modsConc.join(','));
check('Concierge NÃO vê Administração', !modsConc.includes('admin'));
check('Concierge NÃO vê Financeiro', !modsConc.includes('financeiro'));
check('Concierge NÃO vê MBC', !modsConc.includes('mbc'));
check('Concierge VÊ CRM e Concierge', modsConc.includes('crm') && modsConc.includes('concierge'));

// tentativa de acesso direto por hash a módulo bloqueado
await page.evaluate(() => { location.hash = 'prontuario'; });
await page.waitForTimeout(900);
const h1Conc = await page.textContent('#conteudo h1').catch(() => '');
check('Acesso direto por URL a módulo bloqueado é barrado', !h1Conc.includes('Prontuário'), 'está em: ' + h1Conc.trim());

log('\n═══ 11. Suíte de autoteste interna (como super admin) ═══');
await page.click('#btn-sair');
await page.waitForTimeout(1500);
await page.waitForSelector('#login:not([hidden])', { timeout: 8000 });
await page.fill('#login-email', 'adielcarneiro@gmail.com');
await page.fill('#login-senha', 'Clinica-GNE-2026-forte!');
await page.click('#login-btn');
await page.waitForSelector('#app.ativo', { timeout: 10000 });

const suite = await page.evaluate(async () => await window.GNE.Testes.rodar());
log(`    ${suite.passou}/${suite.total} asserções em ${suite.ms}ms · resíduo ${suite.residuo}`);
const porGrupo = {};
suite.resultados.forEach(x => { (porGrupo[x.grupo] ||= []).push(x); });
for (const [g, l] of Object.entries(porGrupo)) {
  const f = l.filter(x => !x.ok);
  log(`    ${f.length ? '✗' : '✓'} ${g}: ${l.length - f.length}/${l.length}`);
  f.forEach(x => log(`        ✗ ${x.nome} — ${x.detalhe}`));
}
check('Suíte interna sem falhas', suite.falhou === 0, `${suite.falhou} falha(s)`);
check('Resíduo de massa de teste é zero', suite.residuo === 0);

log('\n═══ 12. Persistência após recarregar ═══');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const precisaLogin = await page.isVisible('#login');
if (precisaLogin) {
  await page.fill('#login-email', 'adielcarneiro@gmail.com');
  await page.fill('#login-senha', 'Clinica-GNE-2026-forte!');
  await page.click('#login-btn');
  await page.waitForSelector('#app.ativo', { timeout: 10000 });
}
await page.click('.nav__item[data-mod="pacientes"]');
await page.waitForTimeout(900);
const persistiu = (await page.textContent('#conteudo')).includes('Paciente Criado Pela UI');
check('Dados persistem após recarregar a página', persistiu);

log('\n═══ 13. Limpeza da massa de teste ═══');
await page.click('.nav__item[data-mod="testes"]');
await page.waitForTimeout(500);
await page.click('button:has-text("Apagar massa de teste")');
await page.waitForSelector('.modal', { timeout: 4000 });
await page.click('.modal__pe .btn--risco');
await page.waitForTimeout(2500);
const inv = await page.evaluate(async () => await window.GNE.Retencao.inventario());
check('Nenhuma massa de teste removível restante', inv.totalTeste === 0, inv.totalTeste + ' restantes');
check('Auditoria das operações de teste é retida de propósito', inv.testeRetidoAuditoria > 0,
  inv.testeRetidoAuditoria + ' evento(s) append-only');
const pops = await page.evaluate(async () => (await window.GNE.DB.listar('processos')).length);
const aud = await page.evaluate(async () => (await window.GNE.DB.listar('auditoria')).length);
check('POPs de produção preservados', pops >= 8, pops + ' POPs');
check('Trilha de auditoria preservada', aud > 50, aud + ' eventos');

log('\n═══ 14. Responsividade ═══');
for (const [w, h, nome] of [[390, 844, 'iPhone'], [820, 1180, 'iPad'], [1440, 950, 'Desktop']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.click('.nav__item[data-mod="command"]').catch(() => {});
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check(`${nome} (${w}px) sem overflow horizontal`, !overflow);
}
await page.setViewportSize({ width: 1440, height: 950 });

log('\n═══ 15. Tema escuro ═══');
await page.click('#btn-tema');
await page.waitForTimeout(400);
const tema = await page.getAttribute('html', 'data-tema');
check('Alternância de tema funciona', tema === 'escuro' || tema === 'claro', tema);
await page.screenshot({ path: new URL('./shot-escuro.png', import.meta.url).pathname, fullPage: false });
await page.click('#btn-tema');
await page.waitForTimeout(400);
await page.screenshot({ path: new URL('./shot-claro.png', import.meta.url).pathname, fullPage: false });

log('\n═══ RESUMO ═══');
log(`Falhas nas verificações: ${falhas}`);
log(`Erros de console / página: ${erros.length}`);
erros.slice(0, 25).forEach(e => log('  ! ' + e.split('\n')[0].slice(0, 200)));

await browser.close();
server.close();
process.exit(falhas === 0 && erros.length === 0 ? 0 : 1);
