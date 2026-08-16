import { ROUTES, DEFAULT_USER } from './config.js';
import { readJSON } from './storage.js';
import { initials } from './utils.js';

const app=document.querySelector('#app'); const title=document.querySelector('#pageTitle');
const sidebar=document.querySelector('#sidebar'); const backdrop=document.querySelector('#sidebarBackdrop');
const menuButton=document.querySelector('#menuButton');

function currentUser(){return readJSON('lega.user',DEFAULT_USER)}
function renderUser(){const user=currentUser();document.querySelector('#userNameTop').textContent=user.name;document.querySelector('#userInitials').textContent=initials(user.name)}
async function navigate(route='dashboard'){
  const item=ROUTES[route]||ROUTES.dashboard; title.textContent=item.title;
  document.querySelectorAll('[data-route]').forEach(el=>el.classList.toggle('active',el.dataset.route===route && el.classList.contains('nav-item')));
  try{const mod=await import(item.module);app.innerHTML=mod.render({user:currentUser()});mod.mount?.({navigate,renderUser});}
  catch(err){console.error(err);app.innerHTML='<div class="panel empty-state"><h2>Não foi possível abrir esta área.</h2><p>Atualize a página e tente novamente.</p></div>'}
  history.replaceState(null,'',`#${route}`);closeMenu();
}
function closeMenu(){sidebar.classList.remove('open');backdrop.classList.remove('show')}
document.addEventListener('click',e=>{const trigger=e.target.closest('[data-route]');if(trigger)navigate(trigger.dataset.route)});
menuButton.addEventListener('click',()=>{sidebar.classList.toggle('open');backdrop.classList.toggle('show')});backdrop.addEventListener('click',closeMenu);
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'dashboard'));
renderUser();navigate(location.hash.slice(1)||'dashboard');
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn))}
