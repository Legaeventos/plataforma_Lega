// Rotina da Lega (v2.1.0)
// -----------------------
// Junta num lugar só o que precisa ser feito nos próximos dias, olhando
// todos os módulos: cobranças de clientes, festas para encerrar, consumo
// sem lançar, contas fixas do mês e o estoque (mínimo e validade).

import { readJSON } from '../../js/storage.js';
import { pagamentoDoSnapshot, cronogramaDe } from '../../modules/eventos/contrato.js';
import { config as configEmpresa, calcularMes } from '../../modules/financeiro/resultado.js';
import { viradaLocal, carregar, vencendo } from './estoque-db.js';

const pad = n => String(n).padStart(2, '0');
export const hojeISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const somarDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return hojeISO(new Date(y, m - 1, d + n)); };
const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '';
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const selectedQuote = e => e?.orcamentos?.find(q => q.id === e.orcamentoEscolhidoId) || e?.orcamentos?.at(-1) || null;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Link do WhatsApp com mensagem pronta (telefone do cadastro do cliente). */
export function linkWhatsApp(nomeCliente, texto) {
  const c = (readJSON('lega.clientes', []) || []).find(x => norm(x.nome) === norm(nomeCliente));
  const fone = String(c?.telefone || c?.whatsapp || '').replace(/\D/g, '');
  if (!fone) return null;
  return `https://wa.me/${fone.length <= 11 ? '55' + fone : fone}?text=${encodeURIComponent(texto)}`;
}

/** Parcelas do contrato ainda não pagas (com vencimento). */
export function parcelasAbertas(e) {
  const contrato = (e.contratos || []).at(-1); if (!contrato) return [];
  const q = selectedQuote(e) || {};
  const pg = pagamentoDoSnapshot(contrato, Number(q.valor || 0));
  if (!pg || pg.legado) return [];
  const lanc = e.lancamentosFinanceiros || [];
  const pago = x => lanc.some(l => l.tipo === 'entrada' && l.parcelaId === x.id) || (x.id === 'entrada' && e.entradaPaga && !lanc.some(l => l.parcelaId));
  return cronogramaDe(pg).filter(x => x.vencimento && !pago(x));
}

export function cobrancas(hoje = hojeISO(), dias = 7) {
  const lim = somarDias(hoje, dias);
  return (readJSON('lega.eventos', []) || []).filter(e => !['orcamento', 'perdido'].includes(e.status)).flatMap(e => {
    const q = selectedQuote(e) || {};
    return parcelasAbertas(e).filter(p => p.vencimento <= lim).map(p => {
      const vencida = p.vencimento < hoje;
      const primeiro = String(q.cliente || '').split(' ')[0];
      const texto = vencida
        ? `Olá${primeiro ? ', ' + primeiro : ''}! Tudo bem? Passando para lembrar que a ${p.descricao.toLowerCase()} da festa${q.nome ? ' “' + q.nome + '”' : ''} (${money(p.valor)}) venceu em ${dataBR(p.vencimento)}. Se já pagou, me manda o comprovante, por favor. Obrigado! 🌳`
        : `Olá${primeiro ? ', ' + primeiro : ''}! Tudo bem? Só lembrando que a ${p.descricao.toLowerCase()} da festa${q.nome ? ' “' + q.nome + '”' : ''} (${money(p.valor)}) vence em ${dataBR(p.vencimento)}. Qualquer dúvida, estou à disposição! 🌳`;
      return { evento: e, q, parcela: p, vencida, whatsapp: linkWhatsApp(q.cliente, texto) };
    });
  }).sort((a, b) => a.parcela.vencimento.localeCompare(b.parcela.vencimento));
}

/** Tarefas da rotina (sem o estoque, que é carregado à parte). */
export function tarefas(hoje = hojeISO()) {
  const evs = readJSON('lega.eventos', []) || [];
  const out = [];
  cobrancas(hoje).forEach(c => out.push({
    tipo: 'cobranca', prioridade: c.vencida ? 0 : 2, icone: c.vencida ? '💸' : '📅',
    titulo: `${c.vencida ? 'Cobrar' : 'Lembrar'} ${c.parcela.descricao.toLowerCase()} · ${money(c.parcela.valor)}`,
    detalhe: `${c.q.cliente || 'Cliente'} · ${c.q.nome || 'Festa'} · ${c.vencida ? 'venceu' : 'vence'} em ${dataBR(c.parcela.vencimento)}`,
    eventoId: c.evento.id, aba: 'financeiro', whatsapp: c.whatsapp, parcelaId: c.parcela.id
  }));
  const ultimos30 = somarDias(hoje, -30);
  evs.filter(e => !['orcamento', 'perdido', 'realizado'].includes(e.status)).forEach(e => {
    const q = selectedQuote(e) || {};
    if (!q.data || q.data >= hoje) return;
    const semConsumo = viradaLocal() && !e.consumoEstoque && !(e.consumos || []).length && q.data >= ultimos30;
    out.push({ tipo: 'encerrar', prioridade: 1, icone: '🎉', titulo: semConsumo ? 'Lançar o consumo e encerrar a festa' : 'Encerrar a festa',
      detalhe: `${q.nome || q.cliente || 'Festa'} · foi em ${dataBR(q.data)}`, eventoId: e.id, aba: semConsumo ? 'consumo' : 'encerramento' });
  });
  // festa nos próximos 3 dias: lista da cozinha
  evs.filter(e => !['orcamento', 'perdido', 'realizado'].includes(e.status)).forEach(e => {
    const q = selectedQuote(e) || {};
    if (q.data && q.data >= hoje && q.data <= somarDias(hoje, 3)) out.push({ tipo: 'cozinha', prioridade: 1, icone: '🍽️', titulo: q.data === hoje ? 'Festa hoje: conferir quanto fazer' : 'Preparar a cozinha: quanto fazer',
      detalhe: `${q.nome || q.cliente || 'Festa'} · ${dataBR(q.data)} · ${Number(e.adultos || 0) + Number(e.criancas || 0) || q.convidadosTotal || '?'} convidados`, eventoId: e.id, aba: 'consumo' });
  });
  // contas fixas do mês já vencidas ou vencendo em 5 dias
  const mes = hoje.slice(0, 7);
  const r = calcularMes(mes, null);
  r.fixas.filter(f => f.pendente).forEach(f => {
    const dia = `${mes}-${pad(Math.min(Number(f.dia || 1), 28))}`;
    if (dia <= somarDias(hoje, 5)) out.push({ tipo: 'fixa', prioridade: dia < hoje ? 1 : 3, icone: '🧾', titulo: `Lançar ${f.descricao} (${money(f.valor)})`, detalhe: dia < hoje ? `venceu dia ${f.dia || 1}` : `vence dia ${f.dia || 1}`, rota: 'financeiro', fixaId: f.id });
  });
  return out.sort((a, b) => a.prioridade - b.prioridade);
}

/** Tarefas do estoque (assíncrono). */
export async function tarefasEstoque() {
  if (!viradaLocal()) return [];
  const d = await carregar();
  const est = new Map(d.estoque.map(e => [String(e.produto_id), e]));
  const baixos = d.produtos.filter(p => p.ativo !== false).filter(p => { const e = est.get(String(p.id)); return Number(e?.estoque_minimo || 0) > 0 && Number(e?.quantidade || 0) <= Number(e?.estoque_minimo || 0); });
  const venc = vencendo(d, 15);
  const out = [];
  if (baixos.length) out.push({ tipo: 'estoque', prioridade: 2, icone: '🛒', titulo: `${baixos.length} produto(s) no estoque mínimo`, detalhe: baixos.slice(0, 4).map(p => p.nome).join(', ') + (baixos.length > 4 ? '…' : ''), rota: 'estoque', estoqueAba: 'visao' });
  if (venc.length) out.push({ tipo: 'estoque', prioridade: 2, icone: '⏳', titulo: `${venc.length} lote(s) vencendo em 15 dias`, detalhe: venc.slice(0, 3).map(l => `${d.produtos.find(p => String(p.id) === String(l.produto_id))?.nome || ''} (${dataBR(l.validade)})`).join(', '), rota: 'estoque', estoqueAba: 'produtos' });
  return out;
}

/** Números do mês para o painel. */
export function resumoMes(hoje = hojeISO()) {
  const r = calcularMes(hoje.slice(0, 7), null);
  const vencidas = cobrancas(hoje, 0).filter(c => c.vencida);
  return { resultadoFestas: r.fest.resultado, resultado: r.resultado, recebido: r.caixa.recebidoClientes, festas: r.festas.length, vencidas: vencidas.length, valorVencido: vencidas.reduce((s, c) => s + c.parcela.valor, 0) };
}
export { configEmpresa };
