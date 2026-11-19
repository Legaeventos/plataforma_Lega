// Validade dos orçamentos (v1.3.2)
// ---------------------------------
// Regra combinada com a Lega:
//   • todo orçamento vale 5 dias úteis (segunda a sexta) a partir do envio;
//   • no 4º e no 5º dia útil a plataforma avisa para cobrar um retorno;
//   • sem aceite ou recusa manual, no 6º dia útil o orçamento é arquivado
//     automaticamente como "Não fechou (validade expirada)".
// Uma nova versão do orçamento ou a reabertura renovam os 5 dias úteis.
// Exceção: festa cuja DATA já passou não é arquivada sozinha — a plataforma
// pergunta se ela aconteceu, para não sumir com uma festa real.

import { readJSON, writeJSON } from '../../js/storage.js';

export const VALIDADE_DIAS_UTEIS = 5;
const KEY = 'lega.eventos';

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const util = d => d.getDay() !== 0 && d.getDay() !== 6;

export function hojeISO() { return toISO(new Date()); }

/** Data ISO + n dias úteis. */
export function somarDiasUteis(iso, n) {
  const d = fromISO(iso); let faltam = n;
  while (faltam > 0) { d.setDate(d.getDate() + 1); if (util(d)) faltam--; }
  return toISO(d);
}
/** Dias úteis depois de `de` até `ate` (inclusive). 0 quando ate <= de. */
export function diasUteisEntre(de, ate) {
  if (!de || !ate || ate <= de) return 0;
  const d = fromISO(de); let n = 0;
  while (toISO(d) < ate) { d.setDate(d.getDate() + 1); if (util(d)) n++; }
  return n;
}

function ultimaVersao(e) { return [...(e.orcamentos || [])].sort((a, b) => (a.versao || 0) - (b.versao || 0)).at(-1) || null; }
function quoteEscolhido(e) { return (e.orcamentos || []).find(q => q.id === e.orcamentoEscolhidoId) || ultimaVersao(e); }

/** A regra de validade vale para este evento agora? */
export function validadeAplicavel(e, hoje = hojeISO()) {
  if (!e || e.status !== 'orcamento') return false;
  const data = quoteEscolhido(e)?.data;
  return !data || data >= hoje;
}

/**
 * Situação da validade:
 *   fase: 'ok' | 'vence-amanha' (4º dia útil) | 'vence-hoje' (5º) | 'expirado' (6º em diante)
 *   restantes: dias úteis até o vencimento (0 = vence hoje; negativo = expirado)
 */
export function validadeDe(e, hoje = hojeISO()) {
  const q = ultimaVersao(e);
  const base = (q?.createdAt || e?.createdAt || '').slice(0, 10) || hoje;
  const validoAte = e?.orcamentoValidoAte || somarDiasUteis(base, VALIDADE_DIAS_UTEIS);
  const restantes = validoAte >= hoje ? diasUteisEntre(hoje, validoAte) : -diasUteisEntre(validoAte, hoje);
  const fase = restantes < 0 ? 'expirado' : restantes === 0 ? 'vence-hoje' : restantes === 1 ? 'vence-amanha' : 'ok';
  return { validoAte, restantes, fase, aplicavel: validadeAplicavel(e, hoje) };
}

/** Validade de um orçamento que acaba de ser enviado (novo ou nova versão). */
export function novaValidade(hoje = hojeISO()) { return somarDiasUteis(hoje, VALIDADE_DIAS_UTEIS); }

/**
 * Executada ao abrir a plataforma e periodicamente:
 *  1) orçamentos em aberto criados antes desta regra ganham prazo a partir de hoje
 *     (ninguém é arquivado de surpresa no primeiro dia);
 *  2) orçamentos com validade vencida são arquivados como "Não fechou".
 * Devolve quantos foram arquivados agora.
 */
export function processarValidades(hoje = hojeISO()) {
  const eventos = readJSON(KEY, []);
  if (!Array.isArray(eventos) || !eventos.length) return { arquivados: [] };
  let mudou = false; const arquivados = [];
  const novos = eventos.map(e => {
    if (!validadeAplicavel(e, hoje)) return e;
    let ev = e;
    if (!ev.orcamentoValidoAte) {
      const q = ultimaVersao(ev);
      const pelaCriacao = somarDiasUteis((q?.createdAt || ev.createdAt || hoje).slice(0, 10), VALIDADE_DIAS_UTEIS);
      const carencia = somarDiasUteis(hoje, VALIDADE_DIAS_UTEIS);
      ev = { ...ev, orcamentoValidoAte: pelaCriacao > carencia ? pelaCriacao : carencia, validadeCarencia: pelaCriacao <= carencia };
      mudou = true;
    }
    const v = validadeDe(ev, hoje);
    if (v.fase !== 'expirado') return ev;
    mudou = true; arquivados.push(ev.id);
    const dia = somarDiasUteis(v.validoAte, 1);
    return {
      ...ev, status: 'perdido', motivoPerda: 'Validade expirada', perdidoEm: `${dia}T08:00:00.000Z`, perdidoAutomatico: true,
      historico: [...(ev.historico || []), { id: `hist_validade_${ev.id}_${v.validoAte}`, label: 'Orçamento arquivado automaticamente', detail: `Sem retorno até ${v.validoAte.split('-').reverse().join('/')} (validade de ${VALIDADE_DIAS_UTEIS} dias úteis)`, at: `${dia}T08:00:00.000Z` }]
    };
  });
  if (mudou) writeJSON(KEY, novos);
  return { arquivados };
}
