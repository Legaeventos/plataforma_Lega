import { readJSON, writeJSON } from '../../js/storage.js';

const EVENTS_KEY='lega.eventos';
const NAV_KEY='lega.navigation.request';
let state={query:'',status:'todos'};
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=v=>{if(!v)return'—';const[y,m,d]=String(v).split('-').map(Number);return y&&m&&d?new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d)):'—';};
const getEvents=()=>readJSON(EVENTS_KEY,[]);

function flattenQuotes(){return getEvents().flatMap(event=>(event.orcamentos||[]).map(q=>{const accepted=event.status!=='orcamento'&&q.id===event.orcamentoEscolhidoId;const chosen=!accepted&&!!event.orcamentoEscolhidoManual&&q.id===event.orcamentoEscolhidoId;return{event,quote:q,chosen,accepted};}));}
function quoteStatus(x){if(x.accepted)return['aceito','Aceito'];if(x.chosen)return['escolhido','Escolhido'];return['emitido','Emitido'];}

export function render(){
  const rows=flattenQuotes();
  const filtered=rows.filter(x=>{const q=x.quote;const text=`${q.cliente||''} ${q.nome||''} ${q.pacote||''} ${q.tipo||''}`.toLowerCase();const[s]=quoteStatus(x);return(!state.query||text.includes(state.query.toLowerCase()))&&(state.status==='todos'||state.status===s);}).sort((a,b)=>String(b.quote.createdAt||'').localeCompare(String(a.quote.createdAt||'')));
  const totalAccepted=rows.filter(x=>x.accepted).reduce((s,x)=>s+Number(x.quote.valor||0),0);
  return `<div class="page-grid budget-module">
    <section class="events-header"><div><span class="eyebrow">COMERCIAL</span><h2>Orçamentos</h2><p>Consulta central de todas as propostas criadas dentro dos eventos.</p></div><button class="btn btn-primary" data-action="new-budget">+ Iniciar orçamento</button></section>
    <section class="budget-kpis"><div class="panel"><small>Propostas salvas</small><strong>${rows.length}</strong></div><div class="panel"><small>Aceitas</small><strong>${rows.filter(x=>x.accepted).length}</strong></div><div class="panel"><small>Valor aceito</small><strong>${money(totalAccepted)}</strong></div></section>
    <section class="panel budget-toolbar"><div class="events-search"><span>⌕</span><input id="budgetSearch" value="${esc(state.query)}" placeholder="Buscar cliente, evento ou pacote"></div><select id="budgetStatus"><option value="todos">Todos</option><option value="emitido" ${state.status==='emitido'?'selected':''}>Emitidos</option><option value="escolhido" ${state.status==='escolhido'?'selected':''}>Escolhidos</option><option value="aceito" ${state.status==='aceito'?'selected':''}>Aceitos</option></select><span class="events-count">${filtered.length} de ${rows.length}</span></section>
    ${rows.length?`<section class="panel budget-list-panel"><div class="table-wrap"><table class="event-table budget-table"><thead><tr><th>Versão</th><th>Cliente / Evento</th><th>Data</th><th>Pacote</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${filtered.map(x=>{const q=x.quote;const[s,l]=quoteStatus(x);return `<tr><td><span class="version-badge">V${q.versao||1}</span></td><td><strong>${esc(q.cliente||'')}</strong><small>${esc(q.nome||q.tipo||'')}</small></td><td>${dateBR(q.data)}</td><td>${esc(q.pacote||'')}</td><td><strong>${money(q.valor)}</strong>${Number(q.valorOficial||0)&&Number(q.valorOficial)!==Number(q.valor||0)?`<small>Tabela ${money(q.valorOficial)}</small>`:''}</td><td><span class="budget-status budget-status--${s}">${l}</span></td><td><button class="btn btn-ghost" data-action="open-budget" data-event="${x.event.id}" data-quote="${q.id}">Abrir no evento</button></td></tr>`;}).join('')}</tbody></table></div></section>`:`<section class="panel empty-state"><div class="empty-leaf"></div><h2>Nenhum orçamento salvo</h2><p>Todos os orçamentos são criados a partir do módulo Eventos e aparecem automaticamente aqui.</p><button class="btn btn-primary" data-action="new-budget">Iniciar orçamento</button></section>`}
  </div>`;
}
export function renderOrcamentos(){return render();}
export function mount({navigate}={}){
  const root=document.querySelector('#app');if(!root)return;
  const rerender=()=>{root.innerHTML=render();mount({navigate});};
  root.querySelector('#budgetSearch')?.addEventListener('input',e=>{state.query=e.target.value;rerender();});
  root.querySelector('#budgetStatus')?.addEventListener('change',e=>{state.status=e.target.value;rerender();});
  root.querySelectorAll('[data-action="new-budget"]').forEach(b=>b.onclick=()=>{writeJSON(NAV_KEY,{action:'new'});navigate?.('eventos');});
  root.querySelectorAll('[data-action="open-budget"]').forEach(b=>b.onclick=()=>{writeJSON(NAV_KEY,{eventId:b.dataset.event,quoteId:b.dataset.quote,tab:'orcamento'});navigate?.('eventos');});
}
