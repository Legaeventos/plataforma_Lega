// Resultado mensal da empresa (etapa 4, v2.0.0)
// ---------------------------------------------
// Junta num mês só:
//   • o resultado de cada festa do mês (receita − consumo − equipe − despesas da festa)
//   • as despesas da casa e do escritório (lançamentos gerais por categoria)
//   • o pró-labore
//   • perdas de estoque e material de escritório comprado no mês
// e mostra também o caixa (o que entrou e saiu de dinheiro no mês).

import { readJSON, writeJSON } from '../../js/storage.js';
import { viradaLocal, carregar } from '../../core/engine/estoque-db.js';

export const CONFIG_KEY = 'lega.empresa.config';
const EVENTS_KEY = 'lega.eventos';
const GENERAL_KEY = 'lega.financeiro.lancamentos';
export const SALARIO_MINIMO = 1621; // 2026 (Decreto 12.797/2025)
export const CATEGORIAS_CASA = ['Aluguel', 'Energia', 'Água', 'Internet e telefone', 'Manutenção', 'Limpeza', 'Material de escritório', 'Marketing e anúncios', 'Impostos e taxas', 'Contador', 'Sistemas e assinaturas', 'Gás', 'Pró-labore', 'Outros'];
export const CATEGORIAS_RECEITA = ['Outras receitas', 'Aluguel do espaço', 'Rendimentos'];

const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const uid = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = m => { const [y, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} de ${y}`; };
const nomeMesTitulo = m => { const t = nomeMes(m); return t.charAt(0).toUpperCase() + t.slice(1); };
const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';
const selectedQuote = e => e?.orcamentos?.find(q => q.id === e.orcamentoEscolhidoId) || e?.orcamentos?.at(-1) || null;
const mesDe = v => String(v || '').slice(0, 7);

// ---------------------------------------------------------------- configuração
export function config() {
  const c = readJSON(CONFIG_KEY, null) || {};
  const fixas = Array.isArray(c.despesasFixas) ? c.despesasFixas : [{ id: 'fixa_prolabore', descricao: 'Pró-labore', categoria: 'Pró-labore', valor: SALARIO_MINIMO, dia: 5, ativo: true }];
  return { ...c, despesasFixas: fixas };
}
export const salvarConfig = c => writeJSON(CONFIG_KEY, c);
const gerais = () => readJSON(GENERAL_KEY, []) || [];
const eventos = () => readJSON(EVENTS_KEY, []) || [];

// ---------------------------------------------------------------- estoque (assíncrono)
let est = null; let estCarregando = false; let estErro = null;
export function estoqueDoMes(onPronto) {
  if (!viradaLocal()) return null;
  if (est || estCarregando || estErro) return est;
  estCarregando = true;
  carregar().then(d => { est = d; }).catch(e => { estErro = e; }).finally(() => { estCarregando = false; onPronto?.(); });
  return null;
}
export const estadoEstoque = () => ({ ativo: !!viradaLocal(), carregando: estCarregando, erro: estErro });
export function recarregarEstoque() { est = null; estErro = null; }

// ---------------------------------------------------------------- cálculo de uma festa
export function resultadoFesta(e) {
  const q = selectedQuote(e) || {}; const consumos = e.consumos || []; const equipe = e.equipe || []; const lanc = e.lancamentosFinanceiros || [];
  const ce = e.consumoEstoque || null;
  const contratado = Number(e.valorContratado ?? q.valor ?? 0);
  const extras = consumos.reduce((a, x) => a + Number(x.quantidade || 0) * Number(x.valorVenda || 0), 0) + Number(ce?.venda || 0) + Number(ce?.rolha || 0);
  const consumo = consumos.reduce((a, x) => a + Number(x.quantidade || 0) * Number(x.custo || 0), 0) + Number(ce?.custo || 0);
  const custoEquipe = equipe.reduce((a, x) => a + Number(x.valor || 0), 0);
  const despesas = lanc.filter(x => x.tipo === 'saida').reduce((a, x) => a + Number(x.valor || 0), 0);
  const receita = contratado + extras; const custos = consumo + custoEquipe + despesas;
  const pendencias = [];
  if (viradaLocal() && !ce && !consumos.length) pendencias.push('consumo');
  if (!equipe.length) pendencias.push('equipe');
  if (e.status !== 'realizado') pendencias.push('encerramento');
  return { e, q, receita, contratado, extras, consumo, custoEquipe, despesas, custos, resultado: receita - custos, pendencias };
}

// ---------------------------------------------------------------- cálculo do mês
export function calcularMes(mes, d = est) {
  const evs = eventos();
  const festas = evs.filter(e => !['orcamento', 'perdido'].includes(e.status) && mesDe(selectedQuote(e)?.data) === mes).map(resultadoFesta)
    .sort((a, b) => String(a.q.data).localeCompare(String(b.q.data)));
  const fest = {
    receita: festas.reduce((s, f) => s + f.receita, 0), consumo: festas.reduce((s, f) => s + f.consumo, 0),
    equipe: festas.reduce((s, f) => s + f.custoEquipe, 0), despesas: festas.reduce((s, f) => s + f.despesas, 0)
  };
  fest.custos = fest.consumo + fest.equipe + fest.despesas; fest.resultado = fest.receita - fest.custos;

  const gMes = gerais().filter(x => mesDe(x.data || x.createdAt) === mes);
  const saidasCasa = gMes.filter(x => x.tipo === 'saida');
  const porCategoria = {};
  saidasCasa.filter(x => x.categoria !== 'Pró-labore').forEach(x => { const c = x.categoria || 'Sem categoria'; porCategoria[c] = (porCategoria[c] || 0) + Number(x.valor || 0); });
  const casa = Object.values(porCategoria).reduce((s, v) => s + v, 0);
  const proLabore = saidasCasa.filter(x => x.categoria === 'Pró-labore').reduce((s, x) => s + Number(x.valor || 0), 0);
  const outrasReceitas = gMes.filter(x => x.tipo === 'entrada').reduce((s, x) => s + Number(x.valor || 0), 0);

  // estoque: perdas/ajustes, material de escritório (vira despesa na compra), investimentos (reutilizáveis)
  let perdas = 0, escritorio = 0, investimentos = 0, comprasEstoque = 0, temEstoque = false;
  if (d) {
    temEstoque = true;
    const prod = new Map(d.produtos.map(p => [String(p.id), p]));
    d.movimentacoes.filter(m => mesDe(m.data_movimento) === mes).forEach(m => {
      const custo = Number(m.custo_total || 0);
      if (m.tipo === 'saida_manual') perdas += custo;
      else if (m.tipo === 'entrada' && m.referencia_tabela === 'balancos_estoque') perdas -= custo;
    });
    const comprasMes = new Set(d.compras.filter(c => mesDe(c.data) === mes).map(c => String(c.id)));
    comprasEstoque = d.compras.filter(c => comprasMes.has(String(c.id))).reduce((s, c) => s + Number(c.valor_total || 0), 0);
    d.comprasItens.filter(i => comprasMes.has(String(i.compra_id))).forEach(i => {
      const p = prod.get(String(i.produto_id)); const v = Number(i.valor_total || 0);
      if (p?.setor === 'escritorio') escritorio += v;
      else if (p?.tipo_item === 'reutilizavel') investimentos += v;
    });
  }
  const despesasEmpresa = casa + escritorio + Math.max(0, perdas);
  const resultado = fest.resultado + outrasReceitas - despesasEmpresa - proLabore + Math.max(0, -perdas);

  // caixa: o que entrou e saiu de dinheiro no mês
  const recebidoClientes = evs.flatMap(e => (e.lancamentosFinanceiros || []).filter(x => x.tipo === 'entrada' && mesDe(x.data || x.createdAt) === mes)).reduce((s, x) => s + Number(x.valor || 0), 0);
  const despesasFestasPagas = evs.flatMap(e => (e.lancamentosFinanceiros || []).filter(x => x.tipo === 'saida' && mesDe(x.data || x.createdAt) === mes)).reduce((s, x) => s + Number(x.valor || 0), 0);
  const caixa = {
    entradas: recebidoClientes + outrasReceitas, recebidoClientes, outrasReceitas,
    compras: comprasEstoque, equipe: fest.equipe, despesasFestas: despesasFestasPagas, casa: saidasCasa.reduce((s, x) => s + Number(x.valor || 0), 0)
  };
  caixa.saidas = caixa.compras + caixa.equipe + caixa.despesasFestas + caixa.casa; caixa.saldo = caixa.entradas - caixa.saidas;

  // despesas fixas do mês: lançadas ou pendentes
  const fixas = config().despesasFixas.filter(f => f.ativo !== false).map(f => {
    const lanc = gMes.find(x => x.fixaId === f.id) || null;
    return { ...f, lancamento: lanc, pendente: !lanc };
  });
  return { mes, festas, fest, porCategoria, casa, proLabore, outrasReceitas, perdas, escritorio, investimentos, despesasEmpresa, resultado, caixa, fixas, temEstoque, margem: (fest.receita + outrasReceitas) > 0 ? resultado / (fest.receita + outrasReceitas) * 100 : 0 };
}

// ---------------------------------------------------------------- tela
export function renderResultado(state) {
  const d = estoqueDoMes(() => state._redesenhar?.());
  const est0 = estadoEstoque();
  const r = calcularMes(state.mesResultado, d);
  const provisorio = r.festas.filter(f => f.pendencias.length);
  const fixasPend = r.fixas.filter(f => f.pendente);
  const hojeMes = new Date().toISOString().slice(0, 7);
  const tarefas = [];
  fixasPend.forEach(f => tarefas.push(`<li><span>🧾 <b>${esc(f.descricao)}</b> (${money(f.valor)}${f.dia ? `, todo dia ${f.dia}` : ''}) ainda não foi lançada em ${nomeMes(r.mes)}.</span><button class="btn btn-primary btn-sm" type="button" data-rm="lancar-fixa" data-id="${esc(f.id)}">Lançar ${money(f.valor)}</button></li>`));
  provisorio.forEach(f => tarefas.push(`<li><span>🎉 <b>${esc(f.q.nome || f.q.cliente || 'Festa')}</b> (${dataBR(f.q.data)}): falta ${f.pendencias.map(p => ({ consumo: 'lançar o consumo', equipe: 'lançar a equipe', encerramento: 'encerrar o evento' }[p])).join(', ')}.</span><button class="btn btn-ghost btn-sm" type="button" data-rm="abrir-festa" data-id="${esc(f.e.id)}">Abrir a festa</button></li>`));
  const linha = (rot, v, cls = '', sub = '') => `<div class="rm-linha ${cls}"><span>${rot}${sub ? `<small>${sub}</small>` : ''}</span><b>${v < 0 ? '−' + money(-v) : money(v)}</b></div>`;
  const cats = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]);
  const ano = Number(state.mesResultado.slice(0, 4));
  const anual = Array.from({ length: 12 }, (_, i) => { const m = `${ano}-${String(i + 1).padStart(2, '0')}`; return calcularMes(m, d); });
  const maxAbs = Math.max(1, ...anual.map(x => Math.abs(x.resultado)));
  const tot = k => anual.reduce((s, x) => s + (typeof k === 'function' ? k(x) : x[k]), 0);
  return `<section class="panel rm-topo"><div><span class="eyebrow">RESULTADO DO MÊS</span><h2>${nomeMesTitulo(r.mes)}</h2>
      <p>Festas pela data em que acontecem; despesas da casa, pró-labore e estoque pelo mês em que foram lançados.</p></div>
      <div class="rm-mes"><button class="btn btn-ghost" type="button" data-rm="mes" data-delta="-1">‹</button><input type="month" id="rmMes" value="${state.mesResultado}"><button class="btn btn-ghost" type="button" data-rm="mes" data-delta="1">›</button>${state.mesResultado !== hojeMes ? '<button class="btn btn-ghost" type="button" data-rm="hoje">Mês atual</button>' : ''}</div></section>
    <section class="finance-kpis rm-kpis">
      <div class="panel"><small>Resultado das festas</small><strong>${money(r.fest.resultado)}</strong><em>${r.festas.length} festa(s) · receita ${money(r.fest.receita)}</em></div>
      <div class="panel"><small>Despesas da casa e escritório</small><strong>${money(r.despesasEmpresa)}</strong><em>${cats.length} categoria(s)${r.escritorio ? ' + material' : ''}</em></div>
      <div class="panel"><small>Pró-labore</small><strong>${money(r.proLabore)}</strong><em>${r.fixas.some(f => f.categoria === 'Pró-labore' && f.pendente) ? 'ainda não lançado' : 'lançado'}</em></div>
      <div class="panel rm-final ${r.resultado < 0 ? 'neg' : ''}"><small>Resultado da empresa</small><strong>${money(r.resultado)}</strong><em>margem ${pct(r.margem)}${provisorio.length ? ' · provisório' : ''}</em></div>
    </section>
    ${tarefas.length ? `<section class="panel"><div class="panel-header"><div><h2>Para fechar o mês</h2><p>${provisorio.length ? 'O resultado ainda é provisório: ' : ''}complete o que falta e o número fica real.</p></div></div><ul class="es-tarefas">${tarefas.join('')}</ul></section>` : `<section class="panel"><p class="es-ok">✓ Mês completo: festas encerradas e despesas fixas lançadas.</p></section>`}
    <div class="rm-colunas">
      <section class="panel rm-dre"><div class="panel-header"><div><h2>Demonstrativo</h2></div></div>
        ${linha('Receita das festas', r.fest.receita, 'pos', 'contratos + extras cobrados')}
        ${linha('Consumo do estoque nas festas', -r.fest.consumo)}
        ${linha('Equipe (freelancers)', -r.fest.equipe)}
        ${linha('Despesas diretas das festas', -r.fest.despesas)}
        ${linha('= Resultado das festas', r.fest.resultado, 'sub')}
        ${r.outrasReceitas ? linha('Outras receitas', r.outrasReceitas, 'pos') : ''}
        ${cats.map(([c, v]) => linha(esc(c), -v)).join('')}
        ${r.escritorio ? linha('Material de escritório (compras)', -r.escritorio) : ''}
        ${r.perdas ? linha(r.perdas > 0 ? 'Perdas e ajustes de estoque' : 'Sobras achadas na conferência', -r.perdas) : ''}
        ${linha('Pró-labore', -r.proLabore)}
        ${linha('= Resultado da empresa', r.resultado, 'total')}
        ${r.investimentos ? `<p class="es-dica">Fora do resultado: ${money(r.investimentos)} em itens reutilizáveis comprados (decoração que dura várias festas).</p>` : ''}
        ${est0.ativo && !r.temEstoque ? `<p class="es-dica">${est0.erro ? 'Não foi possível ler o estoque (perdas e material de escritório ficaram de fora).' : 'Carregando perdas de estoque e material de escritório…'}</p>` : ''}
      </section>
      <section class="panel rm-dre"><div class="panel-header"><div><h2>Caixa do mês</h2><p>Dinheiro que de fato entrou e saiu.</p></div></div>
        ${linha('Pagamentos de clientes', r.caixa.recebidoClientes, 'pos')}
        ${r.caixa.outrasReceitas ? linha('Outras entradas', r.caixa.outrasReceitas, 'pos') : ''}
        ${linha('Compras (estoque, todos os setores)', -r.caixa.compras)}
        ${linha('Equipe das festas do mês', -r.caixa.equipe)}
        ${linha('Despesas das festas', -r.caixa.despesasFestas)}
        ${linha('Casa, escritório e pró-labore', -r.caixa.casa)}
        ${linha('= Saldo do caixa no mês', r.caixa.saldo, 'total')}
        <p class="es-dica">O caixa é diferente do resultado: compras de estoque saem do caixa no dia da compra, mas só viram custo quando são consumidas numa festa.</p>
      </section>
    </div>
    <section class="panel"><div class="panel-header"><div><h2>Festas de ${nomeMes(r.mes)}</h2></div></div>
      ${r.festas.length ? `<div class="table-wrap"><table class="event-table"><thead><tr><th>Data</th><th>Festa</th><th>Receita</th><th>Consumo</th><th>Equipe</th><th>Despesas</th><th>Resultado</th><th></th></tr></thead><tbody>${r.festas.map(f => `<tr><td>${dataBR(f.q.data)}</td><td><b>${esc(f.q.nome || f.q.cliente || 'Festa')}</b>${f.pendencias.length ? ' <span class="badge badge-alerta">provisório</span>' : ''}</td><td>${money(f.receita)}</td><td>${money(f.consumo)}</td><td>${money(f.custoEquipe)}</td><td>${money(f.despesas)}</td><td><b class="${f.resultado < 0 ? 'es-out' : ''}">${money(f.resultado)}</b></td><td><button class="btn btn-ghost btn-sm" type="button" data-rm="abrir-festa" data-id="${esc(f.e.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhuma festa neste mês.</p>'}</section>
    <section class="panel"><div class="panel-header"><div><h2>${ano} mês a mês</h2></div></div>
      <div class="table-wrap"><table class="event-table rm-ano"><thead><tr><th>Mês</th><th>Festas</th><th>Resultado das festas</th><th>Casa e escritório</th><th>Pró-labore</th><th>Resultado</th><th></th></tr></thead><tbody>
      ${anual.map(x => `<tr class="${x.mes === state.mesResultado ? 'rm-atual' : ''}" data-rm="ir-mes" data-mes="${x.mes}"><td>${MESES[Number(x.mes.slice(5)) - 1]}</td><td>${x.festas.length}</td><td>${money(x.fest.resultado)}</td><td>${money(x.despesasEmpresa)}</td><td>${money(x.proLabore)}</td><td><b class="${x.resultado < 0 ? 'es-out' : ''}">${money(x.resultado)}</b></td><td class="rm-barra"><span class="${x.resultado < 0 ? 'neg' : ''}" style="width:${Math.round(Math.abs(x.resultado) / maxAbs * 100)}%"></span></td></tr>`).join('')}
      <tr class="rm-totalano"><td>Total</td><td>${tot(x => x.festas.length)}</td><td>${money(tot(x => x.fest.resultado))}</td><td>${money(tot('despesasEmpresa'))}</td><td>${money(tot('proLabore'))}</td><td><b>${money(tot('resultado'))}</b></td><td></td></tr></tbody></table></div></section>`;
}

export function renderFixas() {
  const c = config();
  return `<section class="panel"><div class="panel-header"><div><h2>Despesas fixas da casa</h2><p>Contas que se repetem todo mês (pró-labore, aluguel, energia, internet, contador…). No Resultado do mês, cada uma aparece para lançar com um clique; o valor pode ser ajustado na hora.</p></div><button class="btn btn-primary" type="button" data-rm="nova-fixa">＋ Nova despesa fixa</button></div>
    <div class="table-wrap"><table class="event-table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Valor de referência</th><th>Dia</th><th>Situação</th><th></th></tr></thead><tbody>
    ${c.despesasFixas.map(f => `<tr class="${f.ativo === false ? 'es-inativo' : ''}"><td><b>${esc(f.descricao)}</b></td><td>${esc(f.categoria)}</td><td>${money(f.valor)}</td><td>${f.dia || '—'}</td><td>${f.ativo === false ? 'Pausada' : 'Ativa'}</td><td><button class="btn btn-ghost btn-sm" type="button" data-rm="editar-fixa" data-id="${esc(f.id)}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="es-dica">Pró-labore de referência: um salário mínimo (${money(SALARIO_MINIMO)} em 2026). Quando o mínimo mudar, é só editar o valor.</p></section>`;
}

function modalFixa(id, aoSalvar) {
  const c = config(); const f = c.despesasFixas.find(x => x.id === id) || { descricao: '', categoria: 'Aluguel', valor: '', dia: '', ativo: true };
  const box = document.createElement('div'); box.className = 'lega-modal';
  box.innerHTML = `<div class="lega-modal__card" role="dialog" aria-modal="true"><span class="eyebrow">${id ? 'EDITAR' : 'NOVA'} DESPESA FIXA</span><h2>${id ? esc(f.descricao) : 'Despesa que se repete todo mês'}</h2>
    <form class="form-grid" id="rmFixaForm"><div class="field"><label>Descrição</label><input name="descricao" required value="${esc(f.descricao)}" placeholder="Ex.: Energia elétrica"></div>
    <div class="field"><label>Categoria</label><select name="categoria">${CATEGORIAS_CASA.map(x => `<option ${x === f.categoria ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Valor de referência (R$)</label><input name="valor" type="number" min="0" step="0.01" required value="${esc(f.valor)}"></div>
    <div class="field"><label>Dia do vencimento (opcional)</label><input name="dia" type="number" min="1" max="31" value="${esc(f.dia || '')}"></div>
    <div class="field"><label>Situação</label><select name="ativo"><option value="1" ${f.ativo !== false ? 'selected' : ''}>Ativa</option><option value="0" ${f.ativo === false ? 'selected' : ''}>Pausada</option></select></div>
    <div class="field field-full form-actions">${id ? '<button type="button" class="btn btn-ghost" data-m="excluir">Excluir</button>' : ''}<button type="button" class="btn btn-ghost" data-m="fechar">Cancelar</button><button class="btn btn-primary">Salvar</button></div></form></div>`;
  document.body.appendChild(box);
  const fechar = () => box.remove();
  box.querySelector('[data-m="fechar"]').onclick = fechar;
  box.onclick = ev => { if (ev.target === box) fechar(); };
  box.querySelector('[data-m="excluir"]')?.addEventListener('click', () => { if (!confirm('Excluir esta despesa fixa? Os lançamentos já feitos continuam.')) return; salvarConfig({ ...c, despesasFixas: c.despesasFixas.filter(x => x.id !== id) }); fechar(); aoSalvar(); });
  box.querySelector('#rmFixaForm').onsubmit = ev => {
    ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.currentTarget).entries());
    const item = { id: id || uid('fixa'), descricao: v.descricao.trim(), categoria: v.categoria, valor: Number(v.valor || 0), dia: Number(v.dia || 0) || null, ativo: v.ativo === '1' };
    salvarConfig({ ...c, despesasFixas: id ? c.despesasFixas.map(x => x.id === id ? item : x) : [...c.despesasFixas, item] });
    fechar(); aoSalvar();
  };
}

export function lancarFixa(id, mes, aoSalvar) {
  const f = config().despesasFixas.find(x => x.id === id); if (!f) return;
  const [y, m] = mes.split('-').map(Number); const ult = new Date(y, m, 0).getDate();
  const dia = `${mes}-${String(Math.min(f.dia || 1, ult)).padStart(2, '0')}`;
  const box = document.createElement('div'); box.className = 'lega-modal';
  box.innerHTML = `<div class="lega-modal__card" role="dialog" aria-modal="true" style="max-width:460px"><span class="eyebrow">CONTA FIXA · ${esc(nomeMes(mes).toUpperCase())}</span><h2>${esc(f.descricao)}</h2>
    <form class="form-grid" id="rmLancarFixa"><div class="field"><label>Valor deste mês (R$)</label><input name="valor" inputmode="decimal" required value="${String(f.valor).replace('.', ',')}"></div>
    <div class="field"><label>Data</label><input name="data" type="date" required value="${dia}"></div>
    <div class="field field-full form-actions"><button type="button" class="btn btn-ghost" data-m="fechar">Cancelar</button><button class="btn btn-primary">Lançar</button></div></form></div>`;
  document.body.appendChild(box);
  const fm = box.querySelector('#rmLancarFixa'); setTimeout(() => { fm.valor.focus(); fm.valor.select(); }, 30);
  box.onclick = ev => { if (ev.target === box || ev.target.closest('[data-m="fechar"]')) box.remove(); };
  fm.onsubmit = ev => {
    ev.preventDefault();
    const n = Number(String(fm.valor.value).replace(/\./g, '').replace(',', '.'));
    if (!(n > 0)) return alert('Informe o valor.');
    writeJSON(GENERAL_KEY, [...gerais(), { id: uid('fin'), tipo: 'saida', descricao: f.descricao, categoria: f.categoria, valor: n, data: fm.data.value, forma: '', fixaId: f.id, createdAt: new Date().toISOString() }]);
    box.remove(); aoSalvar();
  };
}

export function bindResultado(root, state, redesenhar, navigate) {
  state._redesenhar = redesenhar;
  const mudarMes = m => { state.mesResultado = m; redesenhar(); };
  root.querySelector('#rmMes')?.addEventListener('change', e => e.target.value && mudarMes(e.target.value));
  root.querySelectorAll('[data-rm="mes"]').forEach(b => b.onclick = () => { const [y, m] = state.mesResultado.split('-').map(Number); const d = new Date(y, m - 1 + Number(b.dataset.delta), 1); mudarMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); });
  root.querySelector('[data-rm="hoje"]')?.addEventListener('click', () => mudarMes(new Date().toISOString().slice(0, 7)));
  root.querySelectorAll('[data-rm="ir-mes"]').forEach(tr => tr.onclick = () => { mudarMes(tr.dataset.mes); window.scrollTo(0, 0); });
  root.querySelectorAll('[data-rm="lancar-fixa"]').forEach(b => b.onclick = () => lancarFixa(b.dataset.id, state.mesResultado, redesenhar));
  root.querySelectorAll('[data-rm="abrir-festa"]').forEach(b => b.onclick = () => { writeJSON('lega.navigation.request', { eventId: b.dataset.id, tab: 'encerramento' }); navigate ? navigate('eventos') : (location.hash = 'eventos'); });
  root.querySelector('[data-rm="nova-fixa"]')?.addEventListener('click', () => modalFixa(null, redesenhar));
  root.querySelectorAll('[data-rm="editar-fixa"]').forEach(b => b.onclick = () => modalFixa(b.dataset.id, redesenhar));
}
