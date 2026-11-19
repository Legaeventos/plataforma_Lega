# v1.7.0 — Compras e estoque de todos os setores (etapa 2)

- Novo menu Estoque, para bebidas, alimentação, decoração e escritório/casa, com as abas Visão geral, Produtos, Compras, Consumo das festas e Conferência.
- Visão geral: valor em estoque por setor e "O que fazer agora" (festas recentes sem consumo lançado, produtos no mínimo, lotes vencendo em 30 dias).
- Produtos: setor, categoria, unidade de estoque, unidade de compra com conversão (ex.: compra em kg, conta em unidades, 1 kg = 40 un), tipo de item (consumo, reutilizável, para um evento), estoque mínimo, baixa manual (quebra, vencido, uso interno) e histórico.
- Compras: vários itens por nota, busca por nome ou código de barras, conversão de unidade, custo por unidade calculado, validade, compra para uma festa específica e cadastro de produto na hora. A conversão usada fica lembrada para a próxima compra.
- Consumo das festas: escolhe a festa da plataforma (adultos, crianças e bebida alcoólica vêm preenchidos), Levado/Voltou/Consumido, sobra aberta e preço de venda. O estoque baixa pelos lotes mais antigos e o custo vai para o resultado da festa (aba Consumo e Encerramento do evento).
- Conferência: contagem física por setor que acerta o estoque e os lotes, com histórico.
- Migração do controle de bebidas: copia produtos, códigos de barras, estoque, lotes, compras, consumo das festas, conferências e agenda, confere tabela por tabela e o saldo de cada produto, e depois "vira a chave". A cópia pode ser repetida até a virada.
- Bebidas: depois da virada, o painel lê os dados da plataforma (mesmos números) e a sugestão de compra usa as festas futuras da plataforma.
- Gravações que mexem em várias tabelas (compra, consumo, conferência, baixa) são feitas pelo banco de uma vez só (tudo ou nada).
- Novo arquivo sql/etapa2_estoque.sql (rodar uma vez no Supabase da plataforma; a tela Estoque tem o botão para copiar).
- O estoque antigo da plataforma (aquele que deu divergência) foi descartado.

# v1.6.0 — Enviar fotos pela plataforma

- Nova seção Configurações → Fotos do orçamento: escolher ou arrastar várias fotos, marcar onde combinam (capa, decoração, gastronomia, espaço e crianças) e enviar, sem precisar do GitHub.
- As fotos são reduzidas no navegador (até 1800 px, JPEG) antes de enviar e ficam guardadas no Supabase da plataforma (espaço "orcamento-fotos").
- Cada foto enviada pode ter a descrição e as categorias alteradas, ou ser apagada. As fotos que vêm com a plataforma podem ser escondidas da galeria.
- No editor do orçamento as fotos enviadas aparecem em "Enviadas por vocês" e nas categorias marcadas; há um atalho do editor para a seção de fotos.
- Primeira vez: se o espaço de fotos ainda não existir, a plataforma mostra o texto para colar no SQL Editor do Supabase (uma vez só).
- Correção: a tela de Configurações ficava mais larga que a tela no celular.

# v1.5.0 — Orçamento personalizado

- Ao gerar um orçamento abre o editor "Personalizar orçamento", com prévia ao vivo das 3 páginas.
- Estilo: 5 combinações de cores (Lilás Lega, Jardim, Rosa delicado, Azul aventura, Noite dourada).
- Fotos: escolha a foto da capa e as 3 fotos de Gastronomia, Decoração e Espaço e crianças. A galeria tem filtros por categoria.
- Fotos novas: envie imagens para a pasta assets/orcamento no GitHub e elas aparecem sozinhas na galeria, em "Novas".
- Mensagem para o cliente: texto livre na capa (em branco usa o texto padrão).
- O que mostrar: valor por convidado, opção à vista, tabela de parcelas, hora extra e os 3 passos para reservar podem ser ligados ou desligados em cada orçamento.
- Padrão por tipo de festa: "Usar estas escolhas como padrão" faz os próximos orçamentos daquele tipo (ex.: Formatura) já abrirem com as mesmas fotos, cores e opções. O padrão é compartilhado entre os computadores.
- As escolhas ficam salvas em cada versão. Botões "🎨 Personalizar" no evento permitem mudar depois.

# v1.4.0 — Novo orçamento

- Novo modelo de orçamento (3 páginas A4): capa personalizada com o nome do cliente e da festa, data por extenso e dados principais; "o que está incluso" com fotos de gastronomia, decoração e espaço; "investimento e reserva" com valor por convidado, à vista (com quanto economiza) e parcelado (entrada + 6x), os 3 passos para reservar, validade e QR Code do WhatsApp.
- Botão "WhatsApp" na janela do orçamento, com mensagem pronta.
- Cores da marca (lilás e verde-folha) e títulos na fonte Fraunces.

# v1.3.2 — Validade dos orçamentos (5 dias úteis)

- Todo orçamento vale 5 dias úteis (segunda a sexta) a partir do envio; a data de validade sai no PDF do orçamento.
- No 4º dia útil ("vence amanhã") e no 5º ("vence hoje") o orçamento aparece no novo quadro "Orçamentos aguardando retorno" do Hoje na Lega e no topo do evento.
- No evento: botões "Cliente aceitou", "Cliente recusou" (com motivo opcional), "Prorrogar prazo" (+5 dias úteis) e "Lembrar pelo WhatsApp" (quando o cliente tem telefone cadastrado).
- Sem retorno, no 6º dia útil o orçamento é arquivado automaticamente como "Não fechou (validade expirada)". Pode ser reaberto; o prazo recomeça.
- Nova versão do orçamento também renova o prazo.
- Orçamentos que já estavam em aberto ganharam 5 dias úteis a partir da atualização (ninguém é arquivado de surpresa).
- Festas cuja data já passou não são arquivadas automaticamente: continuam com a pergunta "Esta festa aconteceu?".

# v1.3.1 — "Resolver agora" abre o evento certo

- Os botões do "Hoje na Lega" (Resolver agora, Depois desta ação, Próximos eventos, Precisa de atenção) abrem o evento direto na etapa a resolver, em vez de só abrir a lista de eventos.
- Festa antiga que ficou como orçamento abre na pergunta "Esta festa aconteceu?"; as demais abrem no encerramento.

# v1.3.0 — Evento completo de ponta a ponta

**Orçamento da mesma cliente em outra data**
- Ao criar um orçamento para uma cliente que já tem evento em aberto, a plataforma pergunta: é nova versão do mesmo evento (outra data/condição) ou outra festa? Assim a festa não aparece em duas datas.
- Registros duplicados que já existem: botão "Juntar com …" na aba Orçamento.

**Destravar eventos**
- Contrato feito fora da plataforma: registre como "contrato externo" (data e valor) e siga para os pagamentos.
- Festas cuja data já passou: a plataforma pergunta se aconteceram. "Sim" leva direto ao encerramento; "Não fechou" arquiva o orçamento (sai das pendências e pode ser reaberto).
- Financeiro, equipe e encerramento liberados para festas que já aconteceram, mesmo sem contrato/entrada lançados.

**Encerramento com resultado real**
- Receitas (contratado + extras), custos (equipe, despesas da festa por categoria, consumo) e resultado com margem; quanto falta receber.
- Conferência item a item com botões para completar o que falta; nada bloqueia o encerramento.
- Despesas da festa com categoria: bolo e doces, decoração personalizada, alimentação, bebidas, equipe extra, aluguel de itens, outros.

**Guia de próximos passos**
- Em todas as telas do evento, uma faixa "Próximo passo" mostra o que fazer a seguir, com botão "Ir agora".

# v1.2.2 — Conferência com o estoque antigo

- Bebidas → nova aba "Conferência com o estoque antigo": compara, produto a produto, o estoque interno antigo da plataforma com o estoque real do Controle de Bebidas e lista o que foi lançado só na plataforma (entradas pelo menu Estoque e consumos lançados em eventos), com planilhas para baixar. Somente leitura.
- Menu Estoque antigo: aviso de que está desatualizado, com atalho para a conferência.

# v1.2.1 — Ajustes da publicação do módulo Bebidas

- Leitura do banco de bebidas em páginas por offset/limit (mais compatível com os navegadores).
- Proteção contra a página recarregar sem parar quando a publicação no GitHub fica incompleta; mostra um aviso explicando.

# v1.2.0 — Controle de Bebidas dentro da Plataforma (fase 1)

**Novo menu "Bebidas"**, conectado ao MESMO banco do controlebebidaslega (os dois sistemas funcionam em paralelo, com os mesmos dados):
- **Painel:** produtos, itens em estoque, eventos, compras, total vendido, rolha, lucro dos eventos, estoque baixo/sem estoque, lotes vencendo; validade dos lotes; próximos eventos da agenda; desperdício de garrafas abertas; consumo médio de festas fechadas (com adesão / sem adesão / sem álcool), bebidas de adulto e venda avulsa. Filtro de período e "ocultar valores".
- **Estoque:** quantidade, custo médio, valor, mínimo e situação de cada produto, com os lotes e validades.
- **Eventos:** histórico de consumo de cada evento com vendido, custo pelos lotes (PEPS), rolha e resultado; itens e lotes usados.
- **Sugestão de compra:** compra consolidada dos eventos agendados (7/15/30/60 dias ou todos) e simulador por evento, com PDF.
- Os cálculos são os mesmos do sistema antigo (copiados sem alteração) e foram conferidos lado a lado: nenhuma diferença.
- Login: usa o e-mail e senha do Controle de Bebidas; ao entrar na Plataforma, tenta conectar automaticamente com as mesmas credenciais.
- Lançamentos (compras, consumo de evento, balanço, agenda) continuam no sistema antigo nesta fase.

**Outros**
- Aviso em português quando o navegador bloqueia os dados do site (em vez do erro técnico "Failed to read the 'localStorage'…").

# v1.1.12 — Login expirado

- Quando o login expira (erro 401), a plataforma tenta renovar sozinha; se não conseguir, mostra o aviso "Seu login expirou" com o botão "Entrar novamente". Os dados do computador são preservados e enviados à nuvem logo após entrar.
- Antes, o erro ficava silencioso e o computador deixava de sincronizar sem avisar.

# v1.1.11 — Horário excedente

- Contrato: tolerância de 15 minutos sem cobrança; depois, multa de 10% do valor total do contrato a cada fração de 15 minutos excedentes (valor em reais impresso no contrato).

# v1.1.10 — Tipo do evento

- Contrato: o quadro do evento mostra apenas o nome do evento (antes juntava o "Tipo do evento" entre parênteses, ex.: "Formatura (Aniversário infantil)").
- Orçamento: o campo opcional "Tipo do evento" não vem mais preenchido com "Aniversário infantil".

# v1.1.9 — Diagnóstico da sincronização e nova versão de contrato

- Configurações → "Sincronização entre aparelhos": mostra quantos eventos/orçamentos/contratos há neste computador e na nuvem, a última sincronização e eventuais erros; botões "Sincronizar agora", "Baixar cópia dos dados" e "Recuperar itens da cópia de segurança".
- Proteção extra: se o banco recusar a gravação condicional sem motivo, os dados já mesclados são gravados mesmo assim.
- Contrato já assinado: botão "Alterar condições / nova versão" permite emitir nova versão (ex.: outro parcelamento). A nova versão volta a pedir assinatura das duas partes.
- Seção do formulário renomeada para "Condições de pagamento escolhidas pelo cliente".

# v1.1.8 — Sincronização entre aparelhos e atualização automática

**Correção grave de sincronização**
- Antes, cada aparelho enviava todos os seus dados e sobrescrevia a nuvem: quem salvava por último apagava o que o outro tinha criado (ex.: orçamentos sumindo).
- Agora cada envio baixa a versão da nuvem e mescla item a item (eventos, orçamentos, contratos, lançamentos, clientes, estoque). Exclusões também são respeitadas.
- Gravação condicional: se dois aparelhos salvam ao mesmo tempo, o segundo mescla de novo antes de gravar.
- Busca automática de novidades a cada 20 segundos e ao voltar para a janela. A tela se atualiza sozinha; se você estiver preenchendo um formulário, o botão de sincronização mostra ↻ para atualizar quando quiser.
- Primeira sincronização da v1.1.8 soma os dados do aparelho com os da nuvem (nada é apagado) e guarda uma cópia de segurança local.
- Respostas do Supabase não são mais guardadas no cache offline.

**Atualização da plataforma**
- Novo arquivo version.json: quando uma nova versão é publicada, a plataforma percebe em até 5 minutos e se atualiza (ou mostra o aviso "Atualizar agora" se houver formulário em edição).
- Cache offline passa a conferir sempre a versão mais nova no servidor.

# v1.1.7 — Contrato revisado, parcelas com data e assinatura gov.br

**Condições de pagamento (contrato)**
- Modalidade "Entrada + parcelas" ou "À vista" (com desconto opcional da tabela).
- Entrada editável: percentual ou valor fixo, forma de pagamento e data de vencimento.
- Saldo em 1 a 24 parcelas mensais, com data, valor e forma editáveis linha a linha.
- Validações: soma das parcelas = saldo (botão para ajustar a diferença), datas fora de ordem, vencimentos após o prazo de 5 dias úteis ou após o evento.
- O cronograma aparece no contrato e no Financeiro do evento (Pago / A vencer / Vencido, botão "Registrar").
- Valor contratado (ex.: à vista com desconto) passa a ser usado no Financeiro, Hoje na Lega e Contratos.

**Modelo de contrato v2 (revisão jurídica)**
- Qualificação completa: RG, nascimento, nacionalidade, estado civil, profissão e CEP do contratante; representante legal da Lega.
- Corrigido: "pagamento parcial" do valor total; referência a parágrafo inexistente na cláusula de desistência; autorização de imagem em 1ª pessoa.
- Incluído: valor por extenso, mora (multa 2% + juros 1% a.m. + IPCA), multa de desistência escalonada (10% com 120+ dias, 20% entre 119 e 61 dias, 30% com 60 dias ou menos), remarcação, força maior, LGPD, uso de imagem opcional, assinatura eletrônica, foro com ressalva do CDC, numeração de páginas e código do contrato.
- Hora excedente cobrada pelo valor proporcional da hora extra (antes: 10% do total a cada 15 min).
- Pré-visualização agora mostra a MINUTA com os dados digitados (antes mostrava a versão salva).
- Validação de CPF e alerta para contratante menor de 18 anos.

**Assinatura eletrônica gov.br**
- Painel passo a passo: gerar PDF, enviar por WhatsApp com instruções, registrar assinatura do cliente e da Lega, conferir no validar.iti.gov.br e registrar o PDF final (SHA-256).
- Opção "Foi assinado em papel" mantida.

**Configurações**
- Nova seção "Dados da contratada": razão social, endereço, representante, CPF, chave PIX, foro.

# v1.1.1 — Saída de usuário

- Botão **Sair** adicionado diretamente ao cabeçalho.
- Permite trocar rapidamente entre Felipe, Paula e Lega sem precisar entrar em Configurações.
- Mantido o logout existente em Configurações.
- Cache atualizado para evitar carregamento da interface anterior.

# v1.1.0 — Supabase compartilhado

- Login por Supabase Auth.
- Perfis Felipe/Paula/Lega carregados do banco.
- Estado compartilhado entre dispositivos.
- Cache local e reenvio após perda de conexão.
- Indicador de sincronização no cabeçalho.
- Logout em Configurações.

# v1.0.6 — Abas integradas

- Agenda alimentada automaticamente pelos eventos.
- Contratos consolidados a partir dos eventos.
- Financeiro geral integrado aos lançamentos dos eventos e com lançamentos gerais.
- Estoque funcional para entradas de produtos e baixas geradas pelos consumos dos eventos.
- Relatórios consolidados de eventos, receitas, custos, pacotes e consumos.
- Correção do vínculo entre consumo e movimentação de estoque para exclusões futuras.

# Plataforma Lega 1.0.0 — Eventos operacional

- Corrigido o carregamento do módulo Eventos.
- Financeiro completo por evento: entradas, parcelas, saldo e despesas.
- Consumos por Bebidas, Alimentação e Diversos.
- Cada consumo gera movimentação de saída para o estoque.
- Cadastro da equipe do evento e custos.
- Encerramento com receita, custos e resultado estimado.
- Evento pode ser concluído e registrado como memória.
- Mantidos orçamento, versões, contrato, checklist, detalhes e histórico.

## v1.0.2
- Adicionado fluxo visual do evento com etapa atual e botão de acesso direto.
- Etapas concluídas, atuais e futuras agora ficam visíveis no menu do evento.
- Contrato, entrada, preparação e encerramento ficam mais fáceis de testar em sequência.
## v1.0.4
- Fluxo do evento agora mostra uma ação principal clara para a etapa atual.
- Contrato gerado e ainda não assinado exibe diretamente “Marcar contrato como assinado”.
- Depois da assinatura, o próximo passo leva ao registro da entrada.
- Depois da entrada, o fluxo conduz para dados da festa, checklist e encerramento.
- Objetivo desta versão: permitir testar o evento em sequência sem ficar preso entre etapas.


## v1.0.5 — Integração Clientes e Orçamentos
- Aba Clientes passa a ler o cadastro criado automaticamente na etapa de contrato.
- Consulta, pesquisa, edição de dados atuais e histórico de eventos por cliente.
- Contratos antigos permanecem com o snapshot de dados original.
- Aba Orçamentos passa a listar todas as versões geradas dentro dos eventos.
- Filtros por situação, pesquisa e indicadores comerciais.
- Abertura direta do evento correspondente a partir de Clientes e Orçamentos.
- Botões “Iniciar orçamento” direcionam ao fluxo correto dentro de Eventos.

## v1.1.2 — Orçamentos e tabelas anuais
- Orçamentos apenas gerados/salvos não são mais marcados automaticamente como escolhidos.
- Valores a receber no Hoje na Lega passam a considerar apenas eventos cujo orçamento foi aceito/contratado.
- A escolha explícita de uma versão fica registrada separadamente.
- Ao aceitar um orçamento, a versão selecionada fica vinculada ao evento.
- Geração de tabela futura corrigida para aplicar 10% ano a ano (2027 sobre 2026, 2028 sobre 2027, etc.).
