import { getSession, loadRemoteState, saveRemoteState } from './supabase.js';

const LOCAL_ONLY_PREFIXES=['lega.auth.','lega.sync.'];
const LOCAL_ONLY_KEYS=new Set(['lega.user','lega.nav.request']);
let syncEnabled=false;
let syncTimer=null;
let syncing=false;
let pending=false;

function isSharedKey(key){return key.startsWith('lega.')&&!LOCAL_ONLY_KEYS.has(key)&&!LOCAL_ONLY_PREFIXES.some(p=>key.startsWith(p))}
function emit(status,detail=''){window.dispatchEvent(new CustomEvent('lega:sync-status',{detail:{status,detail}}))}
function snapshot(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!isSharedKey(k))continue;try{out[k]=JSON.parse(localStorage.getItem(k))}catch{out[k]=localStorage.getItem(k)}}return out}
function replaceShared(data={}){const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(isSharedKey(k))keys.push(k)}keys.forEach(k=>localStorage.removeItem(k));Object.entries(data||{}).forEach(([k,v])=>{if(isSharedKey(k))localStorage.setItem(k,JSON.stringify(v))})}

const PENDING_FLAG='lega.sync.pending';
function markPendingLocal(){try{localStorage.setItem(PENDING_FLAG,'1')}catch{}}
function clearPendingLocal(){try{localStorage.removeItem(PENDING_FLAG)}catch{}}
function hasPendingLocal(){try{return localStorage.getItem(PENDING_FLAG)==='1'}catch{return false}}

export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value));if(isSharedKey(key)){markPendingLocal();if(syncEnabled)scheduleSync()}}
export function removeJSON(key){localStorage.removeItem(key);if(isSharedKey(key)){markPendingLocal();if(syncEnabled)scheduleSync()}}

// Antes de baixar (e sobrescrever) os dados da nuvem, verificamos se este
// aparelho tem alterações feitas offline que ainda não foram enviadas
// (ex.: um orçamento criado sem internet). Se houver, tentamos enviá-las
// primeiro; só substituímos os dados locais pelos da nuvem quando não há
// nada pendente localmente ou o envio deu certo — assim nada é perdido
// silenciosamente ao reabrir o app.
export async function hydrateFromCloud(){
  const session=await getSession();if(!session)return {ok:false,reason:'no-session'};
  syncEnabled=true;
  if(hasPendingLocal()){
    emit('loading');
    pending=true;
    await flushSync();
    if(hasPendingLocal()){
      emit('offline','Alterações feitas neste aparelho ainda não foram enviadas.');
      return {ok:false,reason:'pending-local'};
    }
    emit('synced',new Date().toISOString());
    return {ok:true,reason:'pending-local-sent'};
  }
  try{emit('loading');const remote=await loadRemoteState(session);replaceShared(remote.dados||{});emit('synced',remote.atualizado_em||'');return {ok:true,remote}}
  catch(err){emit('offline',err.message);return {ok:false,reason:'offline',error:err}}
}

export function enableCloudSync(){syncEnabled=true}
export function disableCloudSync(){syncEnabled=false}
export function scheduleSync(delay=450){pending=true;clearTimeout(syncTimer);syncTimer=setTimeout(flushSync,delay)}
export async function flushSync(){
  if(!syncEnabled||syncing||!pending)return;
  syncing=true;pending=false;emit('saving');
  try{const session=await getSession();if(!session)throw new Error('Sessão indisponível');await saveRemoteState(session,snapshot());clearPendingLocal();emit('synced',new Date().toISOString())}
  catch(err){pending=true;markPendingLocal();emit('offline',err.message)}finally{syncing=false}
}
window.addEventListener('online',()=>{if(syncEnabled){pending=true;flushSync()}});
window.addEventListener('beforeunload',()=>{if(pending)flushSync()});
