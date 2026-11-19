// Orçamento da Lega — modelo v2 (Plataforma 1.4.0)
// ---------------------------------------------------
// 3 páginas A4: capa personalizada para o cliente, "o que está incluso" com
// fotos reais da Lega e "investimento e reserva" com as duas formas de
// pagamento, os 3 passos para reservar, a validade e um QR Code do WhatsApp.

const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fromISO = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d, 12) : null; };
const dataLonga = s => { const d = fromISO(s); return d ? d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'data a definir'; };
const dataCurta = s => { const d = fromISO(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
const primeiroNome = n => String(n || '').trim().split(/\s+/)[0] || '';

export const WHATSAPP_LEGA = '5555996741239';
export const INSTAGRAM_LEGA = 'lega.eventos';

// Estilos de cor (todos derivados da marca; mudam o clima do orçamento)
export const TEMAS = {
  lilas: { nome: 'Lilás Lega', plum: '#3a1d4f', uva: '#6d3f96', lilas: '#a77bd1', nevoa: '#f4eefa', creme: '#fffaf4', folha: '#4f9a5b', folhaClara: '#e6f3e6', linha: '#e8dff0' },
  jardim: { nome: 'Jardim', plum: '#1f3b2a', uva: '#3f7a4f', lilas: '#8cbf8f', nevoa: '#eef6ee', creme: '#fbfaf4', folha: '#b07a3b', folhaClara: '#f6ecdf', linha: '#dfeadf' },
  rosa: { nome: 'Rosa delicado', plum: '#5a2240', uva: '#b04a7c', lilas: '#e59bbd', nevoa: '#fbeef4', creme: '#fffaf8', folha: '#6aa36f', folhaClara: '#e7f3e7', linha: '#f2dde7' },
  azul: { nome: 'Azul aventura', plum: '#16304d', uva: '#2f6aa3', lilas: '#7fb1de', nevoa: '#ecf3fa', creme: '#fafcff', folha: '#e0912f', folhaClara: '#fcefdd', linha: '#dce7f2' },
  dourado: { nome: 'Noite dourada', plum: '#1e1a24', uva: '#9a7429', lilas: '#d6b56b', nevoa: '#f6f0e3', creme: '#fffcf5', folha: '#9a7429', folhaClara: '#f4ead2', linha: '#ece2cc' }
};
export const MOSTRAR_PADRAO = { porConvidado: true, avista: true, parcelas: true, horaExtra: true, passos: true };
// ponto de partida por tipo de festa (a Lega pode trocar e salvar o seu)
const SUGESTAO_TIPO = {
  'Aniversário infantil': { tema: 'lilas', capa: 'foto-01.jpg', decoracao: ['foto-06.jpg', 'foto-07.jpg', 'foto-09.jpg'] },
  'Aniversário adulto': { tema: 'dourado', capa: 'foto-02.jpg', decoracao: ['foto-05.jpg', 'foto-07.jpg', 'foto-09.jpg'] },
  'Formatura': { tema: 'dourado', capa: 'foto-02.jpg', decoracao: ['foto-07.jpg', 'foto-05.jpg', 'foto-09.jpg'] },
  'Casamento': { tema: 'rosa', capa: 'foto-05.jpg', decoracao: ['foto-01.jpg', 'foto-07.jpg', 'foto-09.jpg'] },
  'Chá de bebê': { tema: 'rosa', capa: 'foto-05.jpg', decoracao: ['foto-08.jpg', 'foto-01.jpg', 'foto-09.jpg'] },
  'Corporativo': { tema: 'azul', capa: 'foto-02.jpg', decoracao: ['foto-06.jpg', 'foto-07.jpg', 'foto-09.jpg'] }
};
/** Personalização inicial: padrão salvo para o tipo > sugestão do tipo > geral. */
export function personalizacaoPadrao(tipo, salvos = {}) {
  const base = { tema: 'lilas', capa: 'foto-01.jpg', gastronomia: ['foto-14.jpg', 'foto-11.jpg', 'foto-13.jpg'], decoracao: ['foto-06.jpg', 'foto-08.jpg', 'foto-09.jpg'], espaco: ['foto-02.jpg', 'foto-03.jpg', 'foto-04.jpg'], mensagem: '', mostrar: { ...MOSTRAR_PADRAO } };
  const sug = SUGESTAO_TIPO[tipo] || {};
  const salvo = salvos?.[tipo] || salvos?.geral || {};
  return normalizarPersonalizacao({ ...base, ...sug, ...salvo, mensagem: '' });
}
export function normalizarPersonalizacao(p = {}) {
  const tres = (v, d) => { const a = (Array.isArray(v) ? v : []).filter(Boolean).slice(0, 3); while (a.length < 3) a.push(d[a.length]); return a; };
  return {
    tema: TEMAS[p.tema] ? p.tema : 'lilas',
    capa: p.capa || 'foto-01.jpg',
    gastronomia: tres(p.gastronomia, ['foto-14.jpg', 'foto-11.jpg', 'foto-13.jpg']),
    decoracao: tres(p.decoracao, ['foto-06.jpg', 'foto-08.jpg', 'foto-09.jpg']),
    espaco: tres(p.espaco, ['foto-02.jpg', 'foto-03.jpg', 'foto-04.jpg']),
    mensagem: String(p.mensagem || '').slice(0, 400),
    mostrar: { ...MOSTRAR_PADRAO, ...(p.mostrar || {}) }
  };
}

const DECORACAO = [
  'Painel de LED com tema da festa',
  'Fundo em voal ou de folhagem',
  'Painel redondo e/ou romano',
  'Arco orgânico de balões',
  'Cilindros, mesa e tapete',
  'Bolo e doces personalizados com nome e idade'
];

// ícones simples em linha (sem dependências)
const ICON = {
  pessoas: '<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-11 9c.8-3.2 3.6-5 7-5s6.2 1.8 7 5"/></svg>',
  relogio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendario: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  folha: '<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14m0 0 7-7"/></svg>'
};

/**
 * @param {object} o
 *  q: versão do orçamento · e: evento · calc: calcQuote(...) · pay: paymentSummary(...)
 *  base: URL base do site (para as imagens) · validoAte: 'AAAA-MM-DD' | null
 */
export function orcamentoHTML({ q, e, calc, pay, base, validoAte, diasValidade = 5, personalizacao = null, previa = false }) {
  const cfg = calc.cfg || {};
  const P = normalizarPersonalizacao(personalizacao || q.personalizacao || {});
  const T = TEMAS[P.tema];
  const foto = nome => /^https?:/i.test(nome) ? nome : `${base}assets/orcamento/${nome}`;
  const M = P.mostrar;
  const titulo = q.nome || q.tipo || 'A sua festa';
  const convidados = Number(q.convidadosTotal || 0);
  const porConvidado = convidados ? q.valor / convidados : 0;
  const economia = q.valor - pay.avista;
  const parcela6 = pay.saldo / 6;
  const horario = q.horaInicio ? (() => { const [h, m] = q.horaInicio.split(':').map(Number); const f = (h + Number(calc.duracao || 0)) % 24; return `${q.horaInicio} às ${String(f).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`; })() : `${calc.duracao} horas de festa`;
  const msgWhats = `Olá, Lega! Recebi o orçamento ${q.versao ? 'V' + q.versao + ' ' : ''}da festa${q.nome ? ' “' + q.nome + '”' : ''} para ${dataCurta(q.data)} (${convidados} convidados) e quero conversar sobre a reserva.`;
  const linkWhats = `https://wa.me/${WHATSAPP_LEGA}?text=${encodeURIComponent(msgWhats)}`;
  const li = arr => (arr || []).map(x => `<li>${esc(x)}</li>`).join('');
  const parcelas = [1, 2, 3, 4, 5, 6].map(n => `<div><b>${n}x</b> ${money(pay.saldo / n)}</div>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orçamento ${esc(titulo)} – ${esc(q.cliente || '')} (V${q.versao || 1})</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:0}
:root{--plum:${T.plum};--uva:${T.uva};--lilas:${T.lilas};--nevoa:${T.nevoa};--creme:${T.creme};--folha:${T.folha};--folha-clara:${T.folhaClara};--tinta:#2b2133;--suave:#6f6578;--linha:${T.linha}}
*{box-sizing:border-box}html,body{margin:0}
body{background:#d9d3de;font-family:Inter,system-ui,sans-serif;color:var(--tinta);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.barra{position:fixed;top:16px;right:16px;z-index:9;display:flex;gap:8px}
.barra button,.barra a{border:0;border-radius:999px;padding:12px 18px;font:700 14px Inter,sans-serif;cursor:pointer;text-decoration:none}
.barra .imprimir{background:var(--uva);color:#fff}.barra .zap{background:#fff;color:var(--uva)}
.pagina{width:210mm;height:297mm;margin:10mm auto;background:var(--creme);position:relative;overflow:hidden;page-break-after:always;box-shadow:0 10px 40px rgba(0,0,0,.15)}
h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:700;margin:0;color:var(--plum);letter-spacing:-.01em}
.eyebrow{font:800 9.5px Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--uva)}
.rodape{position:absolute;left:16mm;right:16mm;bottom:9mm;display:flex;justify-content:space-between;font-size:9.5px;color:var(--suave)}
/* ---------- capa ---------- */
.capa .foto{position:absolute;inset:0 0 auto 0;height:200mm;background:center/cover no-repeat}
.capa .foto::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(58,29,79,.55) 0%,rgba(58,29,79,0) 32%,rgba(58,29,79,0) 60%,var(--creme) 100%)}
.capa .logo{position:absolute;top:13mm;left:16mm;width:44mm;filter:brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0,0,0,.25))}
.capa .selo{position:absolute;top:15mm;right:16mm;background:rgba(255,255,255,.92);color:var(--uva);border-radius:999px;padding:7px 14px;font:800 9.5px Inter,sans-serif;letter-spacing:.14em}
.capa .texto{position:absolute;left:16mm;right:16mm;bottom:22mm}
.capa .para{font:600 13px Inter,sans-serif;color:var(--uva);margin-bottom:3mm}
.capa h1{font-size:54px;line-height:1.02;max-width:170mm}
.capa .lead{font-size:14.5px;line-height:1.6;color:var(--suave);max-width:150mm;margin:5mm 0 8mm}
.fatos{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.fato{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:4mm 4mm 3.6mm}
.fato svg{width:18px;height:18px;fill:none;stroke:var(--uva);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.fato small{display:block;font-size:8.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--suave);margin:2mm 0 1mm}
.fato strong{font-size:13.5px;line-height:1.3}
.capa .validade{margin-top:6mm;display:flex;align-items:center;gap:3mm;font-size:11px;color:var(--folha);font-weight:700}
.capa .validade::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--folha);box-shadow:0 0 0 4px var(--folha-clara)}
/* ---------- incluso ---------- */
.miolo{padding:15mm 16mm}
.miolo>header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6mm}
.miolo h2{font-size:30px;line-height:1.05}
.miolo header p{margin:2mm 0 0;color:var(--suave);font-size:12px;max-width:110mm;line-height:1.5}
.pacote{background:var(--nevoa);color:var(--uva);border-radius:999px;padding:7px 14px;font:800 10px Inter,sans-serif;letter-spacing:.08em;white-space:nowrap}
.bloco{display:grid;grid-template-columns:66mm 1fr;gap:6mm;align-items:stretch;margin-bottom:5mm}
.bloco.inv{grid-template-columns:1fr 66mm}.bloco.inv .fotos{order:2}
.fotos{display:grid;gap:2.5mm;grid-template-columns:1fr 1fr;grid-template-rows:38mm 27mm}
.fotos div{border-radius:14px;background:center/cover no-repeat}
.fotos div:first-child{grid-column:1/3}
.conteudo{background:#fff;border:1px solid var(--linha);border-radius:18px;padding:6mm 7mm;display:flex;flex-direction:column;justify-content:center}
.conteudo h3{font-size:19px;margin:1.5mm 0 3mm}
.conteudo ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}
.conteudo li{font-size:12px;line-height:1.4;padding-left:5mm;position:relative}
.conteudo li::before{content:"";position:absolute;left:0;top:1.3mm;width:2.2mm;height:2.2mm;border-radius:50% 0;background:var(--folha);transform:rotate(-45deg)}
.conteudo p{font-size:10.5px;color:var(--suave);margin:3mm 0 0;line-height:1.5}
/* ---------- investimento ---------- */
.total{display:flex;justify-content:space-between;align-items:flex-end;background:var(--plum);color:#fff;border-radius:22px;padding:7mm 9mm;margin-bottom:6mm}
.total .eyebrow{color:#d9c4ee}
.total h2{color:#fff;font-size:38px;margin-top:1.5mm}
.total p{margin:1.5mm 0 0;color:#d9c4ee;font-size:11.5px}
.total .pp{text-align:right}.total .pp strong{display:block;font:700 20px Fraunces,serif;color:#fff}
.opcoes{display:grid;grid-template-columns:1fr 1.25fr;gap:5mm}.opcoes.so-parcelado{grid-template-columns:1fr}[hidden]{display:none!important}
.opcao{background:#fff;border:1px solid var(--linha);border-radius:20px;padding:6mm 7mm;position:relative}
.opcao h3{font-size:18px;margin:2mm 0 1mm}
.opcao .valor{font:700 30px Fraunces,serif;color:var(--plum);margin:3mm 0 1mm}
.opcao .nota{font-size:10.5px;color:var(--suave);line-height:1.45}
.opcao.avista{border:2px solid var(--folha);background:linear-gradient(180deg,#fff,var(--folha-clara))}
.tag{position:absolute;top:-3mm;right:6mm;background:var(--folha);color:#fff;border-radius:999px;padding:5px 11px;font:800 9px Inter,sans-serif;letter-spacing:.08em}
.destaque{font-size:12.5px;margin:3mm 0}.destaque b{font:700 20px Fraunces,serif;color:var(--plum)}
.tabela{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;margin-top:3mm}
.tabela div{background:var(--nevoa);border-radius:10px;padding:3mm;text-align:center;font-size:11.5px}.tabela b{color:var(--uva)}
.extra{font-size:11.5px;color:var(--suave);margin:4mm 1mm 0}
.obs{margin-top:4mm;background:#fff8e8;border:1px solid #efd9a2;border-radius:14px;padding:4mm 5mm;font-size:11px;line-height:1.5}
.passos{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:5mm}
.passo{background:#fff;border:1px solid var(--linha);border-radius:16px;padding:5mm}
.passo span{display:inline-flex;width:7mm;height:7mm;border-radius:50%;background:var(--nevoa);color:var(--uva);font:800 12px Inter,sans-serif;align-items:center;justify-content:center}
.passo strong{display:block;font-size:13px;margin:2.5mm 0 1mm}.passo p{margin:0;font-size:11px;color:var(--suave);line-height:1.45}
.reserva{display:grid;grid-template-columns:1fr 40mm;gap:7mm;align-items:center;margin-top:5mm;background:var(--uva);color:#fff;border-radius:22px;padding:6mm 7mm}
.reserva h3{color:#fff;font-size:23px;line-height:1.15}
.reserva p{margin:3mm 0 0;font-size:12px;color:#ecdff8;line-height:1.5}
.reserva .qr{background:#fff;border-radius:14px;padding:2.5mm;aspect-ratio:1;display:flex;align-items:center;justify-content:center}
.reserva .qr svg,.reserva .qr img{width:100%;height:100%}
.reserva .qr small{color:var(--uva);font-size:8px;text-align:center}
@media screen and (max-width:820px){.pagina{transform:scale(.47);transform-origin:top left;margin:0 0 -157mm 0}}
@media print{body{background:#fff}.barra{display:none}.pagina{margin:0;box-shadow:none}}
</style></head><body>
${previa ? '<style>.barra{display:none}body{background:transparent}.pagina{margin:0 auto 6mm!important;transform:none!important}</style>' : ''}<div class="barra"><a class="zap" href="${esc(linkWhats)}" target="_blank" rel="noopener">WhatsApp</a><button class="imprimir" onclick="window.print()">Salvar PDF</button></div>

<section class="pagina capa">
  <div class="foto" style="background-image:url('${foto(P.capa)}')"></div>
  <img class="logo" src="${base}assets/logo/logo-lega.png" alt="Lega Eventos">
  <span class="selo">PROPOSTA ${q.versao ? 'V' + q.versao : ''}</span>
  <div class="texto">
    <div class="para">Proposta especial para ${esc(q.cliente || '')}</div>
    <h1>${esc(titulo)}</h1>
    <p class="lead">${P.mensagem ? esc(P.mensagem) : `${primeiroNome(q.cliente) ? esc(primeiroNome(q.cliente)) + ', p' : 'P'}reparamos cada detalhe para que ${esc(dataLonga(q.data))} seja um dia para guardar no coração. Você aproveita a festa; a Lega cuida de todo o resto.`}</p>
    <div class="fatos">
      <div class="fato">${ICON.calendario}<small>Data</small><strong>${esc(dataCurta(q.data))}</strong></div>
      <div class="fato">${ICON.pessoas}<small>Convidados</small><strong>${convidados} pessoas</strong></div>
      <div class="fato">${ICON.relogio}<small>Horário</small><strong>${esc(horario)}</strong></div>
      <div class="fato">${ICON.folha}<small>Pacote</small><strong>${esc(q.pacote || '')}</strong></div>
    </div>
    ${validoAte ? `<div class="validade">Sua data está disponível · proposta válida até ${esc(dataCurta(validoAte))}</div>` : ''}
  </div>
  <div class="rodape"><span>@${INSTAGRAM_LEGA}</span><span>Lega Eventos · Caçapava do Sul</span></div>
</section>

<section class="pagina miolo">
  <header><div><span class="eyebrow">O que está incluso</span><h2>Tudo pronto para<br>você só aproveitar</h2><p>${convidados} convidados, ${calc.duracao} horas de festa e uma equipe cuidando de cada detalhe, da recepção ao último docinho.</p></div><span class="pacote">${esc(q.pacote || '')}</span></header>
  <div class="bloco">
    <div class="fotos">${P.gastronomia.map(n => `<div style="background-image:url('${foto(n)}')"></div>`).join('')}</div>
    <div class="conteudo"><span class="eyebrow">Gastronomia</span><h3>Sabores que os convidados comentam</h3><ul>${li(cfg.gastronomia)}</ul></div>
  </div>
  <div class="bloco inv">
    <div class="fotos">${P.decoracao.map(n => `<div style="background-image:url('${foto(n)}')"></div>`).join('')}</div>
    <div class="conteudo"><span class="eyebrow">Decoração</span><h3>O cenário do tema escolhido</h3><ul>${li(DECORACAO)}</ul><p>Lembrancinhas, centros de mesa e itens extras de decoração podem ser combinados à parte.</p></div>
  </div>
  <div class="bloco">
    <div class="fotos">${P.espaco.map(n => `<div style="background-image:url('${foto(n)}')"></div>`).join('')}</div>
    <div class="conteudo"><span class="eyebrow">Espaço e equipe</span><h3>Conforto para as crianças e para a família</h3><ul>${li(cfg.estrutura)}</ul></div>
  </div>
  <div class="rodape"><span>Lega Eventos</span><span>Momentos especiais merecem um cenário especial</span></div>
</section>

<section class="pagina miolo">
  <header><div><span class="eyebrow">Investimento e reserva</span><h2>Escolha o jeito que<br>fica melhor para você</h2></div><span class="pacote">${esc(q.pacote || '')} · ${convidados} convidados</span></header>
  <div class="total"><div><span class="eyebrow">Investimento total</span><h2>${money(q.valor)}</h2><p>${calc.duracao} horas de festa · ${esc(dataCurta(q.data))}</p></div>${porConvidado && M.porConvidado ? `<div class="pp"><span class="eyebrow">Por convidado</span><strong>${money(porConvidado)}</strong></div>` : ''}</div>
  <div class="opcoes ${M.avista ? '' : 'so-parcelado'}">
    ${M.avista ? '' : '<!--'}<div class="opcao avista"><span class="tag">ECONOMIZE ${money(economia)}</span><span class="eyebrow">À vista</span><h3>Pagamento único</h3><div class="valor">${money(pay.avista)}</div><div class="nota">${pay.desconto}% de desconto, com pagamento integral na assinatura do contrato.</div></div>${M.avista ? '' : '-->'}
    <div class="opcao"><span class="eyebrow">Parcelado</span><h3>Entrada + até 6 parcelas</h3><div class="destaque">Entrada de <b>${money(pay.entrada)}</b> e saldo em <b>6x de ${money(parcela6)}</b></div>${M.parcelas ? `<div class="nota">Parcelas iguais, sem acréscimo. Veja outras opções para o saldo de ${money(pay.saldo)}:</div><div class="tabela">${parcelas}</div>` : '<div class="nota">Parcelas iguais, sem acréscimo.</div>'}</div>
  </div>
  <p class="extra" ${M.horaExtra ? '' : 'hidden'}>${cfg.permiteHoraExtra ? `Quer estender a festa? Hora extra: ${money(calc.valorHoraExtra)} por hora, contratada com antecedência.` : 'Este pacote não inclui contratação de hora extra.'}</p>
  ${q.observacaoNegociacao ? `<div class="obs"><b>Condição especial:</b> ${esc(q.observacaoNegociacao)}</div>` : ''}
  <div class="passos" ${M.passos ? '' : 'hidden'}>
    <div class="passo"><span>1</span><strong>Fale com a gente</strong><p>Escolha a forma de pagamento e chame a Lega no WhatsApp.</p></div>
    <div class="passo"><span>2</span><strong>Assine sem sair de casa</strong><p>Enviamos o contrato para assinatura digital pelo gov.br.</p></div>
    <div class="passo"><span>3</span><strong>Data reservada!</strong><p>Com a entrada confirmada, a data é sua e começamos a preparar a festa.</p></div>
  </div>
  <div class="reserva"><div><h3>Vamos reservar ${esc(dataCurta(q.data))} para você?</h3><p>${validoAte ? `Esta proposta vale até <b>${esc(dataCurta(validoAte))}</b> (${diasValidade} dias úteis). Depois disso, valores e disponibilidade da data precisam ser confirmados novamente.` : 'Fale com a gente para confirmar a disponibilidade da data.'}<br>WhatsApp (55) 99674-1239 · @${INSTAGRAM_LEGA}</p></div><a class="qr" id="qr" href="${esc(linkWhats)}"><small>Aponte a câmera para falar no WhatsApp</small></a></div>
  <div class="rodape"><span>@${INSTAGRAM_LEGA}</span><span>WhatsApp (55) 99674-1239</span></div>
</section>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>try{var q=qrcode(0,'M');q.addData(${JSON.stringify(linkWhats)});q.make();document.getElementById('qr').innerHTML=q.createSvgTag({cellSize:4,margin:0,scalable:true});}catch(e){}</script>
</body></html>`;
}
