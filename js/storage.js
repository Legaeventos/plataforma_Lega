import { getSession, loadRemoteState, saveRemoteState } from './supabase.js';
import { mergeState, deepEqual } from './merge.js';

// Sincronização do estado compartilhado (v1.1.8)
// ------------------------------------------------
// • Os dados são gravados primeiro neste aparelho (localStorage).
// • Para enviar, o aparelho baixa a versão da nuvem, MESCLA item a item com a
//   sua (js/merge.js) e grava de forma condicional: se outro aparelho tiver
//   salvo no meio do caminho, baixa de novo e mescla outra vez.
// • A cada 20 s (e ao voltar para a aba) o aparelho busca novidades da nuvem.
// • Antes de substituir dados locais, uma cópia de segurança é guardada.

const LOCAL_ONLY_PREFIXES=['lega.auth.','lega.sync.'];
const LOCAL_ONLY_KEYS=new Set(['lega.user','lega.nav.request','lega.navigation.request','lega.portaria.evento']);
const BASE_KEY='lega.sync.base';
const VERSION_KEY='lega.sync.version';
const BACKUP_KEY='lega.sync.backup';
const PENDING_FLAG='lega.sync.pending';
const PULL_INTERVAL=20000;

let syncEnabled=false;
let syncTimer=null;
let running=null;
let again=false;
let pullTimer=null;

function isSharedKey(key){return key.startsWith('lega.')&&!LOCAL_ONLY_KEYS.has(key)&&!LOCAL_ONLY_PREFIXES.some(p=>key.startsWith(p))}
function emit(status,detail=''){window.dispatchEvent(new CustomEvent('lega:sync-status',{detail:{status,detail}}))}
function snapshot(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!isSharedKey(k))continue;try{out[k]=JSON.parse(localStorage.getItem(k))}catch{out[k]=localStorage.getItem(k)}}return out}
function replaceShared(data={}){const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(isSharedKey(k))keys.push(k)}keys.forEach(k=>{if(!(k in (data||{})))localStorage.removeItem(k)});Object.entries(data||{}).forEach(([k,v])=>{if(isSharedKey(k))localStorage.setItem(k,JSON.stringify(v))})}
function safeSet(k,v){try{localStorage.setItem(k,v);return true}catch(err){console.warn('Sem espaço para',k,err);return false}}
function readBase(){try{const v=localStorage.getItem(BASE_KEY);return v?JSON.parse(v):null}catch{return null}}
function writeBase(v){if(!safeSet(BASE_KEY,JSON.stringify(v)))localStorage.removeItem(BASE_KEY)}
function backupLocal(motivo){
  try{const atual=snapshot();if(!Object.keys(atual).length)return;
    const lista=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]').slice(-1);
    lista.push({em:new Date().toISOString(),motivo,dados:atual});
    if(!safeSet(BACKUP_KEY,JSON.stringify(lista)))safeSet(BACKUP_KEY,JSON.stringify(lista.slice(-1)));
  }catch{}
}
function markPendingLocal(){try{localStorage.setItem(PENDING_FLAG,'1')}catch{}}
function clearPendingLocal(){try{localStorage.removeItem(PENDING_FLAG)}catch{}}
function hasPendingLocal(){try{return localStorage.getItem(PENDING_FLAG)==='1'}catch{return false}}

export function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value));if(isSharedKey(key)){markPendingLocal();if(syncEnabled)scheduleSync()}}
export function removeJSON(key){localStorage.removeItem(key);if(isSharedKey(key)){markPendingLocal();if(syncEnabled)scheduleSync()}}

// Uma rodada completa: baixa, mescla, envia (se preciso) e aplica localmente.
async function syncRound(){
  const session=await getSession();if(!session)throw new Error('Sessão indisponível');
  const base=readBase();
  const local=snapshot();
  let remote=await loadRemoteState(session);
  let merged=mergeState(base,local,remote.dados||{});
  let version=remote.atualizado_em||null;
  for(let tentativa=0;!deepEqual(merged,remote.dados||{});tentativa++){
    if(tentativa>=4)throw new Error('Muitas alterações simultâneas; tentando novamente em instantes.');
    emit('saving');
    const res=await saveRemoteState(session,merged,remote.atualizado_em??null);
    if(res.ok){version=res.atualizado_em;break}
    const esperado=remote.atualizado_em??null;
    remote=await loadRemoteState(session); // outro aparelho salvou: mescla de novo
    merged=mergeState(base,local,remote.dados||{});
    version=remote.atualizado_em||null;
    if((remote.atualizado_em??null)===esperado){
      // A nuvem não mudou, mas a gravação condicional foi recusada: o filtro de
      // data não está funcionando neste banco. Grava os dados já mesclados.
      const res2=await saveRemoteState(session,merged);if(res2.ok){version=res2.atualizado_em;break}
    }
  }
  // Se o usuário alterou algo durante a rodada, preserva essa alteração.
  const agora=snapshot();
  let aplicar=merged;let pendente=false;
  if(!deepEqual(agora,local)){aplicar=mergeState(local,agora,merged);pendente=true}
  const mudouLocal=!deepEqual(aplicar,agora);
  if(mudouLocal){if(!base)backupLocal('primeira sincronização v1.1.8');replaceShared(aplicar)}
  writeBase(merged);safeSet(VERSION_KEY,String(version||''));
  if(pendente){markPendingLocal()}else clearPendingLocal();
  if(mudouLocal)window.dispatchEvent(new CustomEvent('lega:remote-changed'));
  return {pendente};
}

export async function syncNow(){
  if(!syncEnabled)return {ok:false,reason:'disabled'};
  if(running){again=true;return running}
  running=(async()=>{
    try{const r=await syncRound();safeSet('lega.sync.info',JSON.stringify({em:new Date().toISOString(),ok:true}));emit('synced',new Date().toISOString());if(r.pendente)scheduleSync(300);return {ok:true}}
    catch(err){safeSet('lega.sync.info',JSON.stringify({em:new Date().toISOString(),ok:false,erro:String(err?.message||err)}));markPendingLocal();emit('offline',err.message);return {ok:false,reason:'offline',error:err}}
    finally{running=null;if(again){again=false;scheduleSync(200)}}
  })();
  return running;
}

export async function hydrateFromCloud(){
  const session=await getSession();if(!session)return {ok:false,reason:'no-session'};
  syncEnabled=true;emit('loading');
  const r=await syncNow();
  startAutoPull();
  return r;
}

function startAutoPull(){
  if(pullTimer)return;
  pullTimer=setInterval(()=>{if(document.visibilityState==='visible')syncNow()},PULL_INTERVAL);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow()});
  window.addEventListener('focus',()=>syncNow());
}

export function enableCloudSync(){syncEnabled=true;startAutoPull()}
export function disableCloudSync(){syncEnabled=false}
export function scheduleSync(delay=450){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(),delay)}
export async function flushSync(){if(!syncEnabled)return;if(hasPendingLocal()||running)await syncNow()}
export function localBackups(){try{return JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]')}catch{return []}}
window.addEventListener('online',()=>{if(syncEnabled)syncNow()});

// --- Diagnóstico (Configurações → Sincronização) ---------------------------
export function syncInfo(){let info={};try{info=JSON.parse(localStorage.getItem('lega.sync.info')||'{}')}catch{}return {...info,pendente:hasPendingLocal(),versaoNuvem:localStorage.getItem(VERSION_KEY)||''}}
export function localState(){return snapshot()}
export function cloudState(){return readBase()||{}}
// Recupera itens de uma cópia de segurança SOMANDO com os dados atuais
// (nada atual é apagado; itens que só existem na cópia voltam).
export function restoreFromBackup(index){
  const lista=localBackups();const bk=lista[index];if(!bk)return 0;
  const atual=snapshot();const unido=mergeState(null,atual,bk.dados||{});
  let n=0;Object.entries(unido).forEach(([k,v])=>{if(!deepEqual(v,atual[k])){localStorage.setItem(k,JSON.stringify(v));n++}});
  if(n){markPendingLocal();scheduleSync(100)}return n;
}
