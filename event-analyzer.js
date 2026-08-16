const normalize = value => String(value || '').trim().toLowerCase();

function eventDate(event, quote) {
  const value = quote?.data || event?.data;
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(event, quote, now) {
  const date = eventDate(event, quote);
  if (!date) return null;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEvent = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startEvent.getTime() - startToday.getTime()) / 86400000);
}

function pendingChecklist(event) {
  return (event?.checklist || []).filter(item => !item.concluido);
}

function checklistAction(item) {
  if (!item) return null;
  const title = String(item.titulo || '').trim();
  const key = normalize(title);

  if (key.includes('lista de convidados')) return 'Receber lista de convidados';
  if (key.includes('entrada recebida')) return 'Conferir recebimento da entrada';
  if (key.includes('saldo')) return 'Conferir saldo do evento';
  return `Concluir: ${title}`;
}

function healthFor({ event, quote, now, contractSigned, entryPaid, checklistPending }) {
  const daysRemaining = daysUntil(event, quote, now);

  if (event.status === 'realizado') {
    return { status: 'ok', label: 'Em dia', reason: 'Evento encerrado e registrado como memória.', daysRemaining };
  }

  if (daysRemaining === null) {
    return { status: 'attention', label: 'Atenção', reason: 'A data do evento ainda não foi definida.', daysRemaining };
  }

  if (daysRemaining < 0) {
    return { status: 'late', label: 'Atrasado', reason: 'A data do evento passou e ele ainda não foi encerrado.', daysRemaining };
  }

  if (daysRemaining <= 7 && !contractSigned) {
    return { status: 'late', label: 'Atrasado', reason: `Faltam ${daysRemaining} dia(s) e o contrato ainda não foi assinado.`, daysRemaining };
  }

  if (daysRemaining <= 7 && !entryPaid) {
    return { status: 'late', label: 'Atrasado', reason: `Faltam ${daysRemaining} dia(s) e a entrada ainda não foi registrada.`, daysRemaining };
  }

  if (daysRemaining <= 3 && checklistPending.length) {
    return { status: 'late', label: 'Atrasado', reason: `Faltam ${daysRemaining} dia(s) e há ${checklistPending.length} item(ns) pendente(s) no checklist.`, daysRemaining };
  }

  if (daysRemaining <= 14 && (!contractSigned || !entryPaid)) {
    return { status: 'attention', label: 'Atenção', reason: 'O evento está próximo e ainda há etapas comerciais pendentes.', daysRemaining };
  }

  if (daysRemaining <= 14 && checklistPending.length) {
    return { status: 'attention', label: 'Atenção', reason: `O evento está próximo e há ${checklistPending.length} item(ns) pendente(s) no checklist.`, daysRemaining };
  }

  return { status: 'ok', label: 'Em dia', reason: 'Nenhum risco urgente foi identificado neste momento.', daysRemaining };
}

/**
 * Analisa um evento sem alterar seus dados.
 * Retorna fase, próxima ação, pendências e saúde operacional.
 */
export function analyzeEvent(event = {}, quote = null, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const hasQuote = Boolean(quote || event.orcamentos?.length);
  const quoteAccepted = event.status !== 'orcamento';
  const contracts = event.contratos || [];
  const hasContract = contracts.length > 0 || Boolean(event.contratoGeradoEm);
  const contractSigned = Boolean(event.contratoAssinado) || ['contrato', 'entrada', 'preparacao', 'pronto', 'realizado'].includes(event.status);
  const entryPaid = Boolean(event.entradaPaga) || ['entrada', 'preparacao', 'pronto', 'realizado'].includes(event.status);
  const checklistPending = pendingChecklist(event);
  const checklistComplete = Boolean(event.checklist?.length) && checklistPending.length === 0;
  const daysRemaining = daysUntil(event, quote, now);
  const occurred = daysRemaining !== null && daysRemaining < 0;
  const health = healthFor({ event, quote, now, contractSigned, entryPaid, checklistPending });
  const result = (phase, nextAction, pending) => ({ phase, nextAction, pending, health, daysRemaining });

  if (!hasQuote) return result('Contato', 'Criar o primeiro orçamento', ['Criar orçamento']);
  if (event.status === 'realizado') return result('Evento encerrado', 'Nenhuma ação pendente', []);

  if (occurred) {
    const pending = [];
    if (!contractSigned) pending.push('Contrato não assinado');
    if (!entryPaid) pending.push('Entrada não registrada');
    if (checklistPending.length) pending.push(`${checklistPending.length} item(ns) do checklist não concluído(s)`);
    pending.push('Encerrar evento');
    return result('Evento realizado', 'Encerrar evento', pending);
  }

  if (!quoteAccepted) return result('Orçamento', 'Confirmar interesse do cliente', ['Orçamento aguardando aceite']);
  if (!hasContract) return result('Contrato', 'Gerar contrato', ['Gerar contrato', 'Assinar contrato', 'Registrar entrada']);
  if (!contractSigned) return result('Contrato', 'Assinar contrato', ['Assinar contrato', 'Registrar entrada']);
  if (!entryPaid) return result('Contrato', 'Registrar pagamento da entrada', ['Registrar entrada']);
  if (checklistComplete || event.status === 'pronto') return result('Evento pronto', 'Aguardar a realização do evento', []);

  const nextChecklistItem = checklistPending.find(item => normalize(item.titulo).includes('lista de convidados')) || checklistPending[0];
  return result(
    'Preparação',
    checklistAction(nextChecklistItem) || 'Completar dados e checklist da festa',
    checklistPending.map(item => item.titulo)
  );
}
