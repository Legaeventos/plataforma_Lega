// Conexão com o banco do Controle de Bebidas (Supabase próprio, separado do
// banco da Plataforma). A Plataforma lê e grava NO MESMO banco que o sistema
// antigo usa: os dois funcionam em paralelo, sem cópia de dados.
// O login fica guardado só neste aparelho (chave lega.auth.bebidas, que não
// vai para a nuvem da Plataforma).

export const BEBIDAS_URL = 'https://gkxbzcmyeumvrospufdx.supabase.co';
const BEBIDAS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreGJ6Y215ZXVtdnJvc3B1ZmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDIxMjIsImV4cCI6MjA5MDM3ODEyMn0.yCnQ8O-FjToVfvRgxehNjIGhCNO2M7rLXtT-zAsStPQ';
const SESSION_KEY = 'lega.auth.bebidas';

function ler() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function gravar(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { } }
function expirado(s) {
  try { const p = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return !p.exp || p.exp * 1000 < Date.now() + 60000; }
  catch { return true; }
}
function erroAuth(msg) { const e = new Error(msg); e.code = 'AUTH'; return e; }

export function temSessao() { return !!ler(); }
export function emailSessao() { return ler()?.user?.email || ''; }

export async function entrar(email, senha) {
  const r = await fetch(`${BEBIDAS_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: BEBIDAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? 'E-mail ou senha não conferem com o login do Controle de Bebidas. Use o mesmo e-mail e senha do controlebebidaslega.' : `Não foi possível entrar no Controle de Bebidas (${r.status}).`);
  gravar(d); return d;
}
export function sair() { gravar(null); }

async function renovar(s) {
  if (!s?.refresh_token) return null;
  try {
    const r = await fetch(`${BEBIDAS_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: BEBIDAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!r.ok) { if (r.status >= 400 && r.status < 500) gravar(null); return null; }
    const n = await r.json(); gravar(n); return n;
  } catch { return s; }
}
async function sessaoValida() {
  let s = ler(); if (!s) return null;
  if (expirado(s)) s = await renovar(s);
  return s;
}

/** Token válido do login do controle de bebidas (usado pela leitura de nota por foto). */
export async function tokenAcesso() { const s = await sessaoValida(); return s?.access_token || null; }

const PAGINA = 1000;
/**
 * Lê uma tabela inteira (caminho no formato do PostgREST, ex.: "produtos?select=*").
 * O Supabase devolve no máximo 1000 linhas por vez; a leitura é feita em
 * páginas (offset/limit) até vir uma página vazia.
 */
export async function buscar(caminho) {
  let s = await sessaoValida();
  if (!s) throw erroAuth('Entre no Controle de Bebidas.');
  const sep = caminho.includes('?') ? '&' : '?';
  const req = (token, ini) => fetch(`${BEBIDAS_URL}/rest/v1/${caminho}${sep}limit=${PAGINA}&offset=${ini}`, { cache: 'no-store', headers: { apikey: BEBIDAS_KEY, Authorization: `Bearer ${token}` } });
  const todas = [];
  for (let volta = 0; volta < 200; volta++) {
    let r = await req(s.access_token, todas.length);
    if (r.status === 401) { s = await renovar(s); if (!s) throw erroAuth('Login do Controle de Bebidas expirou.'); r = await req(s.access_token, todas.length); }
    if (r.status === 401) { gravar(null); throw erroAuth('Login do Controle de Bebidas expirou.'); }
    if (!r.ok) throw new Error(`Falha ao ler "${caminho.split('?')[0]}" (${r.status}).`);
    const pagina = await r.json();
    if (!Array.isArray(pagina)) return pagina;
    if (!pagina.length) break;
    todas.push(...pagina);
  }
  return todas;
}
