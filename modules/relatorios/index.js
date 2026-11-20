// Relatórios (v2.1.0)
// -------------------
// Indicadores do ano: funil de orçamentos, ticket médio, rentabilidade por
// pacote e por tipo de festa, custo por convidado, dias mais pedidos e o que
// mais pesa no consumo. Usa a mesma conta do Resultado do mês.

import { readJSON } from '../../js/storage.js';
import { resultadoFesta } from '../financeiro/resultado.js';

const EVENTS_KEY = 'lega.eventos';
let state = { year: new Date().getFullYear() };
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const num = (v, c = 0) => Number(Number(v || 0).toFixed(c)).toLocaleString('pt-BR');
const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';
const selectedQuote = e => e?.orcamentos?.find(q => q.id === e.orcamentoEscolhidoId) || e?.orcamentos?.at(-1) || null;
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const convidadosDe = f => Number(f.e.adultos || 0) + Number(f.e.criancas || 0) || Number(f.q.convidadosTotal || 0);

function agrupar(lista, chave) {
  const m = new Map();
  lista.forEach(f => { const k = chave(f) || 'Não informado'; const a = m.get(k) || { nome: k, n: 0, receita: 0, resultado: 0, completas: 0, resultadoCompletas: 0, receitaCompletas: 0 }; a.n++; a.receita += f.receita; if (!f.pendencias.length) { a.completas++; a.resultadoCompletas += f.resultado; a.receitaCompletas += f.receita; } m.set(k, a); });
  return [...m.values()].sort((a, b) => b.n - a.n || b.receita - a.receita);
}
const barra = (v, max, neg = false) => `<i class="${neg ? 'neg' : ''}" style="width:${Math.max(3, Math.round(Math.abs(v) / Math.max(1, max) * 100))}%"></i>`;

export function render() {
  const eventos = readJSON(EVENTS_KEY, []) || [];
  const anos = [...new Set(eventos.map(e => Number(String(selectedQuote(e)?.data || '').slice(0, 4))).filter(Boolean).concat([new Date().getFullYear()]))].sort((a, b) => b - a);
  if (!anos.includes(state.year)) state.year = anos[0];
  const doAno = eventos.filter(e => Number(String(selectedQuote(e)?.data || '').slice(0, 4)) === Number(state.year));
  const fechadas = doAno.filter(e => !['orcamento', 'perdido'].includes(e.status)).map(resultadoFesta);
  const perdidas = doAno.filter(e => e.status === 'perdido');
  const abertos = doAno.filter(e => e.status === 'orcamento');
  const decididos = fechadas.length + perdidas.length;
  const conversao = decididos ? fechadas.length / decididos * 100 : 0;
  const receita = fechadas.reduce((s, f) => s + f.receita, 0);
  const completas = fechadas.filter(f => !f.pendencias.length);
  const resultadoCompletas = completas.reduce((s, f) => s + f.resultado, 0);
  const convCompletas = completas.reduce((s, f) => s + convidadosDe(f), 0);
  const custoConv = convCompletas ? completas.reduce((s, f) => s + f.custos, 0) / convCompletas : 0;
  const motivos = {}; perdidas.forEach(e => { const k = e.motivoPerda || 'Sem motivo anotado'; motivos[k] = (motivos[k] || 0) + 1; });
  const porMes = Array.from({ length: 12 }, (_, i) => { const l = fechadas.filter(f => Number(String(f.q.data).slice(5, 7)) === i + 1); return { m: i, n: l.length, receita: l.reduce((s, f) => s + f.receita, 0) }; });
  const maxMes = Math.max(1, ...porMes.map(x => x.receita));
  const pacotes = agrupar(fechadas, f => f.q.pacote); const tipos = agrupar(fechadas, f => f.q.tipo);
  const dias = Array(7).fill(0); doAno.forEach(e => { const d = selectedQuote(e)?.data; if (d) { const [y, m, dd] = d.split('-').map(Number); dias[new Date(y, m - 1, dd).getDay()]++; } });
  const maxDia = Math.max(1, ...dias);
  const cons = new Map();
  fechadas.forEach(f => (f.e.consumoEstoque?.itens || []).forEach(i => { const k = i.receita ? `${i.receita} (receita)` : i.produto; const a = cons.get(k) || { nome: k, custo: 0, festas: new Set() }; a.custo += Number(i.custo || 0); a.festas.add(f.e.id); cons.set(k, a); }));
  const topCons = [...cons.values()].sort((a, b) => b.custo - a.custo).slice(0, 10);
  const maxCons = Math.max(1, ...topCons.map(x => x.custo));
  const tabelaGrupo = (lista, titulo, sub) => `<div class="panel"><div class="panel-header"><div><h2>${titulo}</h2><p>${sub}</p></div></div>${lista.length ? `<div class="table-wrap"><table class="event-table"><thead><tr><th></th><th>Festas</th><th>Ticket médio</th><th>Resultado médio*</th><th>Margem*</th></tr></thead><tbody>${lista.map(a => `<tr><td><b>${esc(a.nome)}</b></td><td>${a.n}</td><td>${money(a.receita / a.n)}</td><td>${a.completas ? money(a.resultadoCompletas / a.completas) : '—'}</td><td>${a.receitaCompletas ? pct(a.resultadoCompletas / a.receitaCompletas * 100) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted-copy">Sem festas neste ano.</p>'}</div>`;
  return `<div class="page-grid reports-module">
  <section class="events-header"><div><span class="eyebrow">GESTÃO</span><h2>Relatórios</h2><p>Como foi o ano: orçamentos que viraram festa, quanto cada pacote rende e onde vai o custo.</p></div><select id="reportYear" class="report-year">${anos.map(y => `<option value="${y}" ${Number(y) === Number(state.year) ? 'selected' : ''}>${y}</option>`).join('')}</select></section>
  <section class="finance-kpis rel-kpis">
    <div class="panel"><small>Festas fechadas</small><strong>${fechadas.length}</strong><em>${fechadas.filter(f => f.e.status === 'realizado').length} já realizadas</em></div>
    <div class="panel"><small>Orçamentos que fecharam</small><strong>${pct(conversao)}</strong><em>${fechadas.length} de ${decididos} decididos${abertos.length ? ` · ${abertos.length} em aberto` : ''}</em></div>
    <div class="panel"><small>Ticket médio</small><strong>${money(fechadas.length ? receita / fechadas.length : 0)}</strong><em>receita do ano ${money(receita)}</em></div>
    <div class="panel"><small>Resultado médio por festa*</small><strong>${money(completas.length ? resultadoCompletas / completas.length : 0)}</strong><em>custo por convidado ${money(custoConv)}</em></div>
  </section>
  <section class="reports-grid">
    <div class="panel"><div class="panel-header"><div><h2>Receita por mês</h2><p>Festas fechadas pela data em que acontecem.</p></div></div><div class="report-bars">${porMes.map(x => `<div class="report-bar-row"><span>${MESES[x.m]}</span><div>${barra(x.receita, maxMes)}</div><strong>${x.n}</strong><small>${money(x.receita)}</small></div>`).join('')}</div></div>
    <div class="panel"><div class="panel-header"><div><h2>Orçamentos que não fecharam</h2><p>${perdidas.length} no ano. Os motivos ajudam a ajustar preço e pacotes.</p></div></div>${perdidas.length ? `<div class="ranking-list">${Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n], i) => `<div><span>${i + 1}</span><strong>${esc(m)}</strong><b>${n}</b></div>`).join('')}</div>` : '<p class="muted-copy">Nenhum orçamento perdido neste ano.</p>'}
      <h3 class="rel-sub">Dias mais pedidos</h3><div class="report-bars">${dias.map((n, i) => ({ n, i })).filter(x => x.n).sort((a, b) => b.n - a.n).map(x => `<div class="report-bar-row"><span>${DIAS[x.i].slice(0, 3)}</span><div>${barra(x.n, maxDia)}</div><strong>${x.n}</strong><small></small></div>`).join('') || '<p class="muted-copy">Sem dados.</p>'}</div></div>
  </section>
  <section class="reports-grid">${tabelaGrupo(pacotes, 'Por pacote', 'Quanto cada pacote vende e rende.')}${tabelaGrupo(tipos, 'Por tipo de festa', 'Infantil, adulto, formatura, corporativo…')}</section>
  <section class="panel"><div class="panel-header"><div><h2>Onde vai o custo do consumo</h2><p>Produtos e receitas que mais pesaram nas festas do ano (lançados no Estoque).</p></div></div>${topCons.length ? `<div class="report-bars">${topCons.map(x => `<div class="report-bar-row rel-cons"><span>${esc(x.nome)}</span><div>${barra(x.custo, maxCons)}</div><strong>${money(x.custo)}</strong><small>${x.festas.size} festa(s)</small></div>`).join('')}</div>` : '<p class="muted-copy">Ainda não há consumo lançado pelo Estoque neste ano.</p>'}</section>
  <section class="panel"><div class="panel-header"><div><h2>Rentabilidade por festa</h2><p>Receita menos consumo, equipe e despesas da festa.</p></div></div><div class="table-wrap"><table class="event-table"><thead><tr><th>Festa</th><th>Data</th><th>Convidados</th><th>Receita</th><th>Custos</th><th>Resultado</th><th>Margem</th></tr></thead><tbody>${fechadas.length ? [...fechadas].sort((a, b) => String(b.q.data || '').localeCompare(String(a.q.data || ''))).map(f => `<tr><td><strong>${esc(f.q.nome || f.q.cliente || 'Festa')}</strong>${f.pendencias.length ? ' <span class="badge badge-alerta">provisório</span>' : ''}<br><small>${esc(f.q.pacote || '')}</small></td><td>${dataBR(f.q.data)}</td><td>${convidadosDe(f) || '—'}</td><td>${money(f.receita)}</td><td>${money(f.custos)}</td><td><strong class="${f.resultado < 0 ? 'es-out' : ''}">${money(f.resultado)}</strong></td><td>${f.receita ? pct(f.resultado / f.receita * 100) : '—'}</td></tr>`).join('') : '<tr><td colspan="7">Sem festas neste ano.</td></tr>'}</tbody></table></div>
  <p class="es-dica">* Médias e margens só com festas completas (consumo, equipe e encerramento lançados), para não inflar o resultado.</p></section>
  </div>`;
}
export function renderRelatorios() { return render(); }
export function mount() {
  const root = document.querySelector('#app'); if (!root) return;
  root.querySelector('#reportYear')?.addEventListener('change', e => { state.year = Number(e.target.value); root.innerHTML = render(); mount(); });
}
