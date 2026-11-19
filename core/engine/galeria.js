// Galeria de fotos do orçamento (v1.5.0)
// --------------------------------------
// Fotos que já vêm com a plataforma (assets/orcamento) + fotos novas que a
// Lega enviar para essa mesma pasta no GitHub: a plataforma lista a pasta
// sozinha e as fotos novas aparecem na galeria (categoria "Novas").

export const FOTOS_PADRAO = [
  { nome: 'foto-01.jpg', cats: ['capa', 'decoracao'], desc: 'Decoração rosa com arco de flores' },
  { nome: 'foto-02.jpg', cats: ['capa', 'decoracao', 'espaco'], desc: 'Painel colorido e salão' },
  { nome: 'foto-03.jpg', cats: ['espaco'], desc: 'Crianças brincando no painel' },
  { nome: 'foto-04.jpg', cats: ['espaco'], desc: 'Menino no painel de brincadeiras' },
  { nome: 'foto-05.jpg', cats: ['capa', 'decoracao'], desc: 'Arranjo de flores com orelhas' },
  { nome: 'foto-06.jpg', cats: ['capa', 'decoracao'], desc: 'Decoração tema futebol' },
  { nome: 'foto-07.jpg', cats: ['capa', 'decoracao', 'gastronomia'], desc: 'Bolo personalizado com nome' },
  { nome: 'foto-08.jpg', cats: ['decoracao', 'gastronomia'], desc: 'Bolo de Páscoa' },
  { nome: 'foto-09.jpg', cats: ['gastronomia'], desc: 'Doces personalizados' },
  { nome: 'foto-10.jpg', cats: ['gastronomia'], desc: 'Salgados variados' },
  { nome: 'foto-11.jpg', cats: ['gastronomia'], desc: 'Salgados assados' },
  { nome: 'foto-12.jpg', cats: ['gastronomia'], desc: 'Frutas' },
  { nome: 'foto-13.jpg', cats: ['gastronomia'], desc: 'Linguicinha e polenta' },
  { nome: 'foto-14.jpg', cats: ['gastronomia'], desc: 'Mesa de salgados' }
];
export const CATEGORIAS = [['todas', 'Todas'], ['capa', 'Boas para capa'], ['decoracao', 'Decoração'], ['gastronomia', 'Gastronomia'], ['espaco', 'Espaço e crianças'], ['novas', 'Enviadas por vocês']];
export const CATS_FOTO = CATEGORIAS.filter(([k]) => k !== 'todas' && k !== 'novas');

// Fotos enviadas pela própria plataforma (Configurações → Fotos do orçamento).
// A lista é compartilhada entre os computadores; os arquivos ficam no Supabase.
export const FOTOS_KEY = 'lega.orcamento.fotos';
export const OCULTAS_KEY = 'lega.orcamento.fotosOcultas';
const ler = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
export const fotosEnviadas = () => (ler(FOTOS_KEY, []) || []).filter(f => f && f.nome && !f.apagada);
export const fotosOcultas = () => new Set(ler(OCULTAS_KEY, []) || []);

const CACHE = 'lega.galeria.cache';
const EXT = /\.(jpe?g|png|webp)$/i;

/** Descobre usuário/repositório quando a plataforma roda no GitHub Pages. */
function repositorio() {
  const h = location.hostname;
  if (!h.endsWith('github.io')) return null;
  const dono = h.split('.')[0];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return dono && repo ? { dono, repo } : null;
}

/** Lista as fotos (padrão + novas da pasta no GitHub). Nunca falha: sem internet, devolve as padrão. */
export async function carregarGaleria() {
  const ocultas = fotosOcultas();
  const enviadas = fotosEnviadas().map(f => ({ nome: f.nome, cats: [...new Set([...(f.cats || []), 'novas'])], desc: f.desc || 'Foto enviada' }));
  const lista = [...enviadas, ...FOTOS_PADRAO.filter(f => !ocultas.has(f.nome)).map(f => ({ ...f }))];
  const conhecidas = new Set([...lista.map(f => f.nome), ...FOTOS_PADRAO.map(f => f.nome)]);
  const r = repositorio();
  if (!r) return lista;
  let nomes = null;
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
    if (c && Date.now() - c.em < 30 * 60 * 1000) nomes = c.nomes;
  } catch { }
  if (!nomes) {
    try {
      const resp = await fetch(`https://api.github.com/repos/${r.dono}/${r.repo}/contents/assets/orcamento`, { cache: 'no-store' });
      if (resp.ok) {
        nomes = (await resp.json()).filter(x => x.type === 'file' && EXT.test(x.name)).map(x => x.name);
        try { sessionStorage.setItem(CACHE, JSON.stringify({ em: Date.now(), nomes })); } catch { }
      }
    } catch { }
  }
  (nomes || []).filter(n => !conhecidas.has(n)).sort().forEach(n => lista.push({ nome: n, cats: ['novas'], desc: n.replace(EXT, '').replace(/[-_]+/g, ' ') }));
  return lista;
}

export const urlFoto = (base, nome) => /^https?:/i.test(nome) ? nome : `${base}assets/orcamento/${nome}`;
