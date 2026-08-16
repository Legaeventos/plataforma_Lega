import { readJSON, writeJSON } from '../../js/storage.js';

const EVENTS_KEY='lega.eventos';
const NAV_KEY='lega.navigation.request';
let state={month:new Date().getMonth(),year:new Date().getFullYear(),selectedDate:''};
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateISO=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const dateBR=v=>{if(!v)return'—';const[y,m,d]=String(v).split('-').map(Number);return new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d));};
const selectedQuote=e=>e?.orcamentos?.find(q=>q.id===e.orcamentoEscolhidoId)||e?.orcamentos?.at(-1)||null;
const getEvents=()=>readJSON(EVENTS_KEY,[]);
const statusLabel=s=>({orcamento:'Orçamento',aceito:'Aceito',contrato:'Contrato',entrada:'Entrada paga',preparacao:'Preparação',pronto:'Pronto',realizado:'Realizado'})[s]||s||'Evento';

function monthEvents(){return getEvents().map(event=>({event,quote:selectedQuote(event)})).filter(x=>x.quote?.data&&Number(x.quote.data.slice(0,4))===state.year&&Number(x.quote.data.slice(5,7))===state.month+1);}
function calendar(){
  const rows=monthEvents();
  const first=new Date(state.year,state.month,1);const days=new Date(state.year,state.month+1,0).getDate();const offset=first.getDay();
  const today=new Date();const todayISO=dateISO(today.getFullYear(),today.getMonth(),today.getDate());
  const cells=[];for(let i=0;i<offset;i++)cells.push('<div class="calendar-day calendar-day--empty"></div>');
  for(let d=1;d<=days;d++){
    const iso=dateISO(state.year,state.month,d);const evs=rows.filter(x=>x.quote.data===iso);const cls=[iso===todayISO?'today':'',iso===state.selectedDate?'selected':''].filter(Boolean).join(' ');
    cells.push(`<button class="calendar-day ${cls}" data-action="select-day" data-date="${iso}"><span class="calendar-day__num">${d}</span>${evs.slice(0,3).map(x=>`<span class="calendar-event-dot" title="${esc(x.quote.nome||x.quote.cliente||'Evento')}">${esc((x.quote.nome||x.quote.cliente||'Evento').slice(0,20))}</span>`).join('')}${evs.length>3?`<small>+${evs.length-3}</small>`:''}</button>`);
  }
  const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(state.year,state.month,1));
  return `<section class="panel agenda-calendar"><div class="agenda-calendar__head"><button class="btn btn-ghost" data-action="prev-month">←</button><div><span class="eyebrow">CALENDÁRIO</span><h2>${esc(label.charAt(0).toUpperCase()+label.slice(1))}</h2></div><div class="agenda-calendar__actions"><button class="btn btn-ghost" data-action="today">Hoje</button><button class="btn btn-ghost" data-action="next-month">→</button></div></div><div class="calendar-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div></section>`;
}
function selectedList(){
  const all=getEvents().map(event=>({event,quote:selectedQuote(event)})).filter(x=>x.quote?.data);
  const date=state.selectedDate||dateISO(new Date().getFullYear(),new Date().getMonth(),new Date().getDate());
  const list=all.filter(x=>x.quote.data===date).sort((a,b)=>String(a.quote.horaInicio||'').localeCompare(String(b.quote.horaInicio||'')));
  return `<section class="panel agenda-day"><div class="panel-header"><div><h2>${dateBR(date)}</h2><p>${list.length} evento(s) nesta data.</p></div><button class="btn btn-primary" data-action="new-event">+ Iniciar orçamento</button></div>${list.length?`<div class="agenda-event-list">${list.map(({event,quote})=>`<button class="agenda-event-row" data-action="open-event" data-event="${event.id}"><span class="agenda-event-time">${esc(quote.horaInicio||'—')}</span><span><strong>${esc(quote.nome||quote.tipo||'Evento')}</strong><small>${esc(quote.cliente||'')} · ${esc(quote.pacote||'')}</small></span><span><strong>${money(quote.valor)}</strong><small>${statusLabel(event.status)}</small></span></button>`).join('')}</div>`:'<div class="empty-inline"><p>Nenhum evento nesta data.</p></div>'}</section>`;
}
export function render(){return `<div class="page-grid agenda-module"><section class="events-header"><div><span class="eyebrow">OPERAÇÃO</span><h2>Agenda</h2><p>Os eventos aparecem aqui automaticamente a partir das datas informadas no módulo Eventos.</p></div></section>${calendar()}${selectedList()}</div>`;}
export function renderAgenda(){return render();}
export function mount({navigate}={}){const root=document.querySelector('#app');if(!root)return;const rerender=()=>{root.innerHTML=render();mount({navigate});};root.querySelector('[data-action="prev-month"]')?.addEventListener('click',()=>{state.month--;if(state.month<0){state.month=11;state.year--;}rerender();});root.querySelector('[data-action="next-month"]')?.addEventListener('click',()=>{state.month++;if(state.month>11){state.month=0;state.year++;}rerender();});root.querySelector('[data-action="today"]')?.addEventListener('click',()=>{const d=new Date();state.month=d.getMonth();state.year=d.getFullYear();state.selectedDate=dateISO(d.getFullYear(),d.getMonth(),d.getDate());rerender();});root.querySelectorAll('[data-action="select-day"]').forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;rerender();});root.querySelectorAll('[data-action="open-event"]').forEach(b=>b.onclick=()=>{writeJSON(NAV_KEY,{eventId:b.dataset.event,tab:'menu'});navigate?.('eventos');});root.querySelector('[data-action="new-event"]')?.addEventListener('click',()=>{writeJSON(NAV_KEY,{action:'new'});navigate?.('eventos');});}
