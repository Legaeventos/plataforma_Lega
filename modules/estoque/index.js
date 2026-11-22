// Estoque — compras e estoque de todos os setores (etapa 2, v1.7.0)
// -----------------------------------------------------------------
// Bebidas, alimentação, decoração e escritório num lugar só:
//   • Visão geral com o que fazer agora (abaixo do mínimo, validade, festas sem consumo)
//   • Produtos por setor (unidade de estoque, unidade de compra e conversão)
//   • Compras (entram no estoque por lote, com custo e validade)
//   • Consumo das festas (baixa por lote, do mais antigo para o mais novo)
//   • Conferência (contagem física que acerta o estoque)
// Antes da virada, a tela guia a instalação e a migração do controle de bebidas.

import { readJSON, writeJSON } from '../../js/storage.js';
import { platRest } from '../../js/supabase.js';
import * as bebidasBanco from '../bebidas/banco.js';
import {
  SETORES, setorNome, setorIcone, TIPOS_ITEM, UNIDADES, rpc, carregar, invalidar, situacao, viradaLocal,
  vencendo, migrarDoAntigo, conferirMigracao, virarChave, aprendizado
} from '../../core/engine/estoque-db.js';

const UI_KEY = 'lega.estoque.ui';
const EVENTOS_KEY = 'lega.eventos';
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v, casas = 3) => Number(Number(v || 0).toFixed(casas)).toLocaleString('pt-BR', { maximumFractionDigits: casas });
const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '';
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const numero = v => { if (v === null || v === undefined) return NaN; const s = String(v).trim().replace(/\s/g, ''); if (!s) return NaN; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };

let ui = lerUi();
function lerUi() { try { return { aba: 'visao', setor: 'todos', busca: '', ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch { return { aba: 'visao', setor: 'todos', busca: '' }; } }
function salvarUi() { try { const { novo, eventoPlataforma, ...resto } = ui; Object.keys(resto).filter(k => k.startsWith('_')).forEach(k => delete resto[k]); localStorage.setItem(UI_KEY, JSON.stringify(resto)); } catch { } }

let sit = null;          // {instalado, virada, migracao}
let d = null;            // dados carregados
let erro = null;
let ocupado = false;
let aviso = null;        // {tipo:'ok'|'erro', texto}
let compra = null;       // rascunho da compra
let consumo = null;      // rascunho do consumo
let conferencia = {};    // produto_id -> contado (texto)
let migracaoLog = '';
let conferenciaMig = null;
let rootAtual = null;

const eventosPlataforma = () => readJSON(EVENTOS_KEY, []) || [];
const quoteDe = e => (e.orcamentos || []).find(o => o.id === e.orcamentoEscolhidoId) || (e.orcamentos || []).at(-1) || {};
const prodPorId = id => d?.produtos.find(p => String(p.id) === String(id));
const estDe = id => d?.estoque.find(e => String(e.produto_id) === String(id));
const saldoDe = id => Number(estDe(id)?.quantidade || 0);
const setorDe = id => prodPorId(id)?.setor || 'bebidas';
const unidadeDe = id => prodPorId(id)?.unidade || 'un';
const ativos = () => (d?.produtos || []).filter(p => p.ativo !== false);
const bancoV2 = () => Number(sit?.sqlVersao || 1) >= 2;
const bancoV3 = () => Number(sit?.sqlVersao || 1) >= 3;
const receitasAtivas = () => (d?.receitas || []).filter(r => r.ativo !== false);
const doSetor = p => ui.setor === 'todos' || (p.setor || 'bebidas') === ui.setor;

// ------------------------------------------------------------------ carregamento
async function iniciar(forcar = false) {
  if (ocupado && !forcar) return;
  ocupado = true; erro = null;
  try {
    sit = await situacao();
    if (sit.instalado && (sit.virada || viradaLocal())) d = await carregar({ forcar });
  } catch (e) { erro = e; }
  ocupado = false;
  desenhar();
}
async function recarregarDados() { invalidar(); d = await carregar({ forcar: true }); }

// ------------------------------------------------------------------ telas
function cabecalho() {
  const v = sit?.virada || viradaLocal();
  return `<section class="events-header"><div><span class="eyebrow">COMPRAS E ESTOQUE</span><h2>Estoque</h2><p>Bebidas, alimentação, decoração e escritório: o que entra nas compras e o que sai nas festas.</p></div>
  ${v && d ? `<div class="bb-head-actions"><button class="btn btn-primary" type="button" data-es="ir" data-aba="compras" data-novo="1">＋ Lançar compra</button><button class="btn btn-ghost" type="button" data-es="ir" data-aba="consumo" data-novo="1">＋ Consumo de festa</button><button class="btn btn-ghost" type="button" data-es="atualizar">↻</button></div>` : ''}</section>`;
}
const ABAS = [['visao', 'Visão geral'], ['produtos', 'Produtos'], ['receitas', 'Receitas'], ['compras', 'Compras'], ['consumo', 'Consumo das festas'], ['conferencia', 'Conferência']];

function avisoHtml() {
  if (!aviso) return '';
  return `<div class="es-aviso es-aviso--${aviso.tipo}">${aviso.texto}<button type="button" data-es="fechar-aviso" aria-label="Fechar">✕</button></div>`;
}

export function render() {
  let corpo;
  if (erro) corpo = `<section class="panel empty-state"><h3>Não foi possível abrir o estoque.</h3><p>${esc(erro.message)}</p><button class="btn btn-primary" type="button" data-es="atualizar">Tentar de novo</button></section>`;
  else if (!sit) corpo = '<section class="panel empty-state"><h3>Abrindo o estoque…</h3></section>';
  else if (sit.instalado === false) corpo = telaInstalar();
  else if (sit.instalado === null) corpo = `<section class="panel empty-state"><h3>Sem conexão com o banco da plataforma.</h3><p>${esc(sit.erro || '')}</p><button class="btn btn-primary" type="button" data-es="atualizar">Tentar de novo</button></section>`;
  else if (!(sit.virada || viradaLocal())) corpo = telaMigracao();
  else if (!d) corpo = '<section class="panel empty-state"><h3>Carregando produtos, compras e consumo…</h3></section>';
  else corpo = `${bancoV3() ? '' : `<section class="panel es-atualizar"><div><b>🛠️ Atualização do banco disponível</b><p>Para usar as receitas dos extras e a contagem de salgados em unidades, rode de novo o texto do estoque no Supabase (SQL Editor → New query → colar → Run). Pode rodar por cima: não apaga nada.</p></div><button class="btn btn-primary" type="button" data-es="copiar-sql">📋 Copiar o texto</button><button class="btn btn-ghost" type="button" data-es="atualizar">Já rodei</button></section>`}<nav class="bb-tabs">${ABAS.map(([k, t]) => `<button type="button" class="${ui.aba === k ? 'active' : ''}" data-es-aba="${k}">${t}</button>`).join('')}</nav>${avisoHtml()}${telaAba()}`;
  return `<div class="page-grid estoque-module">${cabecalho()}${corpo}</div>`;
}

function telaAba() {
  if (ui.aba === 'produtos') return telaProdutos();
  if (ui.aba === 'receitas') return telaReceitas();
  if (ui.aba === 'compras') return telaCompras();
  if (ui.aba === 'consumo') return telaConsumo();
  if (ui.aba === 'conferencia') return telaConferencia();
  return telaVisao();
}

// ---------- instalação
function telaInstalar() {
  return `<section class="panel guide-card"><div><span class="eyebrow">PASSO 1 DE 3 · UMA VEZ SÓ</span><h2>Preparar o banco da plataforma para o estoque</h2>
    <p>O estoque fica em tabelas próprias no Supabase da Plataforma Lega. Para criá-las:</p>
    <ol class="es-passos"><li>Entre em <b>supabase.com</b> → projeto da <b>Plataforma Lega</b> → <b>SQL Editor</b> → <b>New query</b>.</li>
    <li>Clique em <b>Copiar o texto</b> aqui embaixo, cole lá e clique em <b>Run</b>. Deve aparecer “Success”.</li>
    <li>Volte aqui e clique em <b>Já rodei, continuar</b>.</li></ol>
    <div class="guide-card__actions"><button class="btn btn-ghost" type="button" data-es="copiar-sql">📋 Copiar o texto</button><button class="btn btn-primary" type="button" data-es="atualizar">Já rodei, continuar</button></div>
    <p class="es-dica">Se o Supabase avisar de “operação destrutiva”, pode confirmar: o texto só cria o que falta e não apaga dados.</p></div></section>`;
}

// ---------- migração
function telaMigracao() {
  const mig = sit.migracao;
  const logado = bebidasBanco.temSessao();
  const conf = conferenciaMig;
  const passo2 = `<section class="panel es-etapa ${mig ? 'is-feito' : ''}"><span class="eyebrow">PASSO 2 DE 3</span><h2>Copiar os dados do controle de bebidas</h2>
    <p>Produtos, estoque por lote, compras, histórico de consumo das festas, conferências e agenda são copiados para a plataforma, com os mesmos números. O sistema antigo não é alterado.</p>
    ${logado ? '' : `<form id="esLoginBeb" class="form-grid"><p class="field-full">Entre com o <b>e-mail e senha do controlebebidaslega</b> para a plataforma poder ler os dados:</p><div class="field"><label>E-mail</label><input name="email" type="email" required value="${esc(bebidasBanco.emailSessao() || (readJSON('lega.user', {}) || {}).email || '')}"></div><div class="field"><label>Senha</label><input name="senha" type="password" required></div><div class="field form-actions"><button class="btn btn-ghost">Entrar</button></div></form>`}
    ${mig ? `<p class="es-ok">✓ Última cópia: ${new Date(mig.em).toLocaleString('pt-BR')} · ${Object.values(mig.contagens || {}).reduce((a, b) => a + b, 0).toLocaleString('pt-BR')} registros.</p>` : ''}
    <div class="es-acoes"><button class="btn ${mig ? 'btn-ghost' : 'btn-primary'}" type="button" data-es="migrar" ${logado && !ocupado ? '' : 'disabled'}>${mig ? '↻ Copiar de novo (atualizar)' : 'Copiar agora'}</button></div>
    ${migracaoLog ? `<p class="es-dica" id="esLogMig">${esc(migracaoLog)}</p>` : '<p class="es-dica" id="esLogMig"></p>'}
    ${mig ? '<p class="es-dica">Se alguém lançar algo no sistema antigo antes da virada, é só copiar de novo: a cópia anterior é substituída.</p>' : ''}</section>`;
  const tabela = conf ? `<div class="table-wrap"><table class="bb-table"><thead><tr><th>Tabela</th><th>No sistema antigo</th><th>Na plataforma</th><th></th></tr></thead><tbody>${conf.tabelas.map(t => `<tr><td>${esc(t.antiga.replace(/_/g, ' '))}</td><td>${t.qAntigo}</td><td>${t.qNovo}</td><td>${t.qAntigo === t.qNovo ? '✓' : '⚠️'}</td></tr>`).join('')}</tbody></table></div>
    <p>${conf.divergentes.length ? `⚠️ ${conf.divergentes.length} produto(s) com saldo ou custo diferente:` : `✓ Saldo e custo médio dos ${conf.saldos.length} produtos conferem com o sistema antigo.`}</p>
    ${conf.divergentes.length ? `<ul>${conf.divergentes.slice(0, 20).map(x => `<li>${esc(x.produto)}: antigo ${qtd(x.antigo)} (${money(x.custoAntigo)}) · plataforma ${qtd(x.novo)} (${money(x.custoNovo)})</li>`).join('')}</ul>` : ''}` : '';
  const passo3 = `<section class="panel es-etapa ${mig ? '' : 'is-bloqueado'}"><span class="eyebrow">PASSO 3 DE 3</span><h2>Conferir e virar a chave</h2>
    ${mig ? `<div class="es-acoes"><button class="btn btn-ghost" type="button" data-es="conferir-mig" ${logado && !ocupado ? '' : 'disabled'}>Conferir com o sistema antigo</button></div>${tabela}
    <div class="es-virada"><p><b>Ao virar a chave:</b></p><ul><li>compras, consumo das festas e conferências passam a ser lançados <b>só aqui na plataforma</b>, para todos os setores;</li><li>o painel de Bebidas passa a ler daqui;</li><li><b>não lancem mais nada no controlebebidaslega</b> (ele continua no ar só para consulta).</li></ul>
    <p class="es-dica">Faça isso depois de copiar de novo, num momento em que ninguém esteja lançando no sistema antigo. Vale para os dois computadores.</p>
    <button class="btn btn-primary" type="button" data-es="virar" ${ocupado ? 'disabled' : ''}>🔑 Virar a chave</button></div>` : '<p>Disponível depois da cópia dos dados.</p>'}</section>`;
  return `<section class="panel es-etapa is-feito"><span class="eyebrow">PASSO 1 DE 3</span><h2>Banco da plataforma preparado ✓</h2></section>${passo2}${passo3}`;
}

// ---------- visão geral
function valorEstoque(lista) { return lista.reduce((s, p) => { const e = estDe(p.id); return s + Math.max(0, Number(e?.quantidade || 0)) * Number(e?.custo_medio || 0); }, 0); }
function abaixoMinimo(lista) { return lista.filter(p => { const e = estDe(p.id); return Number(e?.estoque_minimo || 0) > 0 && Number(e?.quantidade || 0) <= Number(e?.estoque_minimo || 0); }); }
function festasSemConsumo() {
  const com = new Set(d.eventos.map(e => e.plataforma_evento_id).filter(Boolean));
  const lim = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  return eventosPlataforma().filter(e => ['realizado', 'pronto', 'preparacao'].includes(e.status)).filter(e => { const q = quoteDe(e); return q.data && q.data <= hoje() && q.data >= lim && !com.has(e.id); })
    .sort((a, b) => String(quoteDe(b).data).localeCompare(String(quoteDe(a).data)));
}
function telaVisao() {
  const ps = ativos();
  const baixos = abaixoMinimo(ps);
  const venc = vencendo(d, 30);
  const semConsumo = festasSemConsumo();
  const cards = SETORES.map(([k, nome, ic]) => {
    const l = ps.filter(p => (p.setor || 'bebidas') === k);
    const b = abaixoMinimo(l).length;
    return `<button type="button" class="panel es-setor" data-es="ver-setor" data-setor="${k}"><span class="es-setor__ic">${ic}</span><strong>${nome}</strong><span>${l.length} produto(s)</span><b>${money(valorEstoque(l))}</b>${b ? `<em>${b} abaixo do mínimo</em>` : '<small>em estoque</small>'}</button>`;
  }).join('');
  const tarefas = [];
  semConsumo.slice(0, 4).forEach(e => { const q = quoteDe(e); tarefas.push(`<li><span>🎉 <b>${esc(q.nome || q.cliente)}</b> (${dataBR(q.data)}) ainda não tem consumo lançado</span><button class="btn btn-primary" type="button" data-es="consumo-evento" data-evento="${esc(e.id)}">Lançar consumo</button></li>`); });
  if (baixos.length) tarefas.push(`<li><span>🛒 <b>${baixos.length} produto(s)</b> no estoque mínimo ou abaixo: ${baixos.slice(0, 5).map(p => esc(p.nome)).join(', ')}${baixos.length > 5 ? '…' : ''}</span><button class="btn btn-ghost" type="button" data-es="comprar-baixos">Montar compra</button></li>`);
  if (venc.length) tarefas.push(`<li><span>⏳ <b>${venc.length} lote(s)</b> vencem em até 30 dias: ${venc.slice(0, 4).map(l => `${esc(prodPorId(l.produto_id)?.nome || '')} (${dataBR(l.validade)})`).join(', ')}</span><button class="btn btn-ghost" type="button" data-es="ir" data-aba="produtos">Ver produtos</button></li>`);
  if (!ps.some(p => p.setor && p.setor !== 'bebidas')) tarefas.push(`<li><span>🍽️ Cadastre os produtos de <b>alimentação, decoração e escritório</b> (ou lance a primeira compra e cadastre na hora).</span><button class="btn btn-ghost" type="button" data-es="novo-produto">Cadastrar produto</button></li>`);
  const movs = d.movimentacoes.slice(0, 12).map(m => `<tr><td>${dataBR(m.data_movimento)}</td><td>${esc(prodPorId(m.produto_id)?.nome || `#${m.produto_id}`)}</td><td>${m.tipo === 'entrada' ? '<span class="es-in">entrada</span>' : '<span class="es-out">saída</span>'}</td><td>${qtd(m.quantidade)} ${esc(unidadeDe(m.produto_id))}</td><td>${esc(m.motivo || '')}</td></tr>`).join('');
  return `<section class="es-setores">${cards}</section>
  <section class="panel"><div class="panel-header"><div><h2>O que fazer agora</h2><p>Sugestões a partir das festas, do estoque mínimo e das validades.</p></div></div>
    ${tarefas.length ? `<ul class="es-tarefas">${tarefas.join('')}</ul>` : '<p class="es-ok">✓ Tudo em dia: nenhuma festa sem consumo, nada abaixo do mínimo e nada vencendo.</p>'}</section>
  <section class="panel"><div class="panel-header"><div><h2>Últimas movimentações</h2></div></div>${movs ? `<div class="table-wrap"><table class="bb-table"><thead><tr><th>Data</th><th>Produto</th><th></th><th>Qtd.</th><th>Motivo</th></tr></thead><tbody>${movs}</tbody></table></div>` : '<p>Nenhuma movimentação ainda.</p>'}</section>
  ${(sit?.virada || viradaLocal())?.em ? `<p class="es-dica">Estoque na plataforma desde ${new Date((sit?.virada || viradaLocal()).em).toLocaleDateString('pt-BR')}.</p>` : ''}`;
}

// ---------- filtro de setor
function filtroSetor(extra = '') {
  return `<div class="es-filtro"><div class="ft-filtro" style="border:0;padding:0;margin:0">${[['todos', 'Todos'], ...SETORES].map(([k, t]) => `<button type="button" class="${ui.setor === k ? 'on' : ''}" data-es-setor="${k}">${t}</button>`).join('')}</div>${extra}</div>`;
}

// ---------- produtos
function telaProdutos() {
  const busca = String(ui.busca || '').toLowerCase();
  const lista = d.produtos.filter(doSetor).filter(p => !busca || `${p.nome} ${p.categoria || ''} ${p.codigo_barras || ''}`.toLowerCase().includes(busca))
    .sort((a, b) => (a.ativo === false) - (b.ativo === false) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const linhas = lista.map(p => {
    const e = estDe(p.id); const s = Number(e?.quantidade || 0); const min = Number(e?.estoque_minimo || 0);
    const st = s < 0 ? '<span class="badge badge-alerta">negativo</span>' : min > 0 && s <= min ? '<span class="badge badge-alerta">comprar</span>' : '';
    return `<tr class="${p.ativo === false ? 'es-inativo' : ''}" data-es="editar-produto" data-id="${p.id}"><td><b>${esc(p.nome)}</b>${p.categoria ? `<br><small>${esc(p.categoria)}</small>` : ''}</td><td>${setorIcone(p.setor)} ${esc(setorNome(p.setor))}</td><td>${qtd(s)} ${esc(p.unidade || 'un')} ${st}</td><td>${min ? `${qtd(min)}` : '—'}</td><td>${money(e?.custo_medio)}</td><td>${money(Math.max(0, s) * Number(e?.custo_medio || 0))}</td></tr>`;
  }).join('');
  return `<section class="panel"><div class="panel-header"><div><h2>Produtos</h2><p>Clique num produto para editar, ver o histórico ou dar baixa (quebra, perda, uso interno).</p></div><button class="btn btn-primary" type="button" data-es="novo-produto">＋ Novo produto</button></div>
    ${filtroSetor(`<input class="es-busca" id="esBusca" placeholder="Buscar por nome, categoria ou código" value="${esc(ui.busca || '')}">`)}
    <div class="table-wrap"><table class="bb-table es-tabela-click"><thead><tr><th>Produto</th><th>Setor</th><th>Em estoque</th><th>Mínimo</th><th>Custo médio</th><th>Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="6">Nenhum produto neste filtro.</td></tr>'}</tbody></table></div>
    <p class="es-dica">${lista.length} produto(s) · valor em estoque ${money(valorEstoque(lista))}</p></section>`;
}

function modalProduto(id = null, aoSalvar = null, setorInicial = null) {
  const p = id ? prodPorId(id) : { setor: setorInicial || (ui.setor !== 'todos' ? ui.setor : 'bebidas'), unidade: 'un', fator_compra: 1, tipo_item: 'consumo', ativo: true };
  const e = id ? estDe(id) : null;
  const cats = [...new Set(d.produtos.map(x => x.categoria).filter(Boolean))].sort();
  const movs = id ? d.movimentacoes.filter(m => String(m.produto_id) === String(id)).slice(0, 8) : [];
  const box = document.createElement('div'); box.className = 'lega-modal'; box.id = 'esModal';
  box.innerHTML = `<div class="lega-modal__card es-modal" role="dialog" aria-modal="true"><span class="eyebrow">${id ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</span><h2>${id ? esc(p.nome) : 'Cadastrar produto'}</h2>
    <form id="esProdForm" class="form-grid">
      <div class="field field-full"><label>Nome</label><input name="nome" required value="${esc(p.nome || '')}" placeholder="Ex.: Coxinha congelada, Capa de cilindro rosa, Papel A4"></div>
      <div class="field"><label>Setor</label><select name="setor">${SETORES.map(([k, t]) => `<option value="${k}" ${p.setor === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Categoria (opcional)</label><input name="categoria" list="esCats" value="${esc(p.categoria || '')}" placeholder="Ex.: salgados, refrigerante"><datalist id="esCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>Conta no estoque em</label><select name="unidade">${UNIDADES.map(u => `<option ${p.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="field"><label>Costuma comprar em</label><div class="es-conv"><select name="unidade_compra"><option value="">mesma unidade</option>${UNIDADES.map(u => `<option ${p.unidade_compra === u ? 'selected' : ''}>${u}</option>`).join('')}</select><span>com</span><input name="fator_compra" inputmode="decimal" value="${esc(String(p.fator_compra ?? 1).replace('.', ','))}"><span class="es-conv__un">${esc(p.unidade || 'un')}</span></div><small>Ex.: compra em <b>kg</b> e conta em <b>un</b>: 1 kg ≈ 40 un.</small></div>
      <div class="field field-full"><label>Tipo de item</label><div class="es-tipos">${TIPOS_ITEM.map(([k, t, desc]) => `<label class="es-tipo ${p.tipo_item === k ? 'on' : ''}"><input type="radio" name="tipo_item" value="${k}" ${p.tipo_item === k ? 'checked' : ''}><b>${t}</b><small>${desc}</small></label>`).join('')}</div></div>
      <div class="field"><label>Estoque mínimo (avisa para comprar)</label><input name="estoque_minimo" inputmode="decimal" value="${esc(String(e?.estoque_minimo ?? 0).replace('.', ','))}"></div>
      <div class="field"><label>Situação</label><select name="ativo"><option value="1" ${p.ativo !== false ? 'selected' : ''}>Em uso</option><option value="0" ${p.ativo === false ? 'selected' : ''}>Não uso mais (esconder)</option></select></div>
      <div class="field es-so-bebidas"><label>Consumo conta para</label><select name="somente_adultos"><option value="" ${p.somente_adultos == null ? 'selected' : ''}>Automático pelo nome</option><option value="1" ${p.somente_adultos === true ? 'selected' : ''}>Só adultos</option><option value="0" ${p.somente_adultos === false ? 'selected' : ''}>Adultos e crianças</option></select></div>
      <div class="field es-so-bebidas"><label>Volume (litros, opcional)</label><input name="volume_litros" inputmode="decimal" value="${esc(p.volume_litros == null ? '' : String(p.volume_litros).replace('.', ','))}" placeholder="Ex.: 2"></div>
      ${bancoV2() ? (() => { const ap = id ? aprendizado(d, id) : { n: 0 }; const min = Number(p.minimo_aprendizado || 50); return `<div class="field field-full es-unid ${p.conta_unidades ? 'on' : ''}"><label class="es-check"><input type="checkbox" name="conta_unidades" ${p.conta_unidades ? 'checked' : ''}> 🍽️ A cozinha conta este produto em <b>unidades</b> (ex.: salgados)</label>
        <small>No consumo da festa vocês informam as unidades e o peso aproximado. A plataforma aprende quantas unidades vêm por <span class="es-conv__un">${esc(p.unidade || 'un')}</span> e, depois de</small>
        <div class="es-conv"><input name="minimo_aprendizado" inputmode="numeric" value="${min}"><span>lançamentos, passa a sugerir o peso sozinha.</span></div>
        ${id && p.conta_unidades ? `<p class="es-dica">${ap.n ? `Média até agora: <b>${qtd(ap.unPorPeso, 1)} un por ${esc(p.unidade)}</b> em ${ap.n} lançamento(s)${ap.n >= min ? ' ✓ já sugerindo' : ` · faltam ${min - ap.n} para sugerir`}.` : 'Ainda sem lançamentos com unidades.'}</p>` : ''}</div>`; })() : ''}
      <div class="field field-full"><label>Observação</label><input name="observacao" value="${esc(p.observacao || '')}"></div>
      <div class="field field-full form-actions"><button type="button" class="btn btn-ghost" data-m="fechar">Cancelar</button><button class="btn btn-primary">${id ? 'Salvar' : 'Cadastrar'}</button></div>
    </form>
    ${id ? `<details class="es-baixa"><summary>➖ Dar baixa (quebra, perda, uso interno)</summary><form id="esBaixaForm" class="form-grid"><div class="field"><label>Quantidade que saiu (${esc(p.unidade || 'un')})</label><input name="quantidade" inputmode="decimal" required></div><div class="field"><label>Motivo</label><select name="motivo"><option>Quebra / avaria</option><option>Vencido</option><option>Uso interno</option><option>Doação / cortesia</option><option>Ajuste manual</option></select></div><div class="field field-full"><label>Observação</label><input name="observacao"></div><div class="field field-full form-actions"><button class="btn btn-ghost">Registrar baixa</button></div><p class="es-dica field-full">Em estoque agora: <b>${qtd(e?.quantidade)} ${esc(p.unidade || 'un')}</b></p></form></details>
    ${(() => { const ls = d.lotes.filter(l => String(l.produto_id) === String(id) && Number(l.quantidade_disponivel) > 0); const soma = ls.reduce((s0, l) => s0 + Number(l.quantidade_disponivel), 0); const sem = Number(e?.quantidade || 0) - soma;
      return `<div class="es-hist"><h3>Lotes em estoque <small>(saem do mais antigo para o mais novo)</small></h3>${ls.length ? `<table class="bb-table es-lotes"><thead><tr><th>Lote</th><th>Disponível</th><th>Custo unit.</th><th>Validade</th><th></th></tr></thead><tbody>${ls.map(l => `<tr><td>${esc(rotuloLote(l))}</td><td>${qtd(l.quantidade_disponivel)} de ${qtd(l.quantidade_original)}</td><td>${money(l.custo_unitario)}</td><td>${l.validade ? dataBR(l.validade) : '—'}</td><td><button type="button" class="btn btn-ghost btn-sm" data-lote-custo="${l.id}" data-atual="${Number(l.custo_unitario || 0)}">Corrigir custo</button></td></tr>`).join('')}</tbody></table>` : '<p class="es-dica">Nenhum lote com saldo.</p>'}
        ${Math.abs(sem) > 0.0005 ? `<p class="es-alerta">${sem > 0 ? `${qtd(sem)} ${esc(p.unidade || 'un')} em estoque sem lote: essas saem pelo custo médio (${money(e?.custo_medio)}).` : `Os lotes somam ${qtd(-sem)} a mais que o estoque.`} Uma conferência do produto acerta isso.</p>` : ''}
        <p class="es-dica">Custo médio ${money(e?.custo_medio)} (calculado na última compra; o custo das festas usa os lotes acima). <button type="button" class="btn btn-ghost btn-sm" data-recalc-medio>Recalcular pelos lotes</button></p></div>`; })()}
    <div class="es-hist"><h3>Últimas movimentações</h3>${movs.length ? `<ul>${movs.map(m => `<li>${dataBR(m.data_movimento)} · ${m.tipo === 'entrada' ? '＋' : '−'}${qtd(m.quantidade)} · ${esc(m.motivo || m.tipo)}</li>`).join('')}</ul>` : '<p class="es-dica">Nenhuma ainda.</p>'}</div>` : ''}
  </div>`;
  document.body.appendChild(box);
  const f = box.querySelector('#esProdForm');
  const atualizarSetor = () => { box.querySelectorAll('.es-so-bebidas').forEach(x => x.hidden = f.setor.value !== 'bebidas'); box.querySelectorAll('.es-conv__un').forEach(x => x.textContent = f.unidade.value); const u = box.querySelector('.es-unid'); if (u) u.style.display = f.unidade.value === 'un' ? 'none' : ''; };
  atualizarSetor(); f.setor.onchange = atualizarSetor; f.unidade.onchange = atualizarSetor;
  box.querySelectorAll('.es-tipo input').forEach(r => r.onchange = () => box.querySelectorAll('.es-tipo').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  const fechar = () => box.remove();
  box.querySelector('[data-m="fechar"]').onclick = fechar;
  box.onclick = ev => { if (ev.target === box) fechar(); };
  f.conta_unidades?.addEventListener('change', () => box.querySelector('.es-unid')?.classList.toggle('on', f.conta_unidades.checked));
  f.onsubmit = async ev => {
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    const fator = numero(v.fator_compra); const minimo = numero(v.estoque_minimo); const vol = numero(v.volume_litros);
    if (!v.nome.trim()) return alert('Informe o nome.');
    if (v.unidade_compra && !(fator > 0)) return alert('Informe quantas unidades vêm em cada unidade de compra.');
    const linha = { nome: v.nome.trim(), setor: v.setor, categoria: v.categoria.trim() || null, unidade: v.unidade, unidade_compra: v.unidade_compra || null, fator_compra: v.unidade_compra ? fator : 1,
      tipo_item: v.tipo_item || 'consumo', ativo: v.ativo === '1', observacao: v.observacao.trim() || null, updated_at: new Date().toISOString(),
      ...(bancoV2() ? { conta_unidades: !!f.conta_unidades?.checked && v.unidade !== 'un', minimo_aprendizado: Math.max(1, Math.round(numero(v.minimo_aprendizado) || 50)) } : {}),
      ...(v.setor === 'bebidas' ? { somente_adultos: v.somente_adultos === '' ? null : v.somente_adultos === '1', volume_litros: vol > 0 ? vol : null } : {}) };
    const btn = f.querySelector('.btn-primary'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      let pid = id;
      if (id) await platRest('PATCH', `est_produtos?id=eq.${id}`, linha, 'return=minimal');
      else { const r = await platRest('POST', 'est_produtos', [linha], 'return=representation'); pid = r?.[0]?.id; }
      if (pid != null && Number.isFinite(minimo)) await platRest('PATCH', `est_estoque?produto_id=eq.${pid}`, { estoque_minimo: Math.max(0, minimo) }, 'return=minimal');
      await recarregarDados(); fechar();
      if (aoSalvar) aoSalvar(pid); else { aviso = { tipo: 'ok', texto: `✓ ${esc(linha.nome)} ${id ? 'atualizado' : 'cadastrado'}.` }; desenhar(); }
    } catch (e) { btn.disabled = false; btn.textContent = id ? 'Salvar' : 'Cadastrar'; alert(`Não foi possível salvar: ${e.message}`); }
  };
  const recalcularMedio = async () => {
    const ls = d.lotes.filter(l => String(l.produto_id) === String(id) && Number(l.quantidade_disponivel) > 0);
    const q = ls.reduce((s0, l) => s0 + Number(l.quantidade_disponivel), 0);
    const medio = q > 0 ? ls.reduce((s0, l) => s0 + Number(l.quantidade_disponivel) * Number(l.custo_unitario || 0), 0) / q : Number(e?.custo_medio || 0);
    await platRest('PATCH', `est_estoque?produto_id=eq.${id}`, { custo_medio: Number(medio.toFixed(4)), updated_at: new Date().toISOString() }, 'return=minimal');
    return medio;
  };
  box.querySelectorAll('[data-lote-custo]').forEach(b => b.onclick = async () => {
    const v = prompt('Custo correto por unidade deste lote (R$). Ex.: 0 para bonificação.', String(b.dataset.atual).replace('.', ','));
    if (v === null) return; const n = numero(v); if (!(n >= 0)) return alert('Valor inválido.');
    try { await platRest('PATCH', `est_lotes?id=eq.${b.dataset.loteCusto}`, { custo_unitario: n, updated_at: new Date().toISOString() }, 'return=minimal'); await recarregarDados(); await recalcularMedio(); await recarregarDados(); box.remove(); aviso = { tipo: 'ok', texto: `✓ Custo do lote corrigido para ${money(n)}; custo médio recalculado.` }; desenhar(); modalProduto(id); }
    catch (err) { alert(err.message); }
  });
  box.querySelector('[data-recalc-medio]')?.addEventListener('click', async () => { try { const m = await recalcularMedio(); await recarregarDados(); box.remove(); aviso = { tipo: 'ok', texto: `✓ Custo médio de ${esc(p.nome)} recalculado: ${money(m)}.` }; desenhar(); modalProduto(id); } catch (err) { alert(err.message); } });
  box.querySelector('#esBaixaForm')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(ev.currentTarget).entries()); const q = numero(v.quantidade);
    if (!(q > 0)) return alert('Informe a quantidade.');
    try { await rpc('est_baixa_manual', { p: { produto_id: id, quantidade: q, motivo: v.motivo, observacao: v.observacao } }); await recarregarDados(); fechar(); aviso = { tipo: 'ok', texto: `✓ Baixa de ${qtd(q)} ${esc(p.unidade || 'un')} de ${esc(p.nome)} registrada.` }; desenhar(); }
    catch (e) { alert(e.message); }
  });
  setTimeout(() => f.nome.focus(), 30);
}

// ---------- receitas (fichas técnicas dos extras)
function custoPorcao(r) { return (r.itens || []).reduce((s, i) => s + Number(i.quantidade || 0) * Number(estDe(i.produto_id)?.custo_medio || 0), 0); }
function usoReceita(rid) {
  const evs = d.eventos.filter(e => (e.receitas || []).some(x => String(x.receita_id) === String(rid)));
  const porcoes = evs.reduce((a, e) => a + (e.receitas || []).filter(x => String(x.receita_id) === String(rid)).reduce((b, x) => b + Number(x.porcoes || 0), 0), 0);
  return { festas: evs.length, porcoes };
}
function telaReceitas() {
  if (!bancoV3()) return '<section class="panel empty-state"><h3>Receitas precisam da atualização do banco.</h3><p>Use o aviso amarelo acima: copiar o texto e rodar no Supabase.</p></section>';
  const lista = (d.receitas || []).slice().sort((a, b) => (a.ativo === false) - (b.ativo === false) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const cards = lista.map(r => { const u = usoReceita(r.id); return `<button type="button" class="panel es-receita ${r.ativo === false ? 'es-inativo' : ''}" data-es="editar-receita" data-id="${r.id}">
    <strong>${esc(r.nome)}</strong><span>Custo por ${esc(r.rendimento || 'porção')}: <b>${money(custoPorcao(r))}</b></span>
    <small>${(r.itens || []).map(i => `${qtd(i.quantidade)} ${esc(unidadeDe(i.produto_id))} ${esc(prodPorId(i.produto_id)?.nome || '?')}`).join(' · ') || 'Sem ingredientes'}</small>
    ${u.festas ? `<em>${u.festas} festa(s) · ${qtd(u.porcoes, 0)} ${esc(r.rendimento || 'porção')}(s)</em>` : ''}</button>`; }).join('');
  return `<section class="panel"><div class="panel-header"><div><h2>Receitas dos extras</h2><p>Cachorro-quente, cumbucas e outros extras feitos com ingredientes do estoque. No consumo da festa vocês informam só as porções, e a plataforma baixa cada ingrediente.</p></div><button class="btn btn-primary" type="button" data-es="nova-receita">＋ Nova receita</button></div>
    ${cards ? `<div class="es-receitas">${cards}</div>` : '<p class="es-dica">Nenhuma receita ainda. Ex.: <b>Cachorro-quente</b> = 1 pão + 0,06 kg de salsicha + 0,03 kg de molho, por porção.</p>'}</section>`;
}
function modalReceita(id = null) {
  const r = id ? (d.receitas || []).find(x => String(x.id) === String(id)) : { nome: '', rendimento: 'porção', itens: [], ativo: true };
  let itens = (r.itens || []).map(i => ({ produto_id: i.produto_id, texto: prodPorId(i.produto_id) ? rotuloProduto(prodPorId(i.produto_id)) : '', quantidade: String(i.quantidade ?? '').replace('.', ',') }));
  if (!itens.length) itens = [{ produto_id: '', texto: '', quantidade: '' }];
  const box = document.createElement('div'); box.className = 'lega-modal'; box.id = 'esModal';
  let redesenhando = false;
  const desenharM = () => {
    if (redesenhando) return; redesenhando = true;
    try { const a = document.activeElement; if (a && box.contains(a)) a.blur(); desenharMInterno(); } finally { redesenhando = false; }
  };
  const desenharMInterno = () => {
    const custo = itens.reduce((s, i) => s + (numero(i.quantidade) || 0) * Number(estDe(i.produto_id)?.custo_medio || 0), 0);
    box.innerHTML = `<div class="lega-modal__card es-modal" role="dialog" aria-modal="true"><span class="eyebrow">${id ? 'EDITAR RECEITA' : 'NOVA RECEITA'}</span><h2>${id ? esc(r.nome) : 'Receita de extra'}</h2>
      <form id="esRecForm" class="form-grid">
        <div class="field"><label>Nome</label><input name="nome" required value="${esc(r.nome || '')}" placeholder="Ex.: Cachorro-quente"></div>
        <div class="field"><label>Os ingredientes abaixo são para 1</label><select name="rendimento">${['porção', 'unidade', 'convidado'].map(x => `<option ${r.rendimento === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <datalist id="esListaIng">${ativos().filter(p => p.tipo_item !== 'reutilizavel').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(p => `<option value="${esc(rotuloProduto(p))}">`).join('')}</datalist>
        <div class="field field-full"><label>Ingredientes</label><div class="es-ings">${itens.map((i, ix) => { const p = prodPorId(i.produto_id); return `<div class="es-ing" data-ix="${ix}"><input list="esListaIng" data-r="texto" value="${esc(i.texto)}" placeholder="Produto do estoque"><input data-r="quantidade" inputmode="decimal" value="${esc(i.quantidade)}" placeholder="qtd."><span>${p ? esc(p.unidade || 'un') : ''}</span><button type="button" class="es-x" data-r="tirar">✕</button></div>${i.texto && !p ? '<small class="es-alerta">Produto não encontrado: cadastre em Produtos.</small>' : ''}`; }).join('')}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-r="mais">＋ Ingrediente</button><p class="es-dica">Custo de 1 ${esc(r.rendimento || 'porção')} hoje (custo médio): <b>${money(custo)}</b></p></div>
        <div class="field"><label>Situação</label><select name="ativo"><option value="1" ${r.ativo !== false ? 'selected' : ''}>Em uso</option><option value="0" ${r.ativo === false ? 'selected' : ''}>Não uso mais</option></select></div>
        <div class="field"><label>Observação</label><input name="observacao" value="${esc(r.observacao || '')}"></div>
        <div class="field field-full form-actions"><button type="button" class="btn btn-ghost" data-m="fechar">Cancelar</button><button class="btn btn-primary">${id ? 'Salvar' : 'Cadastrar receita'}</button></div>
      </form></div>`;
    const f = box.querySelector('#esRecForm');
    const lerTopo = () => { r.nome = f.nome.value; r.rendimento = f.rendimento.value; r.ativo = f.ativo.value === '1'; r.observacao = f.observacao.value; };
    box.querySelectorAll('.es-ing').forEach(el => {
      const it = itens[Number(el.dataset.ix)];
      el.querySelector('[data-r="texto"]').onchange = ev => { lerTopo(); it.texto = ev.target.value; const p = acharProduto(ev.target.value); it.produto_id = p ? p.id : ''; if (p) it.texto = rotuloProduto(p); desenharM(); box.querySelector(`.es-ing[data-ix="${el.dataset.ix}"] [data-r="quantidade"]`)?.focus(); };
      el.querySelector('[data-r="quantidade"]').onchange = ev => { lerTopo(); it.quantidade = ev.target.value; desenharM(); };
      el.querySelector('[data-r="tirar"]').onclick = () => { lerTopo(); itens.splice(Number(el.dataset.ix), 1); if (!itens.length) itens.push({ produto_id: '', texto: '', quantidade: '' }); desenharM(); };
    });
    box.querySelector('[data-r="mais"]').onclick = () => { lerTopo(); itens.push({ produto_id: '', texto: '', quantidade: '' }); desenharM(); [...box.querySelectorAll('[data-r="texto"]')].at(-1)?.focus(); };
    box.querySelector('[data-m="fechar"]').onclick = () => box.remove();
    f.onsubmit = async ev => {
      ev.preventDefault(); lerTopo();
      const validos = itens.filter(i => i.texto || i.quantidade);
      if (!r.nome.trim()) return alert('Informe o nome da receita.');
      if (validos.some(i => !i.produto_id)) return alert('Há ingrediente que não é produto do estoque.');
      if (validos.some(i => !(numero(i.quantidade) > 0))) return alert('Informe a quantidade de cada ingrediente (ex.: 1 ou 0,06).');
      if (!validos.length) return alert('Adicione pelo menos um ingrediente.');
      const linha = { nome: r.nome.trim(), rendimento: r.rendimento, ativo: r.ativo, observacao: (r.observacao || '').trim() || null, itens: validos.map(i => ({ produto_id: Number(i.produto_id), quantidade: numero(i.quantidade) })), updated_at: new Date().toISOString() };
      try {
        if (id) await platRest('PATCH', `est_receitas?id=eq.${id}`, linha, 'return=minimal'); else await platRest('POST', 'est_receitas', [linha], 'return=minimal');
        await recarregarDados(); box.remove(); aviso = { tipo: 'ok', texto: `✓ Receita ${esc(linha.nome)} salva.` }; desenhar();
      } catch (e) { alert(`Não foi possível salvar: ${e.message}`); }
    };
  };
  document.body.appendChild(box); desenharM();
  box.onclick = ev => { if (ev.target === box) box.remove(); };
}

// ---------- seletor de produto (nome ou código de barras)
function rotuloProduto(p) { return `${p.nome} · ${setorNome(p.setor)}`; }
function opcoesProdutos(setor) {
  return ativos().filter(p => !setor || setor === 'todos' || p.setor === setor).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(p => `<option value="${esc(rotuloProduto(p))}">`).join('');
}
const normBusca = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function acharProduto(texto, { aproximado = true } = {}) {
  const t = String(texto || '').trim(); if (!t) return null;
  const l = t.toLowerCase();
  const exato = d.produtos.find(p => rotuloProduto(p).toLowerCase() === l) || d.produtos.find(p => String(p.nome).toLowerCase() === l)
    || d.produtos.find(p => p.codigo_barras && String(p.codigo_barras) === t)
    || prodPorId(d.codigos.find(c => String(c.codigo_barras) === t)?.produto_id);
  if (exato || !aproximado) return exato || null;
  // aproximado: mesmo nome sem acento/pontuação, ou um único produto que contém o que foi digitado, ou palavras em comum (nota fiscal)
  const alvo = normBusca(t.replace(/ · .*$/, '')); if (alvo.length < 3) return null;
  const lista = ativos();
  const igual = lista.find(p => normBusca(p.nome) === alvo); if (igual) return igual;
  const contem = lista.filter(p => normBusca(p.nome).includes(alvo) || alvo.includes(normBusca(p.nome)));
  if (contem.length === 1) return contem[0];
  const pal = alvo.split(' ');
  const pontos = lista.map(p => { const pp = normBusca(p.nome).split(' '); const comuns = pal.filter(w => w.length > 1 && pp.includes(w)).length; return { p, ok: pp.length && comuns >= Math.max(2, Math.ceil(pp.length * 0.6)), comuns }; }).filter(x => x.ok).sort((a, b) => b.comuns - a.comuns);
  return pontos.length && (pontos.length === 1 || pontos[0].comuns > pontos[1].comuns) ? pontos[0].p : null;
}

// ---------- compras
function novaCompra(itens = []) { return { data: hoje(), fornecedor: '', forma: '', eventoId: '', observacao: '', itens: itens.length ? itens : [itemCompraVazio()] }; }
function itemCompraVazio(p = null) { return { produto_id: p?.id ?? '', texto: p ? rotuloProduto(p) : '', quantidade: '', unidade: p ? (p.unidade_compra || p.unidade || 'un') : 'un', fator: p ? (p.unidade_compra ? Number(p.fator_compra || 1) : 1) : 1, valor: '', valorUn: '', origem: '', validade: '' }; }
const fmtNum = v => v === '' || v == null || !Number.isFinite(Number(v)) ? '' : String(Number(Number(v).toFixed(2))).replace('.', ',');

function telaCompras() {
  const aberta = !!compra;
  const lista = d.compras.filter(c => ui.setor === 'todos' || d.comprasItens.some(i => String(i.compra_id) === String(c.id) && setorDe(i.produto_id) === ui.setor)).slice(0, 60);
  const linhas = lista.map(c => {
    const its = d.comprasItens.filter(i => String(i.compra_id) === String(c.id));
    const setores = [...new Set(its.map(i => setorDe(i.produto_id)))].map(setorIcone).join(' ');
    return `<details class="es-compra"><summary><span>${dataBR(c.data)}</span><b>${esc(c.fornecedor || 'Sem fornecedor')}</b><span>${setores} ${its.length} item(ns)</span><strong>${money(c.valor_total)}</strong></summary>
      <table class="bb-table"><tbody>${its.map(i => `<tr><td>${esc(prodPorId(i.produto_id)?.nome || `#${i.produto_id}`)}</td><td>${i.quantidade_compra != null && i.unidade_compra && i.unidade_compra !== unidadeDe(i.produto_id) ? `${qtd(i.quantidade_compra)} ${esc(i.unidade_compra)} = ` : ''}${qtd(i.quantidade)} ${esc(unidadeDe(i.produto_id))}</td><td>${money(i.valor_total)}</td><td>${i.validade ? `val. ${dataBR(i.validade)}` : ''}</td></tr>`).join('')}</tbody></table>
      ${c.observacao ? `<p class="es-dica">${esc(c.observacao)}</p>` : ''}${c.plataforma_evento_id ? `<p class="es-dica">Para a festa: ${esc(nomeEventoPlat(c.plataforma_evento_id))}</p>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-es="excluir-compra" data-id="${c.id}">Excluir compra</button></details>`;
  }).join('');
  return `${aberta ? formCompra() : `<section class="panel guide-card"><div><h2>Lançar uma compra</h2><p>Nota de mercado, atacado ou fornecedor: cada item entra no estoque com seu custo (e validade, se tiver).</p></div><div class="guide-card__actions"><button class="btn btn-primary" type="button" data-es="nova-compra">＋ Lançar compra</button></div></section>`}
  <section class="panel"><div class="panel-header"><div><h2>Compras lançadas</h2></div></div>${filtroSetor()}${linhas || '<p>Nenhuma compra neste filtro.</p>'}</section>`;
}
function nomeEventoPlat(id) { const e = eventosPlataforma().find(x => x.id === id); if (!e) return id; const q = quoteDe(e); return `${q.nome || q.cliente || 'Festa'} (${dataBR(q.data)})`; }
function opcoesEventosPlat(sel, { passados = true, futuros = true } = {}) {
  const evs = eventosPlataforma().filter(e => e.status !== 'perdido' && e.status !== 'orcamento').map(e => ({ e, q: quoteDe(e) })).filter(({ q }) => q.data && ((passados && q.data <= hoje()) || (futuros && q.data >= hoje())))
    .sort((a, b) => Math.abs(new Date(a.q.data) - new Date()) - Math.abs(new Date(b.q.data) - new Date())).slice(0, 40);
  return evs.map(({ e, q }) => `<option value="${esc(e.id)}" ${sel === e.id ? 'selected' : ''}>${dataBR(q.data)} · ${esc(q.nome || q.cliente || 'Festa')}</option>`).join('');
}
function calcItemCompra(it) {
  const p = prodPorId(it.produto_id); const q = numero(it.quantidade); const f = Number(it.fator || 1); const v = numero(it.valor);
  if (!p || !(q > 0)) return '';
  return `= <b>${qtd(q * f)} ${esc(p.unidade || 'un')}</b> no estoque${v > 0 ? ` · ${money(v / (q * f))} por ${esc(p.unidade || 'un')}` : ''}`;
}
function formCompra() {
  const c = compra;
  const fornecedores = [...new Set(d.compras.map(x => x.fornecedor).filter(Boolean))].sort();
  const total = c.itens.reduce((s, i) => s + (numero(i.valor) || 0), 0);
  const itens = c.itens.map((it, ix) => {
    const p = prodPorId(it.produto_id);
    return `<div class="es-item es-item--compra" data-ix="${ix}">
      <div class="field es-item__prod"><label>Produto</label><input list="esListaProd" data-c="texto" value="${esc(it.texto)}" placeholder="Nome ou código de barras" autocomplete="off">${p ? `<small>${setorIcone(p.setor)} ${esc(setorNome(p.setor))} · em estoque ${qtd(saldoDe(p.id))} ${esc(p.unidade || 'un')}</small>` : it.texto ? '<small class="es-alerta">Não achei este produto. <a href="#" data-es="cadastrar-do-item">Cadastrar “' + esc(it.texto) + '”</a></small>' : ''}</div>
      <div class="field es-item__q"><label>Quantidade</label><div class="es-conv"><input data-c="quantidade" inputmode="decimal" value="${esc(it.quantidade)}"><select data-c="unidade">${[...new Set([it.unidade, p?.unidade || 'un', ...UNIDADES])].map(u => `<option ${u === it.unidade ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        ${p && it.unidade !== (p.unidade || 'un') ? `<div class="es-conv es-conv--fator"><span>1 ${esc(it.unidade)} =</span><input data-c="fator" inputmode="decimal" value="${esc(String(it.fator).replace('.', ','))}"><span>${esc(p.unidade || 'un')}</span></div>` : ''}</div>
      <div class="field es-item__vu"><label>Valor por ${esc(it.unidade || 'un')}</label><input data-c="valorUn" inputmode="decimal" value="${esc(it.valorUn)}" placeholder="R$"></div>
      <div class="field es-item__v"><label>Total do item</label><input data-c="valor" inputmode="decimal" value="${esc(it.valor)}" placeholder="R$"></div>
      <div class="field es-item__val"><label>Validade</label><input type="date" data-c="validade" value="${esc(it.validade)}"></div>
      <small class="es-item__calc" data-calc>${calcItemCompra(it)}</small>
      <button type="button" class="es-x" data-es="tirar-item" title="Tirar item">✕</button></div>`;
  }).join('');
  return `<section class="panel es-form"><div class="panel-header"><div><span class="eyebrow">NOVA COMPRA</span><h2>Lançar compra</h2></div><button class="btn btn-ghost" type="button" data-es="cancelar-compra">Cancelar</button></div>
    <div class="es-nota"><label class="btn btn-primary es-nota__btn">📷 Ler a nota pela foto<input type="file" id="cFotoNota" accept="image/*" capture="environment" hidden></label><span id="cNotaStatus" class="es-dica">Tire uma foto da nota ou do cupom: a plataforma preenche loja, data e itens. Depois é só conferir.</span></div>
    <div class="form-grid">
      <div class="field"><label>Data da compra</label><input type="date" id="cData" value="${esc(c.data)}" max="${hoje()}"></div>
      <div class="field"><label>Fornecedor / loja</label><input id="cFornecedor" list="esForn" value="${esc(c.fornecedor)}" placeholder="Ex.: Atacadão"><datalist id="esForn">${fornecedores.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="field"><label>Pagamento (opcional)</label><select id="cForma">${['', 'PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'A prazo'].map(x => `<option ${x === c.forma ? 'selected' : ''} value="${x}">${x || '—'}</option>`).join('')}</select></div>
      <div class="field"><label>Comprado para uma festa? (opcional)</label><select id="cEvento"><option value="">Não, vai para o estoque geral</option>${opcoesEventosPlat(c.eventoId)}</select></div>
    </div>
    <datalist id="esListaProd">${opcoesProdutos()}</datalist>
    <div class="es-itens">${itens}</div>
    <div class="es-form__rodape"><div><button class="btn btn-ghost" type="button" data-es="mais-item">＋ Outro item</button><button class="btn btn-ghost" type="button" data-es="novo-produto-compra">Cadastrar produto novo</button></div>
      <div class="es-total">Total da compra <strong data-total-compra>${money(total)}</strong></div></div>
    <p class="es-dica">Dica: <b>Enter</b> passa para o próximo campo; no último, abre um novo item.</p>
    <div class="field"><label>Observação (opcional)</label><input id="cObs" value="${esc(c.observacao)}" placeholder="Ex.: nota 1234"></div>
    <div class="es-acoes"><button class="btn btn-primary" type="button" data-es="salvar-compra" ${ocupado ? 'disabled' : ''}>Salvar compra e dar entrada no estoque</button></div></section>`;
}
function lerCabecalhoCompra(root) {
  if (!compra) return;
  compra.data = root.querySelector('#cData')?.value || compra.data;
  compra.fornecedor = root.querySelector('#cFornecedor')?.value ?? compra.fornecedor;
  compra.forma = root.querySelector('#cForma')?.value ?? compra.forma;
  compra.eventoId = root.querySelector('#cEvento')?.value ?? compra.eventoId;
  compra.observacao = root.querySelector('#cObs')?.value ?? compra.observacao;
}
// ---------- leitura da nota por foto (usa a mesma leitura por IA do controle de bebidas)
const NOTA_URL = () => readJSON('lega.estoque.notaUrl', null) || 'https://controlebebidaslega.netlify.app/.netlify/functions/ler-nota';
function reduzirFoto(arquivo, max = 1600, qualidade = 0.82) {
  return new Promise((ok, erro) => { const url = URL.createObjectURL(arquivo); const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', qualidade).split(',')[1]); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não consegui abrir a foto.')); }; img.src = url; });
}
async function lerNotaPorFoto(root, input) {
  const arq = input.files?.[0]; if (!arq) return;
  const msg = (t, cls = '') => { const st = root.querySelector('#cNotaStatus'); if (st) { st.className = `es-dica ${cls}`; st.innerHTML = t; } };
  lerCabecalhoCompra(root);
  try {
    let token = await bebidasBanco.tokenAcesso();
    if (!token) { msg('Para ler notas, entre uma vez com o <b>login do controle de bebidas</b>: <input id="cNotaEmail" type="email" placeholder="e-mail"> <input id="cNotaSenha" type="password" placeholder="senha"> <button type="button" class="btn btn-ghost btn-sm" id="cNotaEntrar">Entrar e ler</button>');
      root.querySelector('#cNotaEntrar').onclick = async () => { try { await bebidasBanco.entrar(root.querySelector('#cNotaEmail').value.trim(), root.querySelector('#cNotaSenha').value); lerNotaPorFoto(root, input); } catch (e) { alert(e.message); } };
      return; }
    msg('📷 Lendo a nota… leva uns 10 segundos.');
    const base64 = await reduzirFoto(arq);
    const r = await fetch(NOTA_URL(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ imagem_base64: base64, mime_type: 'image/jpeg' }) }).catch(() => null);
    if (!r) throw new Error('Não consegui falar com o serviço de leitura de notas (internet ou endereço do controle de bebidas).');
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || `Falha na leitura (${r.status}).`);
    if (dados.fornecedor && !compra.fornecedor) compra.fornecedor = dados.fornecedor;
    if (dados.data && dados.data <= hoje()) compra.data = dados.data;
    const itens = (Array.isArray(dados.itens) ? dados.itens : []).filter(i => Number(i.quantidade) > 0);
    let achados = 0;
    const novos = itens.map(i => { const p = acharProduto(i.nome); if (p) achados++; const q = Number(i.quantidade); const un = Number(i.valor_unitario || 0);
      return { ...itemCompraVazio(p), ...(p ? { unidade: p.unidade || 'un', fator: 1 } : { texto: i.nome || '' }), quantidade: fmtNum(q), valorUn: fmtNum(un), valor: fmtNum(q * un), origem: 'un' }; });
    compra.itens = [...compra.itens.filter(i => i.texto || i.quantidade || i.valor), ...novos];
    if (!compra.itens.length) compra.itens = [itemCompraVazio()];
    desenhar();
    msg(itens.length ? `✓ ${itens.length} item(ns) lidos da nota${achados < itens.length ? `; <b>${itens.length - achados}</b> não bateram com produtos cadastrados (em laranja: escolha o produto ou cadastre)` : ''}. Confira quantidades e valores antes de salvar.` : 'Não encontrei itens legíveis. Tente outra foto, com mais luz e a nota inteira.', itens.length ? 'es-ok' : 'es-alerta');
  } catch (e) { msg(`Não foi possível ler a nota: ${esc(e.message)} Você pode digitar os itens normalmente.`, 'es-alerta'); }
  finally { input.value = ''; }
}

async function salvarCompra(root) {
  lerCabecalhoCompra(root);
  const c = compra;
  const itens = c.itens.filter(i => i.texto || i.quantidade || i.valor);
  if (!c.data) return alert('Informe a data da compra.');
  if (c.data > hoje()) return alert('A data da compra não pode ser no futuro.');
  if (!itens.length) return alert('Adicione pelo menos um item.');
  for (const i of itens) {
    if (!i.produto_id) return alert(`Produto não encontrado: “${i.texto}”. Escolha da lista ou cadastre o produto.`);
    if (!(numero(i.quantidade) > 0)) return alert(`Informe a quantidade de ${prodPorId(i.produto_id)?.nome}.`);
    if (!(numero(i.valor) >= 0)) return alert(`Informe o valor total de ${prodPorId(i.produto_id)?.nome} (pode ser 0).`);
    if (!(Number(i.fator) > 0)) return alert(`Informe a conversão de unidade de ${prodPorId(i.produto_id)?.nome}.`);
  }
  const payload = { data: c.data, fornecedor: c.fornecedor.trim(), forma_pagamento: c.forma, observacao: c.observacao.trim(), plataforma_evento_id: c.eventoId || null,
    itens: itens.map(i => ({ produto_id: Number(i.produto_id), quantidade_compra: numero(i.quantidade), unidade_compra: i.unidade, fator: Number(i.fator) || 1, valor_total: numero(i.valor) || 0, validade: i.validade || null })) };
  ocupado = true; desenhar();
  try {
    await rpc('est_registrar_compra', { p: payload });
    // lembra a conversão usada para a próxima compra do produto
    for (const i of itens) {
      const p = prodPorId(i.produto_id);
      if (p && i.unidade !== (p.unidade || 'un') && (p.unidade_compra !== i.unidade || Number(p.fator_compra) !== Number(i.fator)))
        await platRest('PATCH', `est_produtos?id=eq.${p.id}`, { unidade_compra: i.unidade, fator_compra: Number(i.fator) }, 'return=minimal').catch(() => { });
    }
    const total = payload.itens.reduce((s, i) => s + i.valor_total, 0);
    if (c.eventoId) anotarNoEvento(c.eventoId, 'Compra para a festa', `${c.fornecedor || 'Compra'} · ${money(total)}`);
    compra = null; await recarregarDados();
    aviso = { tipo: 'ok', texto: `✓ Compra salva: ${payload.itens.length} item(ns), ${money(total)}. O estoque já foi atualizado.` };
  } catch (e) { aviso = { tipo: 'erro', texto: `Não foi possível salvar a compra: ${esc(e.message)}` }; }
  ocupado = false; desenhar(); window.scrollTo(0, 0);
}

// ---------- consumo das festas
function novoConsumo(eventoPlataforma = '') {
  const c = { id: null, eventoPlataforma, nome: '', data: hoje(), adultos: '', criancas: '', tipo: 'fechada', alcool: 'sem_adesao', rolha: false, valorRolha: '', observacao: '', setor: 'todos', itens: [], receitas: [], doEvento: 0 };
  if (eventoPlataforma) preencherDoEvento(c, eventoPlataforma);
  if (!c.itens.length) c.itens = [itemConsumoVazio()];
  return c;
}
function itemConsumoVazio(p = null) { return { produto_id: p?.id ?? '', texto: p ? rotuloProduto(p) : '', levado: '', devolvido: '', consumido: '', aberto: '', preco: '', unidades: '', sugerido: false }; }
function preencherDoEvento(c, id) {
  const e = eventosPlataforma().find(x => x.id === id); if (!e) return;
  const q = quoteDe(e);
  c.eventoPlataforma = id; c.nome = q.nome || q.cliente || 'Festa'; c.data = q.data || c.data;
  const ad = Number(e.adultos || 0), cr = Number(e.criancas || 0);
  c.adultos = ad + cr ? String(ad) : String(q.convidadosTotal || ''); c.criancas = ad + cr ? String(cr) : '';
  const pol = e.alcoolicasPolitica || 'Por adesão';
  c.alcool = pol === 'Por adesão' ? 'adesao' : pol === 'Não haverá' ? 'sem_alcool' : 'sem_adesao';
  const existente = d.eventos.find(x => x.plataforma_evento_id === id);
  if (existente) { carregarConsumoExistente(c, existente); return; }
  // compras feitas para esta festa (bolo, doces, personalizados) já entram no consumo
  const compras = d.compras.filter(x => x.plataforma_evento_id === id).map(x => String(x.id));
  const porProduto = new Map();
  d.comprasItens.filter(i => compras.includes(String(i.compra_id))).forEach(i => porProduto.set(String(i.produto_id), (porProduto.get(String(i.produto_id)) || 0) + Number(i.quantidade || 0)));
  const itens = [...porProduto].map(([pid, q]) => { const p = prodPorId(pid); return p ? { ...itemConsumoVazio(p), consumido: String(Number(q.toFixed(3))).replace('.', ',') } : null; }).filter(Boolean);
  if (itens.length) { c.itens = [...c.itens.filter(i => i.texto), ...itens]; c.doEvento = itens.length; }
}
function carregarConsumoExistente(c, ev) {
  c.id = ev.id; c.nome = ev.nome_evento; c.data = String(ev.data).slice(0, 10); c.adultos = String(ev.adultos ?? ''); c.criancas = String(ev.criancas ?? '');
  c.tipo = ev.tipo_evento || 'fechada'; c.alcool = ev.sem_alcool ? 'sem_alcool' : ev.alcoolico_adesao ? 'adesao' : 'sem_adesao';
  c.rolha = !!ev.rolha_cobrada; c.valorRolha = ev.valor_rolha ? String(ev.valor_rolha).replace('.', ',') : ''; c.observacao = ev.observacao || '';
  c.eventoPlataforma = ev.plataforma_evento_id || c.eventoPlataforma || '';
  const bar = ev.controle_bar || {};
  c.receitas = (ev.receitas || []).map(x => ({ receita_id: x.receita_id, porcoes: String(x.porcoes ?? '').replace('.', ',') }));
  c.itens = d.eventosItens.filter(i => String(i.evento_id) === String(ev.id) && (i.receita_id == null || !c.receitas.length)).map(i => {
    const p = prodPorId(i.produto_id); const b = bar[String(i.produto_id)] || {};
    return { produto_id: i.produto_id, texto: p ? rotuloProduto(p) : `#${i.produto_id}`, levado: b.levado != null ? String(b.levado) : '', devolvido: b.levado != null && b.devolvido != null ? String(b.devolvido) : '',
      unidades: Number(i.quantidade_unidades) > 0 ? String(Number(i.quantidade_unidades)).replace('.', ',') : '', sugerido: false,
      consumido: String(Number(i.quantidade ?? i.quantidade_consumida ?? 0)).replace('.', ','), aberto: b.aberto ? String(b.aberto).replace('.', ',') : '', preco: Number(i.preco_unitario || 0) ? String(i.preco_unitario).replace('.', ',') : '' };
  });
  if (!c.itens.length) c.itens = [itemConsumoVazio()];
}
const consumidoDe = it => { const l = numero(it.levado); if (l >= 0 && !Number.isNaN(l)) { const v = numero(it.devolvido); return Math.max(0, l - (v > 0 ? v : 0)); } const c = numero(it.consumido); return c > 0 ? c : 0; };

// custo do item: gravado na baixa; para o histórico migrado, soma os lotes usados (o que faltar, pelo custo médio)
function custoItem(i) {
  if (i.custo_total != null) return Number(i.custo_total);
  const cons = d.consumos.filter(c => String(c.evento_item_id) === String(i.id));
  const coberto = cons.reduce((s, c) => s + Number(c.quantidade || 0), 0);
  return cons.reduce((s, c) => s + Number(c.quantidade || 0) * Number(c.custo_unitario || 0), 0) + Math.max(0, Number(i.quantidade || 0) - coberto) * Number(estDe(i.produto_id)?.custo_medio || 0);
}
function custoEvento(ev) { return d.eventosItens.filter(i => String(i.evento_id) === String(ev.id)).reduce((s, i) => s + custoItem(i), 0); }
function vendaEvento(ev) { return d.eventosItens.filter(i => String(i.evento_id) === String(ev.id)).reduce((s, i) => s + Number(i.valor_total || 0), 0); }

function telaConsumo() {
  const lista = d.eventos.filter(ev => ui.setor === 'todos' || d.eventosItens.some(i => String(i.evento_id) === String(ev.id) && setorDe(i.produto_id) === ui.setor)).slice(0, 60);
  const semConsumo = festasSemConsumo();
  const linhas = lista.map(ev => {
    const its = d.eventosItens.filter(i => String(i.evento_id) === String(ev.id));
    return `<tr><td>${dataBR(ev.data)}</td><td><b>${esc(ev.nome_evento)}</b>${ev.plataforma_evento_id ? ' <span class="badge">festa da plataforma</span>' : ''}<br><small>${ev.adultos || 0} adultos · ${ev.criancas || 0} crianças${ev.tipo_evento === 'avulsa' ? ' · venda avulsa' : ''}</small></td><td>${its.length}</td><td>${money(custoEvento(ev))}</td><td>${vendaEvento(ev) ? money(vendaEvento(ev)) : '—'}</td><td><button class="btn btn-ghost btn-sm" type="button" data-es="editar-consumo" data-id="${ev.id}">Abrir</button></td></tr>`;
  }).join('');
  return `${consumo ? formConsumo() : `<section class="panel guide-card"><div><h2>Lançar o consumo de uma festa</h2><p>Depois da festa, informe o que foi levado e o que voltou (ou direto o consumido). O estoque baixa pelos lotes mais antigos e o custo vai para o resultado da festa.</p>
    ${semConsumo.length ? `<p class="es-alerta">${semConsumo.length} festa(s) recente(s) sem consumo lançado.</p>` : ''}</div><div class="guide-card__actions">${semConsumo[0] ? `<button class="btn btn-primary" type="button" data-es="consumo-evento" data-evento="${esc(semConsumo[0].id)}">Lançar: ${esc(quoteDe(semConsumo[0]).nome || quoteDe(semConsumo[0]).cliente)}</button>` : ''}<button class="btn ${semConsumo[0] ? 'btn-ghost' : 'btn-primary'}" type="button" data-es="novo-consumo">＋ Lançar consumo</button></div></section>`}
  <section class="panel"><div class="panel-header"><div><h2>Consumo lançado</h2></div></div>${filtroSetor()}<div class="table-wrap"><table class="bb-table"><thead><tr><th>Data</th><th>Festa</th><th>Itens</th><th>Custo</th><th>Venda</th><th></th></tr></thead><tbody>${linhas || '<tr><td colspan="6">Nenhum consumo neste filtro.</td></tr>'}</tbody></table></div></section>`;
}
function expandirReceitas(c) {
  const out = [];
  (c.receitas || []).forEach(x => { const r = (d.receitas || []).find(y => String(y.id) === String(x.receita_id)); const n = numero(x.porcoes) || 0; if (!r || !(n > 0)) return;
    (r.itens || []).forEach(i => out.push({ produto_id: Number(i.produto_id), quantidade: Number((Number(i.quantidade) * n).toFixed(3)), receita_id: Number(r.id) })); });
  return out;
}
// Mesma conta que o banco faz ao salvar: lote mais antigo primeiro, custo de cada lote.
// Ao editar, o que esta festa já tinha tirado volta para os lotes antes de simular.
function rotuloLote(l) {
  const compra = l.compra_id != null ? d.compras.find(c => String(c.id) === String(l.compra_id)) : null;
  const origem = l.origem === 'ajuste' ? 'Ajuste de estoque' : l.origem === 'migracao' ? 'Saldo migrado' : compra ? `Compra${compra.fornecedor ? ' · ' + compra.fornecedor : ''}` : 'Compra';
  return `${origem} de ${dataBR(l.data_compra || l.created_at)}`;
}
function simularLotes(c) {
  const disp = new Map(d.lotes.map(l => [String(l.id), Number(l.quantidade_disponivel || 0)]));
  if (c.id) {
    const meus = new Set(d.eventosItens.filter(i => String(i.evento_id) === String(c.id)).map(i => String(i.id)));
    d.consumos.filter(x => meus.has(String(x.evento_item_id)) && x.lote_id != null).forEach(x => disp.set(String(x.lote_id), (disp.get(String(x.lote_id)) || 0) + Number(x.quantidade || 0)));
  }
  const ordem = [...d.lotes].sort((a, b) => String(a.data_compra || '').localeCompare(String(b.data_compra || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')) || Number(a.id) - Number(b.id));
  const alocar = (pid, q) => {
    let falta = q; const partes = [];
    ordem.filter(l => String(l.produto_id) === String(pid)).forEach(l => { if (falta <= 1e-9) return; const dd = disp.get(String(l.id)) || 0; if (dd <= 0) return; const usar = Math.min(dd, falta); disp.set(String(l.id), dd - usar); falta -= usar; partes.push({ rotulo: rotuloLote(l), quantidade: usar, custo: Number(l.custo_unitario || 0) }); });
    if (falta > 1e-9) partes.push({ rotulo: 'Sem lote (usa o custo médio)', quantidade: falta, custo: Number(estDe(pid)?.custo_medio || 0), semLote: true });
    return { partes, custo: partes.reduce((s, x) => s + x.quantidade * x.custo, 0) };
  };
  const porItem = c.itens.map(it => { const q = consumidoDe(it); return it.produto_id && q > 0 ? alocar(it.produto_id, q) : null; });
  const receitas = expandirReceitas(c).map(x => alocar(x.produto_id, x.quantidade));
  return { porItem, custoReceitas: receitas.reduce((s, r) => s + r.custo, 0) };
}
const resumoLotes = a => a && a.partes.length ? `<div class="es-lotes-uso">${a.partes.map(x => `<span class="${x.semLote ? 'es-alerta' : ''}">${qtd(x.quantidade)} × ${money(x.custo)} · ${esc(x.rotulo)}</span>`).join('')}<b>custo ${money(a.custo)}</b></div>` : '';
function formConsumo() {
  const c = consumo;
  const setorVis = c.setor;
  const sim = simularLotes(c);
  const itens = c.itens.map((it, ix) => {
    const p = prodPorId(it.produto_id);
    if (setorVis !== 'todos' && p && p.setor !== setorVis) return '';
    const cons = consumidoDe(it); const s = p ? saldoDe(p.id) : 0;
    const usaLevado = it.levado !== '' && it.levado != null;
    const jaLancado = c.id ? Number(d.eventosItens.filter(i => String(i.evento_id) === String(c.id) && String(i.produto_id) === String(it.produto_id)).reduce((a, i) => a + Number(i.quantidade || 0), 0)) : 0;
    const falta = p && cons > s + jaLancado + 1e-9;
    const beb = p?.setor === 'bebidas';
    return `<div class="es-item es-item--consumo" data-ix="${ix}">
      <div class="field es-item__prod"><label>Produto</label><input list="esListaProd" data-k="texto" value="${esc(it.texto)}" placeholder="Nome ou código" autocomplete="off">${p ? `<small>${setorIcone(p.setor)} em estoque ${qtd(s + jaLancado)} ${esc(p.unidade || 'un')}</small>` : it.texto ? '<small class="es-alerta">Produto não encontrado</small>' : ''}</div>
      <div class="field"><label>Levado</label><input data-k="levado" inputmode="decimal" value="${esc(it.levado)}" placeholder="—"></div>
      <div class="field"><label>Voltou</label><input data-k="devolvido" inputmode="decimal" value="${esc(it.devolvido)}" ${usaLevado ? '' : 'disabled'} placeholder="—"></div>
      <div class="field"><label>Consumido${p && p.unidade && p.unidade !== 'un' ? ` (${esc(p.unidade)})` : ''}</label><input data-k="consumido" inputmode="decimal" value="${usaLevado ? esc(String(cons).replace('.', ',')) : esc(it.consumido)}" ${usaLevado ? 'readonly class="es-calc"' : ''}><small>${p ? esc(p.unidade || 'un') : ''}${falta ? ' <span class="es-alerta">acima do estoque</span>' : ''}</small></div>
      ${p?.conta_unidades && bancoV2() ? (() => { const ap = aprendizado(d, p.id, c.id); const min = Number(p.minimo_aprendizado || 50); const pronto = ap.n >= min;
        return `<div class="field es-item__un"><label>Unidades (cozinha)</label><input data-k="unidades" inputmode="numeric" value="${esc(it.unidades)}" placeholder="ex.: 200"><small>${pronto ? `${it.sugerido ? '↖ peso sugerido · ' : ''}média ${qtd(ap.unPorPeso, 1)} un/${esc(p.unidade)}` : `aprendendo: ${ap.n} de ${min} · informe o peso`}</small></div>`; })()
        : `<div class="field"><label>${beb ? 'Sobra aberta' : '&nbsp;'}</label>${beb ? `<input data-k="aberto" inputmode="decimal" value="${esc(it.aberto)}" placeholder="0">` : ''}</div>`}
      <div class="field"><label>Preço de venda</label><input data-k="preco" inputmode="decimal" value="${esc(it.preco)}" placeholder="se cobrado"></div>
      ${resumoLotes(sim.porItem[ix])}
      <button type="button" class="es-x" data-es="tirar-consumo" title="Tirar item">✕</button></div>`;
  }).join('');
  const expandidas = expandirReceitas(c);
  const custoEstim = sim.custoReceitas + sim.porItem.reduce((s, a) => s + (a ? a.custo : 0), 0);
  const venda = c.itens.reduce((s, it) => s + consumidoDe(it) * (numero(it.preco) || 0), 0);
  return `<section class="panel es-form"><div class="panel-header"><div><span class="eyebrow">${c.id ? 'EDITAR CONSUMO' : 'CONSUMO DA FESTA'}</span><h2>${c.id ? esc(c.nome) : 'Lançar consumo'}</h2></div><button class="btn btn-ghost" type="button" data-es="cancelar-consumo">Cancelar</button></div>
    <div class="form-grid">
      <div class="field field-full"><label>Festa</label><select id="kEvento"><option value="">Outra (não cadastrada na plataforma)</option>${opcoesEventosPlat(c.eventoPlataforma, { futuros: true })}</select></div>
      <div class="field"><label>Nome</label><input id="kNome" value="${esc(c.nome)}" required></div>
      <div class="field"><label>Data</label><input id="kData" type="date" value="${esc(c.data)}" max="${hoje()}"></div>
      <div class="field"><label>Adultos presentes</label><input id="kAdultos" inputmode="numeric" value="${esc(c.adultos)}"></div>
      <div class="field"><label>Crianças presentes</label><input id="kCriancas" inputmode="numeric" value="${esc(c.criancas)}"></div>
      <div class="field"><label>Tipo</label><select id="kTipo"><option value="fechada" ${c.tipo === 'fechada' ? 'selected' : ''}>Festa fechada</option><option value="avulsa" ${c.tipo === 'avulsa' ? 'selected' : ''}>Venda avulsa (use day, formatura)</option></select></div>
      <div class="field"><label>Bebida alcoólica</label><select id="kAlcool"><option value="sem_adesao" ${c.alcool === 'sem_adesao' ? 'selected' : ''}>Sem adesão</option><option value="adesao" ${c.alcool === 'adesao' ? 'selected' : ''}>Por adesão</option><option value="sem_alcool" ${c.alcool === 'sem_alcool' ? 'selected' : ''}>Contratante pediu sem álcool</option></select></div>
      <div class="field"><label class="es-check"><input type="checkbox" id="kRolha" ${c.rolha ? 'checked' : ''}> Rolha cobrada</label><input id="kValorRolha" inputmode="decimal" value="${esc(c.valorRolha)}" placeholder="Valor da rolha" ${c.rolha ? '' : 'disabled'}></div>
    </div>
    <datalist id="esListaProd">${opcoesProdutos()}</datalist>
    <div class="es-filtro"><span class="es-dica">Mostrar itens de:</span><div class="ft-filtro" style="border:0;padding:0;margin:0">${[['todos', 'Todos'], ...SETORES].map(([k, t]) => `<button type="button" class="${setorVis === k ? 'on' : ''}" data-es="setor-consumo" data-setor="${k}">${t}</button>`).join('')}</div><button class="btn btn-ghost btn-sm" type="button" data-es="itens-padrao">Trazer produtos do setor</button></div>
    <p class="es-dica">Preencha <b>Levado</b> e <b>Voltou</b> (o consumido é calculado) ou direto o <b>Consumido</b>. Itens sem quantidade são ignorados.</p>
    ${c.doEvento ? `<p class="es-ok">🎂 ${c.doEvento} item(ns) comprado(s) para esta festa já vieram preenchidos. Confira as quantidades.</p>` : ''}
    <div class="es-itens">${itens}</div>
    ${bancoV3() ? `<div class="es-rec-bloco"><h3>Receitas (extras)</h3>${receitasAtivas().length ? `${(c.receitas || []).map((x, ix) => { const r = (d.receitas || []).find(y => String(y.id) === String(x.receita_id)); const n = numero(x.porcoes) || 0;
        return `<div class="es-rec-linha" data-rix="${ix}"><select data-rk="receita_id"><option value="">Escolha a receita</option>${receitasAtivas().map(y => `<option value="${y.id}" ${String(y.id) === String(x.receita_id) ? 'selected' : ''}>${esc(y.nome)}</option>`).join('')}</select><input data-rk="porcoes" inputmode="decimal" value="${esc(x.porcoes)}" placeholder="${esc(r?.rendimento || 'porção')}s"><span>${r && n > 0 ? `= ${(r.itens || []).map(i => `${qtd(i.quantidade * n)} ${esc(unidadeDe(i.produto_id))} ${esc(prodPorId(i.produto_id)?.nome || '')}`).join(' · ')} · ${money(custoPorcao(r) * n)}` : ''}</span><button type="button" class="es-x" data-es="tirar-receita">✕</button></div>`; }).join('')}<button class="btn btn-ghost btn-sm" type="button" data-es="mais-receita">＋ Receita</button>` : '<p class="es-dica">Cadastre as receitas dos extras (cachorro-quente, cumbucas) na aba <b>Receitas</b> para lançar só as porções aqui.</p>'}</div>` : ''}
    <div class="es-form__rodape"><div><button class="btn btn-ghost" type="button" data-es="mais-consumo">＋ Outro item</button></div><div class="es-total">Custo pelos lotes <strong>${money(custoEstim)}</strong>${venda ? ` · Venda <strong>${money(venda)}</strong>` : ''}</div></div>
    <div class="field"><label>Observação (opcional)</label><input id="kObs" value="${esc(c.observacao)}"></div>
    <div class="es-acoes">${c.id ? '<button class="btn btn-ghost" type="button" data-es="excluir-consumo">Excluir este consumo</button>' : ''}<button class="btn btn-primary" type="button" data-es="salvar-consumo" ${ocupado ? 'disabled' : ''}>${c.id ? 'Salvar alterações' : 'Salvar e baixar do estoque'}</button></div></section>`;
}
function lerCabecalhoConsumo(root) {
  if (!consumo) return;
  const v = s => root.querySelector(s);
  consumo.nome = v('#kNome')?.value ?? consumo.nome; consumo.data = v('#kData')?.value || consumo.data;
  consumo.adultos = v('#kAdultos')?.value ?? consumo.adultos; consumo.criancas = v('#kCriancas')?.value ?? consumo.criancas;
  consumo.tipo = v('#kTipo')?.value || consumo.tipo; consumo.alcool = v('#kAlcool')?.value || consumo.alcool;
  consumo.rolha = !!v('#kRolha')?.checked; consumo.valorRolha = v('#kValorRolha')?.value ?? consumo.valorRolha; consumo.observacao = v('#kObs')?.value ?? consumo.observacao;
}
async function salvarConsumo(root) {
  lerCabecalhoConsumo(root);
  const c = consumo;
  if (!c.nome.trim()) return alert('Informe o nome da festa.');
  if (!c.data) return alert('Informe a data.');
  if (c.data > hoje()) return alert('O consumo só pode ser lançado depois da festa.');
  if (c.rolha && !(numero(c.valorRolha) > 0)) return alert('Informe o valor da rolha (ou desmarque "Rolha cobrada").');
  const validos = c.itens.filter(i => i.texto || i.levado || i.consumido);
  for (const i of validos) if (!i.produto_id) return alert(`Produto não encontrado: “${i.texto}”.`);
  const usados = validos.filter(i => consumidoDe(i) > 0 || numero(i.aberto) > 0);
  const repetidos = usados.map(i => String(i.produto_id)).filter((x, ix, a) => a.indexOf(x) !== ix);
  if (repetidos.length) return alert(`O produto ${prodPorId(repetidos[0])?.nome} aparece mais de uma vez. Junte numa linha só.`);
  for (const i of validos.filter(x => numero(x.unidades) > 0 && !(consumidoDe(x) > 0))) { const p = prodPorId(i.produto_id); if (p?.conta_unidades) return alert(`Informe o peso aproximado de ${p.nome} (${i.unidades} un). É com ele que a plataforma aprende a média e baixa o estoque.`); }
  for (const i of usados) { const p = prodPorId(i.produto_id); if (!p?.conta_unidades || !bancoV2()) continue;
    if (numero(i.unidades) > 0 && !(consumidoDe(i) > 0)) return alert(`Informe o peso aproximado de ${p.nome} (${i.unidades} un). É com ele que a plataforma aprende a média e baixa o estoque.`);
    if (consumidoDe(i) > 0 && !(numero(i.unidades) > 0) && !confirm(`${p.nome}: faltou informar quantas unidades a cozinha fez. Sem isso, este lançamento não ensina a média. Salvar assim mesmo?`)) return; }
  const linhasRec = (c.receitas || []).filter(x => x.receita_id || x.porcoes);
  if (linhasRec.some(x => !x.receita_id || !(numero(x.porcoes) > 0))) return alert('Em Receitas, escolha a receita e informe as porções (ou tire a linha).');
  const expandidas = expandirReceitas(c);
  if (!usados.some(i => consumidoDe(i) > 0) && !expandidas.length && !confirm('Nenhum item com quantidade consumida. Salvar mesmo assim?')) return;
  const semVolta = usados.filter(i => i.levado !== '' && (i.devolvido === '' || i.devolvido == null));
  if (semVolta.length && !confirm(`${semVolta.length} produto(s) com "Levado" mas sem "Voltou": tudo o que foi levado conta como consumido.\n\nSalvar assim mesmo?`)) return;
  if (c.alcool === 'sem_alcool') { const alc = usados.filter(i => consumidoDe(i) > 0 && prodPorId(i.produto_id)?.somente_adultos === true); if (alc.length && !confirm(`Festa marcada SEM bebida alcoólica, mas há bebida de adulto lançada: ${alc.map(i => prodPorId(i.produto_id)?.nome).join(', ')}.\n\nSalvar assim mesmo?`)) return; }
  const controle = {};
  usados.forEach(i => { const ab = numero(i.aberto) || 0; if ((i.levado === '' || i.levado == null) && !(ab > 0)) return; controle[String(i.produto_id)] = { levado: i.levado === '' ? null : numero(i.levado), devolvido: i.levado === '' ? 0 : (i.devolvido === '' ? null : numero(i.devolvido)), aberto: ab > 0 ? ab : 0, preco: numero(i.preco) || 0 }; });
  const payload = { id: c.id, nome_evento: c.nome.trim(), data: c.data, adultos: Math.round(numero(c.adultos) || 0), criancas: Math.round(numero(c.criancas) || 0), observacao: c.observacao.trim(),
    tipo_evento: c.tipo, alcoolico_adesao: c.alcool === 'adesao', sem_alcool: c.alcool === 'sem_alcool', rolha_cobrada: c.rolha, valor_rolha: c.rolha ? numero(c.valorRolha) : 0,
    controle_bar: Object.keys(controle).length ? controle : null, plataforma_evento_id: c.eventoPlataforma || null,
    receitas: linhasRec.map(x => ({ receita_id: Number(x.receita_id), nome: (d.receitas || []).find(y => String(y.id) === String(x.receita_id))?.nome || '', porcoes: numero(x.porcoes) })),
    itens: [...usados.filter(i => consumidoDe(i) > 0).map(i => ({ produto_id: Number(i.produto_id), quantidade: consumidoDe(i), preco_unitario: numero(i.preco) || 0, ...(numero(i.unidades) > 0 ? { unidades: Math.round(numero(i.unidades)) } : {}) })), ...expandidas] };
  ocupado = true; desenhar();
  try {
    const eid = await rpc('est_registrar_consumo', { p: payload });
    await recarregarDados();
    const ev = d.eventos.find(x => String(x.id) === String(eid));
    if (ev?.plataforma_evento_id) resumirNoEvento(ev);
    aviso = { tipo: 'ok', texto: `✓ Consumo de ${esc(payload.nome_evento)} salvo: ${payload.itens.length} item(ns), custo ${money(ev ? custoEvento(ev) : 0)}. Estoque atualizado.${ev?.plataforma_evento_id ? ` O custo já aparece no resultado da festa. <button type="button" class="btn btn-ghost btn-sm" data-es="voltar-festa" data-evento="${esc(ev.plataforma_evento_id)}">← Voltar para a festa</button>` : ''}` };
    consumo = null;
  } catch (e) { aviso = { tipo: 'erro', texto: `Não foi possível salvar o consumo: ${esc(e.message)}` }; }
  ocupado = false; desenhar(); window.scrollTo(0, 0);
}

// Resumo do consumo dentro do evento da plataforma (resultado da festa)
function resumirNoEvento(ev) {
  const itens = d.eventosItens.filter(i => String(i.evento_id) === String(ev.id)).map(i => { const p = prodPorId(i.produto_id); return { produtoId: i.produto_id, produto: p?.nome || `#${i.produto_id}`, setor: p?.setor || 'bebidas', quantidade: Number(i.quantidade || 0), unidade: p?.unidade || 'un', unidades: Number(i.quantidade_unidades || 0) || null, receita: i.receita_id != null ? ((d.receitas || []).find(r => String(r.id) === String(i.receita_id))?.nome || 'Receita') : null, custo: Number(i.custo_total || 0), venda: Number(i.valor_total || 0) }; });
  const resumo = { estEventoId: ev.id, receitas: (ev.receitas || []).map(x => ({ nome: x.nome, porcoes: Number(x.porcoes || 0) })), convidados: Number(ev.adultos || 0) + Number(ev.criancas || 0), custo: itens.reduce((s, i) => s + i.custo, 0), venda: itens.reduce((s, i) => s + i.venda, 0), rolha: ev.rolha_cobrada ? Number(ev.valor_rolha || 0) : 0, itens, atualizadoEm: new Date().toISOString() };
  const evs = eventosPlataforma();
  writeJSON(EVENTOS_KEY, evs.map(e => e.id !== ev.plataforma_evento_id ? e : { ...e, consumoEstoque: resumo, historico: [...(e.historico || []), { id: `hist_${Date.now().toString(36)}`, label: e.consumoEstoque ? 'Consumo da festa atualizado' : 'Consumo da festa lançado', detail: `${itens.length} item(ns) · custo ${money(resumo.custo)}`, at: new Date().toISOString() }] }));
}
function tirarDoEvento(platId) {
  if (!platId) return;
  writeJSON(EVENTOS_KEY, eventosPlataforma().map(e => { if (e.id !== platId) return e; const { consumoEstoque, ...resto } = e; return { ...resto, historico: [...(e.historico || []), { id: `hist_${Date.now().toString(36)}`, label: 'Consumo da festa excluído', detail: 'Estoque devolvido', at: new Date().toISOString() }] }; }));
}
function anotarNoEvento(platId, label, detail) {
  writeJSON(EVENTOS_KEY, eventosPlataforma().map(e => e.id !== platId ? e : { ...e, historico: [...(e.historico || []), { id: `hist_${Date.now().toString(36)}`, label, detail, at: new Date().toISOString() }] }));
}

// ---------- conferência
function telaConferencia() {
  const lista = ativos().filter(doSetor).sort((a, b) => String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR') || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const preenchidos = Object.entries(conferencia).filter(([, v]) => String(v).trim() !== '');
  const linhas = lista.map(p => {
    const s = saldoDe(p.id); const v = conferencia[p.id]; const n = numero(v); const dif = Number.isFinite(n) ? n - s : null;
    return `<tr><td><b>${esc(p.nome)}</b>${p.categoria ? `<br><small>${esc(p.categoria)}</small>` : ''}</td><td>${qtd(s)} ${esc(p.unidade || 'un')}</td><td><input class="es-contado" data-conf="${p.id}" inputmode="decimal" value="${esc(v ?? '')}" placeholder="contado"></td><td class="${dif ? (dif < 0 ? 'es-out' : 'es-in') : ''}" data-dif="${p.id}">${dif === null ? '' : dif === 0 ? '✓' : (dif > 0 ? '+' : '') + qtd(dif)}</td></tr>`;
  }).join('');
  const hist = d.balancos.slice(0, 10).map(b => { const its = d.balancosItens.filter(i => String(i.balanco_id) === String(b.id)); const difs = its.filter(i => Number(i.diferenca || 0) !== 0).length; return `<li>${dataBR(b.data)} · ${b.setor ? esc(setorNome(b.setor)) : 'Geral'} · ${its.length} item(ns) contados · ${difs} com diferença${b.observacao ? ` · ${esc(b.observacao)}` : ''}</li>`; }).join('');
  return `<section class="panel"><div class="panel-header"><div><h2>Conferência de estoque</h2><p>Conte o que tem na prateleira e digite. Só os itens preenchidos são acertados; os outros ficam como estão.</p></div></div>
    ${filtroSetor()}
    <div class="table-wrap"><table class="bb-table"><thead><tr><th>Produto</th><th>No sistema</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>${linhas || '<tr><td colspan="4">Nenhum produto neste setor.</td></tr>'}</tbody></table></div>
    <div class="form-grid"><div class="field field-full"><label>Observação (opcional)</label><input id="confObs" placeholder="Ex.: contagem do fim do mês"></div></div>
    <div class="es-acoes"><button class="btn btn-ghost" type="button" data-es="limpar-conf">Limpar</button><button class="btn btn-primary" type="button" data-es="aplicar-conf" ${preenchidos.length && !ocupado ? '' : 'disabled'}>Acertar estoque com a contagem (${preenchidos.length})</button></div></section>
  <section class="panel"><div class="panel-header"><div><h2>Conferências anteriores</h2></div></div>${hist ? `<ul class="es-lista">${hist}</ul>` : '<p>Nenhuma ainda.</p>'}</section>`;
}

// ------------------------------------------------------------------ eventos da tela
let desenhando = false;
function desenhar() {
  const root = rootAtual || document.querySelector('#app .estoque-module')?.parentElement;
  if (!root || !root.querySelector('.estoque-module') || desenhando) return;
  desenhando = true;
  try {
    // tira o foco antes de redesenhar: o "change" do campo atualiza o rascunho sem redesenhar de novo
    const ativo = document.activeElement; if (ativo && root.contains(ativo)) ativo.blur();
    root.innerHTML = render(); ligar(root);
  } finally { desenhando = false; }
}
function ir(aba) { ui.aba = aba; salvarUi(); aviso = null; desenhar(); }

function ligar(root) {
  rootAtual = root;
  const q = s => root.querySelector(s);
  const qa = s => root.querySelectorAll(s);
  qa('[data-es-aba]').forEach(b => b.onclick = () => ir(b.dataset.esAba));
  qa('[data-es-setor]').forEach(b => b.onclick = () => { ui.setor = b.dataset.esSetor; salvarUi(); desenhar(); });
  q('[data-es="fechar-aviso"]')?.addEventListener('click', () => { aviso = null; desenhar(); });
  qa('[data-es="atualizar"]').forEach(b => b.onclick = async () => { b.disabled = true; sit = null; d = null; desenhar(); invalidar(); await iniciar(true); });
  qa('[data-es="ir"]').forEach(b => b.onclick = () => { if (b.dataset.novo && b.dataset.aba === 'compras' && !compra) compra = novaCompra(); if (b.dataset.novo && b.dataset.aba === 'consumo' && !consumo) consumo = novoConsumo(); ir(b.dataset.aba); });
  qa('[data-es="ver-setor"]').forEach(b => b.onclick = () => { ui.setor = b.dataset.setor; ir('produtos'); });
  qa('[data-es="novo-produto"]').forEach(b => b.onclick = () => modalProduto());
  qa('[data-es="editar-produto"]').forEach(tr => tr.onclick = () => modalProduto(tr.dataset.id));
  q('#esBusca')?.addEventListener('input', ev => { ui.busca = ev.target.value; salvarUi(); const pos = ev.target.selectionStart; desenhar(); const i = root.querySelector('#esBusca'); i?.focus(); try { i?.setSelectionRange(pos, pos); } catch { } });
  q('[data-es="copiar-sql"]')?.addEventListener('click', async ev => {
    try { const t = await (await fetch('sql/etapa2_estoque.sql', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(t); ev.target.textContent = '✓ Copiado! Agora cole no SQL Editor'; }
    catch { window.open('sql/etapa2_estoque.sql', '_blank'); }
  });
  // migração
  q('#esLoginBeb')?.addEventListener('submit', async ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget); const b = ev.currentTarget.querySelector('button'); b.disabled = true; b.textContent = 'Entrando…'; try { await bebidasBanco.entrar(String(f.get('email')).trim(), String(f.get('senha'))); desenhar(); } catch (e) { b.disabled = false; b.textContent = 'Entrar'; alert(e.message); } });
  q('[data-es="migrar"]')?.addEventListener('click', async () => {
    if (sit.migracao && !confirm('Copiar de novo? A cópia anterior na plataforma é substituída pelos dados atuais do sistema antigo.')) return;
    ocupado = true; conferenciaMig = null; desenhar();
    const log = t => { migracaoLog = t; const el = document.querySelector('#esLogMig'); if (el) el.textContent = t; };
    try { const r = await migrarDoAntigo(bebidasBanco.buscar, log); sit.migracao = { em: r.em, contagens: r.contagens }; log('Cópia concluída. Conferindo com o sistema antigo…'); conferenciaMig = await conferirMigracao(bebidasBanco.buscar); log(conferenciaMig.ok ? '✓ Cópia concluída e conferida.' : 'Cópia concluída, mas a conferência achou diferenças (veja abaixo).'); }
    catch (e) { log(`Erro: ${e.message}`); alert(`A cópia não terminou: ${e.message}\n\nPode tentar de novo; a cópia recomeça do zero.`); }
    ocupado = false; desenhar();
  });
  q('[data-es="conferir-mig"]')?.addEventListener('click', async () => { ocupado = true; desenhar(); try { conferenciaMig = await conferirMigracao(bebidasBanco.buscar); } catch (e) { alert(e.message); } ocupado = false; desenhar(); });
  q('[data-es="virar"]')?.addEventListener('click', async () => {
    if (conferenciaMig && !conferenciaMig.ok && !confirm('A conferência mostrou diferenças. Virar a chave mesmo assim?')) return;
    if (!confirm('Virar a chave agora?\n\nDepois disso, compras e consumo das festas são lançados SÓ na plataforma, e não dá para copiar de novo do sistema antigo.')) return;
    ocupado = true; desenhar();
    try { await virarChave({ migracao: sit.migracao }); sit.virada = { em: new Date().toISOString() }; d = await carregar({ forcar: true }); ui.aba = 'visao'; salvarUi(); aviso = { tipo: 'ok', texto: '🔑 Pronto! O estoque agora é da plataforma. A partir de hoje, lance compras e o consumo das festas aqui.' }; }
    catch (e) { alert(`Não foi possível virar a chave: ${e.message}`); }
    ocupado = false; desenhar();
  });
  if (!d) return;
  qa('[data-es="voltar-festa"]').forEach(b => b.onclick = () => { try { localStorage.setItem('lega.navigation.request', JSON.stringify({ eventId: b.dataset.evento, tab: 'encerramento' })); } catch { } location.hash = 'eventos'; });
  qa('[data-es="nova-receita"]').forEach(b => b.onclick = () => modalReceita());
  qa('[data-es="editar-receita"]').forEach(b => b.onclick = () => modalReceita(b.dataset.id));
  // visão geral
  qa('[data-es="consumo-evento"]').forEach(b => b.onclick = () => { consumo = novoConsumo(b.dataset.evento); ir('consumo'); });
  q('[data-es="comprar-baixos"]')?.addEventListener('click', () => { compra = novaCompra(abaixoMinimo(ativos()).map(p => itemCompraVazio(p))); ir('compras'); });
  // compras
  q('[data-es="nova-compra"]')?.addEventListener('click', () => { compra = novaCompra(); desenhar(); });
  q('[data-es="cancelar-compra"]')?.addEventListener('click', () => { if (compra.itens.some(i => i.texto) && !confirm('Descartar esta compra?')) return; compra = null; desenhar(); });
  if (compra && q('.es-form #cData')) {
    ['#cData', '#cFornecedor', '#cForma', '#cEvento', '#cObs'].forEach(s => q(s)?.addEventListener('change', () => lerCabecalhoCompra(root)));
    qa('.es-item').forEach(el => {
      const it = compra.itens[Number(el.dataset.ix)];
      const ix = Number(el.dataset.ix);
      const campo = k => el.querySelector(`[data-c="${k}"]`);
      const atualizarCalculos = () => {
        el.querySelector('[data-calc]').innerHTML = calcItemCompra(it);
        const tot = compra.itens.reduce((s, i) => s + (numero(i.valor) || 0), 0);
        const t = root.querySelector('[data-total-compra]'); if (t) t.textContent = money(tot);
      };
      el.querySelectorAll('[data-c]').forEach(inp => {
        const k = inp.dataset.c;
        inp.addEventListener(k === 'texto' || k === 'unidade' ? 'change' : 'input', () => {
          if (k === 'texto') { lerCabecalhoCompra(root); it.texto = inp.value; const p = acharProduto(inp.value); if (p) { Object.assign(it, itemCompraVazio(p), { quantidade: it.quantidade, valor: it.valor, valorUn: it.valorUn, origem: it.origem, validade: it.validade }); } else it.produto_id = ''; desenhar(); if (p) root.querySelector(`.es-item[data-ix="${ix}"] [data-c="quantidade"]`)?.focus(); return; }
          if (k === 'unidade') { lerCabecalhoCompra(root); it.unidade = inp.value; const p = prodPorId(it.produto_id); it.fator = p && inp.value === p.unidade_compra ? Number(p.fator_compra || 1) : 1; desenhar(); return; }
          it[k] = k === 'fator' ? (numero(inp.value) || '') : inp.value;
          // valor por unidade ⇄ total: o que foi digitado por último manda
          const q = numero(it.quantidade);
          if (k === 'valorUn') { it.origem = 'un'; const un = numero(it.valorUn); it.valor = q > 0 && un >= 0 ? fmtNum(q * un) : it.valor; campo('valor').value = it.valor; }
          else if (k === 'valor') { it.origem = 'total'; const v = numero(it.valor); it.valorUn = q > 0 && v >= 0 ? fmtNum(v / q) : it.valorUn; campo('valorUn').value = it.valorUn; }
          else if (k === 'quantidade') { if (it.origem === 'un' && numero(it.valorUn) >= 0) { it.valor = q > 0 ? fmtNum(q * numero(it.valorUn)) : ''; campo('valor').value = it.valor; } else if (it.origem === 'total' && numero(it.valor) >= 0) { it.valorUn = q > 0 ? fmtNum(numero(it.valor) / q) : ''; campo('valorUn').value = it.valorUn; } }
          atualizarCalculos();
        });
        // Enter avança: produto → quantidade → valor → total → próximo item
        inp.addEventListener('keydown', ev => {
          if (ev.key !== 'Enter') return; ev.preventDefault();
          const ordem = ['texto', 'quantidade', 'valorUn', 'valor'];
          const i = ordem.indexOf(k);
          if (k === 'texto') { inp.dispatchEvent(new Event('change')); return; }
          if (i >= 0 && i < ordem.length - 1) { const n = campo(ordem[i + 1]); n?.focus(); n?.select?.(); return; }
          lerCabecalhoCompra(root);
          if (ix === compra.itens.length - 1) compra.itens.push(itemCompraVazio());
          desenhar(); root.querySelector(`.es-item[data-ix="${ix + 1}"] [data-c="texto"]`)?.focus();
        });
      });
      el.querySelector('[data-es="tirar-item"]').onclick = () => { lerCabecalhoCompra(root); compra.itens.splice(Number(el.dataset.ix), 1); if (!compra.itens.length) compra.itens.push(itemCompraVazio()); desenhar(); };
      el.querySelector('[data-es="cadastrar-do-item"]')?.addEventListener('click', ev => { ev.preventDefault(); lerCabecalhoCompra(root); modalProduto(null, pid => { const p = prodPorId(pid); if (p) Object.assign(it, itemCompraVazio(p), { quantidade: it.quantidade, valor: it.valor }); desenhar(); }); setTimeout(() => { const n = document.querySelector('#esProdForm [name=nome]'); if (n) n.value = it.texto; }, 40); });
    });
    q('[data-es="mais-item"]')?.addEventListener('click', () => { lerCabecalhoCompra(root); compra.itens.push(itemCompraVazio()); desenhar(); const l = [...root.querySelectorAll('.es-item [data-c="texto"]')].at(-1); l?.focus(); });
    q('[data-es="novo-produto-compra"]')?.addEventListener('click', () => { lerCabecalhoCompra(root); modalProduto(null, pid => { const p = prodPorId(pid); if (p) { const vazio = compra.itens.findIndex(i => !i.texto); const novo = itemCompraVazio(p); if (vazio >= 0) compra.itens[vazio] = novo; else compra.itens.push(novo); } desenhar(); }); });
    q('[data-es="salvar-compra"]')?.addEventListener('click', () => salvarCompra(root));
    q('#cFotoNota')?.addEventListener('change', ev => lerNotaPorFoto(root, ev.target));
  }
  qa('[data-es="excluir-compra"]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esta compra? Os itens saem do estoque.')) return;
    try { await rpc('est_excluir_compra', { p_compra_id: Number(b.dataset.id) }); await recarregarDados(); aviso = { tipo: 'ok', texto: '✓ Compra excluída e estoque ajustado.' }; } catch (e) { aviso = { tipo: 'erro', texto: esc(e.message) }; }
    desenhar();
  });
  // consumo
  q('[data-es="novo-consumo"]')?.addEventListener('click', () => { consumo = novoConsumo(); desenhar(); });
  qa('[data-es="editar-consumo"]').forEach(b => b.onclick = () => { const ev = d.eventos.find(x => String(x.id) === b.dataset.id); consumo = novoConsumo(); carregarConsumoExistente(consumo, ev); desenhar(); window.scrollTo(0, 0); });
  q('[data-es="cancelar-consumo"]')?.addEventListener('click', () => { consumo = null; desenhar(); });
  if (consumo && q('#kNome')) {
    ['#kNome', '#kData', '#kAdultos', '#kCriancas', '#kTipo', '#kAlcool', '#kValorRolha', '#kObs'].forEach(s => q(s)?.addEventListener('change', () => lerCabecalhoConsumo(root)));
    q('#kRolha').onchange = () => { lerCabecalhoConsumo(root); desenhar(); };
    q('#kEvento').onchange = ev => {
      lerCabecalhoConsumo(root); const id = ev.target.value;
      const ja = id && d.eventos.find(x => x.plataforma_evento_id === id);
      if (ja && consumo.id !== ja.id) { if (!confirm('Essa festa já tem consumo lançado. Abrir para editar?')) { ev.target.value = consumo.eventoPlataforma || ''; return; } consumo = novoConsumo(id); }
      else if (id) { const itens = consumo.itens; preencherDoEvento(consumo, id); if (!consumo.id) consumo.itens = itens; }
      else consumo.eventoPlataforma = '';
      desenhar();
    };
    qa('[data-es="setor-consumo"]').forEach(b => b.onclick = () => { lerCabecalhoConsumo(root); consumo.setor = b.dataset.setor; desenhar(); });
    q('[data-es="itens-padrao"]')?.addEventListener('click', () => {
      lerCabecalhoConsumo(root);
      const ja = new Set(consumo.itens.map(i => String(i.produto_id)));
      const setor = consumo.setor === 'todos' ? 'bebidas' : consumo.setor;
      const novos = ativos().filter(p => p.setor === setor && p.tipo_item !== 'reutilizavel' && saldoDe(p.id) > 0 && !ja.has(String(p.id))).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(p => itemConsumoVazio(p));
      consumo.itens = [...consumo.itens.filter(i => i.texto), ...novos]; if (!consumo.itens.length) consumo.itens = [itemConsumoVazio()];
      consumo.setor = setor; desenhar();
    });
    qa('.es-item--consumo').forEach(el => {
      const it = consumo.itens[Number(el.dataset.ix)];
      el.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        inp.addEventListener(k === 'texto' ? 'change' : 'input', () => {
          if (k === 'texto') { lerCabecalhoConsumo(root); it.texto = inp.value; const p = acharProduto(inp.value); it.produto_id = p ? p.id : ''; if (p) it.texto = rotuloProduto(p); desenhar(); if (p) root.querySelector(`.es-item[data-ix="${el.dataset.ix}"] [data-k="levado"]`)?.focus(); return; }
          it[k] = inp.value;
          if (k === 'consumido') it.sugerido = false;
          if (k === 'unidades') { const p = prodPorId(it.produto_id); const ap = p ? aprendizado(d, p.id, consumo.id) : null; const un = numero(inp.value);
            if (p && ap && ap.n >= Number(p.minimo_aprendizado || 50) && (it.levado === '' || it.levado == null) && (it.sugerido || it.consumido === '')) { it.consumido = un > 0 ? String(Number((un * ap.pesoPorUn).toFixed(3))).replace('.', ',') : ''; it.sugerido = un > 0; } }
          clearTimeout(inp._t); inp._t = setTimeout(() => { lerCabecalhoConsumo(root); const pos = inp.selectionStart; desenhar(); const n = root.querySelector(`.es-item[data-ix="${el.dataset.ix}"] [data-k="${k}"]`); n?.focus(); try { n?.setSelectionRange(pos, pos); } catch { } }, 600);
        });
      });
      el.querySelector('[data-es="tirar-consumo"]').onclick = () => { lerCabecalhoConsumo(root); consumo.itens.splice(Number(el.dataset.ix), 1); if (!consumo.itens.length) consumo.itens.push(itemConsumoVazio()); desenhar(); };
    });
    qa('.es-rec-linha').forEach(el => { const x = consumo.receitas[Number(el.dataset.rix)];
      el.querySelector('[data-rk="receita_id"]').onchange = ev => { lerCabecalhoConsumo(root); x.receita_id = ev.target.value; desenhar(); root.querySelector(`.es-rec-linha[data-rix="${el.dataset.rix}"] [data-rk="porcoes"]`)?.focus(); };
      el.querySelector('[data-rk="porcoes"]').onchange = ev => { lerCabecalhoConsumo(root); x.porcoes = ev.target.value; desenhar(); };
      el.querySelector('[data-es="tirar-receita"]').onclick = () => { lerCabecalhoConsumo(root); consumo.receitas.splice(Number(el.dataset.rix), 1); desenhar(); }; });
    q('[data-es="mais-receita"]')?.addEventListener('click', () => { lerCabecalhoConsumo(root); consumo.receitas = consumo.receitas || []; consumo.receitas.push({ receita_id: '', porcoes: '' }); desenhar(); });
    q('[data-es="mais-consumo"]')?.addEventListener('click', () => { lerCabecalhoConsumo(root); consumo.itens.push(itemConsumoVazio()); desenhar(); [...root.querySelectorAll('.es-item [data-k="texto"]')].at(-1)?.focus(); });
    q('[data-es="salvar-consumo"]')?.addEventListener('click', () => salvarConsumo(root));
    q('[data-es="excluir-consumo"]')?.addEventListener('click', async () => {
      if (!confirm('Excluir este consumo? As quantidades voltam para o estoque.')) return;
      const plat = d.eventos.find(x => String(x.id) === String(consumo.id))?.plataforma_evento_id;
      try { await rpc('est_excluir_consumo', { p_evento_id: Number(consumo.id) }); tirarDoEvento(plat); consumo = null; await recarregarDados(); aviso = { tipo: 'ok', texto: '✓ Consumo excluído e estoque devolvido.' }; } catch (e) { aviso = { tipo: 'erro', texto: esc(e.message) }; }
      desenhar();
    });
  }
  // conferência
  qa('[data-conf]').forEach(inp => inp.addEventListener('input', () => {
    conferencia[inp.dataset.conf] = inp.value;
    const s = saldoDe(inp.dataset.conf); const n = numero(inp.value); const cel = root.querySelector(`[data-dif="${inp.dataset.conf}"]`);
    if (cel) { const dif = Number.isFinite(n) ? n - s : null; cel.textContent = dif === null ? '' : dif === 0 ? '✓' : (dif > 0 ? '+' : '') + qtd(dif); cel.className = dif ? (dif < 0 ? 'es-out' : 'es-in') : ''; }
    const n2 = Object.values(conferencia).filter(v => String(v).trim() !== '').length; const b = root.querySelector('[data-es="aplicar-conf"]'); if (b) { b.disabled = !n2; b.textContent = `Acertar estoque com a contagem (${n2})`; }
  }));
  q('[data-es="limpar-conf"]')?.addEventListener('click', () => { conferencia = {}; desenhar(); });
  q('[data-es="aplicar-conf"]')?.addEventListener('click', async () => {
    const itens = Object.entries(conferencia).filter(([, v]) => String(v).trim() !== '').map(([id, v]) => ({ produto_id: Number(id), contada: numero(v) }));
    if (itens.some(i => !(i.contada >= 0))) return alert('Há contagem inválida. Use só números (ex.: 12 ou 3,5).');
    const difs = itens.filter(i => Math.abs(i.contada - saldoDe(i.produto_id)) > 1e-9).length;
    if (!confirm(`Acertar o estoque de ${itens.length} produto(s)? ${difs} têm diferença e serão corrigidos.`)) return;
    ocupado = true; desenhar();
    try { await rpc('est_aplicar_conferencia', { p: { observacao: q('#confObs')?.value || '', setor: ui.setor === 'todos' ? null : ui.setor, itens } }); conferencia = {}; await recarregarDados(); aviso = { tipo: 'ok', texto: `✓ Conferência aplicada: ${itens.length} produto(s) contados, ${difs} corrigido(s).` }; }
    catch (e) { aviso = { tipo: 'erro', texto: esc(e.message) }; }
    ocupado = false; desenhar(); window.scrollTo(0, 0);
  });
}

export function mount() {
  const root = document.querySelector('#app');
  rootAtual = root;
  // pedidos vindos de outras telas (Bebidas, evento da plataforma)
  const pedido = lerUi();
  if (pedido.novo || pedido.eventoPlataforma) {
    ui = { ...ui, aba: pedido.aba || ui.aba, setor: pedido.setor || ui.setor };
    if (d && pedido.aba === 'compras' && !compra) compra = novaCompra();
    if (d && pedido.aba === 'consumo') consumo = novoConsumo(pedido.eventoPlataforma || '');
    else if (pedido.aba === 'consumo') ui._pedidoConsumo = pedido.eventoPlataforma || '';
    else if (pedido.aba === 'compras') ui._pedidoCompra = true;
    salvarUi();
    root.innerHTML = render();
  }
  ligar(root);
  if (!sit || !d) iniciar().then(() => {
    if (d && ui._pedidoConsumo !== undefined) { consumo = novoConsumo(ui._pedidoConsumo); delete ui._pedidoConsumo; desenhar(); }
    if (d && ui._pedidoCompra) { compra = compra || novaCompra(); delete ui._pedidoCompra; desenhar(); }
  });
}
