// Contrato de prestação de serviços — modelo v2 (Plataforma Lega 1.1.7)
// -----------------------------------------------------------------------
// Este arquivo concentra tudo que é específico do contrato:
//   • dados da CONTRATADA (editáveis em Configurações);
//   • condições de pagamento (entrada editável, parcelas com data, à vista);
//   • texto jurídico do contrato (modelo revisado);
//   • fluxo de assinatura eletrônica pelo gov.br (assinador.iti.br).
// O módulo Eventos importa estas funções; nenhum dado novo muda de chave
// de armazenamento, apenas são acrescentados campos às versões do contrato.

import { readJSON, writeJSON } from '../../js/storage.js';

export const CONTRATADA_KEY = 'lega.contratada';
export const TEMPLATE_VERSAO = 2;
export const FORMAS = ['Pix', 'Transferência bancária', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Boleto'];
export const ESTADOS_CIVIS = ['', 'Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)'];
export const GOVBR = {
  assinador: 'https://assinador.iti.br',
  validador: 'https://validar.iti.gov.br',
  conta: 'https://www.gov.br/governodigital/pt-br/conta-gov-br'
};

export const CONTRATADA_PADRAO = {
  razaoSocial: 'Lega Eventos Ltda',
  nomeFantasia: 'Lega Eventos',
  cnpj: '58.363.804/0001-35',
  endereco: 'Avenida Pinheiro Machado, nº 518',
  bairro: '',
  cidade: 'Caçapava do Sul',
  estado: 'RS',
  cep: '',
  telefone: '55 99674-1239',
  email: '',
  representante: '',
  representanteCpf: '',
  representanteCargo: 'sócio(a) administrador(a)',
  chavePix: '',
  dadosBancarios: '',
  foro: 'Caçapava do Sul/RS'
};

export function getContratada() {
  return { ...CONTRATADA_PADRAO, ...(readJSON(CONTRATADA_KEY, {}) || {}) };
}
export function saveContratada(dados) {
  writeJSON(CONTRATADA_KEY, { ...getContratada(), ...dados, updatedAt: new Date().toISOString() });
}
export function contratadaPendencias(ct = getContratada()) {
  const faltando = [];
  if (!ct.representante) faltando.push('nome do representante legal');
  if (!ct.representanteCpf) faltando.push('CPF do representante');
  if (!ct.cep) faltando.push('CEP da sede');
  if (!ct.chavePix && !ct.dadosBancarios) faltando.push('chave PIX ou dados bancários');
  return faltando;
}

// ---------------------------------------------------------------- utilidades
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round2 = v => Math.round(Number(v || 0) * 100) / 100;
export const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export function dateBR(v) {
  if (!v) return '____/____/______';
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
  return y && m && d ? new Intl.DateTimeFormat('pt-BR').format(new Date(y, m - 1, d)) : '____/____/______';
}
function fromISO(v) { const [y, m, d] = String(v).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); }
function toISO(dt) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
export function addMonths(iso, n) {
  if (!iso) return '';
  const base = fromISO(iso); const dia = base.getDate();
  const alvo = new Date(base.getFullYear(), base.getMonth() + n, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(dia, ultimo));
  return toISO(alvo);
}
export function addDays(iso, n) { if (!iso) return ''; const dt = fromISO(iso); dt.setDate(dt.getDate() + n); return toISO(dt); }
// Volta N dias úteis (segunda a sexta). Feriados não são considerados.
export function businessDaysBefore(iso, n) {
  if (!iso) return '';
  const dt = fromISO(iso); let faltam = n;
  while (faltam > 0) { dt.setDate(dt.getDate() - 1); const w = dt.getDay(); if (w !== 0 && w !== 6) faltam--; }
  return toISO(dt);
}
function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }

export function validaCPF(cpf = '') {
  const n = String(cpf).replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = len => { let s = 0; for (let i = 0; i < len; i++) s += Number(n[i]) * (len + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(n[9]) && dv(10) === Number(n[10]);
}
export function idadeEm(nascimento, referencia = todayISO()) {
  if (!nascimento) return null;
  const a = fromISO(nascimento), b = fromISO(referencia);
  let idade = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) idade--;
  return idade;
}

// Valor por extenso (reais), padrão usado em contratos.
function extensoInteiro(n) {
  const u = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = x => {
    if (x === 0) return ''; if (x === 100) return 'cem';
    const partes = []; const h = Math.floor(x / 100), r = x % 100;
    if (h) partes.push(c[h]);
    if (r) { if (r < 20) partes.push(u[r]); else { const t = Math.floor(r / 10), o = r % 10; partes.push(o ? `${d[t]} e ${u[o]}` : d[t]); } }
    return partes.join(' e ');
  };
  if (n === 0) return 'zero';
  const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const grupos = [];
  if (mi) grupos.push({ v: mi * 1e6, t: mi === 1 ? 'um milhão' : `${ate999(mi)} milhões` });
  if (mil) grupos.push({ v: mil * 1000, t: mil === 1 ? 'mil' : `${ate999(mil)} mil` });
  if (resto) grupos.push({ v: resto, t: ate999(resto) });
  return grupos.reduce((s, g, i) => {
    if (i === 0) return g.t;
    const ultimo = i === grupos.length - 1;
    const usaE = ultimo && (g.v < 100 || g.v % 100 === 0);
    return `${s}${usaE ? ' e ' : ' '}${g.t}`;
  }, '');
}
export function valorPorExtenso(valor) {
  const total = Math.round(Math.abs(Number(valor || 0)) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const partes = [];
  if (reais) {
    const exatoMilhao = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${extensoInteiro(reais)}${exatoMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cent) partes.push(`${extensoInteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}
const valorCompleto = v => `${money(v)} (${valorPorExtenso(v)})`;

// ------------------------------------------------------ condições de pagamento
export function gerarParcelas(saldo, quantidade, primeiroVencimento, forma = 'Pix') {
  const n = Math.max(1, Math.min(24, Math.floor(Number(quantidade || 1))));
  const cents = Math.round(Number(saldo || 0) * 100);
  const base = Math.floor(cents / n); const resto = cents - base * n;
  return Array.from({ length: n }, (_, i) => ({
    id: `par_${i + 1}`, numero: i + 1,
    valor: (base + (i < resto ? 1 : 0)) / 100,
    vencimento: primeiroVencimento ? addMonths(primeiroVencimento, i) : '',
    forma
  }));
}

// Converte contratos antigos (v1, só entrada) para a estrutura nova, para que
// o formulário e o financeiro funcionem também com versões já emitidas.
export function pagamentoDoSnapshot(snap, totalOrcamento) {
  if (snap?.pagamento) return snap.pagamento;
  const total = Number(totalOrcamento || snap?.orcamento?.valor || 0);
  const tipo = snap?.entradaTipo === 'valor' ? 'valor' : 'percentual';
  const percentual = Number(snap?.entradaPercentualUsado ?? 30);
  const valor = tipo === 'valor' ? Number(snap?.entradaValorUsado || 0) : round2(total * percentual / 100);
  return {
    legado: true, modalidade: 'parcelado', valorBase: total, valorContrato: total, descontoAvistaPerc: 0,
    entrada: { tipo, percentual: total ? round2(valor / total * 100) : 0, valor, forma: '', vencimento: '' },
    parcelas: [], observacoes: ''
  };
}

export function cronogramaDe(pagamento) {
  if (!pagamento) return [];
  if (pagamento.modalidade === 'avista') {
    return [{ id: 'avista', descricao: 'Pagamento à vista (integral)', valor: Number(pagamento.valorContrato || 0), vencimento: pagamento.avista?.vencimento || '', forma: pagamento.avista?.forma || '' }];
  }
  const itens = [];
  if (Number(pagamento.entrada?.valor || 0) > 0) itens.push({ id: 'entrada', descricao: 'Entrada (sinal e princípio de pagamento)', valor: Number(pagamento.entrada.valor), vencimento: pagamento.entrada.vencimento || '', forma: pagamento.entrada.forma || '' });
  const n = (pagamento.parcelas || []).length;
  (pagamento.parcelas || []).forEach((p, i) => itens.push({ id: p.id || `par_${i + 1}`, descricao: `Parcela ${i + 1}/${n}`, valor: Number(p.valor || 0), vencimento: p.vencimento || '', forma: p.forma || '' }));
  return itens;
}

const opt = (lista, atual) => lista.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(atual) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

function parcelaRows(parcelas) {
  if (!parcelas.length) return '<tr><td colspan="4" class="pg-empty">Sem parcelas: o saldo é zero.</td></tr>';
  return parcelas.map((p, i) => `<tr data-row="${i}">
    <td><strong>${i + 1}/${parcelas.length}</strong></td>
    <td><input type="date" name="pg_p${i}_venc" value="${esc(p.vencimento || '')}" required></td>
    <td><input type="number" name="pg_p${i}_valor" value="${round2(p.valor).toFixed(2)}" min="0.01" step="0.01" required></td>
    <td><select name="pg_p${i}_forma">${opt(FORMAS, p.forma || 'Pix')}</select></td>
  </tr>`).join('');
}

/**
 * Seção "Condições de pagamento" do formulário do contrato.
 * @param {{total:number, cfgPerc:number, descontoPerc:number, dataEvento:string, anterior:object|null}} ctx
 */
export function paymentSection({ total, cfgPerc, descontoPerc, dataEvento, anterior }) {
  const prev = anterior || null;
  const modalidade = prev?.modalidade || 'parcelado';
  const en = prev?.entrada || {};
  const enTipo = en.tipo === 'valor' ? 'valor' : 'percentual';
  const enPerc = en.percentual ?? cfgPerc;
  const enValor = round2(en.valor ?? total * cfgPerc / 100);
  const enVenc = en.vencimento || todayISO();
  const enForma = en.forma || 'Pix';
  const saldo = Math.max(0, round2(total - (enTipo === 'valor' ? enValor : total * enPerc / 100)));
  const limite = businessDaysBefore(dataEvento, 5);
  let parcelas = Array.isArray(prev?.parcelas) && prev.parcelas.length ? prev.parcelas : null;
  const qtd = parcelas ? parcelas.length : Math.max(1, Math.min(6, (() => { if (!dataEvento) return 3; let m = 0; let d = addMonths(enVenc, 1); while (d && d <= limite && m < 6) { m++; d = addMonths(enVenc, m + 1); } return Math.max(1, m); })()));
  const primeiro = parcelas?.[0]?.vencimento || addMonths(enVenc, 1);
  const formaPadrao = parcelas?.[0]?.forma || 'Pix';
  if (!parcelas) parcelas = saldo > 0 ? gerarParcelas(saldo, qtd, primeiro, formaPadrao) : [];
  const av = prev?.avista || {};
  const avDesconto = prev?.modalidade === 'avista' ? Number(prev?.descontoAvistaPerc || 0) > 0 : true;
  return `<section class="pg-section" id="pgSection" data-total="${total}" data-desconto="${descontoPerc}" data-evento="${esc(dataEvento || '')}" data-limite="${esc(limite)}">
    <div class="panel-header" style="margin-top:22px"><div><h3>Condições de pagamento escolhidas pelo cliente</h3><p>Escolha aqui como o cliente vai pagar (à vista ou entrada + parcelas, com datas). É exatamente isto que sai na Cláusula 4ª do contrato. Valor do orçamento: <b>${money(total)}</b>.</p></div></div>
    <div class="form-grid">
      <div class="field"><label>Modalidade</label><select name="pg_modalidade">${opt([['parcelado', 'Entrada + parcelas'], ['avista', 'À vista (pagamento único)']], modalidade)}</select></div>
    </div>
    <div class="pg-block" data-pg="avista">
      <div class="form-grid">
        <label class="pg-check"><input type="checkbox" name="pg_av_desconto" ${avDesconto ? 'checked' : ''}><span>Aplicar desconto à vista de ${descontoPerc}%</span></label>
        <div class="field"><label>Vencimento do pagamento</label><input type="date" name="pg_av_vencimento" value="${esc(av.vencimento || todayISO())}"></div>
        <div class="field"><label>Forma de pagamento</label><select name="pg_av_forma">${opt(FORMAS, av.forma || 'Pix')}</select></div>
      </div>
    </div>
    <div class="pg-block" data-pg="parcelado">
      <h4 class="pg-subtitle">Entrada</h4>
      <div class="form-grid">
        <div class="field"><label>Tipo de entrada</label><select name="pg_en_tipo">${opt([['percentual', 'Percentual (%)'], ['valor', 'Valor fixo (R$)']], enTipo)}</select></div>
        <div class="field" data-en="percentual"><label>Percentual da entrada (%)</label><input type="number" name="pg_en_percentual" value="${round2(enPerc)}" min="0" max="100" step="0.01"></div>
        <div class="field" data-en="valor"><label>Valor da entrada (R$)</label><input type="number" name="pg_en_valor" value="${enValor.toFixed(2)}" min="0" step="0.01"></div>
        <div class="field"><label>Vencimento da entrada</label><input type="date" name="pg_en_vencimento" value="${esc(enVenc)}"></div>
        <div class="field"><label>Forma de pagamento da entrada</label><select name="pg_en_forma">${opt(FORMAS, enForma)}</select></div>
      </div>
      <h4 class="pg-subtitle">Saldo parcelado</h4>
      <div class="form-grid">
        <div class="field"><label>Quantidade de parcelas</label><input type="number" name="pg_qtd" value="${parcelas.length || 1}" min="1" max="24" step="1"></div>
        <div class="field"><label>1º vencimento</label><input type="date" name="pg_primeiro" value="${esc(primeiro)}"></div>
        <div class="field"><label>Forma padrão das parcelas</label><select name="pg_forma_padrao">${opt(FORMAS, formaPadrao)}</select></div>
        <div class="field pg-actions"><label>&nbsp;</label><button type="button" class="btn btn-ghost" data-action="pg-regenerar">↻ Recalcular parcelas</button></div>
      </div>
      <p class="pg-hint">As parcelas são mensais a partir do 1º vencimento. Você pode editar a data, o valor e a forma de cada uma na tabela. Alterar entrada, quantidade ou 1º vencimento recalcula a tabela.</p>
      <div class="table-wrap"><table class="event-table pg-table"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor (R$)</th><th>Forma</th></tr></thead><tbody id="pgParcelas">${parcelaRows(parcelas)}</tbody></table></div>
    </div>
    <div class="field field-full" style="margin-top:14px"><label>Observações sobre o pagamento (opcional — sai no contrato)</label><textarea name="pg_obs" rows="2" placeholder="Ex.: parcelas com vencimento no dia 10; cartão em até 3x pela maquininha.">${esc(prev?.observacoes || '')}</textarea></div>
    <div class="pg-summary" id="pgResumo"></div>
  </section>`;
}

/** Lê o formulário e devolve {pagamento, erros, avisos}. */
export function readPayment(form) {
  const sec = form.querySelector('#pgSection');
  const total = Number(sec?.dataset.total || 0);
  const descontoPerc = Number(sec?.dataset.desconto || 0);
  const dataEvento = sec?.dataset.evento || '';
  const limite = sec?.dataset.limite || '';
  const f = n => form.elements[n]?.value ?? '';
  const erros = [], avisos = [];
  const modalidade = f('pg_modalidade') === 'avista' ? 'avista' : 'parcelado';
  const observacoes = f('pg_obs').trim();
  if (modalidade === 'avista') {
    const aplica = !!form.elements.pg_av_desconto?.checked;
    const valorContrato = round2(aplica ? total * (1 - descontoPerc / 100) : total);
    const vencimento = f('pg_av_vencimento');
    if (!vencimento) erros.push('Informe a data do pagamento à vista.');
    if (dataEvento && vencimento && vencimento > dataEvento) avisos.push('O pagamento à vista vence depois da data do evento.');
    else if (limite && vencimento && vencimento > limite) avisos.push(`O pagamento à vista vence após ${dateBR(limite)} (5 dias úteis antes do evento).`);
    const pagamento = { modalidade, valorBase: total, descontoAvistaPerc: aplica ? descontoPerc : 0, valorContrato, avista: { vencimento, forma: f('pg_av_forma') }, entrada: { tipo: 'valor', percentual: 100, valor: valorContrato, forma: f('pg_av_forma'), vencimento }, parcelas: [], observacoes };
    return { pagamento, erros, avisos, limite, dataEvento };
  }
  const tipo = f('pg_en_tipo') === 'valor' ? 'valor' : 'percentual';
  let valorEntrada = tipo === 'valor' ? round2(f('pg_en_valor')) : round2(total * Number(f('pg_en_percentual') || 0) / 100);
  if (valorEntrada < 0) erros.push('A entrada não pode ser negativa.');
  if (valorEntrada > total + 0.001) erros.push('A entrada é maior que o valor do contrato.');
  const percentual = total ? round2(valorEntrada / total * 100) : 0;
  const venc = f('pg_en_vencimento');
  if (valorEntrada > 0 && !venc) erros.push('Informe o vencimento da entrada.');
  const saldo = Math.max(0, round2(total - valorEntrada));
  const parcelas = [];
  form.querySelectorAll('#pgParcelas tr[data-row]').forEach((tr, i) => {
    parcelas.push({ id: `par_${i + 1}`, numero: i + 1, vencimento: f(`pg_p${i}_venc`), valor: round2(f(`pg_p${i}_valor`)), forma: f(`pg_p${i}_forma`) });
  });
  const soma = round2(parcelas.reduce((s, p) => s + p.valor, 0));
  if (saldo > 0 && !parcelas.length) erros.push('Há saldo a pagar: gere ao menos uma parcela.');
  if (Math.abs(soma - saldo) > 0.009) erros.push(`A soma das parcelas (${money(soma)}) é diferente do saldo (${money(saldo)}). Diferença: ${money(saldo - soma)}.`);
  parcelas.forEach((p, i) => {
    if (!p.vencimento) erros.push(`Informe o vencimento da parcela ${i + 1}.`);
    if (!(p.valor > 0)) erros.push(`O valor da parcela ${i + 1} deve ser maior que zero.`);
    if (i > 0 && p.vencimento && parcelas[i - 1].vencimento && p.vencimento < parcelas[i - 1].vencimento) avisos.push(`A parcela ${i + 1} vence antes da parcela ${i}.`);
  });
  if (venc && parcelas[0]?.vencimento && parcelas[0].vencimento < venc) avisos.push('A primeira parcela vence antes da entrada.');
  const ultima = parcelas.map(p => p.vencimento).filter(Boolean).sort().at(-1) || venc;
  if (dataEvento && ultima && ultima > dataEvento) avisos.push('Existe pagamento com vencimento DEPOIS da data do evento.');
  else if (limite && ultima && ultima > limite) avisos.push(`Existe pagamento vencendo após ${dateBR(limite)} (5 dias úteis antes do evento). O contrato passará a citar apenas o cronograma.`);
  const pagamento = { modalidade, valorBase: total, descontoAvistaPerc: 0, valorContrato: total, entrada: { tipo, percentual, valor: valorEntrada, forma: f('pg_en_forma'), vencimento: venc }, parcelas, observacoes };
  return { pagamento, erros, avisos, limite, dataEvento, saldo, soma };
}

/** Liga os eventos da seção de pagamento (chamar após renderizar o formulário). */
export function bindPaymentSection(form) {
  const sec = form.querySelector('#pgSection'); if (!sec) return;
  const total = Number(sec.dataset.total || 0);
  const desconto = Number(sec.dataset.desconto || 0);
  const tbody = form.querySelector('#pgParcelas');
  const resumo = form.querySelector('#pgResumo');
  const el = n => form.elements[n];
  const entradaAtual = () => el('pg_en_tipo').value === 'valor' ? round2(el('pg_en_valor').value) : round2(total * Number(el('pg_en_percentual').value || 0) / 100);
  const regenerar = () => {
    const q = el('pg_qtd'); q.value = String(Math.max(1, Math.min(24, Math.floor(Number(q.value) || 1))));
    const saldo = Math.max(0, round2(total - entradaAtual()));
    const parcelas = saldo > 0 ? gerarParcelas(saldo, el('pg_qtd').value, el('pg_primeiro').value, el('pg_forma_padrao').value) : [];
    tbody.innerHTML = parcelaRows(parcelas);
    atualizar();
  };
  const atualizar = () => {
    const modalidade = el('pg_modalidade').value;
    sec.querySelectorAll('[data-pg]').forEach(b => { b.hidden = b.dataset.pg !== modalidade; b.querySelectorAll('input,select').forEach(i => { i.disabled = b.hidden; }); });
    const tipo = el('pg_en_tipo').value;
    sec.querySelectorAll('[data-en]').forEach(b => { b.hidden = b.dataset.en !== tipo; });
    // mantém percentual e valor coerentes entre si
    if (tipo === 'valor' && total) el('pg_en_percentual').value = round2(Number(el('pg_en_valor').value || 0) / total * 100);
    if (tipo === 'percentual') el('pg_en_valor').value = (total * Number(el('pg_en_percentual').value || 0) / 100).toFixed(2);
    const r = readPayment(form);
    const p = r.pagamento;
    const linhas = modalidade === 'avista'
      ? `<div><small>Valor do contrato</small><strong>${money(p.valorContrato)}</strong>${p.descontoAvistaPerc ? `<span>com ${desconto}% de desconto sobre ${money(total)}</span>` : ''}</div><div><small>Vencimento</small><strong>${dateBR(p.avista.vencimento)}</strong><span>${esc(p.avista.forma)}</span></div>`
      : `<div><small>Entrada</small><strong>${money(p.entrada.valor)}</strong><span>${p.entrada.percentual}% · ${dateBR(p.entrada.vencimento)}</span></div><div><small>Saldo</small><strong>${money(r.saldo)}</strong><span>${p.parcelas.length} parcela(s) · soma ${money(r.soma)}</span></div>`;
    const prazo = r.limite ? `<p class="pg-limit">Prazo de quitação recomendado (5 dias úteis antes do evento): <b>${dateBR(r.limite)}</b></p>` : '';
    resumo.innerHTML = `<div class="payment-preview">${linhas}</div>${prazo}${r.erros.length ? `<ul class="pg-errors">${r.erros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${r.avisos.length ? `<ul class="pg-warnings">${r.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${p.parcelas.length && Math.abs(r.soma - r.saldo) > 0.009 ? '<button type="button" class="btn btn-ghost" data-action="pg-ajustar">Ajustar diferença na última parcela</button>' : ''}`;
    resumo.querySelector('[data-action="pg-ajustar"]')?.addEventListener('click', () => {
      const rows = tbody.querySelectorAll('tr[data-row]'); const last = rows.length - 1; if (last < 0) return;
      const input = el(`pg_p${last}_valor`); input.value = round2(Number(input.value || 0) + (r.saldo - r.soma)).toFixed(2); atualizar();
    });
  };
  ['pg_en_tipo', 'pg_en_percentual', 'pg_en_valor', 'pg_qtd', 'pg_primeiro', 'pg_forma_padrao'].forEach(n => el(n)?.addEventListener('change', regenerar));
  el('pg_en_vencimento')?.addEventListener('change', () => { if (el('pg_en_vencimento').value) el('pg_primeiro').value = addMonths(el('pg_en_vencimento').value, 1); regenerar(); });
  ['pg_modalidade', 'pg_av_desconto', 'pg_av_vencimento', 'pg_av_forma'].forEach(n => el(n)?.addEventListener('change', atualizar));
  tbody.addEventListener('input', atualizar);
  form.querySelector('[data-action="pg-regenerar"]')?.addEventListener('click', regenerar);
  atualizar();
}

// ------------------------------------------------------------ texto do contrato
export function contractCode(eventId = '', createdAt = '', versao = 1) {
  const ano = String(createdAt || new Date().toISOString()).slice(0, 4);
  const sufixo = String(eventId).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'MINUTA';
  return `LEGA-${ano}-${sufixo}-V${versao}`;
}

function qualificacaoContratante(c) {
  const partes = [`<b>${esc(c.nome || '')}</b>`];
  if (c.nacionalidade) partes.push(esc(c.nacionalidade));
  if (c.estadoCivil) partes.push(esc(c.estadoCivil).toLowerCase());
  if (c.profissao) partes.push(esc(c.profissao));
  if (c.dataNascimento) partes.push(`nascido(a) em ${dateBR(c.dataNascimento)}`);
  if (c.rg) partes.push(`portador(a) do RG nº ${esc(c.rg)}`);
  partes.push(`inscrito(a) no CPF sob o nº ${esc(c.cpf || '_______________')}`);
  const end = [c.endereco, c.bairro && `bairro ${c.bairro}`, c.cidade && `${c.cidade}/${c.estado || ''}`, c.cep && `CEP ${c.cep}`].filter(Boolean).map(esc).join(', ');
  partes.push(`residente e domiciliado(a) em ${end || '________________________'}`);
  const contato = [c.telefone && `telefone ${esc(c.telefone)}`, c.email && `e-mail ${esc(c.email)}`].filter(Boolean).join(', ');
  if (contato) partes.push(contato);
  return partes.join(', ');
}
function qualificacaoContratada(ct) {
  const end = [ct.endereco, ct.bairro && `bairro ${ct.bairro}`, ct.cidade && `${ct.cidade}/${ct.estado || ''}`, ct.cep && `CEP ${ct.cep}`].filter(Boolean).map(esc).join(', ');
  const rep = ct.representante ? `, neste ato representada por seu(sua) ${esc(ct.representanteCargo || 'representante legal')} <b>${esc(ct.representante)}</b>${ct.representanteCpf ? `, CPF nº ${esc(ct.representanteCpf)}` : ''}` : ', neste ato representada na forma de seu contrato social';
  return `<b>${esc(ct.razaoSocial)}</b>${ct.nomeFantasia ? ` (nome fantasia ${esc(ct.nomeFantasia)})` : ''}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${esc(ct.cnpj)}, com sede em ${end || '________________________'}${ct.telefone ? `, telefone ${esc(ct.telefone)}` : ''}${ct.email ? `, e-mail ${esc(ct.email)}` : ''}${rep}`;
}

/**
 * Monta o HTML completo do contrato.
 * ctx = { snap, eventId, calc:{duracao}, cfg, rascunho }
 */
export function contractHTML({ snap, eventId, calc, cfg, rascunho = false }) {
  const q = snap.orcamento || {};
  const c = snap.cliente || {};
  const ct = { ...CONTRATADA_PADRAO, ...(snap.contratada || getContratada()) };
  const pg = pagamentoDoSnapshot(snap, Number(q.valor || 0));
  const valorContrato = Number(pg.valorContrato ?? q.valor ?? 0);
  const cronograma = cronogramaDe(pg);
  const codigo = snap.codigo || contractCode(eventId, snap.createdAt, snap.versao || 1);
  const duracao = Number(calc?.duracao || cfg?.duracao || 4);
  const fim = q.horaInicio ? `${String((Number(q.horaInicio.slice(0, 2)) + duracao) % 24).padStart(2, '0')}:${q.horaInicio.slice(3)}` : '';
  const horario = q.horaInicio ? `das ${q.horaInicio} às ${fim}` : 'em horário a ser confirmado no checklist';
  const servicos = [...(cfg?.gastronomia || []), ...(cfg?.estrutura || [])].map(x => `<li>${esc(x)}</li>`).join('');
  const dataLista = q.data ? dateBR(addDays(q.data, -10)) : '____/____/______';
  const dataHoraExtra = q.data ? dateBR(addDays(q.data, -30)) : '____/____/______';
  const limite = q.data ? businessDaysBefore(q.data, 5) : '';
  const ultimoVenc = cronograma.map(x => x.vencimento).filter(Boolean).sort().at(-1) || '';
  const dentroDoPrazo = !limite || !ultimoVenc || ultimoVenc <= limite;
  const dataContrato = snap.createdAt ? new Date(snap.createdAt) : new Date();
  const dataExtenso = dataContrato.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const valorHora = cfg?.permiteHoraExtra && Number(cfg?.valorHoraExtra) > 0 ? Number(cfg.valorHoraExtra) : (duracao ? valorContrato / duracao : 0);
  const fracao15 = round2(valorHora / 4);
  const autorizaImagem = snap.autorizaImagem !== 'nao';
  const tabela = cronograma.length
    ? `<table class="crono"><thead><tr><th>Pagamento</th><th>Vencimento</th><th>Valor</th><th>Forma</th></tr></thead><tbody>${cronograma.map(x => `<tr><td>${esc(x.descricao)}</td><td>${dateBR(x.vencimento)}</td><td>${money(x.valor)}</td><td>${esc(x.forma || 'A combinar')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td colspan="2"><b>${money(cronograma.reduce((s, x) => s + x.valor, 0))}</b></td></tr></tfoot></table>`
    : `<p class="clausula">Entrada de <b>${money(pg.entrada?.valor)}</b> na assinatura deste contrato e saldo de <b>${money(Math.max(0, valorContrato - Number(pg.entrada?.valor || 0)))}</b> conforme acordado entre as partes.</p>`;
  const dadosPagamento = [ct.chavePix && `Chave PIX: <b>${esc(ct.chavePix)}</b> (titular: ${esc(ct.razaoSocial)})`, ct.dadosBancarios && `Dados bancários: ${esc(ct.dadosBancarios)}`].filter(Boolean).join('<br>');
  const descontoTxt = pg.modalidade === 'avista' && Number(pg.descontoAvistaPerc) > 0 ? `, já considerado o desconto de ${pg.descontoAvistaPerc}% para pagamento à vista sobre o valor de tabela/orçamento de ${money(pg.valorBase)}` : '';
  let n = 0; const cl = () => `${++n}ª`;
  let pn = 0; const par = () => `Parágrafo ${['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo'][pn++]}:`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato ${esc(codigo)} - ${esc(c.nome || q.cliente || '')}</title><style>
  @page{size:A4;margin:16mm 17mm 18mm}
  @page{@bottom-left{content:"${esc(codigo)}";font:9px Arial;color:#777}@bottom-right{content:"Página " counter(page) " de " counter(pages);font:9px Arial;color:#777}}
  *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#222;max-width:176mm;margin:auto;font-size:11.2px}
  .toolbar{position:fixed;right:16px;top:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;z-index:10;max-width:330px}
  .toolbar button{padding:12px 18px;background:#6f3b91;color:#fff;border:0;border-radius:20px;font-weight:bold;cursor:pointer}
  .toolbar .dica{background:#fff8e1;border:1px solid #e3b94f;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.4}
  .minuta{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90px;color:rgba(160,0,0,.08);transform:rotate(-30deg);pointer-events:none;font-weight:900}
  h1{text-align:center;font-size:16px;margin:0 0 4px;letter-spacing:.3px}.codigo{text-align:center;font-size:10px;color:#666;margin-bottom:16px}
  h2{font-size:12px;margin:16px 0 6px;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:3px;break-after:avoid;page-break-after:avoid}
  .clausula{text-align:justify;margin:6px 0}.servicos{margin:4px 0 8px;padding-left:20px;columns:2}.servicos li{margin:1px 0}
  .quadro{border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin:8px 0;background:#fafafa}.quadro b{display:inline-block;min-width:150px}
  table.crono{width:100%;border-collapse:collapse;margin:6px 0 8px}table.crono th,table.crono td{border:1px solid #bbb;padding:4px 6px;text-align:left}table.crono th{background:#f0eaf5}
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:22px;text-align:center}.assina{min-height:120px;display:flex;flex-direction:column;justify-content:flex-end}
  .assina .campo{font-size:9px;color:#888;border:1px dashed #ccc;border-radius:6px;padding:6px;margin-bottom:6px;min-height:68px;display:flex;align-items:center;justify-content:center}
  .linha{border-top:1px solid #222;padding-top:6px}.testemunhas{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:26px;font-size:10px;text-align:center}
  .nota{font-size:9.5px;color:#555;margin-top:6px;text-align:justify}.quebra-evitar{break-inside:avoid;page-break-inside:avoid}
  @media print{.toolbar,.minuta{display:none}body{max-width:none}}
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">Salvar / Imprimir PDF</button><div class="dica"><b>Para assinar no gov.br:</b> clique em “Salvar / Imprimir PDF”, escolha <b>Salvar como PDF</b> como destino e desmarque “Cabeçalhos e rodapés”. Depois envie o arquivo em <b>assinador.iti.br</b>.</div></div>
  ${rascunho ? '<div class="minuta">MINUTA</div>' : ''}
  <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FESTA E EVENTO</h1>
  <div class="codigo">Contrato nº ${esc(codigo)}${rascunho ? ' · MINUTA PARA CONFERÊNCIA — SEM VALOR DE ASSINATURA' : ''}</div>

  <p class="clausula"><b>CONTRATANTE:</b> ${qualificacaoContratante(c)}.</p>
  <p class="clausula"><b>CONTRATADA:</b> ${qualificacaoContratada(ct)}.</p>
  <p class="clausula">As partes acima qualificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas a seguir e pela legislação aplicável, em especial o Código Civil (Lei nº 10.406/2002) e o Código de Defesa do Consumidor (Lei nº 8.078/1990).</p>

  <div class="quadro quebra-evitar">
    <b>Evento:</b> ${esc(q.nome || q.tipo || 'Evento')}<br>
    <b>Tema:</b> ${esc(q.tema || 'A definir no checklist')}<br>
    <b>Data e horário:</b> ${dateBR(q.data)}, ${horario} (${duracao} horas de duração)<br>
    <b>Local:</b> sede da CONTRATADA — ${esc([ct.endereco, ct.bairro, ct.cidade && `${ct.cidade}/${ct.estado}`].filter(Boolean).join(', '))}<br>
    <b>Convidados contratados:</b> ${Number(q.convidadosTotal || 0)} pessoas (pagantes)<br>
    <b>Pacote:</b> ${esc(q.pacote || '')}${Number(q.horasExtras || 0) ? ` + ${q.horasExtras} hora(s) extra(s)` : ''}<br>
    <b>Valor total do contrato:</b> ${valorCompleto(valorContrato)}
  </div>

  <h2>Cláusula ${cl()} — Do objeto</h2>
  <p class="clausula">O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviços de festa e evento na data, horário e local indicados no quadro acima, compreendendo o pacote <b>${esc(q.pacote || '')}</b>, com os seguintes itens:</p>
  <ul class="servicos">${servicos}</ul>
  <p class="clausula"><b>Parágrafo primeiro:</b> A CONTRATADA disponibilizará a decoração padrão do pacote no Painel de LED, composta por: painel MDF com LED; painel de fundo em voal ou de folhas verdes; 1 painel redondo de 1,5 m e/ou 1 painel romano e/ou painel romano branco 3D; 1 arco orgânico de balões de 1,50 m; 2 a 3 cilindros e/ou mesa; tapete; bolo e doces personalizados na mesa principal, com nome e idade e/ou imagem do tema; bandejas; escada ou mesa de MDF para lembrancinhas.</p>
  <p class="clausula"><b>Parágrafo segundo:</b> Demais itens de decoração, lembrancinhas e centros de mesa são de responsabilidade do CONTRATANTE. A CONTRATADA não fornece alimentos nem embalagens para viagem.</p>
  ${q.observacoes ? `<p class="clausula"><b>Parágrafo terceiro:</b> Condições específicas acordadas: ${esc(q.observacoes)}</p>` : ''}

  <h2>Cláusula ${cl()} — Das obrigações da CONTRATADA</h2>
  <p class="clausula">A CONTRATADA obriga-se a: (a) fornecer os alimentos e bebidas do pacote contratado, observadas as normas sanitárias vigentes; (b) disponibilizar as instalações em bom estado de conservação, limpeza e segurança, respeitada a lotação máxima do espaço; (c) disponibilizar a equipe de atendimento prevista no pacote; (d) enviar ao CONTRATANTE os checklists de organização com os prazos de cada etapa.</p>

  <h2>Cláusula ${cl()} — Das obrigações do CONTRATANTE</h2>
  <p class="clausula">O CONTRATANTE obriga-se a: (a) efetuar os pagamentos nas datas e valores ajustados na Cláusula 4ª; (b) fornecer à CONTRATADA as informações necessárias à adequada realização do evento e cumprir os prazos dos checklists (confirmação de pessoas, tema, recheios de bolo, sabores de doces etc.); (c) entregar, até <b>${dataLista}</b>, a lista nominal de convidados, separando adultos e crianças; (d) informar, com a lista, eventuais restrições alimentares ou alergias de convidados de que tenha conhecimento; (e) comunicar à CONTRATADA, com antecedência mínima de 10 (dez) dias do evento, a entrada de profissionais terceirizados por ele contratados, que somente terão acesso se previamente cadastrados; (f) zelar, por si e por seus convidados, pela supervisão das crianças durante todo o evento.</p>

  <h2>Cláusula ${cl()} — Do preço e da forma de pagamento</h2>
  <p class="clausula">Pelos serviços contratados, o CONTRATANTE pagará à CONTRATADA o valor total de <b>${valorCompleto(valorContrato)}</b>${descontoTxt}, conforme o cronograma abaixo:</p>
  ${tabela}
  ${pg.observacoes ? `<p class="clausula"><b>Observações de pagamento:</b> ${esc(pg.observacoes)}</p>` : ''}
  ${dadosPagamento ? `<p class="clausula"><b>${par()}</b> Os pagamentos deverão ser feitos exclusivamente em favor da CONTRATADA pelos seguintes meios: ${dadosPagamento}. O comprovante deverá ser enviado à CONTRATADA, que dará quitação de cada parcela.</p>` : `<p class="clausula"><b>${par()}</b> Os pagamentos deverão ser feitos exclusivamente em favor da CONTRATADA, que dará quitação de cada parcela mediante comprovante.</p>`}
  ${pg.modalidade !== 'avista' && Number(pg.entrada?.valor || 0) > 0 ? `<p class="clausula"><b>${par()}</b> A entrada de ${money(pg.entrada.valor)} tem natureza de sinal e princípio de pagamento (arts. 417 a 420 do Código Civil) e garante a reserva da data, que somente fica confirmada após o seu pagamento.</p>` : ''}
  <p class="clausula"><b>${par()}</b> ${dentroDoPrazo && limite ? `O valor total deverá estar integralmente quitado até <b>${dateBR(limite)}</b> (5 dias úteis antes do evento).` : 'O valor total deverá estar quitado nas datas do cronograma acima, ajustadas especificamente entre as partes.'}</p>
  <p class="clausula"><b>${par()}</b> O atraso no pagamento de qualquer parcela sujeitará o valor em atraso à multa de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo IPCA, nos termos do art. 52, § 1º, do Código de Defesa do Consumidor.</p>
  <p class="clausula"><b>${par()}</b> Havendo parcela vencida e não paga na data do evento, a CONTRATADA poderá suspender a sua realização até a regularização, mediante notificação prévia ao CONTRATANTE com antecedência mínima de 48 (quarenta e oito) horas, aplicando-se, se for o caso, o disposto na Cláusula de desistência e rescisão.</p>
  ${q.observacaoNegociacao ? `<p class="clausula"><b>${par()}</b> Condição comercial registrada: ${esc(q.observacaoNegociacao)}</p>` : ''}

  <h2>Cláusula ${cl()} — Dos convidados</h2>
  <p class="clausula">O evento será organizado para o número de convidados contratado e com base na lista entregue na forma da Cláusula 3ª. Convidados que excedam o número contratado deverão ser pagos à vista, por dinheiro, PIX, transferência ou cartão de débito, imediatamente após a confirmação pelo CONTRATANTE, pelo valor por convidado do pacote vigente. Não havendo pagamento até o término do evento, o valor dos excedentes será acrescido de 10% (dez por cento).</p>
  <p class="clausula"><b>Parágrafo primeiro:</b> Se o acréscimo de convidados ultrapassar 15% (quinze por cento) do número contratado, o pagamento da diferença deverá ser antecipado à data do evento. Acréscimos de 10 (dez) ou mais convidados serão calculados pela faixa seguinte do pacote; os demais, pelo valor unitário por convidado do pacote.</p>
  <p class="clausula"><b>Parágrafo segundo:</b> Sem o pagamento antecipado de que trata o parágrafo anterior, a CONTRATADA não estará obrigada a atender número de convidados superior a 15% do contratado.</p>
  <p class="clausula"><b>Parágrafo terceiro:</b> O não comparecimento de convidados não gera restituição nem redução do preço, uma vez que a estrutura, a equipe e os insumos são dimensionados para o número contratado.</p>
  <p class="clausula"><b>Parágrafo quarto:</b> São isentos de pagamento o(a) aniversariante e as crianças de 0 (zero) a 3 (três) anos e 11 (onze) meses de idade na data do evento.</p>

  <h2>Cláusula ${cl()} — Da duração e do horário</h2>
  <p class="clausula">O evento terá duração de ${duracao} (${extensoInteiro(duracao)}) horas, com tolerância de 15 (quinze) minutos para a saída dos convidados. Ultrapassada a tolerância, será cobrado o valor de <b>${money(fracao15)}</b> por fração de 15 (quinze) minutos excedentes, correspondente à hora ${cfg?.permiteHoraExtra ? 'extra do pacote' : 'proporcional do evento'}, a ser pago ao final do evento.</p>
  <p class="clausula"><b>Parágrafo único:</b> ${cfg?.permiteHoraExtra ? `A contratação antecipada de hora extra poderá ser feita até <b>${dataHoraExtra}</b>, pelo valor do pacote (${money(cfg.valorHoraExtra)} por hora), mediante aditivo ou registro no checklist.` : 'O pacote contratado não prevê contratação antecipada de hora extra.'}</p>

  <h2>Cláusula ${cl()} — Das bebidas alcoólicas</h2>
  <p class="clausula">Bebidas alcoólicas não fazem parte do pacote e poderão ser adquiridas à parte, por consumo do CONTRATANTE ou por comanda individual de convidado, conforme definido no checklist, com pagamento integral ao final do evento, em dinheiro ou PIX.</p>
  <p class="clausula"><b>Parágrafo único:</b> É proibido vender, fornecer ou entregar bebida alcoólica a menores de 18 (dezoito) anos (arts. 81, II, e 243 da Lei nº 8.069/1990 — Estatuto da Criança e do Adolescente). O CONTRATANTE é responsável pela orientação e supervisão de seus convidados e responde pelo fornecimento a menores feito por convidados ou terceiros, hipótese em que a CONTRATADA não terá responsabilidade.</p>

  <h2>Cláusula ${cl()} — Da conservação do espaço e dos objetos</h2>
  <p class="clausula">O CONTRATANTE responde, por si e por seus convidados e terceiros por ele contratados, pela integridade do espaço e dos bens da CONTRATADA durante o evento, devendo indenizar os danos causados, apurados em vistoria ao final do evento. O CONTRATANTE poderá vistoriar o espaço antes do início do evento.</p>
  <p class="clausula"><b>Parágrafo primeiro:</b> A CONTRATADA não se responsabiliza por objetos, roupas ou calçados esquecidos, nem por furto ou extravio de bens pessoais de convidados, ressalvados os casos de culpa comprovada de sua equipe.</p>
  <p class="clausula"><b>Parágrafo segundo:</b> A montagem, a limpeza e a retirada de materiais de decoração de terceiros, nas áreas interna e externa, são de responsabilidade do CONTRATANTE e dos fornecedores por ele contratados, que deverão retirá-los ao final do evento.</p>

  <h2>Cláusula ${cl()} — Da substituição de itens, equipamentos e força maior</h2>
  <p class="clausula">Na falta eventual de algum item do pacote, a CONTRATADA o substituirá por outro de qualidade e valor equivalentes ou superiores, comunicando o CONTRATANTE sempre que possível.</p>
  <p class="clausula"><b>Parágrafo primeiro:</b> A CONTRATADA realiza a manutenção periódica dos equipamentos eletrônicos, mas não responde por panes súbitas ou por interrupções no fornecimento de energia elétrica ou de água causadas pela rede pública ou por intempéries.</p>
  <p class="clausula"><b>Parágrafo segundo:</b> Se o evento não puder ser realizado por caso fortuito ou força maior (art. 393 do Código Civil), como calamidades, determinações de autoridades públicas ou interdição do local por motivo alheio às partes, o evento será remarcado em comum acordo, sem custo adicional, em até 12 (doze) meses; não havendo acordo, os valores pagos serão restituídos integralmente, sem multa para qualquer das partes.</p>

  <h2>Cláusula ${cl()} — Da desistência, remarcação e rescisão</h2>
  <p class="clausula"><b>Parágrafo primeiro:</b> A desistência pelo CONTRATANTE deverá ser comunicada por escrito e implicará multa compensatória sobre o valor total do contrato, conforme a antecedência em relação à data do evento: <b>10%</b> se comunicada com 120 (cento e vinte) dias ou mais; <b>20%</b> se entre 119 (cento e dezenove) e 61 (sessenta e um) dias; <b>30%</b> se com 60 (sessenta) dias ou menos. Os valores pagos que excederem a multa serão restituídos em até 30 (trinta) dias da comunicação; se os valores pagos forem inferiores à multa, o CONTRATANTE pagará a diferença.</p>
  <p class="clausula"><b>Parágrafo segundo (remarcação):</b> O CONTRATANTE poderá solicitar, uma única vez, a remarcação do evento com antecedência mínima de 60 (sessenta) dias, sem multa, sujeita à disponibilidade de agenda, para data em até 12 (doze) meses. Se a nova data recair em período de tabela de preços diferente, será cobrada a diferença de valor.</p>
  <p class="clausula"><b>Parágrafo terceiro:</b> O atraso superior a 15 (quinze) dias no pagamento de qualquer parcela, não regularizado em até 5 (cinco) dias após notificação, autoriza a CONTRATADA a rescindir o contrato, aplicando-se a multa do parágrafo primeiro.</p>

  <h2>Cláusula ${cl()} — Do uso de imagem</h2>
  ${autorizaImagem
    ? `<p class="clausula">O CONTRATANTE <b>AUTORIZA</b>, a título gratuito, o uso de fotos e vídeos do evento pela CONTRATADA em suas redes sociais e materiais de divulgação, sem fins de comercialização da imagem. O CONTRATANTE declara ser o responsável legal pelas crianças sob sua guarda e que informará aos demais convidados sobre a possibilidade de registro, comprometendo-se a indicar à CONTRATADA quem não deseje ser fotografado. A autorização pode ser revogada a qualquer tempo, por escrito, para publicações futuras.</p>`
    : `<p class="clausula">O CONTRATANTE <b>NÃO AUTORIZA</b> o uso de imagens do evento pela CONTRATADA para divulgação. Eventuais registros feitos pela equipe da CONTRATADA serão utilizados apenas para fins operacionais e não serão publicados.</p>`}

  <h2>Cláusula ${cl()} — Da proteção de dados pessoais</h2>
  <p class="clausula">A CONTRATADA tratará os dados pessoais do CONTRATANTE e dos convidados (inclusive a lista de convidados) exclusivamente para a execução deste contrato, o controle de acesso ao evento e o cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018 (LGPD), mantendo-os pelo prazo necessário a essas finalidades e aos prazos legais. O CONTRATANTE declara estar autorizado a fornecer os dados dos convidados para essas finalidades e poderá exercer os direitos do art. 18 da LGPD pelos canais de contato da CONTRATADA.</p>

  <h2>Cláusula ${cl()} — Da assinatura eletrônica</h2>
  <p class="clausula">As partes reconhecem como válida e eficaz a assinatura deste contrato por meio eletrônico, em especial pela assinatura eletrônica avançada do gov.br (Lei nº 14.063/2020 e art. 10, § 2º, da Medida Provisória nº 2.200-2/2001), bem como por certificado digital ICP-Brasil, admitida também a assinatura manuscrita. O contrato assinado eletronicamente dispensa a assinatura de testemunhas para constituir título executivo extrajudicial (art. 784, § 4º, do Código de Processo Civil). A autenticidade das assinaturas pode ser conferida em validar.iti.gov.br.</p>

  <h2>Cláusula ${cl()} — Disposições gerais</h2>
  <p class="clausula">Este contrato substitui quaisquer propostas ou combinações anteriores sobre o mesmo objeto, e qualquer alteração somente terá validade por escrito (aditivo ou mensagem registrada no checklist com a concordância de ambas as partes). A tolerância de uma parte quanto ao descumprimento de qualquer obrigação não implica renúncia ou novação. O CONTRATANTE declara que leu e compreendeu todas as cláusulas, tendo recebido previamente o orçamento e a descrição do pacote contratado.</p>

  <h2>Cláusula ${cl()} — Do foro</h2>
  <p class="clausula">Fica eleito o foro da Comarca de ${esc(ct.foro || 'Caçapava do Sul/RS')} para dirimir questões oriundas deste contrato, sem prejuízo do direito do CONTRATANTE, na condição de consumidor, de propor ação no foro de seu domicílio (art. 101, I, do Código de Defesa do Consumidor).</p>

  <p class="clausula quebra-evitar" style="margin-top:14px">E, por estarem de acordo, as partes assinam o presente instrumento.</p>
  <p class="clausula quebra-evitar">${esc(ct.cidade || 'Caçapava do Sul')}/${esc(ct.estado || 'RS')}, ${dataExtenso}.</p>
  <div class="assinaturas quebra-evitar">
    <div class="assina"><div class="campo">Espaço para assinatura gov.br do CONTRATANTE</div><div class="linha"><b>CONTRATANTE</b><br>${esc(c.nome || q.cliente || '')}<br>CPF: ${esc(c.cpf || '')}</div></div>
    <div class="assina"><div class="campo">Espaço para assinatura gov.br da CONTRATADA</div><div class="linha"><b>CONTRATADA</b><br>${esc(ct.razaoSocial)} — CNPJ ${esc(ct.cnpj)}<br>${ct.representante ? `p.p. ${esc(ct.representante)}${ct.representanteCpf ? ` · CPF ${esc(ct.representanteCpf)}` : ''}` : 'Representante legal'}</div></div>
  </div>
  <div class="testemunhas quebra-evitar"><div class="linha">Testemunha 1 — Nome e CPF</div><div class="linha">Testemunha 2 — Nome e CPF</div></div>
  <p class="nota">Testemunhas necessárias apenas em caso de assinatura manuscrita (art. 784, III, do CPC). Na assinatura eletrônica, ficam dispensadas (art. 784, § 4º, do CPC). Documento gerado pela Plataforma Lega — contrato nº ${esc(codigo)}.</p>
  </body></html>`;
}

// ------------------------------------------------------------- assinatura gov.br
export function whatsappLink(telefone = '', mensagem = '') {
  let d = String(telefone).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}` : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}
export function mensagemAssinatura({ nome = '', dataEvento = '', codigo = '' }) {
  const primeiro = String(nome).trim().split(/\s+/)[0] || '';
  return `Olá${primeiro ? `, ${primeiro}` : ''}! Segue o contrato da sua festa na Lega Eventos${dataEvento ? ` (${dateBR(dataEvento)})` : ''}, nº ${codigo}.

Para assinar gratuitamente pelo gov.br:
1) Salve o PDF do contrato que enviamos nesta conversa.
2) Acesse ${GOVBR.assinador} e entre com sua conta gov.br (é preciso nível prata ou ouro).
3) Envie o PDF, posicione a assinatura no espaço do CONTRATANTE e confirme com o código que chega no app gov.br.
4) Baixe o arquivo assinado e nos devolva por aqui.

Qualquer dúvida, estamos à disposição!`;
}

export async function sha256File(file) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador não permite calcular o código do arquivo (é preciso abrir a plataforma por https).');
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const stamp = v => v ? new Date(v).toLocaleString('pt-BR') : '';

/** Painel de assinatura exibido enquanto o contrato aguarda assinatura. */
export function signaturePanel(versao, cliente = {}) {
  const a = versao?.assinatura || {};
  const passo = (id, titulo, desc, feito, extra = '') => `<li class="gov-step ${feito ? 'done' : ''}"><label><input type="checkbox" data-action="gov-step" data-step="${id}" ${feito ? 'checked' : ''}><span><strong>${titulo}</strong><small>${desc}${feito ? ` · ${stamp(feito)}` : ''}</small></span></label>${extra}</li>`;
  const arquivo = a.arquivo
    ? `<div class="gov-file"><span>📎 <b>${esc(a.arquivo.nome)}</b> · ${(Number(a.arquivo.tamanho || 0) / 1024).toFixed(0)} KB · registrado em ${stamp(a.arquivo.registradoEm)}</span><code title="SHA-256">SHA-256: ${esc(a.arquivo.sha256)}</code></div>`
    : '';
  const pronto = a.contratanteEm && a.contratadaEm && a.validadoEm;
  return `<section class="panel gov-panel">
    <div class="panel-header"><div><span class="eyebrow">ASSINATURA ELETRÔNICA</span><h2>Assinar pelo gov.br</h2><p>Gratuito, com validade jurídica (Lei 14.063/2020) e sem necessidade de testemunhas (art. 784, § 4º, CPC). Cliente e Lega assinam o <b>mesmo PDF</b>, um depois do outro.</p></div><span class="version-badge">${esc(versao?.codigo || `V${versao?.versao || 1}`)}</span></div>
    <ol class="gov-steps">
      <li class="gov-step info"><span><strong>1. Gerar o PDF</strong><small>Abra o contrato e use “Salvar como PDF”. Confira todos os dados antes de enviar.</small></span><button type="button" class="btn btn-ghost" data-action="open-contract" data-contract="${esc(versao?.id || '')}">Abrir contrato / PDF</button></li>
      <li class="gov-step info"><span><strong>2. Enviar ao cliente</strong><small>Mande o PDF no WhatsApp e a mensagem com as instruções. O cliente precisa de conta gov.br prata ou ouro.</small></span><span class="gov-actions"><a class="btn btn-ghost" target="_blank" rel="noopener" data-action="gov-whatsapp" href="${esc(whatsappLink(cliente.telefone, mensagemAssinatura({ nome: cliente.nome, dataEvento: versao?.orcamento?.data, codigo: versao?.codigo || '' })))}">WhatsApp</a><button type="button" class="btn btn-ghost" data-action="gov-copy">Copiar mensagem</button></span></li>
      ${passo('contratante', '3. Cliente assinou', 'O cliente devolveu o PDF assinado no gov.br.', a.contratanteEm)}
      ${passo('contratada', '4. Lega assinou', `O representante da Lega assinou o PDF já assinado pelo cliente em <a href="${GOVBR.assinador}" target="_blank" rel="noopener">assinador.iti.br</a>.`, a.contratadaEm)}
      ${passo('validado', '5. Assinaturas conferidas', `Envie o PDF final em <a href="${GOVBR.validador}" target="_blank" rel="noopener">validar.iti.gov.br</a> e confira que aparecem as duas assinaturas como “aprovadas”.`, a.validadoEm)}
      <li class="gov-step ${a.arquivo ? 'done' : ''}"><span><strong>6. Registrar o PDF final</strong><small>A plataforma guarda o nome e a “impressão digital” (SHA-256) do arquivo para provar depois que é o mesmo documento. Guarde o PDF em local seguro (Drive, e-mail).</small>${arquivo}</span><label class="btn btn-ghost gov-upload">${a.arquivo ? 'Trocar arquivo' : 'Selecionar PDF assinado'}<input type="file" id="govSignedFile" accept="application/pdf,.pdf" hidden></label></li>
    </ol>
    <div class="form-actions gov-final"><button type="button" class="btn btn-ghost" data-action="sign-contract">Foi assinado em papel</button><button type="button" class="btn btn-primary" data-action="gov-confirm" ${pronto ? '' : 'disabled title="Conclua os passos 3, 4 e 5"'}>Concluir assinatura gov.br</button></div>
  </section>`;
}

/** Resumo exibido quando o contrato já está assinado. */
export function signatureSummary(versao) {
  const a = versao?.assinatura;
  if (!a) return '';
  const metodo = a.metodo === 'govbr' ? 'Assinatura eletrônica gov.br' : a.metodo === 'presencial' ? 'Assinatura manuscrita (papel)' : 'Assinatura registrada';
  return `<div class="gov-summary"><strong>${metodo}</strong>${a.contratanteEm ? `<span>Contratante: ${stamp(a.contratanteEm)}</span>` : ''}${a.contratadaEm ? `<span>Contratada: ${stamp(a.contratadaEm)}</span>` : ''}${a.validadoEm ? `<span>Conferido no ITI: ${stamp(a.validadoEm)}</span>` : ''}${a.arquivo ? `<span>Arquivo: ${esc(a.arquivo.nome)}</span><code>SHA-256: ${esc(a.arquivo.sha256)}</code>` : ''}</div>`;
}
