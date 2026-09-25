import { readJSON, writeJSON } from '../../js/storage.js';
const PRODUCTS_KEY='lega.estoque.produtos';const LOTS_KEY='lega.estoque.lotes';const MOV_KEY='lega.estoque.movimentacoes';
let state={query:'',setor:'todos',view:'estoque'};
const uid=(p='stk')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=v=>{if(!v)return'—';const[y,m,d]=String(v).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d));};

// --- acesso a dados (usados também pelo módulo de eventos) ---
export function produtos(){return readJSON(PRODUCTS_KEY,[]);}
export function lotes(){return readJSON(LOTS_KEY,[]);}
export function movimentacoes(){return readJSON(MOV_KEY,[]);}
function saveProdutos(v){writeJSON(PRODUCTS_KEY,v);}
function saveLotes(v){writeJSON(LOTS_KEY,v);}
function saveMovimentacoes(v){writeJSON(MOV_KEY,v);}

export function produtoPorId(id){return produtos().find(p=>p.id===id)||null;}
export function produtoPorNome(nome){const n=String(nome||'').trim().toLowerCase();return produtos().find(p=>String(p.nome).trim().toLowerCase()===n)||null;}

// saldo real do produto = soma do que ainda resta nos lotes (FIFO), não mais média
export function saldoProduto(produtoId){return lotes().filter(l=>l.produtoId===produtoId).reduce((s,l)=>s+Number(l.quantidadeDisponivel||0),0);}
function custoMedioAtual(produtoId){const ls=lotes().filter(l=>l.produtoId===produtoId&&Number(l.quantidadeDisponivel||0)>0);const q=ls.reduce((s,l)=>s+Number(l.quantidadeDisponivel||0),0);const v=ls.reduce((s,l)=>s+Number(l.quantidadeDisponivel||0)*Number(l.custoUnitario||0),0);return q?v/q:0;}

/**
 * Baixa "quantidade" unidades do produto, consumindo os lotes mais antigos primeiro (FIFO).
 * Retorna {ok:false, disponivel} se não houver estoque suficiente (nada é alterado nesse caso),
 * ou {ok:true, custoTotal, custoMedio, consumos:[{loteId, quantidade, custoUnitario}]} quando aplicado.
 */
export function consumirFIFO(produtoId, quantidade){
    quantidade=Number(quantidade||0);
    if(quantidade<=0) return {ok:true, custoTotal:0, custoMedio:0, consumos:[]};

    const disponivel=saldoProduto(produtoId);
    if(disponivel<quantidade) return {ok:false, disponivel};

    let ls=lotes();
    const ordenados=ls.filter(l=>l.produtoId===produtoId&&Number(l.quantidadeDisponivel||0)>0)
        .sort((a,b)=>String(a.dataEntrada||a.createdAt||'').localeCompare(String(b.dataEntrada||b.createdAt||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));

    let restante=quantidade;let custoTotal=0;const consumos=[];
    for(const lote of ordenados){
        if(restante<=0) break;
        const tomar=Math.min(Number(lote.quantidadeDisponivel||0),restante);
        if(tomar<=0) continue;
        ls=ls.map(l=>l.id===lote.id?{...l,quantidadeDisponivel:Number(l.quantidadeDisponivel)-tomar}:l);
        custoTotal+=tomar*Number(lote.custoUnitario||0);
        consumos.push({loteId:lote.id,quantidade:tomar,custoUnitario:Number(lote.custoUnitario||0)});
        restante-=tomar;
    }
    saveLotes(ls);
    return {ok:true, custoTotal, custoMedio: quantidade?custoTotal/quantidade:0, consumos};
}

/** Devolve exatamente as quantidades tomadas de cada lote (usado ao excluir/editar um consumo de evento). */
export function devolverConsumo(consumos){
    if(!Array.isArray(consumos)||!consumos.length) return;
    let ls=lotes();
    consumos.forEach(c=>{
        ls=ls.map(l=>l.id===c.loteId?{...l,quantidadeDisponivel:Number(l.quantidadeDisponivel||0)+Number(c.quantidade||0)}:l);
    });
    saveLotes(ls);
}

/** Garante que o produto existe no cadastro de estoque (usado pelo módulo de eventos), sem criar lote. */
export function garantirProduto({nome,setor='Bebidas',unidade='un',estoqueMinimo=0}){
    let ps=produtos();
    let p=produtoPorNome(nome);
    if(!p){p={id:uid('prod'),nome:String(nome).trim(),setor,unidade,estoqueMinimo:Number(estoqueMinimo||0),createdAt:new Date().toISOString()};ps=[...ps,p];saveProdutos(ps);}
    return p;
}

export function registrarMovimento(m){saveMovimentacoes([...movimentacoes(),{id:uid('mov'),createdAt:new Date().toISOString(),...m}]);}

export function render(){
    const ps=produtos();
    const filtered=ps.filter(p=>{const text=`${p.nome} ${p.setor}`.toLowerCase();return(!state.query||text.includes(state.query.toLowerCase()))&&(state.setor==='todos'||p.setor===state.setor);}).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
    const value=ps.reduce((s,p)=>s+Math.max(0,saldoProduto(p.id))*custoMedioAtual(p.id),0);
    const low=ps.filter(p=>saldoProduto(p.id)<=Number(p.estoqueMinimo||0)).length;
    const recent=[...movimentacoes()].sort((a,b)=>String(b.data||b.createdAt||'').localeCompare(String(a.data||a.createdAt||''))).slice(0,30);
    return `<div class="page-grid stock-module"><section class="events-header"><div><span class="eyebrow">SUPRIMENTOS</span><h2>Estoque</h2><p>Cada entrada gera um lote. As saídas consomem sempre o lote mais antigo primeiro (FIFO) e são geradas automaticamente pelo consumo dos eventos.</p></div></section><section class="panel" id="importPanel"><div class="panel-header"><div><h2>Importar estoque do sistema antigo</h2><p>Carregue o arquivo dados_migracao_estoque.json uma única vez para trazer os produtos e lotes reais do controlebebidaslega. Pode importar de novo sem medo: itens já importados não são duplicados.</p></div></div><div class="form-grid"><div class="field field-full"><label>Arquivo de migração (.json)</label><input type="file" id="importFile" accept="application/json,.json"></div></div><p id="importStatus" style="margin:4px 0 0;color:#666"></p></section><section class="finance-kpis"><div class="panel"><small>Produtos cadastrados</small><strong>${ps.length}</strong></div><div class="panel"><small>Estoque baixo</small><strong>${low}</strong></div><div class="panel"><small>Valor estimado em estoque</small><strong>${money(value)}</strong></div><div class="panel"><small>Saídas registradas</small><strong>${movimentacoes().filter(x=>x.tipo==='saida').length}</strong></div></section><section class="panel"><div class="panel-header"><div><h2>Entrada de produto</h2><p>Cada compra gera um lote próprio, preservando custo e data de entrada.</p></div></div><form id="stockEntryForm" class="form-grid"><div class="field"><label>Produto</label><input name="nome" list="stockProductNames" required><datalist id="stockProductNames">${ps.map(p=>`<option value="${esc(p.nome)}"></option>`).join('')}</datalist></div><div class="field"><label>Setor</label><select name="setor"><option>Bebidas</option><option>Alimentação</option><option>Decoração</option><option>Itens de limpeza</option><option>Itens de banheiro</option><option>Itens de cozinha</option><option>Diversos</option></select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Unidade</label><select name="unidade"><option>un</option><option>garrafa</option><option>pacote</option><option>kg</option><option>L</option><option>caixa</option><option>saco</option></select></div><div class="field"><label>Custo unitário</label><input name="custoUnitario" type="number" min="0" step="0.01" required></div><div class="field"><label>Data da entrada</label><input name="dataEntrada" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Validade (opcional)</label><input name="validade" type="date"></div><div class="field"><label>Estoque mínimo</label><input name="estoqueMinimo" type="number" min="0" step="0.01" value="0"></div><div class="field-full form-actions"><button class="btn-salvar">Registrar entrada</button></div></form></section><section class="panel stock-toolbar"><div class="events-search"><span>⌕</span><input id="stockSearch" value="${esc(state.query)}" placeholder="Buscar produto"></div><select id="stockSector"><option value="todos">Todos os setores</option>${['Bebidas','Alimentação','Decoração','Itens de limpeza','Itens de banheiro','Itens de cozinha','Diversos'].map(s=>`<option value="${s}" ${state.setor===s?'selected':''}>${s}</option>`).join('')}</select></section><section class="panel"><div class="table-wrap"><table class="event-table"><thead><tr><th>Produto</th><th>Setor</th><th>Saldo (lotes)</th><th>Unidade</th><th>Custo médio atual</th><th>Mínimo</th><th>Situação</th></tr></thead><tbody>${filtered.length?filtered.map(p=>{const bal=saldoProduto(p.id);const isLow=bal<=Number(p.estoqueMinimo||0);return `<tr><td><strong>${esc(p.nome)}</strong></td><td>${esc(p.setor)}</td><td><strong>${Number(bal.toFixed(2)).toLocaleString('pt-BR')}</strong></td><td>${esc(p.unidade||'un')}</td><td>${money(custoMedioAtual(p.id))}</td><td>${Number(p.estoqueMinimo||0).toLocaleString('pt-BR')}</td><td><span class="stock-status ${isLow?'stock-status--low':'stock-status--ok'}">${isLow?'Repor':'OK'}</span></td></tr>`;}).join(''):'<tr><td colspan="7">Nenhum produto cadastrado.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-header"><div><h2>Movimentações recentes</h2><p>Inclui as saídas informadas nos eventos.</p></div></div><div class="table-wrap"><table class="event-table"><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Quantidade</th><th>Setor</th></tr></thead><tbody>${recent.length?recent.map(m=>`<tr><td>${dateBR(m.data||m.createdAt)}</td><td>${m.tipo==='saida'?'Saída':m.tipo==='estorno'?'Estorno':'Entrada'}</td><td>${esc(m.produto||m.produtoNome||'')}</td><td>${Number(m.quantidade||0).toLocaleString('pt-BR')} ${esc(m.unidade||'')}</td><td>${esc(m.setor||'')}</td></tr>`).join(''):'<tr><td colspan="5">Nenhuma movimentação registrada.</td></tr>'}</tbody></table></div></section></div>`;
}
export function renderEstoque(){return render();}
/** Importa produtos/lotes vindos do sistema antigo (Supabase controlebebidaslega), sem duplicar em reimportações. */
export function importarMigracao(dados){
    const entrada={produtos:Array.isArray(dados?.produtos)?dados.produtos:[],lotes:Array.isArray(dados?.lotes)?dados.lotes:[]};
    let ps=produtos();let ls=lotes();
    const mapaIdAntigoParaNovo={};
    let produtosCriados=0,produtosAtualizados=0,lotesCriados=0,lotesIgnorados=0;

    entrada.produtos.forEach(op=>{
        let p=produtoPorNome(op.nome);
        if(!p){p={id:uid('prod'),nome:String(op.nome).trim(),setor:op.setor||'Bebidas',unidade:op.unidade||'un',estoqueMinimo:Number(op.estoqueMinimo||0),origemId:op.origemId||null,createdAt:new Date().toISOString()};ps=[...ps,p];produtosCriados++;}
        else if(!p.origemId&&op.origemId){ps=ps.map(x=>x.id===p.id?{...x,origemId:op.origemId}:x);produtosAtualizados++;}
        mapaIdAntigoParaNovo[op.origemId||op.id]=p.id;
    });
    saveProdutos(ps);

    entrada.lotes.forEach(ol=>{
        if(ls.some(l=>l.origemId&&l.origemId===ol.origemId)){lotesIgnorados++;return;}
        const produtoId=mapaIdAntigoParaNovo[ol.produtoOrigemId]||produtoPorNome(ol.produtoNome)?.id;
        if(!produtoId)return;
        ls=[...ls,{id:uid('lote'),produtoId,produtoNome:ol.produtoNome,setor:ol.setor||'Bebidas',unidade:ol.unidade||'un',
            quantidadeInicial:Number(ol.quantidadeInicial||0),quantidadeDisponivel:Number(ol.quantidadeDisponivel||0),
            custoUnitario:Number(ol.custoUnitario||0),dataEntrada:ol.dataEntrada,validade:ol.validade||'',
            origemId:ol.origemId||null,createdAt:new Date().toISOString()}];
        lotesCriados++;
    });
    saveLotes(ls);
    return {produtosCriados,produtosAtualizados,lotesCriados,lotesIgnorados};
}

export function mount(){
    const root=document.querySelector('#app');if(!root)return;
    const rerender=()=>{root.innerHTML=render();mount();};
    root.querySelector('#importFile')?.addEventListener('change',e=>{
        const file=e.target.files?.[0];if(!file)return;
        const status=root.querySelector('#importStatus');
        const reader=new FileReader();
        reader.onload=()=>{
            try{
                const dados=JSON.parse(reader.result);
                const r=importarMigracao(dados);
                if(status)status.textContent=`Importado: ${r.produtosCriados} produto(s) novo(s), ${r.lotesCriados} lote(s) novo(s) (${r.lotesIgnorados} já existiam e foram ignorados).`;
                rerender();
            }catch(err){if(status)status.textContent='Não foi possível ler o arquivo: '+err.message;}
        };
        reader.readAsText(file);
    });
    root.querySelector('#stockSearch')?.addEventListener('input',e=>{state.query=e.target.value;rerender();});
    root.querySelector('#stockSector')?.addEventListener('change',e=>{state.setor=e.target.value;rerender();});
    root.querySelector('#stockEntryForm')?.addEventListener('submit',e=>{
        e.preventDefault();
        const d=Object.fromEntries(new FormData(e.currentTarget).entries());
        const p=garantirProduto({nome:d.nome,setor:d.setor,unidade:d.unidade,estoqueMinimo:d.estoqueMinimo});
        // atualiza setor/unidade/mínimo se o produto já existia
        saveProdutos(produtos().map(x=>x.id===p.id?{...x,setor:d.setor,unidade:d.unidade,estoqueMinimo:Number(d.estoqueMinimo||x.estoqueMinimo||0),updatedAt:new Date().toISOString()}:x));
        const lote={id:uid('lote'),produtoId:p.id,produtoNome:p.nome,setor:d.setor,unidade:d.unidade,
            quantidadeInicial:Number(d.quantidade||0),quantidadeDisponivel:Number(d.quantidade||0),
            custoUnitario:Number(d.custoUnitario||0),dataEntrada:d.dataEntrada,validade:d.validade||'',createdAt:new Date().toISOString()};
        saveLotes([...lotes(),lote]);
        registrarMovimento({tipo:'entrada',produto:p.nome,produtoId:p.id,quantidade:Number(d.quantidade||0),unidade:d.unidade,setor:d.setor,data:d.dataEntrada});
        rerender();
    });
}
