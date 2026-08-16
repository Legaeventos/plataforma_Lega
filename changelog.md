# Histórico de alterações

## v0.9.9 — Assistente Operacional
- Motor de Prioridades centralizado em `core/engine/priority-engine.js`.
- Nova área “O que fazer agora?” no Dashboard.
- Ação principal com justificativa e botão para o módulo correspondente.
- Fila de próximas ações classificada por risco, tipo de pendência e dias restantes.

# Changelog

## v0.9.8.1 — Correções e estabilidade
- Correções no Dashboard, Event Analyzer, versão visual e cache.
- Melhor compatibilidade com eventos migrados e dados legados.
- Ajustes na seleção do próximo evento e na janela de sete dias.

## v0.9.8 — Painel Operacional
- Dashboard conectado aos eventos reais salvos no navegador.
- Indicadores automáticos de eventos de hoje, próximos 7 dias, eventos em risco e valores a receber.
- Lista de próximos eventos com saúde operacional e próxima ação recomendada.
- Prioridades ordenadas por urgência usando o Event Analyzer.
- Resumo de eventos ativos, pendências e eventos em dia.
- Removidos os dados demonstrativos fixos da tela inicial.

## v0.9.4 — Event Analyzer
- Criado o primeiro núcleo de análise operacional em `core/engine/event-analyzer.js`.
- Ao abrir um evento, a tela informa fase, próxima ação e pendências.
- A análise considera orçamento, aceite, contrato, assinatura, entrada, checklist e data do evento.
- Nenhum dado existente foi migrado ou apagado.
- Atualizado o cache do aplicativo para carregar a nova versão.

## v0.9.3
- Corrigida a função interna de atualização (`rerender`) do módulo de eventos.
- Corrigida a abertura do menu e das áreas internas do evento.
- Atualizado o cache do aplicativo e o ícone da aba.

## v0.9.2 — Correção de abertura de eventos

- Corrigida a rota que carregava `/modules/eventos/index.js` e retornava 404.
- Criado o módulo compatível `/modules/eventos.js`.
- Mantida uma cópia do arquivo antigo para segurança.
- Atualizado o identificador de versão e adicionada marca de cache na importação.

# v0.8.2

- Corrigido o valor negociado no PDF do orçamento.
- O valor final exibido na tela passa a ser gravado diretamente na versão do orçamento.
- O PDF agora mostra também a diferença em reais entre a tabela oficial e o valor negociado.
- Mantidos o motivo e a observação comercial no PDF.

# v0.8.1

- Aviso quando não existe tabela para o ano do evento.
- Criação da tabela do ano diretamente no orçamento, usando reajuste de 10% sobre a vigência anterior.
- Seleção automática da tabela quando ela existe.
- Observação comercial e composição do preço exibidas no PDF do orçamento.
- Valor oficial preservado ao lado do valor negociado.

# Changelog

## v0.5.0
- Novo fluxo começa por um orçamento simples.
- Removido o aviso redundante de local fixo.
- Confirmação de interesse altera automaticamente o status para Orçamento aceito.
- Dados detalhados são liberados após a confirmação.
- Contrato assinado altera automaticamente o status.
- Checklist funcional foi incorporado ao Workspace do Evento.
- Orçamento possui visualização própria e impressão/PDF pelo navegador.


## v0.4.0

- Módulo de Eventos funcional com persistência local.
- Cadastro e edição de eventos.
- Público separado em adultos, crianças e menores de 4 anos.
- Política comercial para alimentação, bebidas não alcoólicas e alcoólicas.
- Lista com pesquisa e filtro por etapa.
- Workspace do evento com Ciclo da Festa, resumo financeiro, público e política comercial.
- Histórico automático de criação, edição e mudança de etapa.
- Exclusão de eventos com confirmação.
- Layout responsivo para computador, tablet e celular.

## v0.3.0

- Nova identidade visual da Plataforma Lega.
- Árvore oficial e linguagem botânica.
- Dashboard “Hoje na Lega”.

## v0.6.0
- Novo fluxo iniciado por orçamento.
- Cálculo automático dos quatro pacotes usando convidados, faixas e horas extras.
- Orçamento profissional em três páginas pronto para imprimir ou salvar em PDF.
- Orçamento salvo e vinculado ao evento.
- Confirmação de interesse avança automaticamente o ciclo.
- Dados completos e checklist liberados após o aceite.

## v0.8.0
- Corrigido o corte do selo de status/semente nos cartões de eventos.
- Novo fluxo obrigatório: orçamento escolhido → interesse confirmado → contrato assinado → entrada paga.
- Detalhes da festa, checklist, consumo e arquivos são liberados somente depois da entrada.
- Contrato e entrada agora possuem etapas próprias dentro do Workspace.
- Histórico registra assinatura do contrato e pagamento da entrada.

## v0.8.0
- Tabelas anuais de preços com reajuste acumulado sobre a vigência anterior.
- Reajuste padrão de 10%, editável, com arredondamento e revisão manual.
- Seleção automática da tabela pela data do evento e escolha manual no orçamento.
- Desconto, acréscimo ou valor final manual com motivo e observação preservados na versão.
- Assistente de contrato com busca ou cadastro de cliente dentro do evento.
- Cadastro do cliente alimentado automaticamente pelo contrato.
- Pré-visualização e impressão do contrato preenchido.
- Abertura do evento diretamente na etapa cronológica atual.


## v0.8.3
- Negociação comercial mais intuitiva: a tela mostra apenas o campo correspondente ao tipo escolhido.
- Desconto e acréscimo exibem somente o percentual.
- Valor final negociado exibe somente o valor manual.
- Campos inativos deixam de interferir no cálculo e no salvamento do orçamento.
- Compatibilidade mantida com orçamentos antigos salvos como 'Valor final manual'.


## v0.9.0
- Tela inicial do evento limpa, com botões de acesso.
- Painel do evento disponível sob consulta.
- Negociação com campos exclusivos e limpeza de campos inativos.
- Detalhes internos da negociação removidos do PDF do cliente.
- Contratos versionados com snapshot de cliente, orçamento, tabela e pacote.
- Contrato ampliado com base no modelo oficial da Lega.

## v0.9.1 - Contrato completo
- Restaurado o texto integral do contrato oficial da Lega Eventos, sem resumo ou supressão de cláusulas.
- Mantido o assistente que solicita os dados obrigatórios faltantes antes da geração.
- Dados do cliente, evento, pacote, serviços, valores, datas e assinaturas continuam preenchidos automaticamente.
- Prazos da lista de convidados e da solicitação de hora extra são calculados a partir da data do evento.


## v0.9.7 — Saúde do Evento
- Classificação automática em Em dia, Atenção ou Atrasado.
- Exibição dos dias restantes e do motivo do alerta.
- Risco calculado por data, contrato, entrada e checklist.
- Eventos passados não encerrados aparecem como atrasados.
