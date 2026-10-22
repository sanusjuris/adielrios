import http from 'node:http';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const scrypt=promisify(scryptCallback),root=dirname(fileURLToPath(import.meta.url));
const profiles=['nome','crm','rqe','esp','cidade','tom'];
const dataKeys=new Set(['perfil','banco','fila','growth','calData','checklist','scores','gencount','pubcount','notifs','plano30','crm','pkg_conteudo','pkg_data']);
const cleanProfile=p=>Object.fromEntries(profiles.filter(k=>typeof p?.[k]==='string').map(k=>[k,p[k].slice(0,500)]));
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function integrationRoute(input,env){
  const u=new URL(input.target),method=input.method||'GET';
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw fail(400,'Destino inválido');
  const h={'Content-Type':'application/json'};let secret,allowed=false;
  // Caller-supplied credentials and headers are never forwarded.
  const query=new URLSearchParams();
  if(u.hostname==='api.anthropic.com'&&u.pathname==='/v1/messages'&&method==='POST'){
    secret=env.ANTHROPIC_API_KEY;h['x-api-key']=secret;h['anthropic-version']='2023-06-01';allowed=true;
    if(!Number.isInteger(input.body?.max_tokens)||input.body.max_tokens<1||input.body.max_tokens>8192)throw fail(400,'Limite de geração inválido');
  }else if(u.hostname==='generativelanguage.googleapis.com'&&/^\/v1beta\/models\/[a-zA-Z0-9.-]+:(generateContent|predict)$/.test(u.pathname)&&method==='POST'){
    secret=env.GOOGLE_AI_API_KEY;h['x-goog-api-key']=secret;allowed=true;
  }else if(u.hostname==='api.d-id.com'&&((u.pathname==='/talks'&&method==='POST')||(/^\/talks\/[a-zA-Z0-9_-]+$/.test(u.pathname)&&method==='GET'))){
    secret=env.DID_API_KEY;h.Authorization=secret?.startsWith('Basic ')?secret:`Basic ${Buffer.from((secret||'')+':').toString('base64')}`;allowed=true;
  }else if(u.hostname==='graph.facebook.com'){
    const ig=`/v25.0/${env.IG_USER_ID}`,wa=`/v17.0/${env.WA_PHONE_ID}`;
    if(env.IG_USER_ID&&((u.pathname===ig&&method==='GET')||([ig+'/media',ig+'/media_publish'].includes(u.pathname)&&method==='POST'))){secret=env.IG_TOKEN;allowed=true;if(method==='GET')query.set('fields','username,followers_count');}
    else if(env.WA_PHONE_ID&&((u.pathname===wa&&method==='GET')||(u.pathname===wa+'/messages'&&method==='POST'))){secret=env.WA_TOKEN;allowed=true;}
    h.Authorization=`Bearer ${secret}`;
  }else if(u.hostname==='api.linkedin.com'&&((u.pathname==='/v2/me'&&method==='GET')||(u.pathname==='/v2/ugcPosts'&&method==='POST'))){
    if(method==='POST'&&(!env.LINKEDIN_URN||input.body?.author!==env.LINKEDIN_URN))throw fail(400,'Autor inválido');
    secret=env.LINKEDIN_TOKEN;h.Authorization=`Bearer ${secret}`;h['X-Restli-Protocol-Version']='2.0.0';allowed=true;
  }else if(env.SUPABASE_URL&&u.origin===new URL(env.SUPABASE_URL).origin&&u.pathname==='/rest/v1/perfil'&&method==='POST'){
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL))throw fail(503,'Configuração inválida');
    secret=env.SUPABASE_KEY;h.apikey=secret;h.Authorization=`Bearer ${secret}`;h.Prefer='resolution=merge-duplicates';allowed=true;
  }else if(env.ENABLE_CLOUDFLARE_DEPLOY==='true'&&u.hostname==='api.cloudflare.com'&&((u.pathname==='/client/v4/user/tokens/verify'&&method==='GET')||(env.CF_ACCOUNT_ID&&u.pathname===`/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`&&method==='POST'))){
    if(method==='POST'&&(input.body?.name!=='adielrios-pages-dev'||input.body?.production_branch!=='main'))throw fail(400,'Projeto inválido');
    secret=env.CF_API_TOKEN;h.Authorization=`Bearer ${secret}`;allowed=true;
  }
  if(!allowed)throw fail(403,'Operação não permitida');
  if(!secret)throw fail(503,'Integração não configurada');
  u.search=query.toString();return {url:u.href,options:{method,headers:h,body:method==='GET'?undefined:JSON.stringify(input.body),redirect:'error',signal:AbortSignal.timeout(60000)}};
}
export function createApp(env=process.env,upstream=fetch,clock=Date.now){
  const origin=new URL(env.APP_ORIGIN||'');
  const dev=env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(origin.hostname);
  if(origin.protocol!=='https:'&&!dev)throw Error('APP_ORIGIN must use HTTPS');
  if(origin.origin!==env.APP_ORIGIN)throw Error('APP_ORIGIN must be an origin without path');
  if(!env.AUTH_USER||!/^([a-f0-9]{32}):([a-f0-9]{128})$/.test(env.AUTH_PASSWORD_HASH||''))throw Error('Configure authentication before starting');
  const [salt,hash]=env.AUTH_PASSWORD_HASH.split(':'),sessions=new Map(),attempts=new Map();
  const name=dev?'modo_session':'__Host-modo_session',dataDir=resolve(env.DATA_DIR||resolve(root,'private-data'));
  const digest=s=>createHash('sha256').update(s).digest('hex');
  const cookie=(s,age)=>`${name}=${s}; HttpOnly; ${dev?'':'Secure; '}SameSite=Strict; Path=/; Max-Age=${age}`;
  const limit=(key,max,window)=>{const now=clock();for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);const v=attempts.get(key)||{count:0,until:now+window};v.count++;attempts.set(key,v);if(v.count>max)throw fail(429,'Aguarde antes de tentar novamente');};
  async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>1024*1024)throw fail(413,'Conteúdo muito grande');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'null');}catch{throw fail(400,'JSON inválido');}}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(!dev)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      const path=new URL(req.url,origin).pathname,method=req.method;
      if(method==='GET'&&['/','/index.html','/security-client.js'].includes(path)){
        const file=path==='/security-client.js'?'security-client.js':'index.html';res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});res.end(await readFile(resolve(root,file)));return;
      }
      if(!path.startsWith('/api/'))throw fail(404,'Não encontrado');
      if(!['GET','POST','PUT'].includes(method))throw fail(405,'Método não permitido');
      if(method!=='GET'&&(req.headers.origin!==origin.origin||req.headers['x-modo-deus']!=='1'||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')))throw fail(403,'Origem não permitida');
      const now=clock();for(const [k,v] of sessions)if(v.expires<=now||v.last+30*60*1000<=now)sessions.delete(k);
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
      const session=sessions.get(digest(token));
      if(path==='/api/login'&&method==='POST'){
        limit('login-global',50,15*60*1000);limit('login:'+req.socket.remoteAddress,10,15*60*1000);
        const b=await body(req);if(typeof b?.password!=='string'||b.password.length>1024)throw fail(401,'Acesso negado');
        const calculated=await scrypt(b.password,salt,64);
        if(!timingSafeEqual(calculated,Buffer.from(hash,'hex'))||b.username!==env.AUTH_USER)throw fail(401,'Acesso negado');
        sessions.delete(digest(token));const id=randomBytes(32).toString('hex');sessions.set(digest(id),{expires:now+8*3600000,last:now});res.setHeader('Set-Cookie',cookie(id,8*3600));send(200,{ok:true});return;
      }
      if(!session)throw fail(401,'Sessão necessária');session.last=now;
      if(path==='/api/session'&&method==='GET'){send(200,{authenticated:true});return;}
      if(path==='/api/logout'&&method==='POST'){sessions.delete(digest(token));res.setHeader('Set-Cookie',cookie('',0));send(200,{ok:true});return;}
      if(path==='/api/integrations'&&method==='GET'){
        send(200,{anthropic_key:!!env.ANTHROPIC_API_KEY,gai_key:!!env.GOOGLE_AI_API_KEY,did_key:env.DID_API_KEY?'configured':'',ig_tok:!!env.IG_TOKEN,ig_uid:env.IG_USER_ID||'',wa_tok:!!env.WA_TOKEN,wa_pid:env.WA_PHONE_ID||'',li_tok:!!env.LINKEDIN_TOKEN,li_urn:env.LINKEDIN_URN||'',sb_key:!!env.SUPABASE_KEY,sb_url:env.SUPABASE_URL||'',cf_tok:env.ENABLE_CLOUDFLARE_DEPLOY==='true'&&!!env.CF_API_TOKEN,cf_acc:env.CF_ACCOUNT_ID||''});return;
      }
      if(path.startsWith('/api/data/')){
        const key=path.slice(10);if(!dataKeys.has(key))throw fail(404,'Chave inválida');
        const file=resolve(dataDir,key+'.json');
        if(method==='GET'){let v=null;try{v=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}send(200,v);return;}
        if(method==='PUT'){let v=await body(req);if(key==='perfil')v=cleanProfile(v);await mkdir(dataDir,{recursive:true,mode:0o700});const tmp=file+'.'+randomBytes(8).toString('hex');await writeFile(tmp,JSON.stringify(v),{mode:0o600});await rename(tmp,file);send(200,{ok:true});return;}
      }
      if(path==='/api/integration'&&method==='POST'){
        limit('integration',60,60000);
        const route=integrationRoute(await body(req),env);const response=await upstream(route.url,route.options);
        if(!response.ok)throw fail(502,'O provedor recusou a operação');
        // Do not relay provider errors, headers or redirects, which can disclose secrets.
        const chunks=[];let size=0;for await(const c of response.body){size+=c.length;if(size>20*1024*1024)throw fail(502,'Resposta muito grande');chunks.push(c);}
        let value=JSON.parse(Buffer.concat(chunks).toString());
        let serialized=JSON.stringify(value);for(const k of ['ANTHROPIC_API_KEY','GOOGLE_AI_API_KEY','DID_API_KEY','IG_TOKEN','WA_TOKEN','LINKEDIN_TOKEN','SUPABASE_KEY','CF_API_TOKEN'])if(env[k])serialized=serialized.split(env[k]).join('[redacted]');
        res.writeHead(200,{'Content-Type':'application/json'});res.end(serialized);return;
      }
      throw fail(404,'Não encontrado');
    }catch(e){send(e.status||500,{error:{message:e.status?e.message:'Falha interna. Consulte o administrador.'}});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createApp().listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Modo Deus: servidor iniciado em loopback.'));
