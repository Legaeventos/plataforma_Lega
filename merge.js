// Mesclagem de 3 vias (base × local × nuvem) para o estado compartilhado.
// -----------------------------------------------------------------------
// Antes (até a v1.1.7) cada aparelho enviava TODOS os seus dados e
// sobrescrevia a nuvem: quem salvava por último apagava o que o outro
// tinha criado. Agora, antes de enviar, o aparelho baixa a versão da
// nuvem e mescla item a item:
//   • base  = última versão que este aparelho recebeu/enviou com sucesso;
//   • local = dados deste aparelho;
//   • nuvem = dados atuais no Supabase (podem ter mudanças do outro aparelho).
// Listas de objetos com `id` (eventos, orçamentos, contratos, lançamentos,
// clientes, produtos...) são mescladas por id, inclusive dentro de cada
// evento. Exclusões feitas em um aparelho são respeitadas porque o item
// existia na base e sumiu de um dos lados.
// Sem base (primeira sincronização), nada é apagado: os dois lados se somam.

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdList = v => Array.isArray(v) && v.length > 0 && v.every(x => isObj(x) && x.id !== undefined && x.id !== null);
const canIdMerge = (...vals) => vals.every(v => v === undefined || (Array.isArray(v) && (v.length === 0 || isIdList(v)))) && vals.some(v => Array.isArray(v) && v.length);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const stamp = o => String(o?.updatedAt || o?.atualizadoEm || o?.createdAt || '');

function mergeIdList(base, local, remote, prefer = 'local') {
  const b = new Map((base || []).map(x => [String(x.id), x]));
  const l = new Map((local || []).map(x => [String(x.id), x]));
  const r = new Map((remote || []).map(x => [String(x.id), x]));
  const order = [];
  const seen = new Set();
  // mantém a ordem da nuvem e acrescenta os novos itens locais no fim
  for (const x of [...(remote || []), ...(local || [])]) { const k = String(x.id); if (!seen.has(k)) { seen.add(k); order.push(k); } }
  const out = [];
  for (const k of order) {
    const inB = b.has(k), inL = l.has(k), inR = r.has(k);
    if (inL && inR) { out.push(mergeValue(b.get(k), l.get(k), r.get(k), prefer)); continue; }
    if (inL && !inR) {
      // existia na base e a nuvem apagou → só mantém se este aparelho alterou depois
      if (inB && deepEqual(b.get(k), l.get(k))) continue;
      out.push(l.get(k)); continue;
    }
    if (inR && !inL) {
      if (inB && deepEqual(b.get(k), r.get(k))) continue; // apagado aqui
      out.push(r.get(k));
    }
  }
  return out;
}

export function mergeValue(base, local, remote, prefer = 'local') {
  if (deepEqual(local, remote)) return local;
  if (local === undefined) return base !== undefined && deepEqual(base, remote) ? undefined : remote;
  if (remote === undefined) return base !== undefined && deepEqual(base, local) ? undefined : local;
  if (base !== undefined && deepEqual(local, base)) return remote;
  if (base !== undefined && deepEqual(remote, base)) return local;
  // os dois lados mudaram
  if (canIdMerge(base, local, remote)) return mergeIdList(base, local, remote, prefer);
  if (isObj(local) && isObj(remote)) {
    const out = {};
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    const bObj = isObj(base) ? base : {};
    const pref = stamp(remote) && stamp(remote) > stamp(local) ? 'remote' : stamp(local) > stamp(remote) ? 'local' : prefer;
    for (const k of keys) {
      const v = mergeValue(isObj(base) ? bObj[k] : undefined, local[k], remote[k], pref);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  // valores simples alterados nos dois lados: vence o mais recente quando
  // houver data; caso contrário, o deste aparelho.
  return prefer === 'remote' ? remote : local;
}

/** Mescla o estado inteiro (objeto chave → valor). */
export function mergeState(base, local, remote) {
  const out = {};
  const keys = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})]);
  for (const k of keys) {
    const v = mergeValue(base ? base[k] : undefined, (local || {})[k], (remote || {})[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
