// Estoque da plataforma (etapa 2, v1.7.0)
// ---------------------------------------
// Compras, lotes, consumo de eventos e conferências de TODOS os setores ficam
// em tabelas próprias no Supabase da plataforma (est_*). As gravações que
// mexem em mais de uma tabela passam por funções do banco (tudo ou nada).
// Este arquivo também faz a migração única do controle de bebidas antigo.

import { platRest } from '../../js/supabase.js';
import { readJSON, writeJSON } from '../../js/storage.js';

export const SETORES = [
  ['bebidas', 'Bebidas', '🥤'],
  ['alimentacao', 'Alimentação', '🍽️'],
  ['decoracao', 'Decoração', '🎈'],
  ['escritorio', 'Escritório e casa', '🗂️']
];
export const setorNome = k => (SETORES.find(s => s[0] === k) || [k, k || 'Sem setor'])[1];
export const setorIcone = k => (SETORES.find(s => s[0] === k) || [0, 0, '📦'])[2];
export const TIPOS_ITEM = [
  ['consumo', 'Consumo', 'acaba na festa (bebida, salgado, descartável)'],
  ['reutilizavel', 'Reutilizável', 'volta para o estoque (capas, suportes, números de LED)'],
  ['por_evento', 'Para um evento', 'comprado para uma festa específica (bolo, personalizados)']
];
export const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'fardo', 'dz', 'par', 'rolo'];

const VIRADA_KEY = 'lega.estoque.virada';   // compartilhada: os dois computadores ficam sabendo
const PAGINA = 1000;

export const rpc = (nome, args = {}) => platRest('POST', `rpc/${nome}`, args);

/** Lê uma tabela inteira em páginas de 1000. */
export async function lerTudo(tabela, query = 'select=*&order=id.asc') {
  const todas = [];
  for (let volta = 0; volta < 500; volta++) {
    const pagina = await platRest('GET', `${tabela}?${query}&limit=${PAGINA}&offset=${todas.length}`);
    if (!Array.isArray(pagina)) break;
    todas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return todas;
}

const tabelaFaltando = e => e?.status === 404 || e?.codigo === 'PGRST205' || e?.codigo === '42P01' || /does not exist|schema cache/i.test(e?.message || '');

/** Situação do estoque na plataforma: SQL instalado? virada feita? */
export async function situacao() {
  try {
    const cfg = await platRest('GET', 'est_config?select=chave,valor');
    const v = (cfg || []).find(x => x.chave === 'virada')?.valor || null;
    const local = readJSON(VIRADA_KEY, null);
    if (v && !local) writeJSON(VIRADA_KEY, v);
    const mig = (cfg || []).find(x => x.chave === 'migracao')?.valor || null;
    return { instalado: true, virada: v, migracao: mig };
  } catch (e) {
    if (tabelaFaltando(e)) return { instalado: false, virada: null };
    if (e.code === 'AUTH') throw e;
    return { instalado: null, erro: e.message, virada: readJSON(VIRADA_KEY, null) };
  }
}
export const viradaLocal = () => readJSON(VIRADA_KEY, null);

// ------------------------------------------------------------- leitura geral
let cache = null; let cacheEm = 0; let carregando = null;
export function invalidar() { cache = null; cacheEm = 0; }

export async function carregar({ forcar = false } = {}) {
  if (!forcar && cache && Date.now() - cacheEm < 60000) return cache;
  if (carregando) return carregando;
  carregando = (async () => {
    const [produtos, estoque, compras, comprasItens, lotes, eventos, eventosItens, consumos, movimentacoes, balancos, balancosItens, agenda, codigos] = await Promise.all([
      lerTudo('est_produtos', 'select=*&order=nome.asc'),
      lerTudo('est_estoque'),
      lerTudo('est_compras', 'select=*&order=data.desc,id.desc'),
      lerTudo('est_compras_itens'),
      lerTudo('est_lotes', 'select=*&order=data_compra.asc,created_at.asc,id.asc'),
      lerTudo('est_eventos', 'select=*&order=data.desc,id.desc'),
      lerTudo('est_eventos_itens'),
      lerTudo('est_consumos_lotes'),
      lerTudo('est_movimentacoes', 'select=*&order=data_movimento.desc,id.desc'),
      lerTudo('est_balancos', 'select=*&order=data.desc,id.desc'),
      lerTudo('est_balancos_itens'),
      lerTudo('est_agenda', 'select=*&order=data.asc'),
      lerTudo('est_codigos_barras')
    ]);
    cache = { produtos, estoque, compras, comprasItens, lotes, eventos, eventosItens, consumos, movimentacoes, balancos, balancosItens, agenda, codigos };
    cacheEm = Date.now();
    return cache;
  })();
  try { return await carregando; } finally { carregando = null; }
}

// ------------------------------------------------------------- ajudantes
export function indice(d) {
  const prod = new Map(d.produtos.map(p => [String(p.id), p]));
  const est = new Map(d.estoque.map(e => [String(e.produto_id), e]));
  return { prod, est };
}
export function saldo(d, produtoId) { return Number(d.estoque.find(e => String(e.produto_id) === String(produtoId))?.quantidade || 0); }

/** Próximas validades (lotes com saldo) até N dias. */
export function vencendo(d, dias = 30, hoje = new Date()) {
  const lim = new Date(hoje.getTime() + dias * 864e5).toISOString().slice(0, 10);
  const itens = new Map(d.comprasItens.map(i => [String(i.id), i]));
  return d.lotes.filter(l => Number(l.quantidade_disponivel) > 0).map(l => ({ ...l, validade: l.validade || itens.get(String(l.compra_item_id))?.validade || null }))
    .filter(l => l.validade && l.validade <= lim).sort((a, b) => a.validade.localeCompare(b.validade));
}

// ------------------------------------------------------------- formato antigo (Bebidas)
// Os cálculos do painel de bebidas foram copiados do sistema antigo e esperam
// as tabelas dele. Depois da virada, entregamos as tabelas novas no mesmo
// formato: a linha original (legado) por baixo e os campos atuais por cima.
const comLegado = r => { const { legado, ...resto } = r; return legado && typeof legado === 'object' ? { ...legado, ...resto } : resto; };
export function formatoBebidas(d) {
  const produtos = d.produtos.filter(p => (p.setor || 'bebidas') === 'bebidas').map(comLegado);
  const ids = new Set(produtos.map(p => String(p.id)));
  const doSetor = r => ids.has(String(r.produto_id));
  const eventosItens = d.eventosItens.filter(doSetor).map(comLegado);
  const itensIds = new Set(eventosItens.map(i => String(i.id)));
  const eventosComBebida = new Set(eventosItens.map(i => String(i.evento_id)));
  return {
    produtos,
    estoque: d.estoque.filter(doSetor).map(comLegado),
    compras: d.compras.map(comLegado),
    comprasItens: d.comprasItens.filter(doSetor).map(comLegado),
    eventos: d.eventos.filter(e => eventosComBebida.has(String(e.id)) || !(d.eventosItens.some(i => String(i.evento_id) === String(e.id)))).map(comLegado),
    eventosItens,
    movimentacoes: d.movimentacoes.filter(doSetor).map(comLegado),
    lotesBanco: d.lotes.filter(doSetor).map(comLegado),
    consumosBanco: d.consumos.filter(c => itensIds.has(String(c.evento_item_id))).map(comLegado),
    agenda: d.agenda.map(comLegado)
  };
}

// ------------------------------------------------------------- migração
const txt = v => (v === undefined || v === null || v === '') ? null : String(v);
const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const numOuNull = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const bool = (v, def = false) => v === undefined || v === null ? def : !!v;
const boolOuNull = v => v === undefined || v === null ? null : !!v;
const dia = v => v ? String(v).slice(0, 10) : null;
const quando = v => v || new Date().toISOString();
const inteiro = v => Math.round(num(v, 0));

/** [tabela antiga, tabela nova, conversão, obrigatória?] */
export const MAPA_MIGRACAO = [
  ['produtos', 'est_produtos', r => ({ id: r.id, nome: txt(r.nome) || `Produto ${r.id}`, setor: 'bebidas', categoria: txt(r.categoria), grupo_consumo: txt(r.grupo_consumo), volume_litros: numOuNull(r.volume_litros), somente_adultos: boolOuNull(r.somente_adultos), codigo_barras: txt(r.codigo_barras), unidade: 'un', unidade_compra: null, fator_compra: 1, tipo_item: 'consumo', ativo: bool(r.ativo, true), observacao: txt(r.observacao), created_at: quando(r.created_at) }), true],
  ['produtos_codigos_barras', 'est_codigos_barras', r => ({ id: r.id, produto_id: r.produto_id, codigo_barras: txt(r.codigo_barras) || `sem-codigo-${r.id}`, created_at: quando(r.created_at) }), false],
  ['estoque', 'est_estoque', r => ({ id: r.id, produto_id: r.produto_id, quantidade: num(r.quantidade), custo_medio: num(r.custo_medio), estoque_minimo: num(r.estoque_minimo), updated_at: quando(r.updated_at || r.created_at) }), true],
  ['compras', 'est_compras', r => ({ id: r.id, data: dia(r.data) || dia(r.created_at) || dia(new Date().toISOString()), fornecedor: txt(r.fornecedor), valor_total: num(r.valor_total), observacao: txt(r.observacao), created_at: quando(r.created_at) }), true],
  ['compras_itens', 'est_compras_itens', r => ({ id: r.id, compra_id: r.compra_id, produto_id: r.produto_id, quantidade: num(r.quantidade), valor_unitario: num(r.valor_unitario), valor_total: num(r.valor_total, num(r.quantidade) * num(r.valor_unitario)), validade: dia(r.validade), quantidade_compra: numOuNull(r.quantidade), unidade_compra: 'un', created_at: quando(r.created_at) }), false],
  ['estoque_lotes', 'est_lotes', r => ({ id: r.id, produto_id: r.produto_id, compra_id: r.compra_id ?? null, compra_item_id: r.compra_item_id ?? null, data_compra: dia(r.data_compra), quantidade_original: num(r.quantidade_original), quantidade_disponivel: num(r.quantidade_disponivel), custo_unitario: num(r.custo_unitario), validade: dia(r.validade), origem: txt(r.origem) || 'compra', created_at: quando(r.created_at), updated_at: quando(r.updated_at || r.created_at) }), false],
  ['eventos', 'est_eventos', r => ({ id: r.id, nome_evento: txt(r.nome_evento) || `Evento ${r.id}`, data: dia(r.data) || dia(r.created_at), adultos: inteiro(r.adultos), criancas: inteiro(r.criancas), observacao: txt(r.observacao), tipo_evento: txt(r.tipo_evento) || 'fechada', alcoolico_adesao: bool(r.alcoolico_adesao), sem_alcool: bool(r.sem_alcool), rolha_cobrada: bool(r.rolha_cobrada), valor_rolha: num(r.valor_rolha), controle_bar: r.controle_bar && typeof r.controle_bar === 'object' ? r.controle_bar : null, created_at: quando(r.created_at) }), true],
  ['eventos_itens', 'est_eventos_itens', r => { const q = num(r.quantidade ?? r.quantidade_consumida); const pu = num(r.preco_unitario ?? r.preco_venda); return { id: r.id, evento_id: r.evento_id, produto_id: r.produto_id, quantidade: q, preco_unitario: pu, valor_total: num(r.valor_total, q * pu), created_at: quando(r.created_at) }; }, false],
  ['consumos_lotes', 'est_consumos_lotes', r => ({ id: r.id, evento_item_id: r.evento_item_id, lote_id: r.lote_id ?? null, quantidade: num(r.quantidade), custo_unitario: num(r.custo_unitario), created_at: quando(r.created_at) }), false],
  ['movimentacoes_estoque', 'est_movimentacoes', r => ({ id: r.id, produto_id: r.produto_id, tipo: txt(r.tipo) || 'ajuste', quantidade: num(r.quantidade), motivo: txt(r.motivo), observacao: txt(r.observacao), data_movimento: quando(r.data_movimento || r.created_at), referencia_tabela: txt(r.referencia_tabela), referencia_id: numOuNull(r.referencia_id), created_at: quando(r.created_at) }), false],
  ['balancos_estoque', 'est_balancos', r => ({ id: r.id, data: dia(r.data_balanco || r.data || r.created_at) || dia(new Date().toISOString()), observacao: txt(r.observacao), setor: 'bebidas', aplicado: !!(r.aplicado || /aplic/i.test(r.status || '')), created_at: quando(r.created_at) }), false],
  ['balancos_estoque_itens', 'est_balancos_itens', r => ({ id: r.id, balanco_id: r.balanco_id, produto_id: r.produto_id ?? null, produto_nome: txt(r.produto_nome), quantidade_sistema: numOuNull(r.quantidade_sistema ?? r.quantidade_estoque), quantidade_contada: numOuNull(r.quantidade_contada), diferenca: numOuNull(r.diferenca), created_at: quando(r.created_at) }), false],
  ['eventos_agenda', 'est_agenda', r => ({ id: r.id, nome_evento: txt(r.nome_evento) || 'Evento', data: dia(r.data), adultos: inteiro(r.adultos), criancas: inteiro(r.criancas), tipo_evento: txt(r.tipo_evento) || 'fechada', alcoolico_adesao: bool(r.alcoolico_adesao), sem_alcool: bool(r.sem_alcool), observacao: txt(r.observacao), status: txt(r.status) || 'agendado', evento_id: txt(r.evento_id), created_at: quando(r.created_at) }), false]
];

// Ids do sistema antigo: algumas tabelas usam número, outras usam código (uuid,
// ex.: 10094862-595d-…). Na plataforma os ids são números; as tabelas com código
// ganham números novos e todas as referências entre tabelas são trocadas juntas.
// O código antigo continua guardado em "legado".
const REFERENCIAS = { produto_id: 'produtos', compra_id: 'compras', compra_item_id: 'compras_itens', evento_item_id: 'eventos_itens', lote_id: 'estoque_lotes', balanco_id: 'balancos_estoque' };
const REF_MOV = { compras: 'compras', eventos: 'eventos', balancos_estoque: 'balancos_estoque', compras_itens: 'compras_itens', estoque_lotes: 'estoque_lotes' };
const ehInteiro = v => (typeof v === 'number' && Number.isSafeInteger(v)) || (typeof v === 'string' && /^\d{1,15}$/.test(v));
function mapaDeIds(origem) {
  const mapas = {};
  for (const [t, linhas] of Object.entries(origem)) {
    const comId = (linhas || []).filter(r => r && r.id !== undefined && r.id !== null);
    if (comId.length && comId.some(r => !ehInteiro(r.id))) { const m = new Map(); comId.forEach(r => { if (!m.has(String(r.id))) m.set(String(r.id), m.size + 1); }); mapas[t] = m; }
  }
  const trocar = (tabela, v) => {
    if (v === undefined || v === null || v === '') return null;
    const m = mapas[tabela];
    if (!m) return ehInteiro(v) ? Number(v) : null;
    if (!m.has(String(v))) m.set(String(v), m.size + 1); // referência a linha apagada: mantém consistente
    return m.get(String(v));
  };
  const aplicar = (antiga, r, x) => {
    if (r.id !== undefined && r.id !== null) x.id = trocar(antiga, r.id); else delete x.id;
    for (const [campo, alvo] of Object.entries(REFERENCIAS)) if (campo in x) x[campo] = trocar(alvo, r[campo]);
    if (antiga === 'eventos_itens') x.evento_id = trocar('eventos', r.evento_id);
    if (antiga === 'movimentacoes_estoque') { const alvo = REF_MOV[r.referencia_tabela]; x.referencia_id = alvo ? trocar(alvo, r.referencia_id) : (ehInteiro(r.referencia_id) ? Number(r.referencia_id) : null); }
    if (antiga === 'eventos' && x.controle_bar && mapas.produtos) x.controle_bar = Object.fromEntries(Object.entries(x.controle_bar).map(([k, v]) => [String(trocar('produtos', k)), v]));
    return x;
  };
  return { aplicar, mapas };
}

/** Lê uma tabela antiga inteira; nem toda tabela antiga tem a coluna "id" para ordenar. */
async function lerAntiga(buscarAntigo, tabela) {
  let ultimo;
  for (const ordem of ['&order=id.asc', '&order=produto_id.asc', '']) {
    try { return await buscarAntigo(`${tabela}?select=*${ordem}`); }
    catch (e) { if (e.code === 'AUTH') throw e; ultimo = e; }
  }
  throw ultimo;
}

/**
 * Copia tudo do controle de bebidas para a plataforma (apaga o que já tinha
 * sido copiado antes). `buscarAntigo(caminho)` lê do banco antigo.
 * progresso(texto) recebe mensagens para mostrar na tela.
 */
export async function migrarDoAntigo(buscarAntigo, progresso = () => { }) {
  const origem = {};
  for (const [antiga, , , obrigatoria] of MAPA_MIGRACAO) {
    progresso(`Lendo ${antiga} do controle de bebidas…`);
    try { origem[antiga] = await lerAntiga(buscarAntigo, antiga); }
    catch (e) { if (e.code === 'AUTH' || obrigatoria) throw e; origem[antiga] = []; }
    if (!Array.isArray(origem[antiga])) origem[antiga] = [];
  }
  // validade do lote vem do item da compra quando o lote não tem
  const valItem = new Map((origem.compras_itens || []).map(i => [String(i.id), i.validade]));
  const ids = mapaDeIds(origem);
  progresso('Preparando a plataforma…');
  await rpc('est_preparar_migracao');
  const contagens = {};
  for (const [antiga, nova, conv] of MAPA_MIGRACAO) {
    // tabela sem coluna id no sistema antigo (ex.: estoque por produto): o id novo é gerado aqui
    const linhas = origem[antiga].filter(r => r && typeof r === 'object').map(r => {
      const x = { ...conv(r), legado: r };
      if (nova === 'est_lotes' && !x.validade) x.validade = dia(valItem.get(String(r.compra_item_id))) || null;
      return ids.aplicar(antiga, r, x);
    });
    for (let i = 0; i < linhas.length; i += 500) {
      progresso(`Copiando ${antiga}: ${Math.min(i + 500, linhas.length)} de ${linhas.length}…`);
      await platRest('POST', nova, linhas.slice(i, i + 500), 'return=minimal');
    }
    contagens[antiga] = linhas.length;
  }
  // produto que não tinha linha de estoque no sistema antigo ganha uma zerada
  await rpc('est_sincronizar_sequencias');
  progresso('Conferindo…');
  invalidar();
  const resumo = { em: new Date().toISOString(), contagens };
  await platRest('POST', 'est_config', [{ chave: 'migracao', valor: resumo, atualizado_em: resumo.em }], 'resolution=merge-duplicates,return=minimal');
  return { ...resumo, origem };
}

/** Compara o sistema antigo com o que está na plataforma. */
export async function conferirMigracao(buscarAntigo) {
  const nova = await carregar({ forcar: true });
  const antigo = {
    produtos: await lerAntiga(buscarAntigo, 'produtos'),
    estoque: await lerAntiga(buscarAntigo, 'estoque')
  };
  const contar = async t => { try { return (await lerAntiga(buscarAntigo, t)).length; } catch { return 0; } };
  const tabelas = [];
  for (const [antiga, novaT] of MAPA_MIGRACAO) {
    const chave = { est_produtos: 'produtos', est_codigos_barras: 'codigos', est_estoque: 'estoque', est_compras: 'compras', est_compras_itens: 'comprasItens', est_lotes: 'lotes', est_eventos: 'eventos', est_eventos_itens: 'eventosItens', est_consumos_lotes: 'consumos', est_movimentacoes: 'movimentacoes', est_balancos: 'balancos', est_balancos_itens: 'balancosItens', est_agenda: 'agenda' }[novaT];
    tabelas.push({ antiga, nova: novaT, qAntigo: await contar(antiga), qNovo: (nova[chave] || []).length });
  }
  const estNovo = new Map(nova.estoque.map(e => [String(e.legado?.produto_id ?? e.produto_id), e]));
  const nomes = new Map(antigo.produtos.map(p => [String(p.id), p.nome]));
  const saldos = antigo.estoque.map(e => {
    const n = estNovo.get(String(e.produto_id));
    return { produto: nomes.get(String(e.produto_id)) || `#${e.produto_id}`, antigo: num(e.quantidade), novo: num(n?.quantidade), custoAntigo: num(e.custo_medio), custoNovo: num(n?.custo_medio) };
  });
  const divergentes = saldos.filter(s => Math.abs(s.antigo - s.novo) > 0.0005 || Math.abs(s.custoAntigo - s.custoNovo) > 0.005);
  const tabelasDiferentes = tabelas.filter(t => t.qAntigo !== t.qNovo);
  return { tabelas, saldos, divergentes, tabelasDiferentes, ok: !divergentes.length && !tabelasDiferentes.length };
}

export async function virarChave(resumo) {
  await rpc('est_registrar_virada', { p: resumo || {} });
  const v = { ...(resumo || {}), em: new Date().toISOString() };
  writeJSON(VIRADA_KEY, v);
  invalidar();
  return v;
}
