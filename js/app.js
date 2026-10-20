import { ROUTES, DEFAULT_USER, APP_VERSION } from './config.js';
import { readJSON, writeJSON, hydrateFromCloud, enableCloudSync, flushSync, syncNow } from './storage.js';
import { getSession, getProfile, signIn, signOut } from './supabase.js';
import { initials } from './utils.js';

const app=document.querySelector('#app'); const title=document.querySelector('#pageTitle');
const sidebar=document.querySelector('#sidebar'); const backdrop=document.querySelector('#sidebarBackdrop');
const menuButton=document.querySelector('#menuButton'); const shell=document.querySelector('.app-shell');
const authScreen=document.querySelector('#authScreen'); const loginForm=document.querySelector('#loginForm');

function currentUser(){return readJSON('lega.user',DEFAULT_USER)}
function renderUser(){const user=currentUser();document.querySelector('#userNameTop').textContent=user.name;document.querySelector('#userInitials').textContent=initials(user.name);const role=document.querySelector('#userRoleTop');if(role)role.textContent=user.role||'Administrador'}
function setAuthMessage(msg='',error=false){const el=document.querySelector('#authMessage');if(el){el.textContent=msg;el.classList.toggle('error',error)}}
function showLogin(){shell.hidden=true;authScreen.hidden=false;document.querySelector('#loginPassword')?.focus()}
function showApp(){authScreen.hidden=true;shell.hidden=false}

async function resolveIdentity(session){
  try{const p=await getProfile(session);if(p&&!p.ativo)throw new Error('Este usuário está desativado.');if(p){writeJSON('lega.user',{name:p.nome,role:p.perfil==='administrador'?'Administrador':p.perfil,email:session.user?.email||''});return true}}
  catch(err){console.warn(err)}
  const email=session?.user?.email||'';writeJSON('lega.user',{name:email.split('@')[0]||'Usuário',role:'Administrador',email});return true;
}

async function bootstrap(){
  const session=await getSession();if(!session){showLogin();return}
  await resolveIdentity(session);
  const result=await hydrateFromCloud();if(!result.ok)enableCloudSync();checkVersion();setInterval(checkVersion,5*60*1000);
  renderUser();showApp();navigate(location.hash.slice(1)||'dashboard');
}

let currentRoute='dashboard';let formDirty=false;let refreshPending=false;
async function navigate(route='dashboard'){
  currentRoute=route;formDirty=false;refreshPending=false;markRefresh(false);
  const item=ROUTES[route]||ROUTES.dashboard; title.textContent=item.title;
  document.querySelectorAll('[data-route]').forEach(el=>el.classList.toggle('active',el.dataset.route===route && el.classList.contains('nav-item')));
  try{const mod=await import(item.module);app.innerHTML=mod.render({user:currentUser()});mod.mount?.({navigate,renderUser});}
  catch(err){console.error(err);app.innerHTML='<div class="panel empty-state"><h2>Não foi possível abrir esta área.</h2><p>Atualize a página e tente novamente.</p></div>'}
  history.replaceState(null,'',`#${route}`);closeMenu();
}
function closeMenu(){sidebar.classList.remove('open');backdrop.classList.remove('show')}

document.addEventListener('click',async e=>{
  const trigger=e.target.closest('[data-route]');if(trigger)navigate(trigger.dataset.route);
  if(e.target.closest('[data-action="logout"]')){await flushSync();await signOut();location.reload()}
});
menuButton.addEventListener('click',()=>{sidebar.classList.toggle('open');backdrop.classList.toggle('show')});backdrop.addEventListener('click',closeMenu);
window.addEventListener('hashchange',()=>{if(!shell.hidden)navigate(location.hash.slice(1)||'dashboard')});
window.addEventListener('lega:sync-status',e=>{const el=document.querySelector('#syncStatus');if(!el)return;const s=e.detail.status;el.dataset.status=s;el.title=s==='synced'?'Dados sincronizados':s==='saving'?'Salvando no Supabase…':s==='offline'?'Sem sincronização no momento; os dados ficam salvos neste aparelho.':'Carregando dados…';if(refreshPending&&s==='synced'){markRefresh(true);return}el.textContent=s==='synced'?'✓':s==='saving'?'↻':s==='offline'?'!':'…'});
loginForm?.addEventListener('submit',async e=>{e.preventDefault();const btn=loginForm.querySelector('button');btn.disabled=true;setAuthMessage('Entrando…');try{const fd=new FormData(loginForm);const session=await signIn(String(fd.get('email')||'').trim(),String(fd.get('password')||''));document.querySelector('#authBanner')?.remove();await resolveIdentity(session);await hydrateFromCloud();renderUser();showApp();navigate(location.hash.slice(1)||'dashboard')}catch(err){setAuthMessage(err.message||'Não foi possível entrar.',true)}finally{btn.disabled=false}});


// --- Novidades de outro aparelho ------------------------------------------
// Quando a sincronização traz dados novos, a tela atual é redesenhada — a
// menos que a pessoa esteja preenchendo um formulário; nesse caso o botão
// de sincronização mostra "↻" e redesenha ao clicar.
function editing(){const a=document.activeElement;return formDirty||(!!a&&app.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))}
function markRefresh(on){const el=document.querySelector('#syncStatus');if(!el)return;el.classList.toggle('has-updates',on);if(on){el.textContent='↻';el.title='Há novidades de outro aparelho. Clique para atualizar a tela.'}}
async function refreshView(){
  formDirty=false;refreshPending=false;markRefresh(false);
  const item=ROUTES[currentRoute]||ROUTES.dashboard;
  try{const mod=await import(item.module);const y=window.scrollY;app.innerHTML=mod.render({user:currentUser()});mod.mount?.({navigate,renderUser});window.scrollTo(0,y)}catch(err){console.error(err)}
}
app.addEventListener('input',()=>{formDirty=true});
app.addEventListener('submit',()=>{setTimeout(()=>{formDirty=false},0)},true);
window.addEventListener('lega:remote-changed',()=>{if(shell.hidden)return;if(editing()){refreshPending=true;markRefresh(true)}else refreshView()});
document.querySelector('#syncStatus')?.addEventListener('click',async()=>{if(refreshPending){refreshView();return}await syncNow()});

// --- Nova versão publicada ------------------------------------------------
async function checkVersion(){
  try{
    const r=await fetch(`version.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;
    const {version}=await r.json();if(!version||version===APP_VERSION)return;
    showUpdateBanner(version);
  }catch{}
}
async function applyUpdate(){
  try{await flushSync()}catch{}
  try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}catch{}
  try{const regs=await navigator.serviceWorker?.getRegistrations?.();await Promise.all((regs||[]).map(r=>r.update().catch(()=>{})))}catch{}
  location.reload();
}
function showUpdateBanner(version){
  if(!editing()){applyUpdate();return}
  if(document.querySelector('#updateBanner'))return;
  const bar=document.createElement('div');bar.id='updateBanner';bar.className='update-banner';
  bar.innerHTML=`<span>Nova versão da Plataforma (${version}) disponível.</span><button class="btn btn-primary" type="button">Atualizar agora</button>`;
  bar.querySelector('button').onclick=applyUpdate;document.body.appendChild(bar);
}
window.addEventListener('beforeunload',()=>{flushSync()});
// --- Login expirado ----------------------------------------------------------
window.addEventListener('lega:auth-expired',()=>{
  if(document.querySelector('#authBanner'))return;
  const bar=document.createElement('div');bar.id='authBanner';bar.className='update-banner';
  bar.innerHTML='<span>Seu login expirou e os dados deste computador não estão sendo enviados. Nada foi apagado.</span><button class="btn btn-primary" type="button">Entrar novamente</button>';
  bar.querySelector('button').onclick=()=>{bar.remove();setAuthMessage('Entre novamente para continuar sincronizando. Os dados deste computador estão preservados.');showLogin()};
  document.body.appendChild(bar);
});

bootstrap();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update().catch(()=>{})).catch(console.warn));let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded||editing())return;reloaded=true;location.reload()})}
