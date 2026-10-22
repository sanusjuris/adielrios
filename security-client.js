'use strict';
const profileFields=['nome','crm','rqe','esp','cidade','tom'];
function publicProfile(value){return Object.fromEntries(profileFields.filter(k=>typeof value?.[k]==='string').map(k=>[k,value[k].slice(0,500)]));}
async function purgeLegacySecrets(){
  for(const storage of [localStorage,sessionStorage]){
    storage.removeItem('ar6-anthropic_key');storage.removeItem('ar6-sessao');
    try{const p=JSON.parse(storage.getItem('ar6-perfil'));if(p)storage.setItem('ar6-perfil',JSON.stringify(publicProfile(p)));}catch{storage.removeItem('ar6-perfil');}
  }
  try{
    await window.storage?.delete('ar6-anthropic_key');await window.storage?.delete('ar6-sessao');
    const p=await window.storage?.get('ar6-perfil');if(p)await window.storage.set('ar6-perfil',JSON.stringify(publicProfile(JSON.parse(p.value))));
  }catch{}
  for(const id of ['con-ig-tok','con-wa-tok','con-li-tok','con-ant','con-gai','con-did','did-key','sb-key','cf-tok','con-ig-uid','con-wa-pid','con-li-urn','sb-url','cf-acc']){
    const e=document.getElementById(id);if(e){e.value='';e.disabled=true;e.placeholder='Configuração protegida no servidor';}
  }
}
async function loadIntegrationStatus(){
  const r=await fetch('/api/integrations');if(!r.ok)throw new Error('Sessão inválida');
  const status=await r.json();
  Object.assign(P,status); // Only booleans and public IDs; never credentials.
}
async function integrationFetch(target,options={}){
  const r=await fetch('/api/integration',{method:'POST',headers:{'Content-Type':'application/json','X-Modo-Deus':'1'},body:JSON.stringify({target,method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined})});
  if(!r.ok)throw new Error('Integração indisponível (HTTP '+r.status+'). Verifique a configuração do servidor.');
  return r;
}

function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeContentId(value){const s=String(value);return /^[a-zA-Z0-9_-]+$/.test(s)?s:'';}
function safeImageURL(value){const s=String(value||'');return /^(https:\/\/|data:image\/(png|jpeg|webp);base64,|blob:)/.test(s)?s:'';}
