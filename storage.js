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

export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value));if(syncEnabled&&isSharedKey(key))scheduleSync()}
export function removeJSON(key){localStorage.removeItem(key);if(syncEnabled&&isSharedKey(key))scheduleSync()}

export async function hydrateFromCloud(){
  const session=await getSession();if(!session)return {ok:false,reason:'no-session'};
  try{emit('loading');const remote=await loadRemoteState(session);replaceShared(remote.dados||{});syncEnabled=true;emit('synced',remote.atualizado_em||'');return {ok:true,remote}}
  catch(err){syncEnabled=true;emit('offline',err.message);return {ok:false,reason:'offline',error:err}}
}

export function enableCloudSync(){syncEnabled=true}
export function disableCloudSync(){syncEnabled=false}
export function scheduleSync(delay=450){pending=true;clearTimeout(syncTimer);syncTimer=setTimeout(flushSync,delay)}
export async function flushSync(){
  if(!syncEnabled||syncing||!pending)return;
  syncing=true;pending=false;emit('saving');
  try{const session=await getSession();if(!session)throw new Error('Sessão indisponível');await saveRemoteState(session,snapshot());emit('synced',new Date().toISOString())}
  catch(err){pending=true;emit('offline',err.message)}finally{syncing=false}
}
window.addEventListener('online',()=>{if(syncEnabled){pending=true;flushSync()}});
window.addEventListener('beforeunload',()=>{if(pending)flushSync()});
