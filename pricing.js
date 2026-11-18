// Fonte unica dos pacotes padrao e das regras de reajuste de tabela de precos.
// Usado por modules/eventos e modules/configuracoes para que os dois nunca
// divirjam (duracao, hora extra, faixas de preco e composicao do reajuste
// anual precisam ser sempre os mesmos, nao importa por qual tela a tabela
// foi criada).

export const CONFIG_PADRAO = {
  entradaPercentual: 30,
  descontoAvista: 5,
  pacotes: {
    'Lega Kids': {
      duracao: 3,
      permiteHoraExtra: false,
      valorHoraExtra: 0,
      valorPorConvidado: 50,
      faixas: [[25,1000],[35,1000],[45,1000],[55,1000],[65,1270],[75,1270],[85,1270],[95,1270],[105,1540],[115,1540]],
      gastronomia: ['Salgados variados','Doces tradicionais','Bolo','Refrigerante, suco e água'],
      estrutura: ['Brinquedos da Lega','Equipe de apoio','Espaço exclusivo por 3 horas']
    },
    'Lega Básico': {
      duracao: 3,
      permiteHoraExtra: true,
      valorHoraExtra: 450,
      valorPorConvidado: 42,
      faixas: [[25,1750],[35,1750],[45,1750],[50,1750],[60,2020],[70,2020],[80,2020],[90,2020],[100,2290],[110,2290]],
      gastronomia: ['Cardápio do pacote Básico','Refrigerante, suco e água'],
      estrutura: ['Estrutura completa da Lega','Equipe de apoio','Espaço exclusivo por 3 horas']
    },
    'Lega Tour': {
      duracao: 4,
      permiteHoraExtra: true,
      valorHoraExtra: 700,
      valorPorConvidado: 70,
      faixas: [[25,1500],[35,1600],[45,1650],[50,1650],[60,1700],[70,1700],[80,1750],[90,1750],[100,1800],[110,1800]],
      gastronomia: ['Cardápio completo do pacote Tour','Doces e bolo','Refrigerante, suco e água'],
      estrutura: ['Estrutura completa da Lega','Equipe de apoio','Espaço exclusivo por 4 horas']
    },
    'Lega Transcender': {
      duracao: 4,
      permiteHoraExtra: true,
      valorHoraExtra: 750,
      valorPorConvidado: 75,
      faixas: [[25,1600],[35,1700],[45,1850],[50,1850],[60,1900],[70,1900],[80,1950],[90,1950],[100,2100],[110,2100]],
      gastronomia: ['Entrada com linguicinha parrillera e polenta frita','Rodízio com 14 variedades de salgados','Batata frita','Água com gás e sem gás, refrigerante e suco','Doces gourmet e bolo'],
      estrutura: ['Espaço completo e climatizado','Equipe de apoio durante o evento','Ambiente preparado para receber crianças e família','Atendimento organizado para uma experiência tranquila']
    }
  }
};

function nowISO(){return new Date().toISOString()}

// Aplica um unico reajuste percentual sobre uma tabela de origem,
// preservando duracao e demais campos que nao sao valores monetarios.
export function applyPriceAdjustment(source, ano, reajuste = 10, arredondamento = 10) {
  const rate = 1 + Number(reajuste || 0) / 100;
  const round = Number(arredondamento || 0);
  const cp = JSON.parse(JSON.stringify(source.pacotes || {}));
  Object.values(cp).forEach(pkg => {
    const adj = v => {
      const n = Number(v || 0) * rate;
      return round ? Math.round(n / round) * round : Number(n.toFixed(2));
    };
    pkg.valorPorConvidado = adj(pkg.valorPorConvidado);
    pkg.valorHoraExtra = adj(pkg.valorHoraExtra);
    pkg.faixas = (pkg.faixas || []).map(([lim, val]) => [lim, adj(val)]);
  });
  return { id: `vig_${ano}`, ano: Number(ano), reajuste: Number(reajuste || 0), origemAno: Number(source.ano), pacotes: cp, createdAt: nowISO() };
}

// Cria a tabela de um ano futuro, compondo o reajuste ano a ano a partir da
// ultima tabela existente -- mesmo que anos intermediarios estejam faltando
// (ex.: so existe 2026 e criamos 2029: aplica 10% em 2027, depois em 2028,
// depois em 2029, e nao um salto unico de 10%).
export function createPriceTableForYear(tabelas, ano, reajuste = 10, arredondamento = 10) {
  const ts = [...(tabelas || [])].sort((a, b) => a.ano - b.ano);
  if (!ts.length) return null;
  if (ts.some(t => Number(t.ano) === Number(ano))) return null;
  let ultima = [...ts].filter(t => Number(t.ano) < Number(ano)).at(-1) || ts.at(-1);
  const novas = [];
  const anoAlvo = Number(ano);
  let anoAtual = Number(ultima.ano) + 1;
  while (anoAtual <= anoAlvo) {
    ultima = applyPriceAdjustment(ultima, anoAtual, reajuste, arredondamento);
    novas.push(ultima);
    anoAtual++;
  }
  return { tabela: novas.at(-1), todasNovas: novas };
}
