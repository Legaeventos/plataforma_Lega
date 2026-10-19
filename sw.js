// v1.1.8: só arquivos do próprio site passam pelo cache, sempre conferindo
// a versão mais nova no servidor (cache:'no-cache'). Chamadas ao Supabase
// nunca são guardadas, para não devolver dados antigos.
const CACHE='plataforma-lega-v1.1.9';
const ASSETS=['./','./index.html','./version.json','./css/reset.css','./css/variables.css','./css/layout.css','./css/sidebar.css','./css/components.css','./css/dashboard.css','./css/portaria.css','./css/responsive.css','./js/app.js','./js/config.js','./js/storage.js','./js/merge.js','./js/supabase.js','./js/utils.js','./assets/logo/logo-lega.png','./assets/botanica/folha.svg','./assets/botanica/semente.svg','./assets/botanica/broto.svg','./assets/botanica/muda.svg','./assets/botanica/arvore-jovem.svg','./assets/botanica/arvore-oficial.png','./core/components/tree-progress.js','./core/engine/event-analyzer.js','./core/engine/priority-engine.js','./core/engine/pricing.js','./modules/dashboard/index.js','./modules/eventos/index.js','./modules/eventos/contrato.js','./modules/portaria/index.js','./modules/clientes/index.js','./modules/orcamentos/index.js','./modules/agenda/index.js','./modules/contratos/index.js','./modules/financeiro/index.js','./modules/estoque/index.js','./modules/relatorios/index.js','./modules/configuracoes/index.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'})))).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return; // Supabase e outros: direto na rede
  e.respondWith(fetch(req,{cache:'no-cache'}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return r}).catch(()=>caches.match(req,{ignoreSearch:false}).then(m=>m||caches.match(req,{ignoreSearch:true}))));
});
