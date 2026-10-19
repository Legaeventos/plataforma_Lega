const SUPABASE_URL='https://apjofualxnzrokmterfb.supabase.co';
const SUPABASE_KEY='sb_publishable_-HGITsOcw1nnp7Rs8Hiziw_qjPni2oA';
const SESSION_KEY='lega.auth.session';

const jsonHeaders=(token)=>({
  'apikey':SUPABASE_KEY,
  'Authorization':`Bearer ${token}`,
  'Content-Type':'application/json'
});

function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(s){if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function tokenExpired(s){if(!s?.access_token)return true;try{const p=JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return !p.exp||Date.now()>=(p.exp*1000-60000)}catch{return true}}

export async function signIn(email,password){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data?.error_description||data?.msg||data?.message||'Não foi possível entrar.');
  saveSession(data);return data;
}

export async function signOut(){
  const s=readSession();
  if(s?.access_token){try{await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:jsonHeaders(s.access_token)})}catch{}}
  saveSession(null);
}

export async function getSession(){
  let s=readSession();if(!s)return null;
  if(!tokenExpired(s))return s;
  if(!s.refresh_token)return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
    if(!r.ok)throw new Error('refresh');
    s=await r.json();saveSession(s);return s;
  }catch{return readSession()}
}

export async function getProfile(session){
  const uid=session?.user?.id;if(!uid)return null;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/lega_perfis?user_id=eq.${encodeURIComponent(uid)}&select=nome,perfil,ativo`,{headers:jsonHeaders(session.access_token)});
  if(!r.ok)throw new Error('Não foi possível carregar o perfil.');
  const rows=await r.json();return rows?.[0]||null;
}

export async function loadRemoteState(session){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/lega_app_state?id=eq.principal&select=dados,atualizado_em`,{cache:'no-store',headers:jsonHeaders(session.access_token)});
  if(!r.ok)throw new Error(`Falha ao carregar dados (${r.status}).`);
  const rows=await r.json();return rows?.[0]||{dados:{},atualizado_em:null};
}

// Gravação condicional: só grava se a nuvem ainda estiver na versão que este
// aparelho mesclou (atualizado_em). Se outro aparelho salvou no meio do
// caminho, devolve {conflict:true} para mesclar de novo antes de gravar.
export async function saveRemoteState(session,dados,expectedVersion){
  const novo=new Date().toISOString();
  const filtro=expectedVersion===undefined?'':(expectedVersion?`&atualizado_em=eq.${encodeURIComponent(expectedVersion)}`:'&atualizado_em=is.null');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/lega_app_state?id=eq.principal${filtro}&select=atualizado_em`,{method:'PATCH',cache:'no-store',headers:{...jsonHeaders(session.access_token),'Prefer':'return=representation'},body:JSON.stringify({dados,atualizado_por:session.user.id,atualizado_em:novo})});
  if(!r.ok){const txt=await r.text().catch(()=>'');throw new Error(`Falha ao sincronizar (${r.status}) ${txt}`)}
  const rows=await r.json().catch(()=>[]);
  if(!Array.isArray(rows)||!rows.length)return {conflict:true};
  return {ok:true,atualizado_em:rows[0].atualizado_em||novo};
}

// --- Portaria / lista de convidados ---------------------------------
// Diferente do restante do app (um unico blob JSON), aqui cada convidado
// e uma linha propria na tabela lega_convidados. Isso e proposital: assim
// duas pessoas na portaria (2 iPads) podem marcar presencas ao mesmo tempo
// sem que uma sincronizacao apague o check-in feito pela outra.

export async function fetchGuests(session,eventoId){
  const url=`${SUPABASE_URL}/rest/v1/lega_convidados?evento_id=eq.${encodeURIComponent(eventoId)}&select=*&order=criado_em.asc`;
  const r=await fetch(url,{headers:jsonHeaders(session.access_token)});
  if(!r.ok)throw new Error(`Falha ao carregar convidados (${r.status}).`);
  return r.json();
}

export async function upsertGuests(session,rows){
  if(!rows?.length)return [];
  const url=`${SUPABASE_URL}/rest/v1/lega_convidados?on_conflict=id`;
  const r=await fetch(url,{method:'POST',headers:{...jsonHeaders(session.access_token),'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(rows)});
  if(!r.ok){const txt=await r.text().catch(()=>'');throw new Error(`Falha ao salvar convidados (${r.status}) ${txt}`)}
  return r.json();
}

export async function setGuestPresence(session,guestId,presente){
  const url=`${SUPABASE_URL}/rest/v1/lega_convidados?id=eq.${guestId}`;
  const body={presente,entrada_em:presente?new Date().toISOString():null,atualizado_em:new Date().toISOString(),atualizado_por:session.user.id};
  const r=await fetch(url,{method:'PATCH',headers:{...jsonHeaders(session.access_token),'Prefer':'return=minimal'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`Falha ao marcar presenca (${r.status}).`);
  return true;
}

export async function deleteGuest(session,guestId){
  const url=`${SUPABASE_URL}/rest/v1/lega_convidados?id=eq.${guestId}`;
  const r=await fetch(url,{method:'DELETE',headers:jsonHeaders(session.access_token)});
  if(!r.ok)throw new Error(`Falha ao remover convidado (${r.status}).`);
  return true;
}

export { SUPABASE_URL, SESSION_KEY };
