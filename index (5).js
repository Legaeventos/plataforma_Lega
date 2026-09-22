import { readJSON, writeJSON } from '../../js/storage.js';

const CLIENTS_KEY='lega.clientes';
const EVENTS_KEY='lega.eventos';
const NAV_KEY='lega.navigation.request';
let state={query:'',selectedId:null};

const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=v=>{if(!v)return'—';const[y,m,d]=String(v).split('-').map(Number);return y&&m&&d?new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d)):'—';};
const selectedQuote=e=>e?.orcamentos?.find(q=>q.id===e.orcamentoEscolhidoId)||e?.orcamentos?.at(-1)||null;
const getClients=()=>readJSON(CLIENTS_KEY,[]);
const getEvents=()=>readJSON(EVENTS_KEY,[]);
const saveClients=v=>writeJSON(CLIENTS_KEY,v);

function relatedEvents(client,events){
  const cpf=String(client.cpf||'').replace(/\D/g,'');
  const phone=String(client.telefone||client.whatsapp||'').replace(/\D/g,'');
  const name=String(client.nome||'').trim().toLowerCase();
  return events.filter(e=>{
    if(e.clienteId&&e.clienteId===client.id)return true;
    const c=e.clienteContrato||{};
    const q=selectedQuote(e)||{};
    if(cpf&&String(c.cpf||'').replace(/\D/g,'')===cpf)return true;
    if(phone&&String(c.telefone||c.whatsapp||'').replace(/\D/g,'')===phone)return true;
    return name&&(String(c.nome||q.cliente||'').trim().toLowerCase()===name);
  });
}

function clientMetrics(client,events){
  const rel=relatedEvents(client,events);
  const contracted=rel.filter(e=>e.status!=='orcamento').reduce((sum,e)=>sum+Number(selectedQuote(e)?.valor||0),0);
  const dates=rel.map(e=>selectedQuote(e)?.data).filter(Boolean).sort();
  return{events:rel,total:contracted,lastDate:dates.at(-1)||''};
}

function listView(){
  const clients=getClients();const events=getEvents();
  const filtered=clients.filter(c=>`${c.nome||''} ${c.cpf||''} ${c.telefone||c.whatsapp||''} ${c.email||''}`.toLowerCase().includes(state.query.toLowerCase())).sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
  return `<div class="page-grid client-module">
    <section class="events-header"><div><span class="eyebrow">RELACIONAMENTO</span><h2>Clientes</h2><p>Cadastro alimentado automaticamente pela etapa de contrato dos eventos.</p></div><button class="btn btn-primary" data-action="go-new-event">+ Iniciar orçamento</button></section>
    <section class="panel client-toolbar"><div class="events-search"><span>⌕</span><input id="clientSearch" value="${esc(state.query)}" placeholder="Buscar por nome, CPF, telefone ou e-mail"></div><span class="events-count">${filtered.length} de ${clients.length}</span></section>
    ${clients.length?`<section class="client-list">${filtered.map(c=>{const m=clientMetrics(c,events);return `<article class="panel client-card"><button class="client-card__main" data-action="open-client" data-id="${c.id}"><span class="client-avatar">${esc((c.nome||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span><span><strong>${esc(c.nome||'Cliente sem nome')}</strong><small>${esc(c.telefone||c.whatsapp||'Sem telefone')}${c.cpf?` · ${esc(c.cpf)}`:''}</small></span><span class="client-card__metrics"><b>${m.events.length}</b><small>evento(s)</small></span></button></article>`;}).join('')}</section>`:`<section class="panel empty-state"><div class="empty-leaf"></div><h2>Nenhum cliente cadastrado</h2><p>O cliente será criado automaticamente quando você preencher os dados para gerar o contrato de um evento.</p><button class="btn btn-primary" data-action="go-new-event">Iniciar orçamento</button></section>`}
  </div>`;
}

function detailView(client){
  const events=getEvents();const m=clientMetrics(client,events);
  return `<div class="page-grid client-module">
    <section class="events-header"><div><button class="back-link" data-action="back-list">← Voltar</button><span class="eyebrow">CLIENTE</span><h2>${esc(client.nome||'Cliente')}</h2><p>${m.events.length} evento(s) relacionado(s) · ${money(m.total)} contratado</p></div></section>
    <section class="panel"><div class="panel-header"><div><h2>Dados atuais</h2><p>Alterações aqui atualizam o cadastro do cliente. Contratos já gerados permanecem preservados.</p></div></div>
      <form id="clientEditForm" class="form-grid">
        <input type="hidden" name="id" value="${esc(client.id)}">
        <div class="field"><label>Nome completo</label><input name="nome" required value="${esc(client.nome)}"></div>
        <div class="field"><label>CPF</label><input name="cpf" value="${esc(client.cpf)}" placeholder="000.000.000-00"></div>
        <div class="field"><label>WhatsApp / Telefone</label><input name="telefone" value="${esc(client.telefone||client.whatsapp)}"></div>
        <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(client.email)}"></div>
        <div class="field"><label>CEP</label><input name="cep" value="${esc(client.cep)}"></div>
        <div class="field"><label>Endereço</label><input name="endereco" value="${esc(client.endereco||client.rua)}"></div>
        <div class="field"><label>Número</label><input name="numero" value="${esc(client.numero)}"></div>
        <div class="field"><label>Bairro</label><input name="bairro" value="${esc(client.bairro)}"></div>
        <div class="field"><label>Cidade</label><input name="cidade" value="${esc(client.cidade)}"></div>
        <div class="field"><label>Estado</label><input name="estado" value="${esc(client.estado||'RS')}"></div>
        <div class="field field-full"><label>Observações internas</label><input name="observacoes" value="${esc(client.observacoes)}"></div>
        <div class="field-full form-actions"><button class="btn btn-primary" type="submit">Salvar alterações</button></div>
      </form>
    </section>
    <section class="panel"><div class="panel-header"><div><h2>Histórico de eventos</h2><p>Eventos vinculados a este cliente.</p></div><span class="badge green">${m.events.length} evento(s)</span></div>
      ${m.events.length?`<div class="client-event-list">${[...m.events].sort((a,b)=>String(selectedQuote(b)?.data||'').localeCompare(String(selectedQuote(a)?.data||''))).map(e=>{const q=selectedQuote(e)||{};return `<button class="client-event-row" data-action="open-event" data-event="${e.id}"><span><strong>${esc(q.nome||q.tipo||'Evento')}</strong><small>${dateBR(q.data)} · ${esc(q.pacote||'')}</small></span><span><b>${money(q.valor)}</b><small>${esc(e.status||'')}</small></span></button>`;}).join('')}</div>`:'<p class="muted-copy">Ainda não há eventos vinculados a este cadastro.</p>'}
    </section>
  </div>`;
}

export function render(){const client=getClients().find(c=>c.id===state.selectedId);return client?detailView(client):listView();}
export function renderClientes(){return render();}
export function mount({navigate}={}){
  const root=document.querySelector('#app');if(!root)return;
  const rerender=()=>{root.innerHTML=render();mount({navigate});};
  root.querySelector('#clientSearch')?.addEventListener('input',e=>{state.query=e.target.value;rerender();});
  root.querySelectorAll('[data-action="open-client"]').forEach(b=>b.onclick=()=>{state.selectedId=b.dataset.id;rerender();});
  root.querySelector('[data-action="back-list"]')?.addEventListener('click',()=>{state.selectedId=null;rerender();});
  root.querySelectorAll('[data-action="go-new-event"]').forEach(b=>b.onclick=()=>{writeJSON(NAV_KEY,{action:'new'});navigate?.('eventos');});
  root.querySelectorAll('[data-action="open-event"]').forEach(b=>b.onclick=()=>{writeJSON(NAV_KEY,{eventId:b.dataset.event,tab:'menu'});navigate?.('eventos');});
  const form=root.querySelector('#clientEditForm');if(form)form.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());const list=getClients().map(c=>c.id===d.id?{...c,...d,updatedAt:new Date().toISOString()}:c);saveClients(list);rerender();};
}
