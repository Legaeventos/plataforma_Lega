import { ROUTES, DEFAULT_USER } from './config.js';
import { readJSON, writeJSON, hydrateFromCloud, enableCloudSync, flushSync } from './storage.js';
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
  const result=await hydrateFromCloud();if(!result.ok)enableCloudSync();
  renderUser();showApp();navigate(location.hash.slice(1)||'dashboard');
}

async function navigate(route='dashboard'){
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
window.addEventListener('lega:sync-status',e=>{const el=document.querySelector('#syncStatus');if(!el)return;const s=e.detail.status;el.dataset.status=s;el.title=s==='synced'?'Dados sincronizados':s==='saving'?'Salvando no Supabase…':s==='offline'?'Sem sincronização no momento; os dados ficam salvos neste aparelho.':'Carregando dados…';el.textContent=s==='synced'?'✓':s==='saving'?'↻':s==='offline'?'!':'…'});
loginForm?.addEventListener('submit',async e=>{e.preventDefault();const btn=loginForm.querySelector('button');btn.disabled=true;setAuthMessage('Entrando…');try{const fd=new FormData(loginForm);const session=await signIn(String(fd.get('email')||'').trim(),String(fd.get('password')||''));await resolveIdentity(session);await hydrateFromCloud();renderUser();showApp();navigate(location.hash.slice(1)||'dashboard')}catch(err){setAuthMessage(err.message||'Não foi possível entrar.',true)}finally{btn.disabled=false}});

bootstrap();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn))}
