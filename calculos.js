// Cálculos do Controle de Bebidas — copiados SEM ALTERAÇÃO do app.js do
// sistema antigo (controlebebidaslega), para que a Plataforma mostre
// exatamente os mesmos números: consumo médio, sugestão de compra (+10%),
// custo por lote (PEPS/FIFO), desperdício e validade.
// Gerado por extração automática; não editar as funções à mão — se o sistema
// antigo mudar uma regra, extraia de novo.

let produtosCache = [];
let estoqueCache = [];
let dadosLotesCache = null;
let dashboardMostrarValores = false;

/** Carrega os dados lidos do banco nos "caches" usados pelas funções originais. */
export function definirDados({ produtos = [], estoque = [], lotes = null } = {}) {
    produtosCache = Array.isArray(produtos) ? produtos : [];
    estoqueCache = Array.isArray(estoque) ? estoque : [];
    dadosLotesCache = lotes;
}
export function definirMostrarValores(v) { dashboardMostrarValores = !!v; }
export function mostrandoValores() { return dashboardMostrarValores; }

// ===================== funções originais =====================

const CATEGORIAS_ALCOOLICAS = ["cerveja", "espumante", "vinho", "destilado"];

const REGEX_VOLUME = /(\d+(?:[.,]\d+)?)\s*(ml|litros?|litors|lts?|l)(?![a-zà-ú])/i;

const REGEX_EMBALAGEM = /\b(lat[aã]o|lata|long\s*neck|garrafa|pet)\b/gi;

const TIPOS_EVENTO = {
    fechada: "Festa fechada",
    avulsa: "Venda avulsa"
};

const MARGEM_SEGURANCA = 1.1; // +10%

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function formatarNumero(valor, casas = 0) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function formatarData(dataIso) {
    if (!dataIso) return "-";
    const partes = String(dataIso).split("-");
    if (partes.length !== 3) return dataIso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataHora(dataIso) {
    if (!dataIso) return "-";
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) return dataIso;
    return data.toLocaleString("pt-BR");
}

function hojeInputDate() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function escapeHtml(texto) {
    return String(texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function obterProdutoPorId(produtoId) {
    return produtosCache.find(p => String(p.id) === String(produtoId)) || null;
}

function obterNomeProduto(produtoId) {
    const produto = obterProdutoPorId(produtoId);
    return produto ? produto.nome : "Produto";
}

function obterQuantidadeEventoItem(item) {
    return Number(
        item.quantidade_consumida ??
        item.quantidade ??
        item.qtd ??
        0
    );
}

function obterCustoMedioProduto(produtoId) {
    const itemEstoque = (estoqueCache || []).find(e => String(e.produto_id) === String(produtoId));
    return Number(itemEstoque?.custo_medio || 0);
}

function produtoEhAlcoolico(produto) {
    if (!produto) return false;
    if (produto.somente_adultos === true || produto.somente_adultos === false) return produto.somente_adultos;
    const categoria = normalizarTextoBusca(produto.categoria || "");
    return CATEGORIAS_ALCOOLICAS.includes(categoria);
}

function extrairVolumeLitros(nome) {
    const texto = String(nome || "");
    const m = texto.match(REGEX_VOLUME);
    if (m) {
        const numero = Number(m[1].replace(",", "."));
        if (numero > 0) return m[2].toLowerCase() === "ml" ? numero / 1000 : numero;
    }
    const norm = normalizarTextoBusca(texto);
    if (/\blatao\b/.test(norm)) return 0.473;
    if (/\blata\b/.test(norm)) return 0.35;
    if (/\blong\s*neck\b/.test(norm)) return 0.33;
    return 0;
}

function nomeGrupoAutomatico(nome) {
    const limpo = String(nome || "")
        .replace(REGEX_VOLUME, " ")
        .replace(REGEX_EMBALAGEM, " ")
        .replace(/[-–(),]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return limpo || String(nome || "Produto").trim();
}

function infoConsumoProduto(produto) {
    const nome = produto?.nome || "Produto";
    const grupoSalvo = String(produto?.grupo_consumo || "").trim();
    const volumeSalvo = Number(produto?.volume_litros || 0);
    const grupo = grupoSalvo || nomeGrupoAutomatico(nome);
    const volume = volumeSalvo > 0 ? volumeSalvo : extrairVolumeLitros(nome);
    const unidade = volume > 0 ? "L" : "un";
    return {
        grupo,
        volume,
        unidade,
        fator: volume > 0 ? volume : 1,
        chave: `${normalizarTextoBusca(grupo)}|${unidade}`
    };
}

function formatarVolume(litros) {
    if (!(litros > 0)) return "-";
    if (litros < 1) return `${formatarNumero(litros * 1000, 0)} ml`;
    return `${formatarNumero(litros, litros % 1 ? 1 : 0)} L`;
}

function formatarQtdUnidade(valor, unidade) {
    return unidade === "L" ? `${formatarNumero(valor, 1)} L` : `${formatarNumero(valor, 0)} un`;
}

function dataSomenteDia(valor) {
    if (!valor) return "0000-00-00";
    const texto = String(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const d = new Date(texto);
    if (Number.isNaN(d.getTime())) return texto.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function compararIds(a, b) {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
}

function calcularAlocacaoLotes(opcoes = {}) {
    const dados = dadosLotesCache || { compras: [], comprasItens: [], eventos: [], eventosItens: [], movimentacoes: [], estoque: [] };
    const excluirEventoId = opcoes.excluirEventoId != null ? String(opcoes.excluirEventoId) : null;

    const mapaCompras = {};
    dados.compras.forEach(c => { mapaCompras[String(c.id)] = c; });

    const mapaDataEvento = {};
    dados.eventos.forEach(e => { mapaDataEvento[String(e.id)] = e.data; });

    const custoReserva = {};
    dados.estoque.forEach(e => { custoReserva[String(e.produto_id)] = Number(e.custo_medio || 0); });

    // linha do tempo por produto
    const linhas = {};
    const add = (produtoId, registro) => {
        const pid = String(produtoId);
        (linhas[pid] = linhas[pid] || []).push(registro);
    };

    dados.comprasItens.forEach(item => {
        const compra = mapaCompras[String(item.compra_id)];
        if (!compra) return;
        const quantidade = Number(item.quantidade || 0);
        if (quantidade <= 0) return;
        add(item.produto_id, {
            tipo: "entrada",
            data: dataSomenteDia(compra.data),
            ordem: 0,
            id: item.id,
            quantidade,
            custo: Number(item.valor_unitario || 0),
            validade: item.validade || null,
            compraId: compra.id,
            rotulo: `Compra ${formatarData(dataSomenteDia(compra.data))}${compra.fornecedor ? " · " + compra.fornecedor : ""}`
        });
    });

    // Sobras apontadas em balanço entram como lote (custo médio do estoque)
    dados.movimentacoes.forEach(mov => {
        const quantidade = Number(mov.quantidade || 0);
        if (quantidade <= 0) return;
        const data = dataSomenteDia(mov.data_movimento || mov.created_at);

        if (mov.tipo === "entrada" && mov.referencia_tabela === "balancos_estoque") {
            add(mov.produto_id, {
                tipo: "entrada", data, ordem: 0, id: "m" + mov.id, quantidade,
                custo: custoReserva[String(mov.produto_id)] || 0,
                rotulo: `Ajuste de balanço ${formatarData(data)}`
            });
        } else if (mov.tipo === "saida_manual") {
            add(mov.produto_id, { tipo: "saida", data, ordem: 1, id: "m" + mov.id, quantidade, chave: null });
        }
    });

    const linhaPorEvento = {};
    dados.eventosItens.forEach(item => {
        const eventoId = String(item.evento_id);
        if (excluirEventoId && eventoId === excluirEventoId) return;
        const quantidade = Number(obterQuantidadeEventoItem(item) || 0);
        if (quantidade <= 0) return;
        const indice = linhaPorEvento[eventoId] = (linhaPorEvento[eventoId] ?? -1) + 1;
        add(item.produto_id, {
            tipo: "saida",
            data: dataSomenteDia(mapaDataEvento[eventoId]),
            ordem: 1,
            id: item.id,
            quantidade,
            chave: `ev:${eventoId}#${indice}`
        });
    });

    if (opcoes.rascunho && Array.isArray(opcoes.rascunho.itens)) {
        const dataRascunho = dataSomenteDia(opcoes.rascunho.data || hojeInputDate());
        opcoes.rascunho.itens.forEach((item, indice) => {
            const quantidade = Number(obterQuantidadeEventoItem(item) || 0);
            if (!item.produto_id || quantidade <= 0) return;
            add(item.produto_id, {
                tipo: "saida", data: dataRascunho, ordem: 1, id: Number.MAX_SAFE_INTEGER,
                quantidade, chave: `rascunho#${indice}`
            });
        });
    }

    const resultado = {};
    const saldo = {};
    Object.defineProperty(resultado, "__saldo", { value: saldo, enumerable: false });

    Object.keys(linhas).forEach(produtoId => {
        const registros = linhas[produtoId].sort((a, b) =>
            a.data.localeCompare(b.data) || a.ordem - b.ordem || compararIds(a.id, b.id)
        );

        const fila = [];
        let ultimoCusto = custoReserva[produtoId] || 0;

        registros.forEach(reg => {
            if (reg.tipo === "entrada") {
                fila.push({ ...reg, restante: reg.quantidade });
                if (reg.custo > 0) ultimoCusto = reg.custo;
                return;
            }

            let falta = reg.quantidade;
            const alocacoes = [];

            while (falta > 0 && fila.length) {
                const lote = fila[0];
                const usar = Math.min(falta, lote.restante);
                alocacoes.push({ rotulo: lote.rotulo, data: lote.data, quantidade: usar, custo: lote.custo, validade: lote.validade || null });
                lote.restante -= usar;
                falta -= usar;
                if (lote.restante <= 0) fila.shift();
            }

            if (falta > 0) {
                alocacoes.push({
                    rotulo: "Sem compra lançada (custo médio)",
                    data: null,
                    quantidade: falta,
                    custo: custoReserva[produtoId] || ultimoCusto || 0,
                    semLote: true
                });
            }

            if (reg.chave) resultado[reg.chave] = alocacoes;
        });

        saldo[produtoId] = fila
            .filter(l => l.restante > 0)
            .map(l => ({ rotulo: l.rotulo, data: l.data, validade: l.validade, restante: l.restante, custo: l.custo }));
    });

    return resultado;
}

function resumirAlocacao(alocacoes) {
    const lista = Array.isArray(alocacoes) ? alocacoes : [];
    const quantidade = lista.reduce((s, a) => s + a.quantidade, 0);
    const custoTotal = lista.reduce((s, a) => s + a.quantidade * a.custo, 0);
    return {
        quantidade,
        custoTotal,
        custoUnitario: quantidade > 0 ? custoTotal / quantidade : 0
    };
}

function temLotesBanco() {
    return !!(dadosLotesCache && dadosLotesCache.lotesBanco && dadosLotesCache.lotesBanco.length);
}

function descreverLoteBanco(lote) {
    const d = dadosLotesCache || {};
    const compra = (d.compras || []).find(c => String(c.id) === String(lote?.compra_id));
    const itemCompra = (d.comprasItens || []).find(i => String(i.id) === String(lote?.compra_item_id));
    const data = dataSomenteDia(lote?.data_compra || compra?.data || lote?.created_at);
    const rotulo = lote?.origem === "compra" || compra
        ? `Compra ${formatarData(data)}${compra?.fornecedor ? " · " + compra.fornecedor : ""}`
        : `Ajuste de estoque ${formatarData(data)}`;
    return { rotulo, data, validade: itemCompra?.validade || null };
}

function calcularCustosItensEvento() {
    const d = dadosLotesCache || { eventosItens: [], consumosBanco: [], lotesBanco: [] };
    const mapaLotes = {};
    (d.lotesBanco || []).forEach(l => { mapaLotes[String(l.id)] = l; });

    const consumosPorItem = {};
    (d.consumosBanco || []).forEach(c => {
        (consumosPorItem[String(c.evento_item_id)] = consumosPorItem[String(c.evento_item_id)] || []).push(c);
    });

    const reserva = calcularAlocacaoLotes(); // cálculo do app (eventos antigos)
    const indicePorEvento = {};
    const resultado = {};

    (d.eventosItens || []).forEach(item => {
        const eventoId = String(item.evento_id);
        const quantidade = Number(obterQuantidadeEventoItem(item) || 0);
        let alocacoes = [];
        let origem = "app";

        if (quantidade > 0) {
            const indice = indicePorEvento[eventoId] = (indicePorEvento[eventoId] ?? -1) + 1;
            const doBanco = consumosPorItem[String(item.id)];
            if (doBanco && doBanco.length) {
                origem = "banco";
                alocacoes = doBanco.map(c => {
                    const info = descreverLoteBanco(mapaLotes[String(c.lote_id)]);
                    return { rotulo: info.rotulo, data: info.data, validade: info.validade, quantidade: Number(c.quantidade || 0), custo: Number(c.custo_unitario || 0) };
                }).sort((a, b) => String(a.data).localeCompare(String(b.data)));
                const coberto = alocacoes.reduce((s, a) => s + a.quantidade, 0);
                if (coberto < quantidade - 1e-9) {
                    alocacoes.push({ rotulo: "Sem lote registrado (custo médio)", data: null, quantidade: quantidade - coberto, custo: obterCustoMedioProduto(item.produto_id), semLote: true });
                }
            } else {
                alocacoes = reserva[`ev:${eventoId}#${indice}`] || [];
            }
        }

        resultado[String(item.id)] = { alocacoes, origem, ...resumirAlocacao(alocacoes) };
    });

    return resultado;
}

function tipoDoEvento(evento) {
    return evento?.tipo_evento === "avulsa" ? "avulsa" : "fechada";
}

function eventoSemAlcool(evento) {
    return tipoDoEvento(evento) === "fechada" && !!evento?.sem_alcool;
}

function descricaoAlcoolEvento(evento) {
    if (tipoDoEvento(evento) !== "fechada") return "";
    if (evento?.sem_alcool) return "sem álcool";
    if (evento?.alcoolico_adesao) return "com adesão";
    return "";
}

function calcularStatusEstoque(item) {
    const quantidade = Number(item.quantidade || 0);
    const minimo = Number(item.estoque_minimo || 0);

    if (quantidade <= 0) {
        return {
            classe: "badge-inativo",
            texto: "Sem estoque"
        };
    }

    if (quantidade <= minimo && minimo > 0) {
        return {
            classe: "badge-inativo",
            texto: "Baixo"
        };
    }

    return {
        classe: "badge-ativo",
        texto: "OK"
    };
}

function traduzirTipoMovimentacao(tipo) {
    if (tipo === "saida_manual") return "Saída Manual";
    if (tipo === "entrada") return "Entrada";
    if (tipo === "saida") return "Saída";
    if (tipo === "evento") return "Consumo em Evento";
    return tipo || "-";
}

function formatarValorDashboard(valor, isMonetario = false) {
    if (!isMonetario) {
        return formatarNumero(valor, 0);
    }

    return dashboardMostrarValores ? formatarMoeda(valor) : "R$ •••••";
}

function calcularModeloConsumo(produtos, eventos, eventosItens) {
    const mapaEventos = {};
    (eventos || []).forEach(ev => { mapaEventos[String(ev.id)] = ev; });
    const mapaProdutos = {};
    (produtos || []).forEach(p => { mapaProdutos[String(p.id)] = p; });

    const modelo = {};
    const eventosContados = {};
    const novoGrupo = () => ({ total: 0, adultos: 0, criancas: 0, convidados: 0, eventos: 0 });

    (eventosItens || []).forEach(item => {
        const evento = mapaEventos[String(item.evento_id)];
        if (!evento) return;

        const adultos = Number(evento.adultos || 0);
        const criancas = Number(evento.criancas || 0);
        const convidados = adultos + criancas;
        if (convidados <= 0) return;

        const produtoId = String(item.produto_id);
        const produto = mapaProdutos[produtoId];
        if (!produto) return;

        const soAdultos = produtoEhAlcoolico(produto);
        if (soAdultos && adultos <= 0) return;

        const info = infoConsumoProduto(produto);
        const quantidade = Number(obterQuantidadeEventoItem(item) || 0) * info.fator;
        const tipoEvento = evento.sem_alcool ? "semAlcool" : evento.alcoolico_adesao ? "comAdesao" : "semAdesao";

        if (!modelo[info.chave]) {
            modelo[info.chave] = {
                nome: info.grupo,
                unidade: info.unidade,
                alcoolico: soAdultos,
                volumePorProduto: {},
                geral: novoGrupo(),
                comAdesao: novoGrupo(),
                semAdesao: novoGrupo(),
                semAlcool: novoGrupo()
            };
        }

        const registro = modelo[info.chave];
        registro.volumePorProduto[produtoId] = (registro.volumePorProduto[produtoId] || 0) + quantidade;

        const chaveEvento = `${info.chave}|${evento.id}`;
        const primeiraVez = !eventosContados[chaveEvento];
        eventosContados[chaveEvento] = true;

        [tipoEvento, "geral"].forEach(nomeGrupo => {
            const dados = registro[nomeGrupo];
            dados.total += quantidade;
            if (primeiraVez) {
                dados.adultos += adultos;
                dados.criancas += soAdultos ? 0 : criancas;
                dados.convidados += soAdultos ? adultos : convidados;
                dados.eventos += 1;
            }
        });
    });

    return modelo;
}

function estimarConsumoEvento(modelo, adultos, criancas, comAdesao, semAlcool = false) {
    const resultado = {};
    Object.keys(modelo || {}).forEach(chave => {
        const dados = modelo[chave];
        // festa sem álcool: não sugere nenhuma bebida de adulto
        if (semAlcool && dados.alcoolico) return;
        let grupo = semAlcool ? dados.semAlcool : comAdesao ? dados.comAdesao : dados.semAdesao;
        let base = semAlcool ? "Festas sem álcool" : comAdesao ? "Festas com adesão" : "Festas sem adesão";
        if (modelo.__tipo === "avulsa") {
            grupo = dados.geral;
            base = "Vendas avulsas";
        } else if (!grupo.eventos) {
            grupo = dados.geral;
            base = "Média geral das festas (sem histórico deste tipo)";
        }
        const pessoas = dados.alcoolico ? adultos : (adultos + criancas);
        const media = grupo.convidados > 0 ? grupo.total / grupo.convidados : 0;
        const estimativa = media * pessoas * MARGEM_SEGURANCA;
        if (estimativa <= 0) return;
        resultado[chave] = { chave, nome: dados.nome, unidade: dados.unidade, alcoolico: dados.alcoolico, media, base, estimativa };
    });
    return resultado;
}

function calcularModelosPorTipo(produtos, eventos, eventosItens) {
    const lista = eventos || [];
    const fechada = calcularModeloConsumo(produtos, lista.filter(e => tipoDoEvento(e) === "fechada"), eventosItens);
    const avulsa = calcularModeloConsumo(produtos, lista.filter(e => tipoDoEvento(e) === "avulsa"), eventosItens);
    Object.defineProperty(fechada, "__tipo", { value: "fechada", enumerable: false });
    Object.defineProperty(avulsa, "__tipo", { value: "avulsa", enumerable: false });
    return { fechada, avulsa };
}

function mapaEstoqueDisponivel(estoque) {
    const mapa = {};
    (estoque || []).forEach(e => { mapa[String(e.produto_id)] = Number(e.quantidade || 0); });
    return mapa;
}

function montarListaCompra(estimativas, modelo, produtos, estoque, disponivel = null) {
    const disp = disponivel || mapaEstoqueDisponivel(estoque);

    return Object.values(estimativas)
        .sort((x, y) => x.nome.localeCompare(y.nome))
        .map(est => {
            const dados = modelo[est.chave] || { volumePorProduto: {} };
            const usados = new Set(Object.keys(dados.volumePorProduto || {}));
            let pacotes = (produtos || []).filter(p => infoConsumoProduto(p).chave === est.chave);
            if (usados.size) pacotes = pacotes.filter(p => usados.has(String(p.id)));
            pacotes.sort((a, b) => infoConsumoProduto(b).fator - infoConsumoProduto(a).fator);

            const detalhes = [];
            let estoqueTotal = 0;
            pacotes.forEach(p => {
                const qtd = Number(disp[String(p.id)] || 0);
                if (qtd <= 0) return;
                const info = infoConsumoProduto(p);
                estoqueTotal += qtd * info.fator;
                detalhes.push(`${formatarNumero(qtd, 0)} × ${info.volume > 0 ? formatarVolume(info.volume) : p.nome}`);
            });

            // reserva o estoque usado
            let aReservar = Math.min(est.estimativa, estoqueTotal);
            pacotes.forEach(p => {
                if (aReservar <= 0) return;
                const fator = infoConsumoProduto(p).fator;
                const qtd = Number(disp[String(p.id)] || 0);
                const usar = Math.min(qtd, Math.ceil(Number((aReservar / fator).toFixed(6))));
                disp[String(p.id)] = qtd - usar;
                aReservar -= usar * fator;
            });

            const faltam = Math.max(0, est.estimativa - estoqueTotal);
            const idEmbalagem = Object.keys(dados.volumePorProduto || {})
                .sort((x, y) => dados.volumePorProduto[y] - dados.volumePorProduto[x])[0];
            const produtoEmbalagem = (produtos || []).find(p => String(p.id) === String(idEmbalagem)) || pacotes[0];
            const fatorEmbalagem = produtoEmbalagem ? infoConsumoProduto(produtoEmbalagem).fator : 1;
            const comprarUnidades = faltam > 0 ? Math.ceil(Number((faltam / fatorEmbalagem).toFixed(6))) : 0;
            const comprarEmbalagem = produtoEmbalagem ? produtoEmbalagem.nome : est.nome;

            return {
                produto: est.nome,
                tipo: est.alcoolico ? "Só adultos" : "Todos",
                unidade: est.unidade,
                media: est.media,
                base: est.base,
                estimativa: est.estimativa,
                estoqueAtual: estoqueTotal,
                estoqueDetalhe: detalhes.join(" + "),
                faltam,
                comprarUnidades,
                comprarEmbalagem,
                comprarTexto: comprarUnidades > 0 ? `${formatarNumero(comprarUnidades, 0)} un de ${comprarEmbalagem}` : "Não precisa comprar"
            };
        });
}

function htmlTabelaListaCompra(linhas, opcoes = {}) {
    const mostrarMedia = opcoes.mostrarMedia !== false;
    return `
        <div class="table-container" style="margin-top:10px;">
            <table>
                <thead>
                    <tr>
                        <th>Bebida</th>
                        <th>Consumida por</th>
                        ${mostrarMedia ? `<th>Média usada</th><th>Base do cálculo</th>` : ""}
                        <th>Estimativa (+10%)</th>
                        <th>Estoque atual</th>
                        <th>Comprar</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas.length ? linhas.map(l => `
                        <tr>
                            <td>${escapeHtml(l.produto)}</td>
                            <td>${l.tipo}</td>
                            ${mostrarMedia ? `
                                <td>${formatarNumero(l.media, 2)} ${l.unidade} / ${l.tipo === "Só adultos" ? "adulto" : "convidado"}</td>
                                <td>${escapeHtml(l.base)}</td>
                            ` : ""}
                            <td>${formatarQtdUnidade(l.estimativa, l.unidade)}</td>
                            <td>
                                ${formatarQtdUnidade(l.estoqueAtual, l.unidade)}
                                ${l.estoqueDetalhe ? `<div class="lote-rotulo">${escapeHtml(l.estoqueDetalhe)}</div>` : ""}
                            </td>
                            <td>
                                <strong>${escapeHtml(l.comprarTexto)}</strong>
                                ${l.comprarUnidades > 0 ? `<div class="lote-rotulo">faltam ${formatarQtdUnidade(l.faltam, l.unidade)}</div>` : ""}
                            </td>
                        </tr>
                    `).join("") : `
                        <tr><td colspan="${mostrarMedia ? 7 : 5}" class="empty-state">Sem histórico de consumo para calcular.</td></tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

function listarLotesVencendo(alocacao, dias = 30) {
    const hoje = hojeInputDate();
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    const limiteIso = dataSomenteDia(limite.toISOString());
    const lista = [];

    // saldo real dos lotes do banco
    if (temLotesBanco()) {
        dadosLotesCache.lotesBanco.forEach(l => {
            const restante = Number(l.quantidade_disponivel || 0);
            if (restante <= 0) return;
            const info = descreverLoteBanco(l);
            if (!info.validade || info.validade > limiteIso) return;
            const diasRestantes = Math.round((new Date(info.validade + "T12:00:00") - new Date(hoje + "T12:00:00")) / 86400000);
            lista.push({ produtoId: String(l.produto_id), produto: obterNomeProduto(l.produto_id), rotulo: info.rotulo, validade: info.validade, restante, diasRestantes });
        });
        return lista.sort((a, b) => a.validade.localeCompare(b.validade));
    }

    const saldo = alocacao?.__saldo || {};
    Object.keys(saldo).forEach(produtoId => {
        saldo[produtoId].forEach(lote => {
            if (!lote.validade || lote.validade > limiteIso) return;
            const diasRestantes = Math.round((new Date(lote.validade + "T12:00:00") - new Date(hoje + "T12:00:00")) / 86400000);
            lista.push({ produtoId, produto: obterNomeProduto(produtoId), ...lote, diasRestantes });
        });
    });
    return lista.sort((a, b) => a.validade.localeCompare(b.validade));
}

function calcularIntervaloPeriodo(tipo) {
    const hoje = new Date();
    const iso = d => dataSomenteDia(d.toISOString ? d.toISOString() : d);
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    if (tipo === "mes") return { inicio: iso(new Date(ano, mes, 1)), fim: hojeInputDate() };
    if (tipo === "mes_passado") return { inicio: iso(new Date(ano, mes - 1, 1)), fim: iso(new Date(ano, mes, 0)) };
    if (tipo === "3meses") return { inicio: iso(new Date(ano, mes - 2, 1)), fim: hojeInputDate() };
    if (tipo === "6meses") return { inicio: iso(new Date(ano, mes - 5, 1)), fim: hojeInputDate() };
    if (tipo === "ano") return { inicio: `${ano}-01-01`, fim: hojeInputDate() };
    return { inicio: "", fim: "" };
}

function normalizarTextoBusca(texto) {
    return String(texto || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function obterPrecoEventoItem(item) {
    return Number(
        item?.preco_venda ??
        item?.preco_unitario ??
        0
    );
}

function agendaAtiva(a) {
    return a?.status === "agendado" || a?.status === "a_confirmar";
}

function diasAte(dataIso) {
    return Math.round((new Date(dataIso + "T12:00:00") - new Date(hojeInputDate() + "T12:00:00")) / 86400000);
}

export {
    formatarMoeda, formatarNumero, formatarData, formatarDataHora, hojeInputDate, escapeHtml, obterProdutoPorId, obterNomeProduto,
    obterQuantidadeEventoItem, obterCustoMedioProduto, produtoEhAlcoolico, infoConsumoProduto, formatarVolume, formatarQtdUnidade,
    dataSomenteDia, calcularAlocacaoLotes, resumirAlocacao, temLotesBanco, descreverLoteBanco, calcularCustosItensEvento,
    tipoDoEvento, eventoSemAlcool, descricaoAlcoolEvento, calcularStatusEstoque, traduzirTipoMovimentacao, formatarValorDashboard,
    calcularModeloConsumo, estimarConsumoEvento, calcularModelosPorTipo, mapaEstoqueDisponivel, montarListaCompra, htmlTabelaListaCompra,
    listarLotesVencendo, calcularIntervaloPeriodo, normalizarTextoBusca, obterPrecoEventoItem, agendaAtiva, diasAte,
    TIPOS_EVENTO, MARGEM_SEGURANCA
};
