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
