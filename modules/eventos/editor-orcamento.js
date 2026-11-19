// Editor do orçamento (v1.5.0): escolher fotos, estilo, mensagem e o que
// mostrar, com prévia ao vivo. As escolhas ficam salvas na versão do
// orçamento e podem virar o padrão do tipo de festa.

import { readJSON, writeJSON } from '../../js/storage.js';
import { orcamentoHTML, TEMAS, personalizacaoPadrao, normalizarPersonalizacao } from './orcamento-doc.js';
import { carregarGaleria, CATEGORIAS, urlFoto } from '../../core/engine/galeria.js';

const PADROES_KEY = 'lega.orcamento.padroes';
const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const SLOTS = [['capa', 'Capa', 1], ['gastronomia', 'Gastronomia', 3], ['decoracao', 'Decoração', 3], ['espaco', 'Espaço e crianças', 3]];
const CAT_SUGERIDA = { capa: 'capa', gastronomia: 'gastronomia', decoracao: 'decoracao', espaco: 'espaco' };
const MOSTRAR = [['porConvidado', 'Valor por convidado'], ['avista', 'Opção à vista com desconto'], ['parcelas', 'Tabela de parcelas (1x a 6x)'], ['horaExtra', 'Valor da hora extra'], ['passos', '"Como reservar em 3 passos"']];

export const padroesSalvos = () => readJSON(PADROES_KEY, {}) || {};
export function personalizacaoInicial(q) { return q.personalizacao ? normalizarPersonalizacao(q.personalizacao) : personalizacaoPadrao(q.tipo || '', padroesSalvos()); }

/**
 * Abre o editor.
 * ctx: { q, e, calc, pay, base, validoAte, diasValidade, tipos:[...],
 *        onSalvar(personalizacao, tipo), onAbrirPdf(personalizacao, tipo) }
 */
export async function abrirEditorOrcamento(ctx) {
  document.querySelector('#orcEditor')?.remove();
  let P = personalizacaoInicial(ctx.q);
  let tipo = ctx.q.tipo || '';
  let slot = 'capa';
  let cat = 'capa';
  let galeria = await carregarGaleria();
  let alterado = false;

  const box = document.createElement('div');
  box.id = 'orcEditor'; box.className = 'orc-editor';
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  const fechar = () => { box.remove(); document.body.style.overflow = ''; };

  const thumbs = () => {
    const sel = slot === 'capa' ? [P.capa] : P[slot];
    const lista = galeria.filter(f => cat === 'todas' || f.cats.includes(cat));
    return lista.map(f => { const i = sel.indexOf(f.nome); return `<button type="button" class="orc-thumb ${i >= 0 ? 'on' : ''}" data-foto="${esc(f.nome)}" title="${esc(f.desc)}"><img loading="lazy" src="${esc(urlFoto(ctx.base, f.nome))}" alt="${esc(f.desc)}">${i >= 0 ? `<b>${slot === 'capa' ? '✓' : i + 1}</b>` : ''}</button>`; }).join('') || '<p class="orc-vazio">Nenhuma foto nesta categoria.</p>';
  };
  const escolhidas = () => SLOTS.map(([k, t, n]) => { const fs = k === 'capa' ? [P.capa] : P[k]; return `<button type="button" class="orc-slot ${slot === k ? 'on' : ''}" data-slot="${k}"><span>${t}${n > 1 ? ` <small>(${n})</small>` : ''}</span><span class="orc-mini">${fs.map(f => `<img src="${esc(urlFoto(ctx.base, f))}" alt="">`).join('')}</span></button>`; }).join('');

  const desenhar = () => {
    box.innerHTML = `<div class="orc-editor__top"><div><span class="eyebrow">PERSONALIZAR ORÇAMENTO</span><h2>${esc(ctx.q.nome || ctx.q.tipo || 'Festa')} · ${esc(ctx.q.cliente || '')} <small>V${ctx.q.versao || 1}</small></h2></div><button type="button" class="orc-x" data-orc="fechar" aria-label="Fechar">✕</button></div>
    <div class="orc-editor__body">
      <aside class="orc-editor__painel">
        <section><h3>1. Estilo</h3><div class="orc-temas">${Object.entries(TEMAS).map(([k, t]) => `<button type="button" class="orc-tema ${P.tema === k ? 'on' : ''}" data-tema="${k}"><span style="background:linear-gradient(135deg,${t.plum} 0 50%,${t.uva} 50% 75%,${t.lilas} 75%)"></span>${t.nome}</button>`).join('')}</div></section>
        <section><h3>2. Fotos <small>escolha onde e clique nas fotos</small></h3><div class="orc-slots">${escolhidas()}</div>
          <div class="orc-cats">${CATEGORIAS.map(([k, t]) => `<button type="button" class="${cat === k ? 'on' : ''}" data-cat="${k}">${t}</button>`).join('')}</div>
          <p class="orc-dica">${slot === 'capa' ? 'Clique na foto que vai abrir o orçamento.' : 'Escolha 3 fotos. A 1ª é a grande; clicar numa escolhida tira ela.'}</p>
          <div class="orc-grade">${thumbs()}</div>
          <p class="orc-dica">Para ter mais fotos aqui, envie pela própria plataforma: <a href="#configuracoes" data-orc="ir-fotos">Configurações → Fotos do orçamento</a> (as escolhas feitas aqui ficam salvas).</p></section>
        <section><h3>3. Mensagem para o cliente</h3><textarea id="orcMsg" rows="4" maxlength="400" placeholder="Deixe em branco para usar o texto padrão (com o nome do cliente e a data por extenso).">${esc(P.mensagem)}</textarea></section>
        <section><h3>4. O que mostrar no investimento</h3>${MOSTRAR.map(([k, t]) => `<label class="orc-check"><input type="checkbox" data-mostrar="${k}" ${P.mostrar[k] ? 'checked' : ''}> ${t}</label>`).join('')}</section>
        <section><h3>5. Tipo de festa</h3><div class="orc-tipo"><select id="orcTipo"><option value="">Não informado</option>${(ctx.tipos || []).map(t => `<option ${t === tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><button type="button" class="btn btn-ghost" data-orc="carregar-padrao" ${tipo ? '' : 'disabled'}>Carregar padrão do tipo</button></div>
          <button type="button" class="btn btn-ghost orc-padrao" data-orc="salvar-padrao" ${tipo ? '' : 'disabled'}>⭐ Usar estas escolhas como padrão para ${tipo ? `“${esc(tipo)}”` : 'o tipo'}</button>
          <p class="orc-dica">O padrão vale para os próximos orçamentos deste tipo (fotos, estilo e opções; a mensagem não).</p></section>
      </aside>
      <div class="orc-editor__previa"><div class="orc-previa-escala"><iframe id="orcPrevia" title="Prévia do orçamento"></iframe></div></div>
    </div>
    <div class="orc-editor__rodape"><span class="orc-dica">${alterado ? 'Alterações ainda não salvas' : 'As escolhas ficam salvas nesta versão do orçamento'}</span><div><button type="button" class="btn btn-ghost" data-orc="fechar">Cancelar</button><button type="button" class="btn btn-ghost" data-orc="salvar">Salvar</button><button type="button" class="btn btn-primary" data-orc="abrir">Salvar e abrir PDF</button></div></div>`;
    ligar(); previa();
  };

  let timer = null;
  const previa = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const fr = box.querySelector('#orcPrevia'); if (!fr) return;
      const y = fr.contentWindow?.scrollY || 0;
      fr.srcdoc = orcamentoHTML({ q: { ...ctx.q, tipo }, e: ctx.e, calc: ctx.calc, pay: ctx.pay, base: ctx.base, validoAte: ctx.validoAte, diasValidade: ctx.diasValidade, personalizacao: P, previa: true });
      fr.onload = () => { try { fr.contentWindow.scrollTo(0, y); fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch { } escalar(); };
      escalar();
    }, 120);
  };
  const escalar = () => {
    const area = box.querySelector('.orc-editor__previa'); const esc2 = box.querySelector('.orc-previa-escala'); if (!area || !esc2) return;
    const k = Math.min(1, (area.clientWidth - 24) / 860); esc2.style.transform = `scale(${k})`; esc2.style.width = '860px'; const fr = esc2.querySelector('iframe'); const h = fr?.offsetHeight || 3500; esc2.style.margin = `0 ${-(1 - k) * 430}px ${-(1 - k) * h}px`;
  };
  window.addEventListener('resize', escalar);

  const mudou = () => { alterado = true; const r = box.querySelector('.orc-editor__rodape .orc-dica'); if (r) r.textContent = 'Alterações ainda não salvas'; };
  const atualizarFotos = () => { box.querySelector('.orc-grade').innerHTML = thumbs(); box.querySelector('.orc-slots').innerHTML = escolhidas(); ligarFotos(); previa(); };
  function ligarFotos() {
    box.querySelectorAll('[data-foto]').forEach(b => b.onclick = () => {
      const n = b.dataset.foto;
      if (slot === 'capa') P.capa = n;
      else { const a = [...P[slot]]; const i = a.indexOf(n); if (i >= 0) { if (a.length > 1) a.splice(i, 1); } else { if (a.length >= 3) a.pop(); a.push(n); } P[slot] = a; }
      mudou(); atualizarFotos();
    });
    box.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { slot = b.dataset.slot; cat = CAT_SUGERIDA[slot]; desenhar(); });
  }
  function ligar() {
    ligarFotos();
    box.querySelectorAll('[data-tema]').forEach(b => b.onclick = () => { P.tema = b.dataset.tema; mudou(); box.querySelectorAll('[data-tema]').forEach(x => x.classList.toggle('on', x === b)); previa(); });
    box.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; box.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); box.querySelector('.orc-grade').innerHTML = thumbs(); ligarFotos(); });
    box.querySelector('#orcMsg').oninput = e => { P.mensagem = e.target.value; mudou(); previa(); };
    box.querySelectorAll('[data-mostrar]').forEach(c => c.onchange = () => { P.mostrar[c.dataset.mostrar] = c.checked; mudou(); previa(); });
    box.querySelector('#orcTipo').onchange = e => { tipo = e.target.value; mudou(); desenhar(); };
    box.querySelectorAll('[data-orc="fechar"]').forEach(b => b.onclick = () => { if (alterado && !confirm('Sair sem salvar as alterações?')) return; fechar(); });
    box.querySelector('[data-orc="carregar-padrao"]')?.addEventListener('click', () => { const msg = P.mensagem; P = personalizacaoPadrao(tipo, padroesSalvos()); P.mensagem = msg; mudou(); desenhar(); });
    box.querySelector('[data-orc="salvar-padrao"]')?.addEventListener('click', e => {
      if (!tipo) return;
      const todos = padroesSalvos(); const { mensagem, ...semMsg } = P;
      writeJSON(PADROES_KEY, { ...todos, [tipo]: { ...semMsg, salvoEm: new Date().toISOString() } });
      e.currentTarget.textContent = `✓ Padrão de “${tipo}” salvo`;
    });
    box.querySelector('[data-orc="ir-fotos"]')?.addEventListener('click', ev => { ev.preventDefault(); ctx.onSalvar?.(normalizarPersonalizacao(P), tipo); fechar(); location.hash = 'configuracoes'; const t0 = Date.now(); const ir = () => { const el = document.querySelector('#fotosOrcamento'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); else if (Date.now() - t0 < 4000) setTimeout(ir, 150); }; setTimeout(ir, 200); });
    box.querySelector('[data-orc="salvar"]').onclick = () => { ctx.onSalvar?.(normalizarPersonalizacao(P), tipo); alterado = false; fechar(); };
    box.querySelector('[data-orc="abrir"]').onclick = () => { const p2 = normalizarPersonalizacao(P); ctx.onSalvar?.(p2, tipo); fechar(); ctx.onAbrirPdf?.(p2, tipo); };
  }
  desenhar();
}
