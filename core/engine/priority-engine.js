const normalize = value => String(value || '').trim().toLowerCase();

function urgencyFromDays(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) return 8;
  if (daysRemaining < 0) return 45;
  if (daysRemaining === 0) return 40;
  if (daysRemaining <= 2) return 34;
  if (daysRemaining <= 7) return 26;
  if (daysRemaining <= 14) return 17;
  if (daysRemaining <= 30) return 9;
  return 2;
}

function actionKind(action = '') {
  const text = normalize(action);
  if (text.includes('encerrar')) return 'Encerramento';
  if (text.includes('contrato')) return 'Contrato';
  if (text.includes('entrada') || text.includes('pagamento')) return 'Financeiro';
  if (text.includes('orçamento') || text.includes('orcamento')) return 'Orçamento';
  if (text.includes('convidado')) return 'Convidados';
  if (text.includes('checklist') || text.includes('concluir')) return 'Checklist';
  return 'Operação';
}

function routeFor(action = '') {
  const text = normalize(action);
  if (text.includes('entrada') || text.includes('pagamento') || text.includes('saldo')) return 'financeiro';
  if (text.includes('orçamento') || text.includes('orcamento')) return 'orcamentos';
  if (text.includes('contrato')) return 'contratos';
  return 'eventos';
}

function reasonFor(item, action) {
  const { analysis } = item;
  const days = analysis?.daysRemaining;
  const healthReason = analysis?.health?.reason;

  if (days !== null && days !== undefined) {
    if (days < 0) return `${healthReason || 'A data do evento já passou.'} Esta ação precisa ser resolvida antes do encerramento.`;
    if (days === 0) return `${healthReason || 'O evento acontece hoje.'} Esta é a ação operacional mais urgente.`;
    if (days <= 7) return `${healthReason || `Faltam ${days} dia(s) para o evento.`} Resolver agora reduz o risco da festa.`;
  }

  return healthReason || `Esta é a próxima etapa indicada para manter o evento avançando.`;
}

function scoreFor(item, action, index = 0) {
  const analysis = item.analysis || {};
  const health = analysis.health || {};
  let score = urgencyFromDays(analysis.daysRemaining);

  if (health.status === 'late') score += 40;
  else if (health.status === 'attention') score += 22;
  else score += 5;

  const text = normalize(action);
  if (text.includes('encerrar')) score += 24;
  if (text.includes('contrato')) score += 21;
  if (text.includes('entrada') || text.includes('pagamento')) score += 20;
  if (text.includes('orçamento') || text.includes('orcamento')) score += 14;
  if (text.includes('lista de convidados')) score += 12;
  if (text.includes('checklist') || text.includes('concluir')) score += 10;

  score -= Math.min(index, 5);
  return Math.max(1, Math.round(score));
}

/**
 * Converte análises de eventos em uma fila única de ações priorizadas.
 * Não altera eventos nem análises recebidas.
 */
export function buildPriorities(items = []) {
  return items
    .filter(item => item?.event?.status !== 'realizado')
    .flatMap(item => {
      const analysis = item.analysis || {};
      const actions = [];
      const primaryAction = analysis.nextAction && analysis.nextAction !== 'Nenhuma ação pendente'
        ? analysis.nextAction
        : null;

      if (primaryAction) actions.push(primaryAction);
      (analysis.pending || []).forEach(action => {
        if (action && !actions.some(existing => normalize(existing) === normalize(action))) actions.push(action);
      });

      return actions.slice(0, 3).map((action, index) => ({
        item,
        action,
        kind: actionKind(action),
        route: routeFor(action),
        reason: reasonFor(item, action),
        score: scoreFor(item, action, index),
        isPrimaryForEvent: index === 0
      }));
    })
    .sort((a, b) => b.score - a.score
      || (a.item.analysis.daysRemaining ?? 9999) - (b.item.analysis.daysRemaining ?? 9999)
      || a.action.localeCompare(b.action, 'pt-BR'));
}

export function priorityLevel(score = 0) {
  if (score >= 90) return { key: 'critical', label: 'Prioridade máxima' };
  if (score >= 65) return { key: 'high', label: 'Alta prioridade' };
  if (score >= 40) return { key: 'medium', label: 'Prioridade média' };
  return { key: 'normal', label: 'Próxima ação' };
}
