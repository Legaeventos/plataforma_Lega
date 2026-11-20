// Ações rápidas (v2.2.0)
// ----------------------
// Botão "＋" fixo em todas as telas: abre na hora o que mais se faz no dia a dia,
// sem navegar pelos menus. Também usado pela Rotina do painel ("Recebido").

import { readJSON, writeJSON } from '../../js/storage.js';
import { FORMAS } from '../../modules/eventos/contrato.js';
import { parcelasAbertas } from '../engine/rotina.js';
import { CATEGORIAS_CASA } from '../../modules/financeiro/resultado.js';

const EVENTS_KEY = 'lega.eventos';
const GENERAL_KEY = 'lega.financeiro.lancamentos';
const CATEGORIAS_FESTA = ['Bolo e doces', 'Decoração personalizada', 'Alimentação (compra para a festa)', 'Bebidas (compra para a festa)', 'Equipe extra', 'Aluguel de itens', 'Outros'];
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pad = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '';
const uid = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const selectedQuote = e => e?.orcamentos?.find(q => q.id === e.orcamentoEscolhidoId) || e?.orcamentos?.at(-1) || null;
const numero = v => { const s = String(v ?? '').trim().replace(/\s/g, '').replace('R$', ''); if (!s) return NaN; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
const eventos = () => readJSON(EVENTS_KEY, []) || [];
const nomeFesta = e => { const q = selectedQuote(e) || {}; return `${q.nome || q.cliente || 'Festa'} · ${dataBR(q.data)}`; };
const atualizarTela = () => window.legaNavigate?.(location.hash.slice(1) || 'dashboard');

// ------------------------------------------------------------------ gravações
/** Recebimento do cliente: mesma regra do Financeiro do evento. */
export function registrarRecebimento(eventId, { descricao, valor, data, forma, parcelaId }) {
  const item = { id: uid('fin'), tipo: 'entrada', descricao, valor: Number(valor || 0), data, forma, ...(parcelaId ? { parcelaId } : {}), createdAt: new Date().toISOString() };
  writeJSON(EVENTS_KEY, eventos().map(e => {
    if (e.id !== eventId) return e;
    const primeira = !e.entradaPaga;
    return { ...e, lancamentosFinanceiros: [...(e.lancamentosFinanceiros || []), item],
      entradaPaga: e.entradaPaga || primeira, entradaValor: primeira ? item.valor : e.entradaValor, entradaData: primeira ? item.data : e.entradaData, entradaForma: primeira ? item.forma : e.entradaForma,
      status: primeira && ['aceito', 'contrato'].includes(e.status) ? 'entrada' : e.status,
      historico: [...(e.historico || []), { id: uid('hist'), label: 'Recebimento registrado', detail: `${descricao} · ${money(item.valor)}`, at: new Date().toISOString() }] };
  }));
  return item;
}
export function registrarDespesaFesta(eventId, { descricao, valor, data, forma, categoria }) {
  const item = { id: uid('fin'), tipo: 'saida', descricao, valor: Number(valor || 0), data, forma, categoria: categoria || 'Outros', createdAt: new Date().toISOString() };
  writeJSON(EVENTS_KEY, eventos().map(e => e.id !== eventId ? e : { ...e, lancamentosFinanceiros: [...(e.lancamentosFinanceiros || []), item], historico: [...(e.historico || []), { id: uid('hist'), label: 'Despesa registrada', detail: `${descricao} · ${money(item.valor)}`, at: new Date().toISOString() }] }));
}
export function registrarDespesaCasa({ descricao, valor, data, forma, categoria }) {
  writeJSON(GENERAL_KEY, [...(readJSON(GENERAL_KEY, []) || []), { id: uid('fin'), tipo: 'saida', descricao, categoria, valor: Number(valor || 0), data, forma, createdAt: new Date().toISOString() }]);
}

// ------------------------------------------------------------------ modais
function modal(titulo, eyebrow, corpo) {
  document.querySelector('#arModal')?.remove();
  const box = document.createElement('div'); box.className = 'lega-modal'; box.id = 'arModal';
  box.innerHTML = `<div class="lega-modal__card ar-card" role="dialog" aria-modal="true"><span class="eyebrow">${eyebrow}</span><h2>${titulo}</h2>${corpo}</div>`;
  document.body.appendChild(box);
  box.onclick = ev => { if (ev.target === box || ev.target.closest('[data-ar="fechar"]')) box.remove(); };
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc); } });
  return box;
}
function aviso(texto) {
  document.querySelector('#arToast')?.remove();
  const t = document.createElement('div'); t.id = 'arToast'; t.className = 'ar-toast'; t.textContent = texto; document.body.appendChild(t);
  setTimeout(() => t.classList.add('sai'), 2600); setTimeout(() => t.remove(), 3200);
}

export function abrirRecebimento(eventIdInicial = '', parcelaIdInicial = '') {
  const lista = eventos().filter(e => !['orcamento', 'perdido'].includes(e.status)).map(e => {
    const q = selectedQuote(e) || {}; const recebido = (e.lancamentosFinanceiros || []).filter(x => x.tipo === 'entrada').reduce((s, x) => s + Number(x.valor || 0), 0);
    return { e, q, saldo: Math.max(0, Number(e.valorContratado ?? q.valor ?? 0) - recebido), abertas: parcelasAbertas(e) };
  }).filter(x => x.saldo > 0.009 || x.e.id === eventIdInicial).sort((a, b) => String(a.q.data || '').localeCompare(String(b.q.data || '')));
  if (!lista.length) { aviso('Nenhuma festa com valor a receber.'); return; }
  const box = modal('Receber pagamento', 'AÇÃO RÁPIDA', `<form class="form-grid" id="arReceber">
    <div class="field field-full"><label>Festa</label><select name="evento">${lista.map(x => `<option value="${esc(x.e.id)}" ${x.e.id === eventIdInicial ? 'selected' : ''}>${esc(nomeFesta(x.e))} · falta ${money(x.saldo)}</option>`).join('')}</select></div>
    <div class="field field-full" id="arParcelas"></div>
    <div class="field"><label>Valor recebido (R$)</label><input name="valor" inputmode="decimal" required></div>
    <div class="field"><label>Data</label><input name="data" type="date" value="${hoje()}" max="${hoje()}" required></div>
    <div class="field"><label>Forma</label><select name="forma">${FORMAS.map(f => `<option>${f}</option>`).join('')}</select></div>
    <div class="field"><label>Descrição</label><input name="descricao" required></div>
    <div class="field field-full form-actions"><button type="button" class="btn btn-ghost" data-ar="fechar">Cancelar</button><button class="btn btn-primary">Registrar recebimento</button></div></form>`);
  const f = box.querySelector('#arReceber');
  const montarParcelas = (pid = '') => {
    const x = lista.find(y => y.e.id === f.evento.value); const abertas = x?.abertas || [];
    box.querySelector('#arParcelas').innerHTML = abertas.length ? `<label>Qual parcela?</label><div class="ar-parcelas">${abertas.map((p, i) => `<label class="ar-parcela ${p.vencimento < hoje() ? 'vencida' : ''}"><input type="radio" name="parcela" value="${esc(p.id)}" ${(pid ? p.id === pid : i === 0) ? 'checked' : ''} data-valor="${p.valor}" data-desc="${esc(p.descricao)}" data-forma="${esc(p.forma || '')}"><b>${esc(p.descricao)}</b><span>${money(p.valor)} · ${p.vencimento < hoje() ? 'venceu' : 'vence'} ${dataBR(p.vencimento)}</span></label>`).join('')}<label class="ar-parcela"><input type="radio" name="parcela" value="" ${abertas.length && pid === '__outro' ? 'checked' : ''}><b>Outro valor</b><span>sem parcela definida</span></label></div>` : `<p class="es-dica">Sem parcelas no contrato desta festa: informe o valor recebido. Falta receber ${money(x?.saldo)}.</p>`;
    const aplicar = () => { const r = box.querySelector('[name=parcela]:checked'); if (r && r.value) { f.valor.value = String(r.dataset.valor).replace('.', ','); f.descricao.value = r.dataset.desc; if (FORMAS.includes(r.dataset.forma)) f.forma.value = r.dataset.forma; } else if (!f.descricao.value) f.descricao.value = 'Pagamento do cliente'; };
    box.querySelectorAll('[name=parcela]').forEach(r => r.onchange = aplicar); aplicar();
  };
  f.evento.onchange = () => { f.valor.value = ''; f.descricao.value = ''; montarParcelas(); };
  montarParcelas(parcelaIdInicial);
  if (!f.descricao.value) f.descricao.value = 'Pagamento do cliente';
  setTimeout(() => f.valor.focus(), 30);
  f.onsubmit = ev => {
    ev.preventDefault(); const v = numero(f.valor.value);
    if (!(v > 0)) return alert('Informe o valor recebido.');
    const r = box.querySelector('[name=parcela]:checked');
    registrarRecebimento(f.evento.value, { descricao: f.descricao.value.trim() || 'Pagamento do cliente', valor: v, data: f.data.value, forma: f.forma.value, parcelaId: r?.value || '' });
    box.remove(); aviso(`✓ Recebimento de ${money(v)} registrado.`); atualizarTela();
  };
}

export function abrirDespesa() {
  const festas = eventos().filter(e => !['orcamento', 'perdido'].includes(e.status)).sort((a, b) => Math.abs(new Date(selectedQuote(a)?.data || 0) - Date.now()) - Math.abs(new Date(selectedQuote(b)?.data || 0) - Date.now())).slice(0, 30);
  const box = modal('Lançar despesa', 'AÇÃO RÁPIDA', `<form class="form-grid" id="arDespesa">
    <div class="field field-full"><label>É despesa de quê?</label><div class="ar-tipo"><label><input type="radio" name="de" value="casa" checked> 🏠 Casa e escritório <small>luz, aluguel, internet, pró-labore…</small></label><label><input type="radio" name="de" value="festa"> 🎉 De uma festa <small>aluguel de itens, equipe extra…</small></label></div></div>
    <div class="field field-full" data-so="festa" hidden><label>Festa</label><select name="evento">${festas.map(e => `<option value="${esc(e.id)}">${esc(nomeFesta(e))}</option>`).join('')}</select></div>
    <div class="field"><label>Categoria</label><select name="categoria"></select></div>
    <div class="field"><label>Descrição</label><input name="descricao" required placeholder="Ex.: Conta de luz de novembro"></div>
    <div class="field"><label>Valor (R$)</label><input name="valor" inputmode="decimal" required></div>
    <div class="field"><label>Data</label><input name="data" type="date" value="${hoje()}" required></div>
    <div class="field"><label>Forma</label><select name="forma"><option value="">—</option>${FORMAS.map(f => `<option>${f}</option>`).join('')}</select></div>
    <p class="es-dica field-full">Compras para o estoque (bebidas, comida, decoração, material) são lançadas em <b>Lançar compra</b>, para entrar no estoque.</p>
    <div class="field field-full form-actions"><button type="button" class="btn btn-ghost" data-ar="fechar">Cancelar</button><button class="btn btn-primary">Lançar despesa</button></div></form>`);
  const f = box.querySelector('#arDespesa');
  const trocar = () => { const festa = f.de.value === 'festa'; box.querySelector('[data-so="festa"]').hidden = !festa; f.categoria.innerHTML = (festa ? CATEGORIAS_FESTA : CATEGORIAS_CASA).map(c => `<option>${c}</option>`).join(''); if (!festa) f.categoria.value = 'Outros'; };
  box.querySelectorAll('[name=de]').forEach(r => r.onchange = trocar); trocar();
  if (!festas.length) box.querySelector('[name=de][value=festa]').disabled = true;
  setTimeout(() => f.descricao.focus(), 30);
  f.onsubmit = ev => {
    ev.preventDefault(); const v = numero(f.valor.value);
    if (!(v > 0)) return alert('Informe o valor.');
    const dados = { descricao: f.descricao.value.trim(), valor: v, data: f.data.value, forma: f.forma.value, categoria: f.categoria.value };
    if (f.de.value === 'festa') registrarDespesaFesta(f.evento.value, dados); else registrarDespesaCasa(dados);
    box.remove(); aviso(`✓ Despesa de ${money(v)} lançada.`); atualizarTela();
  };
}

function irEstoque(aba) { try { const u = JSON.parse(localStorage.getItem('lega.estoque.ui') || '{}'); localStorage.setItem('lega.estoque.ui', JSON.stringify({ ...u, aba, novo: true })); } catch { } if (location.hash === '#estoque') window.legaNavigate?.('estoque'); else location.hash = 'estoque'; }
function novoOrcamento() { try { localStorage.setItem('lega.navigation.request', JSON.stringify({ action: 'new' })); } catch { } if (location.hash === '#eventos') window.legaNavigate?.('eventos'); else location.hash = 'eventos'; }

const ACOES = [
  ['orcamento', '📝', 'Novo orçamento', novoOrcamento],
  ['receber', '💰', 'Receber pagamento', () => abrirRecebimento()],
  ['despesa', '🧾', 'Lançar despesa', abrirDespesa],
  ['compra', '🛒', 'Lançar compra', () => irEstoque('compras')],
  ['consumo', '🎉', 'Consumo de festa', () => irEstoque('consumo')]
];

export function instalarAcoesRapidas() {
  if (document.querySelector('#arFab')) return;
  const fab = document.createElement('div'); fab.id = 'arFab'; fab.className = 'ar-fab';
  fab.innerHTML = `<div class="ar-menu" role="menu">${ACOES.map(([k, ic, t]) => `<button type="button" role="menuitem" data-ar-acao="${k}"><span>${ic}</span>${t}</button>`).join('')}</div><button type="button" class="ar-botao" aria-label="Ações rápidas" title="Ações rápidas">＋</button>`;
  document.body.appendChild(fab);
  const fechar = () => fab.classList.remove('aberto');
  fab.querySelector('.ar-botao').onclick = ev => { ev.stopPropagation(); fab.classList.toggle('aberto'); };
  fab.querySelectorAll('[data-ar-acao]').forEach(b => b.onclick = () => { fechar(); ACOES.find(a => a[0] === b.dataset.arAcao)?.[3](); });
  document.addEventListener('click', ev => { if (!fab.contains(ev.target)) fechar(); });
}
