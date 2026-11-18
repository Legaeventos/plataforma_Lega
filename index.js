import { readJSON } from '../../js/storage.js';
import { getSession, fetchGuests, upsertGuests, setGuestPresence, deleteGuest } from '../../js/supabase.js';

const EVENTOS_KEY='lega.eventos';
const LAST_EVENT_KEY='lega.portaria.evento';
const CACHE_PREFIX='lega.portaria.cache.';
const POLL_MS=6000;
const XLSX_SRC='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const AZ_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const normalize=(s='')=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const uid=()=>(crypto.randomUUID?crypto.randomUUID():`gst_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);
const dateBR=(d)=>{if(!d)return'';const dt=new Date(`${d}T12:00:00`);return isNaN(dt)?d:dt.toLocaleDateString('pt-BR')};

let state={
  eventoId:null,
  guests:[],
  filter:'all',
  search:'',
  azPrefix:'',
  saving:new Set(),
  pollTimer:null,
  offline:false
};

function eventos(){return readJSON(EVENTOS_KEY,[])}
function typeLabel(t){return t==='crianca'?'Crianca':t==='isento'?'Isento':'Adulto'}
function cacheKey(eventoId){return `${CACHE_PREFIX}${eventoId}`}
function readCache(eventoId){try{return JSON.parse(localStorage.getItem(cacheKey(eventoId))||'[]')}catch{return[]}}
function writeCache(eventoId,guests){try{localStorage.setItem(cacheKey(eventoId),JSON.stringify(guests))}catch{}}

function pickDefaultEvent(list){
  const hoje=new Date().toISOString().slice(0,10);
  const futuros=list.filter(e=>e.data>=hoje).sort((a,b)=>a.data<b.data?-1:1);
  if(futuros.length)return futuros[0].id;
  const passados=list.filter(e=>e.data<hoje).sort((a,b)=>a.data>b.data?-1:1);
  return passados[0]?.id||list[0]?.id||null;
}

function ensureXlsxLoaded(){
  if(window.XLSX)return Promise.resolve();
  if(document.querySelector(`script[src="${XLSX_SRC}"]`)){
    return new Promise(res=>{const t=setInterval(()=>{if(window.XLSX){clearInterval(t);res()}},150)});
  }
  return new Promise((res,rej)=>{
    const s=document.createElement('script');s.src=XLSX_SRC;
    s.onload=()=>res();s.onerror=()=>rej(new Error('Nao foi possivel carregar o leitor de planilhas (verifique a internet).'));
    document.head.appendChild(s);
  });
}

export function render(){
  const list=eventos();
  if(!state.eventoId||!list.some(e=>e.id===state.eventoId)){
    const saved=localStorage.getItem(LAST_EVENT_KEY);
    state.eventoId=(saved&&list.some(e=>e.id===saved))?saved:pickDefaultEvent(list);
  }
  if(!list.length){
    return '<div class="panel empty-state"><h2>Nenhum evento cadastrado</h2><p>Crie um evento em <strong>Eventos</strong> antes de montar a lista de convidados da portaria.</p></div>';
  }
  const evento=list.find(e=>e.id===state.eventoId)||list[0];
  const options=list.slice().sort((a,b)=>a.data<b.data?1:-1).map(e=>
    `<option value="${e.id}" ${e.id===evento.id?'selected':''}>${esc(e.nome||e.cliente||'Evento')} - ${dateBR(e.data)}</option>`
  ).join('');
  return `
  <div class="page-grid">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Portaria</h2>
          <p>Check-in de convidados na entrada. Funciona com a lista aberta em mais de um aparelho ao mesmo tempo.</p>
        </div>
        <span class="badge green" id="portariaSyncBadge">Carregando...</span>
      </div>
      <div class="field-wide">
        <label>Evento</label>
        <select id="eventoSelect">${options}</select>
      </div>
      <div id="portariaCounts" class="finance-kpis"></div>
    </section>

    <section class="panel" id="portariaRoot" data-evento="${evento.id}">
      <div class="panel-header">
        <div>
          <h2>Convidados</h2>
          <p>Toque num convidado para marcar ou desmarcar a entrada.</p>
        </div>
        <div class="toolbar" style="margin:0;gap:8px;display:flex;flex-wrap:wrap">
          <button class="btn btn-secondary" id="btnImportar">Importar planilha</button>
          <button class="btn btn-secondary" id="btnAdicionar">+ Adicionar convidado</button>
          <input type="file" id="arquivoImportar" accept=".xlsx,.xls,.csv" hidden>
        </div>
      </div>

      <div id="addForm" hidden class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>Nome</label><input id="addNome" type="text" placeholder="Nome do convidado"></div>
        <div class="field"><label>Tipo</label><select id="addTipo"><option value="adulto">Adulto</option><option value="crianca">Crianca</option><option value="isento">Isento</option></select></div>
        <div class="field"><label>Observacao (opcional)</label><input id="addObs" type="text" placeholder="Ex.: familia do aniversariante"></div>
        <div><button class="btn btn-primary" id="addConfirmar" type="button">Adicionar</button></div>
      </div>

      <input id="search" class="search" type="search" placeholder="Digite o nome do convidado...">
      <div class="az-index" id="azIndex"><span class="az-prefix empty" id="azPrefix"></span><button class="az-clear" id="azClear" type="button" title="Limpar indice">x</button></div>
      <div class="filters" id="filters">
        <button data-f="all" class="chip active">Todos</button>
        <button data-f="waiting" class="chip">Aguardando</button>
        <button data-f="present" class="chip">Presentes</button>
      </div>

      <div id="guestList" class="guest-list"><p class="empty">Carregando lista...</p></div>
    </section>
  </div>`;
}

export function mount(){
  const root=document.querySelector('#app');
  if(state.pollTimer){clearInterval(state.pollTimer);state.pollTimer=null}

  const evtSelect=root.querySelector('#eventoSelect');
  evtSelect?.addEventListener('change',()=>{
    localStorage.setItem(LAST_EVENT_KEY,evtSelect.value);
    state.eventoId=evtSelect.value;state.search='';state.azPrefix='';state.filter='all';
    loadGuests();
  });

  root.querySelector('#btnAdicionar')?.addEventListener('click',()=>{
    const form=root.querySelector('#addForm');form.hidden=!form.hidden;if(!form.hidden)root.querySelector('#addNome')?.focus();
  });
  root.querySelector('#addConfirmar')?.addEventListener('click',async()=>{
    const nome=root.querySelector('#addNome').value.trim();if(!nome)return;
    const tipo=root.querySelector('#addTipo').value;
    const obs=root.querySelector('#addObs').value.trim();
    const guest={id:uid(),evento_id:state.eventoId,nome,tipo,aniversariante:false,observacao:obs,presente:false,entrada_em:null,criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString()};
    state.guests=[...state.guests,guest];writeCache(state.eventoId,state.guests);renderGuests();
    root.querySelector('#addNome').value='';root.querySelector('#addObs').value='';root.querySelector('#addForm').hidden=true;
    try{const session=await getSession();if(session)await upsertGuests(session,[guest])}catch(e){console.warn('Falha ao salvar novo convidado:',e.message)}
  });

  root.querySelector('#btnImportar')?.addEventListener('click',()=>root.querySelector('#arquivoImportar').click());
  root.querySelector('#arquivoImportar')?.addEventListener('change',handleImportFile);

  root.querySelector('#search').oninput=()=>{
    state.search=root.querySelector('#search').value.trim();
    if(state.azPrefix){state.azPrefix='';updateAzPrefixDisplay()}
    renderGuests();
  };
  buildAzIndex(root);
  root.querySelector('#azIndex').onclick=e=>{
    const b=e.target.closest('button[data-letter]');
    if(b){state.azPrefix+=b.dataset.letter;root.querySelector('#search').value='';updateAzPrefixDisplay();renderGuests();return}
    if(e.target.id==='azClear'){state.azPrefix='';updateAzPrefixDisplay();renderGuests()}
  };
  root.querySelector('#filters').onclick=e=>{
    const b=e.target.closest('button[data-f]');if(!b)return;
    state.filter=b.dataset.f;
    root.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('active',x===b));
    renderGuests();
  };

  loadGuests();
}

async function loadGuests(){
  const root=document.querySelector('#app');
  if(!root||!state.eventoId)return;
  state.guests=readCache(state.eventoId);
  renderCounts();renderGuests();
  const badge=root.querySelector('#portariaSyncBadge');
  try{
    const session=await getSession();
    if(!session)throw new Error('Sem sessao');
    const remote=await fetchGuests(session,state.eventoId);
    state.guests=remote;writeCache(state.eventoId,remote);state.offline=false;
    if(badge){badge.textContent='Sincronizado';badge.className='badge green'}
  }catch(err){
    state.offline=true;
    if(badge){badge.textContent='Offline (usando copia salva no aparelho)';badge.className='badge warning'}
  }
  renderCounts();renderGuests();
  startPolling();
}

function startPolling(){
  if(state.pollTimer)clearInterval(state.pollTimer);
  state.pollTimer=setInterval(async()=>{
    const root=document.querySelector('#app');
    if(!root||!root.querySelector('#portariaRoot')){clearInterval(state.pollTimer);state.pollTimer=null;return}
    try{
      const session=await getSession();if(!session)return;
      const remote=await fetchGuests(session,state.eventoId);
      const merged=remote.map(r=>state.saving.has(r.id)?(state.guests.find(g=>g.id===r.id)||r):r);
      state.guests=merged;writeCache(state.eventoId,merged);state.offline=false;
      const badge=root.querySelector('#portariaSyncBadge');if(badge){badge.textContent='Sincronizado';badge.className='badge green'}
      renderCounts();renderGuests();
    }catch{ }
  },POLL_MS);
}

function buildAzIndex(root){
  const box=root.querySelector('#azIndex');const clearBtn=root.querySelector('#azClear');
  AZ_LETTERS.forEach(l=>{const b=document.createElement('button');b.type='button';b.textContent=l;b.dataset.letter=l;box.insertBefore(b,clearBtn)});
}
function updateAzPrefixDisplay(){
  const el=document.querySelector('#azPrefix');if(!el)return;
  el.textContent=state.azPrefix;el.classList.toggle('empty',!state.azPrefix);
}

function passFilter(g){
  if(state.filter==='all')return true;
  if(state.filter==='waiting')return!g.presente;
  if(state.filter==='present')return g.presente;
  return true;
}
function matchesSearch(g){
  if(state.azPrefix)return normalize(g.nome).startsWith(normalize(state.azPrefix));
  const term=normalize(state.search);if(!term)return true;
  return normalize(g.nome).includes(term)||normalize(g.observacao||'').includes(term);
}
function orderForDisplay(list){
  const aniversariante=list.filter(g=>g.aniversariante);
  const resto=list.filter(g=>!g.aniversariante);
  return [...aniversariante,...resto];
}

function renderCounts(){
  const box=document.querySelector('#portariaCounts');if(!box)return;
  const g=state.guests;
  const presentes=g.filter(x=>x.presente).length;
  const total=g.length;
  const criancas=g.filter(x=>x.tipo==='crianca').length;
  const isentos=g.filter(x=>x.tipo==='isento').length;
  const card=(label,value)=>`<div class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong></div>`;
  box.innerHTML=card('Confirmados',total)+card('Presentes',presentes)+card('Aguardando',total-presentes)+card('Criancas / Isentos',`${criancas} / ${isentos}`);
}

function renderGuests(){
  const box=document.querySelector('#guestList');if(!box)return;
  const filtered=orderForDisplay(state.guests.filter(g=>passFilter(g)&&matchesSearch(g)));
  const activeFilter=state.search||state.azPrefix;
  if(!filtered.length){box.innerHTML='<p class="empty">Nenhum convidado encontrado.</p>';return}
  box.innerHTML=filtered.map(g=>`
    <article class="guest ${g.presente?'entered':''}" data-id="${g.id}" data-locate="${activeFilter?'1':''}">
      <div class="guest-main">
        <strong>${esc(g.nome)}</strong>
        <span class="status-pill">${typeLabel(g.tipo)}${g.aniversariante?' - Aniversariante':''}</span>
        ${g.observacao?`<small>${esc(g.observacao)}</small>`:''}
      </div>
      <button class="btn ${g.presente?'btn-primary':'btn-secondary'} guest-toggle" data-toggle="${g.id}">${g.presente?'Entrou':'Marcar entrada'}</button>
      <button class="icon-button guest-remove" data-remove="${g.id}" title="Remover">x</button>
    </article>`).join('');

  box.querySelectorAll('[data-toggle]').forEach(btn=>btn.addEventListener('click',()=>togglePresence(btn.dataset.toggle,activeFilter)));
  box.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>removeGuest(btn.dataset.remove)));
}

async function togglePresence(id,wasFiltered){
  const g=state.guests.find(x=>x.id===id);if(!g)return;
  g.presente=!g.presente;g.entrada_em=g.presente?new Date().toISOString():null;
  writeCache(state.eventoId,state.guests);
  if(wasFiltered){
    state.search='';state.azPrefix='';
    const s=document.querySelector('#search');if(s)s.value='';
    updateAzPrefixDisplay();
  }
  renderCounts();renderGuests();
  state.saving.add(id);
  try{const session=await getSession();if(session)await setGuestPresence(session,id,g.presente)}
  catch(err){console.warn('Falha ao sincronizar presenca, tentara de novo no proximo ciclo:',err.message)}
  finally{state.saving.delete(id)}
}

async function removeGuest(id){
  if(!confirm('Remover este convidado da lista?'))return;
  state.guests=state.guests.filter(x=>x.id!==id);writeCache(state.eventoId,state.guests);
  renderCounts();renderGuests();
  try{const session=await getSession();if(session)await deleteGuest(session,id)}catch(err){console.warn('Falha ao remover no servidor:',err.message)}
}

function detectColumns(headerRow){
  const norm=headerRow.map(h=>normalize(String(h||'')));
  const find=(...keys)=>norm.findIndex(h=>keys.some(k=>h.includes(k)));
  return {
    nome:find('nome','convidado'),
    tipo:find('tipo','categoria'),
    criancas:find('crianca menor','crianca','criancas'),
    isentos:find('isento','menor 4','menores 4'),
    obs:find('observa','obs')
  };
}

function rowsFromSheet(sheetRows){
  if(!sheetRows.length)return [];
  const header=sheetRows[0];
  const cols=detectColumns(header);
  const out=[];
  if(cols.nome===-1){
    for(const row of sheetRows){
      const nome=String(row[0]||'').trim();if(!nome)continue;
      out.push({nome,tipo:'adulto',observacao:''});
    }
    return out;
  }
  for(let i=1;i<sheetRows.length;i++){
    const row=sheetRows[i];const nome=String(row[cols.nome]||'').trim();if(!nome)continue;
    let tipo='adulto';
    if(cols.tipo>-1){
      const t=normalize(String(row[cols.tipo]||''));
      tipo=t.includes('crian')?'crianca':t.includes('isent')?'isento':'adulto';
    }
    out.push({nome,tipo,observacao:cols.obs>-1?String(row[cols.obs]||'').trim():''});
  }
  return out;
}

async function handleImportFile(e){
  const file=e.target.files?.[0];if(!file)return;
  const root=document.querySelector('#app');
  const badge=root?.querySelector('#portariaSyncBadge');
  try{
    if(badge){badge.textContent='Lendo planilha...';badge.className='badge'}
    await ensureXlsxLoaded();
    const buf=await file.arrayBuffer();
    const wb=window.XLSX.read(buf,{type:'array'});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const rows=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''});
    const parsed=rowsFromSheet(rows);
    if(!parsed.length){alert('Nao encontrei nenhum nome nessa planilha. Confira se a primeira aba tem uma coluna de nome.');return}
    const novos=parsed.map(p=>({id:uid(),evento_id:state.eventoId,nome:p.nome,tipo:p.tipo,aniversariante:false,observacao:p.observacao||'',presente:false,entrada_em:null,criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString()}));
    state.guests=[...state.guests,...novos];writeCache(state.eventoId,state.guests);
    renderCounts();renderGuests();
    if(badge){badge.textContent='Salvando...';badge.className='badge'}
    const session=await getSession();
    if(session){await upsertGuests(session,novos);if(badge){badge.textContent='Sincronizado';badge.className='badge green'}}
    else if(badge){badge.textContent='Offline (usando copia salva no aparelho)';badge.className='badge warning'}
    alert(`${novos.length} convidado(s) importado(s).`);
  }catch(err){
    alert(`Nao foi possivel importar: ${err.message}`);
  }finally{
    e.target.value='';
  }
}
