// Configurações → Fotos do orçamento (v1.6.0)
// Envia fotos direto da plataforma (sem GitHub). A imagem é reduzida no
// navegador (até 1800 px, JPEG) e guardada no Supabase Storage; a lista com
// categorias e descrição fica nos dados compartilhados da plataforma.

import { readJSON, writeJSON } from '../../js/storage.js';
import { enviarFotoStorage, apagarFotoStorage, urlPublicaFoto, FOTOS_BUCKET } from '../../js/supabase.js';
import { FOTOS_PADRAO, CATS_FOTO, FOTOS_KEY, OCULTAS_KEY, fotosEnviadas, fotosOcultas, urlFoto } from '../../core/engine/galeria.js';

const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const base = () => new URL('.', location.href).href;
let filtro = 'todas';

export const SQL_FOTOS = `-- Rode uma vez no Supabase (SQL Editor) do projeto da Plataforma Lega
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('${FOTOS_BUCKET}', '${FOTOS_BUCKET}', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "lega fotos ler" on storage.objects;
drop policy if exists "lega fotos enviar" on storage.objects;
drop policy if exists "lega fotos alterar" on storage.objects;
drop policy if exists "lega fotos apagar" on storage.objects;
create policy "lega fotos ler" on storage.objects for select to authenticated using (bucket_id = '${FOTOS_BUCKET}');
create policy "lega fotos enviar" on storage.objects for insert to authenticated with check (bucket_id = '${FOTOS_BUCKET}');
create policy "lega fotos alterar" on storage.objects for update to authenticated using (bucket_id = '${FOTOS_BUCKET}');
create policy "lega fotos apagar" on storage.objects for delete to authenticated using (bucket_id = '${FOTOS_BUCKET}');`;

const todas = () => readJSON(FOTOS_KEY, []) || [];
const salvar = (lista) => writeJSON(FOTOS_KEY, lista);
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';

/** Reduz a foto para no máximo 1800 px no lado maior e converte para JPEG. */
async function reduzir(arquivo, max = 1800, qualidade = 0.85) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Arquivo não é uma imagem válida.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok, erro) => cv.toBlob(b => b ? ok(b) : erro(new Error('Não foi possível preparar a foto.')), 'image/jpeg', qualidade));
  } finally { URL.revokeObjectURL(url); }
}

function cartao(f, enviada, oculta) {
  const cats = f.cats || [];
  return `<div class="ft-card ${oculta ? 'is-oculta' : ''}" data-ft="${esc(f.nome)}">
    <div class="ft-img"><img loading="lazy" src="${esc(urlFoto(base(), f.nome))}" alt="${esc(f.desc)}">${enviada ? '<span class="ft-tag">Enviada</span>' : '<span class="ft-tag ft-tag--padrao">Padrão</span>'}${oculta ? '<span class="ft-oculta">Escondida da galeria</span>' : ''}</div>
    <div class="ft-info">
      ${enviada ? `<input class="ft-desc" data-ft-desc value="${esc(f.desc || '')}" placeholder="Descrição (ex.: Mesa de doces formatura)" maxlength="80">` : `<p class="ft-desc-txt">${esc(f.desc)}</p>`}
      <div class="ft-cats">${CATS_FOTO.map(([k, t]) => enviada
        ? `<label class="ft-chip ${cats.includes(k) ? 'on' : ''}"><input type="checkbox" data-ft-cat="${k}" ${cats.includes(k) ? 'checked' : ''}>${t}</label>`
        : (cats.includes(k) ? `<span class="ft-chip on">${t}</span>` : '')).join('')}</div>
      <div class="ft-acoes">${enviada
        ? '<button type="button" class="btn btn-ghost btn-sm" data-ft-apagar>Apagar foto</button>'
        : `<button type="button" class="btn btn-ghost btn-sm" data-ft-ocultar>${oculta ? 'Mostrar na galeria' : 'Esconder da galeria'}</button>`}</div>
    </div></div>`;
}

export function fotosSection() {
  const env = fotosEnviadas(); const oc = fotosOcultas();
  const itens = [...env.map(f => [f, true]), ...FOTOS_PADRAO.map(f => [f, false])]
    .filter(([f, e]) => filtro === 'todas' || (filtro === 'enviadas' ? e : (f.cats || []).includes(filtro)));
  return `<section class="panel" id="fotosOrcamento"><div class="panel-header"><div><h2>Fotos do orçamento</h2><p>Envie fotos das festas direto daqui. Elas aparecem no editor "Personalizar orçamento" para escolher na capa e nas seções.</p></div><span class="badge green">${env.length} enviada(s) · ${FOTOS_PADRAO.length - oc.size} padrão</span></div>
    <form class="ft-envio" id="ftEnvio">
      <label class="ft-drop" id="ftDrop"><input type="file" id="ftArquivos" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden><strong>📷 Escolher fotos</strong><span>ou arraste as fotos para cá · JPG ou PNG · várias de uma vez</span></label>
      <div class="ft-envio__opcoes"><p><b>Onde essas fotos combinam?</b> (pode marcar mais de uma; dá para mudar depois)</p>
        <div class="ft-cats">${CATS_FOTO.map(([k, t]) => `<label class="ft-chip"><input type="checkbox" name="cat" value="${k}">${t}</label>`).join('')}</div>
        <input name="desc" class="ft-desc" placeholder="Descrição (opcional) — ex.: Formatura Medicina, mesa de doces" maxlength="80">
        <div id="ftFila" class="ft-fila"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit" id="ftEnviar" disabled>Enviar fotos</button></div></div>
    </form>
    <div id="ftAviso"></div>
    <div class="ft-filtro">${[['todas', 'Todas'], ['enviadas', 'Enviadas'], ...CATS_FOTO].map(([k, t]) => `<button type="button" class="${filtro === k ? 'on' : ''}" data-ft-filtro="${k}">${t}</button>`).join('')}</div>
    <div class="ft-grade">${itens.map(([f, e]) => cartao(f, e, !e && oc.has(f.nome))).join('') || '<p class="muted">Nenhuma foto neste filtro.</p>'}</div>
  </section>`;
}

function avisoSetup(root) {
  root.querySelector('#ftAviso').innerHTML = `<div class="ft-setup"><h3>Falta um passo (só uma vez)</h3>
    <p>O espaço para guardar as fotos ainda não foi criado no Supabase. Peça para quem administra o Supabase (ou faça você):</p>
    <ol><li>Entre em <b>supabase.com</b> → projeto da Plataforma Lega → <b>SQL Editor</b> → <b>New query</b>.</li><li>Cole o texto abaixo e clique em <b>Run</b>.</li><li>Volte aqui e clique em <b>Enviar fotos</b> de novo.</li></ol>
    <textarea readonly rows="8">${esc(SQL_FOTOS)}</textarea><button type="button" class="btn btn-ghost btn-sm" data-ft-copiar>Copiar texto</button></div>`;
  root.querySelector('[data-ft-copiar]').onclick = async (e) => { try { await navigator.clipboard.writeText(SQL_FOTOS); e.target.textContent = '✓ Copiado'; } catch { root.querySelector('.ft-setup textarea').select(); } };
}

export function bindFotos(root, recarregar) {
  const sec = root.querySelector('#fotosOrcamento'); if (!sec) return;
  const input = sec.querySelector('#ftArquivos'); const drop = sec.querySelector('#ftDrop');
  const fila = sec.querySelector('#ftFila'); const enviar = sec.querySelector('#ftEnviar');
  let arquivos = [];
  const mostrarFila = () => {
    fila.innerHTML = arquivos.map((a, i) => `<span class="ft-fila__item" data-i="${i}"><img src="${URL.createObjectURL(a)}" alt="">${esc(a.name)}<em></em></span>`).join('');
    enviar.disabled = !arquivos.length; enviar.textContent = arquivos.length ? `Enviar ${arquivos.length} foto(s)` : 'Enviar fotos';
  };
  const adicionar = (lista) => { arquivos = [...arquivos, ...[...lista].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name))]; mostrarFila(); };
  input.onchange = () => adicionar(input.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave = () => drop.classList.remove('on');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('on'); adicionar(e.dataTransfer.files); };
  sec.querySelectorAll('.ft-envio .ft-chip input').forEach(c => c.onchange = () => c.parentElement.classList.toggle('on', c.checked));

  sec.querySelector('#ftEnvio').onsubmit = async (ev) => {
    ev.preventDefault(); if (!arquivos.length) return;
    const fd = new FormData(ev.target); const cats = fd.getAll('cat'); const desc = String(fd.get('desc') || '').trim();
    enviar.disabled = true; let ok = 0; let setup = false; const erros = [];
    for (let i = 0; i < arquivos.length; i++) {
      const a = arquivos[i]; const tag = fila.querySelector(`[data-i="${i}"] em`);
      enviar.textContent = `Enviando ${i + 1} de ${arquivos.length}…`; if (tag) tag.textContent = ' · enviando…';
      try {
        const blob = await reduzir(a);
        const path = `${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}-${slug(a.name)}.jpg`;
        await enviarFotoStorage(path, blob);
        const lista = todas();
        lista.push({ id: `foto_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nome: urlPublicaFoto(path), path, cats, desc: desc || a.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), criadoEm: new Date().toISOString() });
        salvar(lista); ok++; if (tag) tag.textContent = ' · ✓';
      } catch (e) {
        if (e.code === 'SETUP') { setup = true; if (tag) tag.textContent = ''; break; }
        erros.push(`${a.name}: ${e.message}`); if (tag) tag.textContent = ' · ✗';
      }
    }
    if (setup) { avisoSetup(root); enviar.disabled = false; enviar.textContent = `Enviar ${arquivos.length} foto(s)`; return; }
    if (erros.length) alert(`${ok} foto(s) enviada(s).\n\nNão foi possível enviar:\n• ${erros.join('\n• ')}`);
    recarregar();
  };

  sec.querySelectorAll('[data-ft-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.ftFiltro; recarregar(); });
  const atualizar = (nome, fn) => salvar(todas().map(f => f.nome === nome ? { ...fn(f), atualizadoEm: new Date().toISOString() } : f));
  sec.querySelectorAll('.ft-card').forEach(card => {
    const nome = card.dataset.ft;
    card.querySelector('[data-ft-desc]')?.addEventListener('change', e => atualizar(nome, f => ({ ...f, desc: e.target.value.trim() })));
    card.querySelectorAll('[data-ft-cat]').forEach(c => c.onchange = () => {
      c.parentElement.classList.toggle('on', c.checked);
      atualizar(nome, f => { const s = new Set(f.cats || []); c.checked ? s.add(c.dataset.ftCat) : s.delete(c.dataset.ftCat); return { ...f, cats: [...s] }; });
    });
    card.querySelector('[data-ft-apagar]')?.addEventListener('click', async (e) => {
      if (!confirm('Apagar esta foto? Orçamentos já enviados que usam ela deixam de mostrar a imagem.')) return;
      const f = todas().find(x => x.nome === nome); e.target.disabled = true; e.target.textContent = 'Apagando…';
      try { if (f?.path) await apagarFotoStorage(f.path); } catch (err) { if (err.code !== 'SETUP' && !confirm(`Não consegui apagar o arquivo (${err.message}). Tirar da galeria mesmo assim?`)) { recarregar(); return; } }
      atualizar(nome, x => ({ ...x, apagada: true })); recarregar();
    });
    card.querySelector('[data-ft-ocultar]')?.addEventListener('click', () => {
      const oc = fotosOcultas(); oc.has(nome) ? oc.delete(nome) : oc.add(nome); writeJSON(OCULTAS_KEY, [...oc]); recarregar();
    });
  });
}
