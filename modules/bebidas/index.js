// Módulo Bebidas — o Controle de Bebidas dentro da Plataforma Lega (v1.2.0)
// -----------------------------------------------------------------------
// Fase 1 da migração: painel (consumo médio, resultado, desperdício,
// validade), estoque atual por lote, histórico de eventos e sugestões de
// compra. Lê o MESMO banco do sistema antigo, então os dois ficam em
// paralelo com os mesmos números. Lançamentos (compras, consumo de evento,
// balanço) continuam no sistema antigo nesta fase.

import * as banco from './banco.js';
import { readJSON } from '../../js/storage.js';
import {
  definirDados, definirMostrarValores, mostrandoValores,
  formatarMoeda, formatarNumero, formatarData, hojeInputDate, escapeHtml, obterProdutoPorId,
  obterQuantidadeEventoItem, obterCustoMedioProduto, produtoEhAlcoolico, infoConsumoProduto, formatarVolume, formatarQtdUnidade,
  dataSomenteDia, calcularAlocacaoLotes, calcularCustosItensEvento, descreverLoteBanco,
  tipoDoEvento, eventoSemAlcool, descricaoAlcoolEvento, calcularStatusEstoque, formatarValorDashboard,
  calcularModelosPorTipo, estimarConsumoEvento, mapaEstoqueDisponivel, montarListaCompra, htmlTabelaListaCompra,
  listarLotesVencendo, calcularIntervaloPeriodo, obterPrecoEventoItem, agendaAtiva, diasAte, TIPOS_EVENTO
} from './calculos.js';

const UI_KEY = 'lega.bebidas.ui';
let ui = (() => { try { return { aba: 'painel', periodo: { tipo: 'tudo', inicio: '', fim: '' }, horizonte: '30', filtroEstoque: '', somenteBaixo: false, filtroEventos: '', ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch { return { aba: 'painel', periodo: { tipo: 'tudo', inicio: '', fim: '' }, horizonte: '30', filtroEstoque: '', somenteBaixo: false, filtroEventos: '' }; } })();
const salvarUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { } };

let dados = null;          // tudo o que foi lido do banco
let carregando = null;     // promise da leitura em andamento
let erro = null;
let ultimaSugestao = null; // para o PDF
let simulacao = null;      // {adultos, criancas, tipo, adesao, semAlcool, linhas}
let eventoAberto = null;

// ------------------------------------------------------------------ leitura
async function carregar() {
  const lerOuVazio = c => banco.buscar(c).catch(e => { if (e.code === 'AUTH') throw e; return []; });
  const [produtos, estoque, compras, comprasItens, eventos, eventosItens, movimentacoes, lotesBanco, consumosBanco, agenda] = await Promise.all([
    banco.buscar('produtos?select=*&order=nome.asc'),
    banco.buscar('estoque?select=*&order=produto_id.asc'),
    banco.buscar('compras?select=*&order=data.desc'),
    lerOuVazio('compras_itens?select=*&order=id.asc'),
    banco.buscar('eventos?select=*&order=data.desc'),
    lerOuVazio('eventos_itens?select=*&order=id.asc'),
    lerOuVazio('movimentacoes_estoque?select=*&order=data_movimento.desc'),
    lerOuVazio('estoque_lotes?select=*&order=data_compra.asc,created_at.asc'),
    lerOuVazio('consumos_lotes?select=*'),
    banco.buscar('eventos_agenda?select=*&order=data.asc').catch(e => { if (e.code === 'AUTH') throw e; return null; })
  ]);
  // mesma estrutura do carregarDadosLotes() original
  const lotes = { compras, comprasItens, eventos, eventosItens, movimentacoes, estoque, lotesBanco, consumosBanco };
  definirDados({ produtos, estoque, lotes });
  const modelosHistorico = calcularModelosPorTipo(produtos, eventos, eventosItens); // agenda: todo o histórico
  dados = { produtos, estoque, compras, comprasItens, eventos, eventosItens, movimentacoes, lotesBanco, consumosBanco, agenda, lotes, modelosHistorico, lidoEm: new Date() };
  return dados;
}
function garantirDados(root) {
  // sem login ou depois de um erro, só tenta de novo quando a pessoa pedir
  if (dados || carregando || erro || !banco.temSessao()) return;
  erro = null;
  carregando = carregar().catch(e => { erro = e; }).finally(() => { carregando = null; if (root?.isConnected) desenhar(root); });
}

// ------------------------------------------------------------------ período
function dataNoPeriodo(data) {
  const d = dataSomenteDia(data);
  if (ui.periodo.inicio && d < ui.periodo.inicio) return false;
  if (ui.periodo.fim && d > ui.periodo.fim) return false;
  return true;
}
function descricaoPeriodo() {
  if (!ui.periodo.inicio && !ui.periodo.fim) return 'Todo o período';
  return `${ui.periodo.inicio ? formatarData(ui.periodo.inicio) : 'início'} a ${ui.periodo.fim ? formatarData(ui.periodo.fim) : 'hoje'}`;
}
function recortePeriodo() {
  const eventos = dados.eventos.filter(e => dataNoPeriodo(e.data));
  const ids = new Set(eventos.map(e => String(e.id)));
  return {
    compras: dados.compras.filter(c => dataNoPeriodo(c.data)),
    eventos,
    eventosItens: dados.eventosItens.filter(i => ids.has(String(i.evento_id)))
  };
}

// ---------------------------------------------- desperdício (igual ao painel antigo)
function calcularDesperdicio(listaEventos, listaEventosItens) {
  const desperdicio = {};
  const eventosComRegistro = new Set();
  const consumoPorEventoProduto = {};
  listaEventosItens.forEach(i => {
    const k = `${i.evento_id}|${i.produto_id}`;
    consumoPorEventoProduto[k] = (consumoPorEventoProduto[k] || 0) + Number(obterQuantidadeEventoItem(i) || 0);
  });
  listaEventos.filter(e => tipoDoEvento(e) === 'fechada' && e.controle_bar).forEach(ev => {
    const registrouAlgum = Object.values(ev.controle_bar).some(c => c && 'aberto' in c);
    if (!registrouAlgum) return;
    eventosComRegistro.add(String(ev.id));
    Object.keys(ev.controle_bar).forEach(pid => {
      const aberto = Number(ev.controle_bar[pid]?.aberto || 0);
      const consumido = consumoPorEventoProduto[`${ev.id}|${pid}`] || 0;
      if (!consumido && !aberto) return;
      const d = desperdicio[pid] = desperdicio[pid] || { consumido: 0, aberto: 0, eventos: 0 };
      d.consumido += consumido; d.aberto += aberto; d.eventos += 1;
    });
  });
  listaEventosItens.forEach(i => {
    if (!eventosComRegistro.has(String(i.evento_id))) return;
    const ev = listaEventos.find(e => String(e.id) === String(i.evento_id));
    if (ev?.controle_bar?.[String(i.produto_id)]) return;
    const d = desperdicio[String(i.produto_id)] = desperdicio[String(i.produto_id)] || { consumido: 0, aberto: 0, eventos: 0 };
    d.consumido += Number(obterQuantidadeEventoItem(i) || 0); d.eventos += 1;
  });
  const linhas = Object.keys(desperdicio).map(pid => {
    const d = desperdicio[pid];
    const produto = obterProdutoPorId(pid);
    const info = infoConsumoProduto(produto);
    const pct = d.consumido > 0 ? d.aberto / d.consumido * 100 : 0;
    return { produto: produto?.nome || 'Produto', ...d, litros: info.volume > 0 ? d.aberto * info.volume : null, pct, custo: d.aberto * obterCustoMedioProduto(pid) };
  }).filter(l => l.aberto > 0).sort((a, b) => b.pct - a.pct);
  return { linhas, eventosComRegistro };
}

// ------------------------------------------- compra consolidada (igual à agenda antiga)
function compraConsolidada(horizonte) {
  const hoje = hojeInputDate();
  let limite = null;
  if (horizonte !== 'todos') { const d = new Date(); d.setDate(d.getDate() + Number(horizonte)); limite = dataSomenteDia(d.toISOString()); }
  const eventos = (dados.agenda || []).filter(a => agendaAtiva(a) && a.data >= hoje && (!limite || a.data <= limite));
  if (!eventos.length) return { eventos, blocos: [], linhas: [] };
  const disponivel = mapaEstoqueDisponivel(dados.estoque);
  const blocos = [];
  ['fechada', 'avulsa'].forEach(tipo => {
    const doTipo = eventos.filter(ev => tipoDoEvento(ev) === tipo);
    if (!doTipo.length) return;
    const modelo = dados.modelosHistorico[tipo] || {};
    const soma = {};
    doTipo.forEach(ev => {
      const est = estimarConsumoEvento(modelo, Number(ev.adultos || 0), Number(ev.criancas || 0), tipo === 'fechada' && !!ev.alcoolico_adesao, eventoSemAlcool(ev));
      Object.values(est).forEach(e => {
        if (!soma[e.chave]) soma[e.chave] = { ...e, estimativa: 0, base: `${doTipo.length} evento(s)` };
        soma[e.chave].estimativa += e.estimativa;
      });
    });
    blocos.push({ tipo, eventos: doTipo, semHistorico: !Object.keys(modelo).length, linhas: montarListaCompra(soma, modelo, dados.produtos, dados.estoque, disponivel) });
  });
  const linhas = blocos.flatMap(bl => bl.linhas.map(l => ({ ...l, produto: blocos.length > 1 ? `${l.produto} (${TIPOS_EVENTO[bl.tipo]})` : l.produto })));
  return { eventos, blocos, linhas };
}

// ------------------------------------------------------------------ telas
const ABAS_BASE = [['painel', 'Painel'], ['estoque', 'Estoque'], ['eventos', 'Eventos'], ['compras', 'Sugestão de compra']];
const temEstoqueInterno = () => (readJSON('lega.estoque.produtos', []) || []).length > 0;
const abas = () => temEstoqueInterno() ? [...ABAS_BASE, ['conferencia', 'Conferência com o estoque antigo']] : ABAS_BASE;
const kpi = (titulo, valor, extra = '') => `<div class="panel"><small>${titulo}</small><strong>${valor}</strong>${extra}</div>`;
const OPCOES_PERIODO = [['tudo', 'Todo o período'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['3meses', 'Últimos 3 meses'], ['6meses', 'Últimos 6 meses'], ['ano', 'Este ano'], ['personalizado', 'Personalizado']];

function barraPeriodo() {
  return `<div class="bb-toolbar">
    <label class="field"><span>Período</span><select id="bbPeriodo">${OPCOES_PERIODO.map(([v, t]) => `<option value="${v}" ${ui.periodo.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="bb-custom" ${ui.periodo.tipo === 'personalizado' ? '' : 'hidden'}><input type="date" id="bbIni" value="${ui.periodo.inicio}"> até <input type="date" id="bbFim" value="${ui.periodo.fim}"><button class="btn btn-ghost" type="button" data-bb="aplicar-periodo">Aplicar</button></div>
    <button class="btn btn-ghost" type="button" data-bb="valores">${mostrandoValores() ? '🙈 Ocultar valores' : '👁️ Mostrar valores'}</button>
  </div><p class="bb-sub">Período: <strong>${descricaoPeriodo()}</strong> (vale para compras, eventos, resultado e médias de consumo)</p>`;
}

function telaPainel() {
  const { compras, eventos, eventosItens } = recortePeriodo();
  const listaEstoque = dados.estoque;
  const totalItensEstoque = listaEstoque.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const totalComprado = compras.reduce((s, i) => s + Number(i.valor_total || 0), 0);
  const baixo = listaEstoque.filter(i => { const q = Number(i.quantidade || 0), m = Number(i.estoque_minimo || 0); return m > 0 && q <= m; }).length;
  const semEstoque = listaEstoque.filter(i => Number(i.quantidade || 0) <= 0).length;
  const alocacao = calcularAlocacaoLotes();
  const custos = calcularCustosItensEvento();
  const custoLotes = eventosItens.reduce((s, i) => s + (custos[String(i.id)]?.custoTotal || 0), 0);
  const vendido = eventosItens.reduce((s, i) => s + Number(obterQuantidadeEventoItem(i) || 0) * obterPrecoEventoItem(i), 0);
  const rolha = eventos.reduce((s, e) => s + (e.rolha_cobrada ? Number(e.valor_rolha || 0) : 0), 0);
  const lucro = vendido - custoLotes + rolha;
  const vencendo = listarLotesVencendo(alocacao, 30);
  const desp = calcularDesperdicio(eventos, eventosItens);

  const limite30 = new Date(); limite30.setDate(limite30.getDate() + 30);
  const limite30Iso = dataSomenteDia(limite30.toISOString());
  const ativos = (dados.agenda || []).filter(agendaAtiva);
  const proximos = ativos.filter(a => a.data >= hojeInputDate() && a.data <= limite30Iso).sort((a, b) => a.data.localeCompare(b.data));
  const pendentes = ativos.filter(a => a.data < hojeInputDate());

  // médias de consumo (respeitam o período)
  const modelos = calcularModelosPorTipo(dados.produtos, eventos, eventosItens);
  const modelo = modelos.fechada, modeloAvulsa = modelos.avulsa;
  const ordenar = m => Object.keys(m).sort((x, y) => m[x].nome.localeCompare(m[y].nome));
  const chaves = ordenar(modelo);
  const chavesTodos = chaves.filter(k => !modelo[k].alcoolico), chavesAdultos = chaves.filter(k => modelo[k].alcoolico), chavesAvulsa = ordenar(modeloAvulsa);
  const media = (t, b) => b > 0 ? t / b : 0;
  const tamanhos = r => { if (!r) return ''; const v = [...new Set(Object.keys(r.volumePorProduto).map(pid => infoConsumoProduto(obterProdutoPorId(pid)).volume).filter(x => x > 0))].sort((a, b) => a - b); return v.length ? v.map(formatarVolume).join(', ') : ''; };
  const GRUPOS = [['comAdesao', 'Com adesão'], ['semAdesao', 'Sem adesão'], ['semAlcool', 'Sem álcool']];
  const linha = (k, base, grupos) => { const r = modelo[k]; const t = tamanhos(r); return `<tr><td>${escapeHtml(r.nome)}${t ? `<div class="lote-rotulo">${escapeHtml(t)}</div>` : ''}</td>${grupos.map(([g]) => { const d = r[g]; return `<td>${formatarQtdUnidade(d.total, r.unidade)}</td><td>${formatarNumero(d.eventos, 0)}</td><td>${d.eventos ? `${formatarNumero(media(d.total, d[base]), 2)} ${r.unidade}` : '-'}</td>`; }).join('')}</tr>`; };
  const tabelaMedia = (titulo, sub, rotulo, ks, base, vazio, grupos = GRUPOS) => `<section class="panel"><div class="panel-header"><div><h3>${titulo}</h3><p>${sub}</p></div></div><div class="table-wrap"><table class="event-table bb-table"><thead><tr><th rowspan="2">Bebida</th>${grupos.map(([, t]) => `<th colspan="3" class="bb-center">${t}</th>`).join('')}</tr><tr>${grupos.map(() => `<th>Total</th><th>Eventos</th><th>${rotulo}</th>`).join('')}</tr></thead><tbody>${ks.length ? ks.map(k => linha(k, base, grupos)).join('') : `<tr><td colspan="${1 + grupos.length * 3}" class="empty-state">${vazio}</td></tr>`}</tbody></table></div></section>`;

  const cardValidade = vencendo.length ? `<section class="panel bb-alerta"><div class="panel-header"><div><h3>⚠️ Validade – lotes vencidos ou vencendo em até 30 dias</h3></div></div><div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Produto</th><th>Lote</th><th>Qtd restante</th><th>Validade</th><th>Situação</th></tr></thead><tbody>${vencendo.map(l => `<tr><td>${escapeHtml(l.produto)}</td><td>${escapeHtml(l.rotulo)}</td><td>${formatarNumero(l.restante, 0)}</td><td>${formatarData(l.validade)}</td><td>${l.diasRestantes < 0 ? `<span class="badge badge-inativo">Vencido há ${Math.abs(l.diasRestantes)} dia(s)</span>` : l.diasRestantes === 0 ? '<span class="badge badge-inativo">Vence hoje</span>' : `<span class="badge badge-alerta">Vence em ${l.diasRestantes} dia(s)</span>`}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const cardAgenda = dados.agenda ? `<section class="panel"><div class="panel-header"><div><h3>📅 Próximos eventos (30 dias)</h3></div><button class="btn btn-ghost" type="button" data-bb-aba="compras">Ver compra sugerida</button></div>${pendentes.length ? `<div class="bb-aviso">⏰ ${pendentes.length} evento(s) já passaram e ainda estão sem o consumo lançado.</div>` : ''}${proximos.length ? `<div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Data</th><th>Evento</th><th>Adultos / Crianças</th><th>Tipo</th></tr></thead><tbody>${proximos.map(a => `<tr><td>${formatarData(a.data)}</td><td>${escapeHtml(a.nome_evento || '-')}${a.status === 'a_confirmar' ? ' <span class="badge badge-alerta">a confirmar</span>' : ''}</td><td>${formatarNumero(a.adultos, 0)} / ${formatarNumero(a.criancas, 0)}</td><td>${TIPOS_EVENTO[tipoDoEvento(a)]}${descricaoAlcoolEvento(a) ? ' · ' + descricaoAlcoolEvento(a) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="bb-sub">Nenhum evento agendado para os próximos 30 dias.</p>'}</section>` : '';
  const cardDesp = desp.linhas.length ? `<section class="panel"><div class="panel-header"><div><h3>🍾 Desperdício – garrafas abertas que sobraram (festas fechadas)</h3><p>Baseado em ${desp.eventosComRegistro.size} festa(s) com sobra registrada no período. A garrafa aberta conta como consumida; este quadro mostra quanto dela foi para o lixo, para ajudar a escolher o tamanho da embalagem.</p></div></div><div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Embalagem</th><th>Garrafas consumidas</th><th>Sobra aberta</th><th>% desperdiçado</th><th>Custo da sobra</th></tr></thead><tbody>${desp.linhas.map(l => `<tr><td>${escapeHtml(l.produto)}</td><td>${formatarNumero(l.consumido, 0)}</td><td>${formatarNumero(l.aberto, 1)} garrafa(s)${l.litros != null ? `<div class="lote-rotulo">≈ ${formatarNumero(l.litros, 1)} L</div>` : ''}</td><td>${l.pct >= 15 ? `<span class="badge badge-alerta">${formatarNumero(l.pct, 0)}%</span>` : `${formatarNumero(l.pct, 0)}%`}</td><td>${formatarValorDashboard(l.custo, true)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const tabelaAvulsa = `<section class="panel"><div class="panel-header"><div><h3>Consumo médio – venda avulsa (use day, formatura)</h3><p>Bebidas vendidas individualmente. Média sobre as pessoas presentes (bebidas de adulto: só adultos).</p></div></div><div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Bebida</th><th>Consumida por</th><th>Total</th><th>Eventos</th><th>Média por pessoa</th></tr></thead><tbody>${chavesAvulsa.length ? chavesAvulsa.map(k => { const r = modeloAvulsa[k]; const t = tamanhos(r); return `<tr><td>${escapeHtml(r.nome)}${t ? `<div class="lote-rotulo">${escapeHtml(t)}</div>` : ''}</td><td>${r.alcoolico ? 'Só adultos' : 'Todos'}</td><td>${formatarQtdUnidade(r.geral.total, r.unidade)}</td><td>${formatarNumero(r.geral.eventos, 0)}</td><td>${formatarNumero(media(r.geral.total, r.geral.convidados), 2)} ${r.unidade} / ${r.alcoolico ? 'adulto' : 'pessoa'}</td></tr>`; }).join('') : '<tr><td colspan="5" class="empty-state">Nenhum evento de venda avulsa neste período.</td></tr>'}</tbody></table></div></section>`;

  return `${barraPeriodo()}
  <section class="finance-kpis bb-kpis">
    ${kpi('Produtos cadastrados', formatarNumero(dados.produtos.length, 0))}
    ${kpi('Itens em estoque', formatarNumero(totalItensEstoque, 0))}
    ${kpi('Eventos no período', formatarNumero(eventos.length, 0))}
    ${kpi('Total em compras', formatarValorDashboard(totalComprado, true))}
    ${kpi('Total vendido em eventos', formatarValorDashboard(vendido, true))}
    ${kpi('Total de rolha cobrada', formatarValorDashboard(rolha, true))}
    ${kpi('Lucro dos eventos', formatarValorDashboard(lucro, true))}
    ${kpi('Produtos com estoque baixo', formatarNumero(baixo, 0))}
    ${kpi('Produtos sem estoque', formatarNumero(semEstoque, 0))}
    ${kpi('Lotes vencendo (30 dias)', formatarNumero(vencendo.length, 0))}
  </section>
  ${cardValidade}${cardAgenda}${cardDesp}
  ${tabelaMedia('Festas fechadas – bebidas para todos os convidados', 'Tamanhos diferentes da mesma bebida somados em litros. Média por convidado (adultos + crianças), separando festas com adesão, sem adesão e sem bebida alcoólica (pedido do contratante).', 'Média / convidado', chavesTodos, 'convidados', 'Ainda não há eventos com convidados informados neste período.')}
  ${tabelaMedia('Festas fechadas – bebidas de adulto (alcoólicas e cerveja zero)', 'Tamanhos diferentes da mesma bebida somados em litros. Média somente sobre adultos (crianças desconsideradas), separando eventos com e sem adesão.', 'Média / adulto', chavesAdultos, 'adultos', 'Ainda não há consumo de bebidas de adulto neste período.', GRUPOS.slice(0, 2))}
  ${tabelaAvulsa}`;
}

function telaEstoque() {
  const texto = ui.filtroEstoque.trim().toLowerCase();
  const lista = dados.estoque.filter(item => {
    const p = obterProdutoPorId(item.produto_id);
    const baixo = Number(item.quantidade || 0) <= Number(item.estoque_minimo || 0) && Number(item.estoque_minimo || 0) > 0;
    return (!texto || `${p?.nome || ''} ${p?.categoria || ''}`.toLowerCase().includes(texto)) && (!ui.somenteBaixo || baixo);
  }).sort((a, b) => String(obterProdutoPorId(a.produto_id)?.nome || '').localeCompare(String(obterProdutoPorId(b.produto_id)?.nome || ''), 'pt-BR'));
  const valorTotal = dados.estoque.reduce((s, i) => s + Math.max(0, Number(i.quantidade || 0)) * Number(i.custo_medio || 0), 0);
  const lotesDe = pid => dados.lotesBanco.filter(l => String(l.produto_id) === String(pid) && Number(l.quantidade_disponivel || 0) > 0);
  return `<section class="finance-kpis bb-kpis">${kpi('Produtos em estoque', formatarNumero(dados.estoque.filter(i => Number(i.quantidade || 0) > 0).length, 0))}${kpi('Unidades em estoque', formatarNumero(dados.estoque.reduce((s, i) => s + Number(i.quantidade || 0), 0), 0))}${kpi('Valor em estoque (custo médio)', formatarValorDashboard(valorTotal, true))}${kpi('Estoque baixo', formatarNumero(dados.estoque.filter(i => { const m = Number(i.estoque_minimo || 0); return m > 0 && Number(i.quantidade || 0) <= m; }).length, 0))}</section>
  <section class="panel"><div class="panel-header"><div><h3>Estoque disponível</h3><p>Quantidade atual, custo médio e lotes com saldo (o consumo sai sempre do lote mais antigo). Clique no produto para ver os lotes.</p></div><button class="btn btn-ghost" type="button" data-bb="valores">${mostrandoValores() ? '🙈 Ocultar valores' : '👁️ Mostrar valores'}</button></div>
  <div class="bb-toolbar"><input id="bbFiltroEstoque" type="search" placeholder="Buscar produto ou categoria" value="${escapeHtml(ui.filtroEstoque)}"><label class="bb-check"><input type="checkbox" id="bbSomenteBaixo" ${ui.somenteBaixo ? 'checked' : ''}> Só estoque baixo</label></div>
  <div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Quantidade</th><th>Custo médio</th><th>Valor</th><th>Mínimo</th><th>Situação</th></tr></thead><tbody>
  ${lista.length ? lista.map(item => { const p = obterProdutoPorId(item.produto_id); const st = calcularStatusEstoque(item); const ls = lotesDe(item.produto_id); return `<tr class="bb-click" data-bb-lotes="${escapeHtml(item.produto_id)}"><td><strong>${escapeHtml(p?.nome || 'Produto')}</strong>${ls.length ? `<div class="lote-rotulo">${ls.length} lote(s) ▾</div>` : ''}</td><td>${escapeHtml(p?.categoria || '-')}</td><td>${formatarNumero(item.quantidade, 0)}</td><td>${formatarValorDashboard(Number(item.custo_medio || 0), true)}</td><td>${formatarValorDashboard(Math.max(0, Number(item.quantidade || 0)) * Number(item.custo_medio || 0), true)}</td><td>${formatarNumero(item.estoque_minimo, 0)}</td><td><span class="badge ${st.classe}">${st.texto}</span></td></tr><tr class="bb-lotes" data-bb-lotes-de="${escapeHtml(item.produto_id)}" hidden><td colspan="7">${ls.length ? `<table class="bb-subtable"><thead><tr><th>Lote</th><th>Entrada</th><th>Restante</th><th>Custo unit.</th><th>Validade</th></tr></thead><tbody>${ls.map(l => { const info = descreverLoteBanco(l); return `<tr><td>${escapeHtml(info.rotulo)}</td><td>${formatarNumero(l.quantidade_original, 0)}</td><td>${formatarNumero(l.quantidade_disponivel, 0)}</td><td>${formatarValorDashboard(Number(l.custo_unitario || 0), true)}</td><td>${info.validade ? formatarData(info.validade) : '-'}</td></tr>`; }).join('')}</tbody></table>` : '<span class="bb-sub">Sem lote com saldo.</span>'}</td></tr>`; }).join('') : '<tr><td colspan="7" class="empty-state">Nenhum item encontrado.</td></tr>'}
  </tbody></table></div></section>`;
}

function resumoEvento(ev, custos) {
  const itens = dados.eventosItens.filter(i => String(i.evento_id) === String(ev.id));
  const vendido = itens.reduce((s, i) => s + Number(obterQuantidadeEventoItem(i) || 0) * obterPrecoEventoItem(i), 0);
  const custo = itens.reduce((s, i) => s + (custos[String(i.id)]?.custoTotal || 0), 0);
  const rolha = ev.rolha_cobrada ? Number(ev.valor_rolha || 0) : 0;
  return { itens, vendido, custo, rolha, resultado: vendido - custo + rolha };
}
function telaEventos() {
  const custos = calcularCustosItensEvento();
  const texto = ui.filtroEventos.trim().toLowerCase();
  const lista = recortePeriodo().eventos.filter(e => !texto || String(e.nome_evento || '').toLowerCase().includes(texto)).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const alcool = e => tipoDoEvento(e) === 'avulsa' ? '<span class="bb-muted">-</span>' : e.sem_alcool ? '<span class="badge badge-alerta">Sem álcool</span>' : e.alcoolico_adesao ? '<span class="badge badge-ativo">Adesão</span>' : '<span class="bb-muted">Sem adesão</span>';
  return `${barraPeriodo()}<section class="panel"><div class="panel-header"><div><h3>Histórico de consumo por evento</h3><p>${lista.length} evento(s). Custo calculado pelos lotes (PEPS); resultado = vendido − custo + rolha. Clique no evento para ver os itens.</p></div></div>
  <div class="bb-toolbar"><input id="bbFiltroEventos" type="search" placeholder="Buscar evento" value="${escapeHtml(ui.filtroEventos)}"></div>
  <div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Data</th><th>Evento</th><th>Tipo</th><th>Alcoólicas</th><th>Adultos / Crianças</th><th>Vendido</th><th>Custo</th><th>Rolha</th><th>Resultado</th></tr></thead><tbody>
  ${lista.length ? lista.map(ev => { const r = resumoEvento(ev, custos); const aberto = String(eventoAberto) === String(ev.id); return `<tr class="bb-click" data-bb-evento="${escapeHtml(ev.id)}"><td>${formatarData(ev.data)}</td><td><strong>${escapeHtml(ev.nome_evento || '-')}</strong><div class="lote-rotulo">${r.itens.length} item(ns) ${aberto ? '▴' : '▾'}</div></td><td>${TIPOS_EVENTO[tipoDoEvento(ev)]}</td><td>${alcool(ev)}</td><td>${formatarNumero(ev.adultos, 0)} / ${formatarNumero(ev.criancas, 0)}</td><td>${formatarValorDashboard(r.vendido, true)}</td><td>${formatarValorDashboard(r.custo, true)}</td><td>${ev.rolha_cobrada ? formatarValorDashboard(r.rolha, true) : '<span class="bb-muted">Não</span>'}</td><td><strong>${formatarValorDashboard(r.resultado, true)}</strong></td></tr>${aberto ? `<tr class="bb-lotes"><td colspan="9">${r.itens.length ? `<table class="bb-subtable"><thead><tr><th>Produto</th><th>Consumido</th><th>Preço de venda</th><th>Vendido</th><th>Custo (lotes)</th><th>Lotes usados</th></tr></thead><tbody>${r.itens.map(i => { const c = custos[String(i.id)] || { alocacoes: [], custoTotal: 0 }; const q = Number(obterQuantidadeEventoItem(i) || 0); return `<tr><td>${escapeHtml(obterProdutoPorId(i.produto_id)?.nome || 'Produto')}</td><td>${formatarNumero(q, 0)}</td><td>${formatarValorDashboard(obterPrecoEventoItem(i), true)}</td><td>${formatarValorDashboard(q * obterPrecoEventoItem(i), true)}</td><td>${formatarValorDashboard(c.custoTotal, true)}</td><td>${c.alocacoes.map(a => `<div class="lote-rotulo">${formatarNumero(a.quantidade, 0)} un · ${escapeHtml(a.rotulo)}${a.validade ? ` · val. ${formatarData(a.validade)}` : ''}</div>`).join('') || '-'}</td></tr>`; }).join('')}</tbody></table>` : '<span class="bb-sub">Evento sem itens lançados.</span>'}</td></tr>` : ''}`; }).join('') : '<tr><td colspan="9" class="empty-state">Nenhum evento neste período.</td></tr>'}
  </tbody></table></div></section>`;
}

function telaCompras() {
  const c = compraConsolidada(ui.horizonte);
  const totalA = c.eventos.reduce((s, e) => s + Number(e.adultos || 0), 0), totalC = c.eventos.reduce((s, e) => s + Number(e.criancas || 0), 0);
  const consolidada = !c.eventos.length ? '<div class="empty-state">Nenhum evento agendado nesse período.</div>' : `<div class="lote-rotulo" style="margin:8px 0">${c.eventos.length} evento(s): ${c.eventos.map(e => `${formatarData(e.data)} ${escapeHtml(e.nome_evento || '')} (em ${diasAte(e.data)} dia(s))`).join(' · ')} — total ${formatarNumero(totalA, 0)} adultos e ${formatarNumero(totalC, 0)} crianças</div>${c.blocos.map(bl => `${c.blocos.length > 1 ? `<h4 class="bb-h4">${TIPOS_EVENTO[bl.tipo]} (${bl.eventos.length} evento(s))</h4>` : ''}${bl.semHistorico ? `<div class="empty-state">Ainda não há histórico de "${TIPOS_EVENTO[bl.tipo]}" para calcular.</div>` : htmlTabelaListaCompra(bl.linhas, { mostrarMedia: false })}`).join('')}`;
  const sim = simulacao;
  const simTipo = sim?.tipo || 'fechada';
  const resultadoSim = !sim ? '' : sim.semModelo ? `<div class="empty-state">Ainda não há eventos do tipo "${TIPOS_EVENTO[sim.tipo]}" no período para calcular a média.</div>` : htmlTabelaListaCompra(sim.linhas);
  return `<section class="panel"><div class="panel-header"><div><h3>🛒 Compra consolidada dos próximos eventos</h3><p>Soma o consumo previsto de todos os eventos agendados no Controle de Bebidas (cada um com sua adesão) e desconta o estoque atual uma única vez. Usa todo o histórico de consumo, com margem de segurança de 10%.</p></div></div>
  <div class="bb-toolbar"><label class="field"><span>Horizonte</span><select id="bbHorizonte">${[['7', 'Próximos 7 dias'], ['15', 'Próximos 15 dias'], ['30', 'Próximos 30 dias'], ['60', 'Próximos 60 dias'], ['todos', 'Todos os agendados']].map(([v, t]) => `<option value="${v}" ${ui.horizonte === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><button class="btn btn-ghost" type="button" data-bb="pdf-consolidada" ${c.linhas.length ? '' : 'disabled'}>Gerar PDF</button></div>${consolidada}</section>
  <section class="panel"><div class="panel-header"><div><h3>Sugestão de compras por evento</h3><p>Simule um evento: informe os convidados e o tipo. As médias usam os eventos do período escolhido no Painel (${descricaoPeriodo()}).</p></div></div>
  <form id="bbSimForm" class="bb-toolbar bb-sim"><input name="adultos" type="number" min="0" placeholder="Qtd adultos" value="${sim?.adultos ?? ''}"><input name="criancas" type="number" min="0" placeholder="Qtd crianças" value="${sim?.criancas ?? ''}"><label class="field"><span>Tipo</span><select name="tipo"><option value="fechada" ${simTipo !== 'avulsa' ? 'selected' : ''}>Festa fechada (contratante)</option><option value="avulsa" ${simTipo === 'avulsa' ? 'selected' : ''}>Venda avulsa (use day, formatura)</option></select></label><label class="bb-check" data-so-fechada ${simTipo === 'avulsa' ? 'hidden' : ''}><input type="checkbox" name="adesao" ${sim?.adesao ? 'checked' : ''}> 🍺 Bebida alcoólica por adesão</label><label class="bb-check" data-so-fechada ${simTipo === 'avulsa' ? 'hidden' : ''}><input type="checkbox" name="semAlcool" ${sim?.semAlcool ? 'checked' : ''}> 🚫 Sem bebida alcoólica (pedido do contratante)</label><button class="btn btn-primary" type="submit">Calcular sugestão</button><button class="btn btn-ghost" type="button" data-bb="limpar-sim">Limpar</button><button class="btn btn-ghost" type="button" data-bb="pdf-sim" ${sim?.linhas?.length ? '' : 'disabled'}>Gerar PDF</button></form>
  <div id="bbResultadoSim">${resultadoSim}</div></section>`;
}


// ------------------------------------------- conferência com o estoque antigo da plataforma
// O menu "Estoque" antigo guarda um estoque interno (importado uma vez do
// sistema de bebidas) que não é atualizado pelo controlebebidaslega. Esta
// tela compara esse estoque com o real e lista o que foi lançado SÓ na
// plataforma, para decidir o que precisa ser lançado no Controle de Bebidas.
const normNome = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function dadosConferencia() {
  const intProdutos = readJSON('lega.estoque.produtos', []) || [];
  const intLotes = readJSON('lega.estoque.lotes', []) || [];
  const intMov = readJSON('lega.estoque.movimentacoes', []) || [];
  const eventosPlat = readJSON('lega.eventos', []) || [];
  const porId = new Map(dados.produtos.map(p => [String(p.id), p]));
  const porNome = new Map(dados.produtos.map(p => [normNome(p.nome), p]));
  const estoqueReal = new Map(dados.estoque.map(e => [String(e.produto_id), e]));
  const correspondente = ip => (ip.origemId != null && porId.get(String(ip.origemId))) || porNome.get(normNome(ip.nome)) || null;
  // lançamentos feitos só na plataforma
  const lanc = [];
  intMov.filter(m => m.tipo === 'entrada').forEach(m => lanc.push({ data: m.data || m.createdAt, tipo: 'Entrada no estoque da plataforma', origem: 'Menu Estoque', produtoId: m.produtoId, produto: m.produto, quantidade: Number(m.quantidade || 0), sinal: 1 }));
  eventosPlat.forEach(ev => {
    const q = (ev.orcamentos || []).find(o => o.id === ev.orcamentoEscolhidoId) || (ev.orcamentos || []).at(-1) || {};
    const nome = [q.nome || q.tipo, q.cliente].filter(Boolean).join(' · ') || 'Evento';
    (ev.consumos || []).forEach(c => lanc.push({ data: c.createdAt, tipo: 'Consumo lançado no evento', origem: `${nome}${q.data ? ' (' + formatarData(q.data) + ')' : ''}`, produtoId: c.produtoId, produto: c.produto, quantidade: Number(c.quantidade || 0), sinal: -1, valorVenda: Number(c.valorVenda || 0) }));
  });
  lanc.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const linhas = intProdutos.map(ip => {
    const saldoPlat = intLotes.filter(l => l.produtoId === ip.id).reduce((s, l) => s + Number(l.quantidadeDisponivel || 0), 0);
    const real = correspondente(ip);
    const qtdReal = real ? Number(estoqueReal.get(String(real.id))?.quantidade || 0) : null;
    const meus = lanc.filter(l => l.produtoId === ip.id);
    const entradas = meus.filter(l => l.sinal > 0).reduce((s, l) => s + l.quantidade, 0);
    const saidas = meus.filter(l => l.sinal < 0).reduce((s, l) => s + l.quantidade, 0);
    return { ip, real, saldoPlat, qtdReal, diferenca: qtdReal == null ? null : saldoPlat - qtdReal, entradas, saidas };
  }).sort((a, b) => Math.abs(b.diferenca ?? 1e9) - Math.abs(a.diferenca ?? 1e9) || String(a.ip.nome).localeCompare(String(b.ip.nome), 'pt-BR'));
  return { linhas, lanc };
}
function csv(linhas) { return linhas.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'); }
function telaConferencia() {
  const { linhas, lanc } = dadosConferencia();
  const casados = linhas.filter(l => l.real).length;
  const comDif = linhas.filter(l => l.diferenca != null && Math.abs(l.diferenca) > 1e-9).length;
  const fmtDif = v => v == null ? '<span class="bb-muted">—</span>' : Math.abs(v) < 1e-9 ? '<span class="badge badge-ativo">Igual</span>' : `<span class="badge ${v > 0 ? 'badge-alerta' : 'badge-inativo'}">${v > 0 ? '+' : ''}${formatarNumero(v, 0)}</span>`;
  return `<section class="panel bb-alerta"><div class="panel-header"><div><h3>Por que existem diferenças?</h3><p>O menu <b>Estoque</b> antigo da plataforma recebeu os produtos do Controle de Bebidas <b>uma única vez</b> (importação) e depois ficou separado: o que entrou e saiu no controlebebidaslega não chegou nele, e o que foi lançado nele não chegou ao Controle de Bebidas. O estoque que vale é o do <b>Controle de Bebidas</b> (aba Estoque deste menu). Use esta tela para ver se algo lançado só na plataforma ainda precisa ser lançado lá. Nada aqui altera dados.</p></div></div></section>
  <section class="finance-kpis bb-kpis">${kpi('Produtos no estoque antigo', formatarNumero(linhas.length, 0))}${kpi('Encontrados no Controle de Bebidas', formatarNumero(casados, 0))}${kpi('Com quantidade diferente', formatarNumero(comDif, 0))}${kpi('Lançamentos feitos só na plataforma', formatarNumero(lanc.length, 0))}</section>
  <section class="panel"><div class="panel-header"><div><h3>Lançamentos feitos só na plataforma</h3><p>Entradas pelo menu Estoque antigo e consumos lançados na aba de um evento da plataforma. Confira se cada um também foi lançado no controlebebidaslega; se não foi, lance lá (é o estoque oficial).</p></div><button class="btn btn-ghost" type="button" data-bb="csv-lanc" ${lanc.length ? '' : 'disabled'}>Baixar planilha</button></div>
  <div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Data</th><th>Tipo</th><th>Onde</th><th>Produto</th><th>Quantidade</th></tr></thead><tbody>${lanc.length ? lanc.map(l => `<tr><td>${l.data ? formatarData(dataSomenteDia(l.data)) : '-'}</td><td>${l.tipo}</td><td>${escapeHtml(l.origem)}</td><td>${escapeHtml(l.produto || '')}</td><td>${l.sinal > 0 ? '+' : '−'}${formatarNumero(l.quantidade, 0)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">Nenhum lançamento feito só na plataforma.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><div class="panel-header"><div><h3>Produto a produto</h3><p>Saldo do estoque antigo da plataforma × estoque real do Controle de Bebidas. Diferença positiva: a plataforma mostra mais do que existe; negativa: mostra menos.</p></div><button class="btn btn-ghost" type="button" data-bb="csv-prod">Baixar planilha</button></div>
  <div class="table-wrap"><table class="event-table bb-table"><thead><tr><th>Produto (plataforma)</th><th>No Controle de Bebidas</th><th>Saldo na plataforma</th><th>Estoque real</th><th>Diferença</th><th>Lançado só na plataforma</th></tr></thead><tbody>${linhas.map(l => `<tr><td>${escapeHtml(l.ip.nome)}</td><td>${l.real ? escapeHtml(l.real.nome) : '<span class="badge badge-inativo">Não encontrado</span>'}</td><td>${formatarNumero(l.saldoPlat, 0)}</td><td>${l.qtdReal == null ? '—' : formatarNumero(l.qtdReal, 0)}</td><td>${fmtDif(l.diferenca)}</td><td>${l.entradas || l.saidas ? `${l.entradas ? `+${formatarNumero(l.entradas, 0)} entrada(s)` : ''}${l.entradas && l.saidas ? ' · ' : ''}${l.saidas ? `−${formatarNumero(l.saidas, 0)} em evento(s)` : ''}` : '<span class="bb-muted">nada</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function baixarCsv(nome, conteudo) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function telaLogin(msg = '') {
  let emailPlataforma = '';
  try { emailPlataforma = JSON.parse(localStorage.getItem('lega.user') || '{}').email || ''; } catch { }
  return `<section class="panel bb-login"><div class="panel-header"><div><span class="eyebrow">CONTROLE DE BEBIDAS</span><h2>Entrar no banco de bebidas</h2><p>O estoque e o histórico de consumo ficam no banco do Controle de Bebidas. Entre uma vez com o <b>mesmo e-mail e senha que você usa no controlebebidaslega</b>; este computador fica conectado.</p></div></div>
  <form id="bbLogin" class="form-grid"><div class="field"><label>E-mail</label><input name="email" type="email" required value="${escapeHtml(banco.emailSessao() || emailPlataforma)}" autocomplete="username"></div><div class="field"><label>Senha</label><input name="senha" type="password" required autocomplete="current-password"></div><div class="field field-full form-actions"><button class="btn btn-primary">Entrar</button></div></form>${msg ? `<p class="bb-erro">${escapeHtml(msg)}</p>` : ''}</section>`;
}

function conteudo() {
  if (!banco.temSessao()) return telaLogin(erro?.code === 'AUTH' ? erro.message : '');
  if (erro) return erro.code === 'AUTH' ? telaLogin(erro.message) : `<section class="panel empty-state"><h3>Não foi possível ler o Controle de Bebidas.</h3><p>${escapeHtml(erro.message)}</p><button class="btn btn-primary" type="button" data-bb="recarregar">Tentar de novo</button></section>`;
  if (!dados) return '<section class="panel empty-state"><h3>Carregando dados do Controle de Bebidas…</h3><p>Estoque, eventos e compras.</p></section>';
  if (ui.aba === 'estoque') return telaEstoque();
  if (ui.aba === 'eventos') return telaEventos();
  if (ui.aba === 'compras') return telaCompras();
  if (ui.aba === 'conferencia') return telaConferencia();
  return telaPainel();
}

export function render() {
  try { const a = JSON.parse(localStorage.getItem(UI_KEY) || '{}').aba; if (a) ui.aba = a; } catch { }
  if (!abas().some(([k]) => k === ui.aba)) ui.aba = 'painel';
  const conectado = banco.temSessao();
  return `<div class="page-grid bebidas-module">
  <section class="events-header"><div><span class="eyebrow">CONTROLE DE BEBIDAS</span><h2>Bebidas</h2><p>Estoque, consumo e sugestões de compra, lidos direto do Controle de Bebidas. Os dois sistemas mostram os mesmos dados.</p></div>
  ${conectado ? `<div class="bb-head-actions"><span class="bb-sub">${dados ? `Atualizado às ${dados.lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span><button class="btn btn-ghost" type="button" data-bb="recarregar">↻ Atualizar</button><button class="btn btn-ghost" type="button" data-bb="sair" title="Desconectar do banco de bebidas neste computador">Desconectar</button></div>` : ''}</section>
  ${conectado ? `<nav class="bb-tabs">${abas().map(([k, t]) => `<button type="button" class="${ui.aba === k ? 'active' : ''}" data-bb-aba="${k}">${t}</button>`).join('')}</nav>` : ''}
  <div id="bbConteudo">${conteudo()}</div></div>`;
}

function desenhar(root) { root.innerHTML = render(); ligar(root); }

function abrirPdf(titulo, subtituloHtml, linhas) {
  const j = window.open('', '_blank');
  if (!j) { alert('Permita pop-ups para gerar o PDF.'); return; }
  const corpo = linhas.map(i => `<tr><td>${escapeHtml(i.produto)}</td><td>${escapeHtml(i.tipo || '')}</td><td>${formatarQtdUnidade(i.estimativa, i.unidade)}</td><td>${formatarQtdUnidade(i.estoqueAtual, i.unidade)}${i.estoqueDetalhe ? `<br><small>${escapeHtml(i.estoqueDetalhe)}</small>` : ''}</td><td><b>${escapeHtml(i.comprarTexto)}</b></td></tr>`).join('');
  j.document.write(`<html><head><title>Sugestão de Compras</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{margin-bottom:8px}.sub{margin-bottom:20px;color:#555}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:10px;text-align:left}th{background:#f3f3f3}</style></head><body><h1>${escapeHtml(titulo)}</h1><div class="sub">${subtituloHtml}Gerado em: ${new Date().toLocaleString('pt-BR')}</div><table><thead><tr><th>Bebida</th><th>Consumida por</th><th>Estimativa (+10%)</th><th>Estoque atual</th><th>Comprar</th></tr></thead><tbody>${corpo}</tbody></table></body></html>`);
  j.document.close(); j.focus(); j.print();
}

function ligar(root) {
  const q = s => root.querySelector(s);
  garantirDados(root);
  root.querySelectorAll('[data-bb-aba]').forEach(b => b.addEventListener('click', () => { ui.aba = b.dataset.bbAba; salvarUi(); desenhar(root); window.scrollTo(0, 0); }));
  q('[data-bb="recarregar"]')?.addEventListener('click', () => { dados = null; erro = null; desenhar(root); });
  q('[data-bb="sair"]')?.addEventListener('click', () => { if (!confirm('Desconectar este computador do banco de bebidas?')) return; banco.sair(); dados = null; desenhar(root); });
  root.querySelectorAll('[data-bb="valores"]').forEach(b => b.addEventListener('click', () => { definirMostrarValores(!mostrandoValores()); desenhar(root); }));
  q('#bbLogin')?.addEventListener('submit', async ev => {
    ev.preventDefault(); const f = new FormData(ev.currentTarget); const btn = ev.currentTarget.querySelector('button');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try { await banco.entrar(String(f.get('email')).trim(), String(f.get('senha'))); erro = null; dados = null; desenhar(root); }
    catch (e) { erro = { code: 'AUTH', message: e.message }; desenhar(root); }
  });
  // período
  q('#bbPeriodo')?.addEventListener('change', e => { const tipo = e.target.value; if (tipo === 'personalizado') { ui.periodo = { ...ui.periodo, tipo }; salvarUi(); q('.bb-custom').hidden = false; return; } ui.periodo = { tipo, ...calcularIntervaloPeriodo(tipo) }; salvarUi(); desenhar(root); });
  q('[data-bb="aplicar-periodo"]')?.addEventListener('click', () => { ui.periodo = { tipo: 'personalizado', inicio: q('#bbIni').value || '', fim: q('#bbFim').value || '' }; salvarUi(); desenhar(root); });
  // estoque
  q('#bbFiltroEstoque')?.addEventListener('input', e => { ui.filtroEstoque = e.target.value; salvarUi(); const pos = e.target.selectionStart; desenhar(root); const n = root.querySelector('#bbFiltroEstoque'); n?.focus(); n?.setSelectionRange(pos, pos); });
  q('#bbSomenteBaixo')?.addEventListener('change', e => { ui.somenteBaixo = e.target.checked; salvarUi(); desenhar(root); });
  root.querySelectorAll('[data-bb-lotes]').forEach(tr => tr.addEventListener('click', () => { const alvo = root.querySelector(`[data-bb-lotes-de="${CSS.escape(tr.dataset.bbLotes)}"]`); if (alvo) alvo.hidden = !alvo.hidden; }));
  // eventos
  q('#bbFiltroEventos')?.addEventListener('input', e => { ui.filtroEventos = e.target.value; salvarUi(); const pos = e.target.selectionStart; desenhar(root); const n = root.querySelector('#bbFiltroEventos'); n?.focus(); n?.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-bb-evento]').forEach(tr => tr.addEventListener('click', () => { eventoAberto = String(eventoAberto) === tr.dataset.bbEvento ? null : tr.dataset.bbEvento; desenhar(root); }));
  // compras
  q('#bbHorizonte')?.addEventListener('change', e => { ui.horizonte = e.target.value; salvarUi(); desenhar(root); });
  q('[data-bb="pdf-consolidada"]')?.addEventListener('click', () => {
    const c = compraConsolidada(ui.horizonte); if (!c.linhas.length) return;
    abrirPdf('Compra consolidada – próximos eventos', c.eventos.map(e => `${formatarData(e.data)} – ${escapeHtml(e.nome_evento || '')} (${TIPOS_EVENTO[tipoDoEvento(e)]}, ${formatarNumero(e.adultos, 0)} adultos, ${formatarNumero(e.criancas, 0)} crianças${descricaoAlcoolEvento(e) ? ', ' + descricaoAlcoolEvento(e) : ''})`).join('<br>') + '<br>', c.linhas);
  });
  const simForm = q('#bbSimForm');
  if (simForm) {
    const tipoSel = simForm.elements.tipo, ades = simForm.elements.adesao, sem = simForm.elements.semAlcool;
    tipoSel.addEventListener('change', () => { const av = tipoSel.value === 'avulsa'; simForm.querySelectorAll('[data-so-fechada]').forEach(l => { l.hidden = av; }); if (av) { ades.checked = false; sem.checked = false; } });
    ades.addEventListener('change', () => { if (ades.checked) sem.checked = false; });
    sem.addEventListener('change', () => { if (sem.checked) ades.checked = false; });
    simForm.addEventListener('submit', ev => {
      ev.preventDefault();
      const adultos = Number(simForm.elements.adultos.value || 0), criancas = Number(simForm.elements.criancas.value || 0);
      const tipo = tipoSel.value === 'avulsa' ? 'avulsa' : 'fechada';
      const semAlcool = tipo === 'fechada' && sem.checked, adesao = tipo === 'fechada' && !semAlcool && ades.checked;
      if (adultos + criancas === 0) { alert('Informe a quantidade de convidados'); return; }
      const { eventos, eventosItens } = recortePeriodo();
      const modelo = calcularModelosPorTipo(dados.produtos, eventos, eventosItens)[tipo] || {};
      const linhas = montarListaCompra(estimarConsumoEvento(modelo, adultos, criancas, adesao, semAlcool), modelo, dados.produtos, dados.estoque);
      simulacao = { adultos, criancas, tipo, adesao, semAlcool, linhas, semModelo: !Object.keys(modelo).length };
      desenhar(root);
    });
  }
  q('[data-bb="csv-lanc"]')?.addEventListener('click', () => { const { lanc } = dadosConferencia(); baixarCsv('lancamentos-so-na-plataforma.csv', csv([['Data', 'Tipo', 'Onde', 'Produto', 'Quantidade'], ...lanc.map(l => [l.data ? formatarData(dataSomenteDia(l.data)) : '', l.tipo, l.origem, l.produto, (l.sinal > 0 ? '' : '-') + l.quantidade])])); });
  q('[data-bb="csv-prod"]')?.addEventListener('click', () => { const { linhas } = dadosConferencia(); baixarCsv('conferencia-estoque.csv', csv([['Produto (plataforma)', 'No Controle de Bebidas', 'Saldo na plataforma', 'Estoque real', 'Diferença', 'Entradas só na plataforma', 'Saídas em eventos da plataforma'], ...linhas.map(l => [l.ip.nome, l.real?.nome || 'Não encontrado', l.saldoPlat, l.qtdReal ?? '', l.diferenca ?? '', l.entradas, l.saidas])])); });
  q('[data-bb="limpar-sim"]')?.addEventListener('click', () => { simulacao = null; desenhar(root); });
  q('[data-bb="pdf-sim"]')?.addEventListener('click', () => {
    const s = simulacao; if (!s?.linhas?.length) return;
    abrirPdf('Sugestão de compras – ' + TIPOS_EVENTO[s.tipo], `Adultos: ${formatarNumero(s.adultos, 0)}<br>Crianças: ${formatarNumero(s.criancas, 0)}<br>` + (s.tipo === 'fechada' ? (s.semAlcool ? 'Sem bebida alcoólica (pedido do contratante)<br>' : `Bebida alcoólica por adesão: ${s.adesao ? 'Sim' : 'Não'}<br>`) : ''), s.linhas);
  });
}

export function mount() { const root = document.querySelector('#app'); if (root) ligar(root); }
