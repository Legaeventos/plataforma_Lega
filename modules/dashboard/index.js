import { greeting, longDate } from '../../js/utils.js';
import { readJSON } from '../../js/storage.js';
import { treeProgress } from '../../core/components/tree-progress.js';
import { analyzeEvent } from '../../core/engine/event-analyzer.js';
import { buildPriorities, priorityLevel } from '../../core/engine/priority-engine.js';

const EVENTS_KEY = 'lega.eventos';
const CLIENTS_KEY = 'lega.clientes';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
}[char]));

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function selectedQuote(event) {
  return event?.orcamentos?.find(quote => quote.id === event.orcamentoEscolhidoId)
    || event?.orcamentos?.at(-1)
    || null;
}

function eventName(event, quote) {
  return quote?.nome || event?.nome || 'Evento sem nome';
}

function eventClient(event, quote) {
  return quote?.cliente || event?.clienteContrato?.nome || event?.cliente || 'Cliente a definir';
}

function eventTime(event, quote) {
  return quote?.horaInicio || event?.horaInicio || '';
}

function eventGuests(event, quote) {
  return Number(quote?.convidadosTotal || event?.convidadosTotal || 0);
}

function eventValue(event, quote) {
  return Number(quote?.valor || event?.valorContrato || 0);
}

function eventReceived(event) {
  const entries = Array.isArray(event?.lancamentosFinanceiros)
    ? event.lancamentosFinanceiros.filter(item => item?.tipo === 'entrada')
    : [];

  // Nas versões antigas, a entrada podia existir apenas nos campos legados.
  // Quando há lançamentos financeiros, eles passam a ser a fonte de verdade
  // para evitar somar a mesma entrada duas vezes.
  if (entries.length) {
    return entries.reduce((sum, item) => sum + Number(item?.valor || 0), 0);
  }

  return event?.entradaPaga ? Number(event?.entradaValor || 0) : 0;
}

function daysLabel(days) {
  if (days === null) return 'Data a definir';
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days > 1) return `Faltam ${days} dias`;
  if (days === -1) return 'Aconteceu ontem';
  return `Há ${Math.abs(days)} dias`;
}

function dateBR(value) {
  const date = parseDate(value);
  if (!date) return 'Data a definir';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function healthMeta(status) {
  return {
    ok: { icon: '🟢', label: 'Em dia', className: 'is-ok' },
    attention: { icon: '🟡', label: 'Atenção', className: 'is-attention' },
    late: { icon: '🔴', label: 'Atrasado', className: 'is-late' }
  }[status] || { icon: '🟡', label: 'Atenção', className: 'is-attention' };
}

function progressFor(event) {
  return ({ orcamento: 8, aceito: 22, contrato: 38, entrada: 54, preparacao: 70, pronto: 88, realizado: 100 })[event?.status] || 8;
}

function operationalData() {
  const now = new Date();
  const today = startOfDay(now);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const events = readJSON(EVENTS_KEY, []).map(event => {
    const quote = selectedQuote(event);
    const analysis = analyzeEvent(event, quote, { now });
    const date = parseDate(quote?.data || event?.data);
    const total = eventValue(event, quote);
    const paid = eventReceived(event);
    const contracted = event?.status && event.status !== 'orcamento';
    const receivable = contracted && event?.status !== 'realizado' ? Math.max(0, total - paid) : 0;
    return { event, quote, analysis, date, total, paid, receivable };
  });

  const active = events.filter(item => item.event.status !== 'realizado');
  const future = active
    .filter(item => item.date && item.date >= today)
    .sort((a, b) => a.date - b.date);
  const todayEvents = future.filter(item => item.date.getTime() === today.getTime());
  const weekEvents = future.filter(item => item.date <= weekEnd);
  const risks = active.filter(item => item.analysis.health.status !== 'ok');
  const urgent = risks
    .flatMap(item => {
      const pending = item.analysis.pending?.length ? item.analysis.pending : [item.analysis.health.reason];
      return pending.slice(0, 2).map((text, index) => ({
        item,
        text,
        priority: item.analysis.health.status === 'late' ? 0 : 1,
        order: index
      }));
    })
    .sort((a, b) => a.priority - b.priority || (a.item.analysis.daysRemaining ?? 9999) - (b.item.analysis.daysRemaining ?? 9999) || a.order - b.order);

  return {
    events,
    active,
    future,
    todayEvents,
    weekEvents,
    risks,
    urgent,
    receivable: active.reduce((sum, item) => sum + item.receivable, 0),
    clients: readJSON(CLIENTS_KEY, []).length
  };
}

function metricCard({ className = '', icon, label, value, note }) {
  return `<article class="metric-card ${className}">
    <span class="metric-icon"><img src="assets/botanica/${icon}" alt=""></span>
    <span class="metric-label">${esc(label)}</span>
    <strong class="metric-value">${esc(value)}</strong>
    <span class="metric-note">${esc(note)}</span>
  </article>`;
}

function upcomingCard(item) {
  const { event, quote, analysis } = item;
  const health = healthMeta(analysis.health.status);
  return `<button class="operation-event ${health.className}" data-route="eventos" title="Abrir módulo de eventos">
    <span class="operation-event__date"><strong>${esc(dateBR(quote?.data || event?.data).slice(0, 5))}</strong><small>${esc(daysLabel(analysis.daysRemaining))}</small></span>
    <span class="operation-event__body">
      <strong>${esc(eventName(event, quote))}</strong>
      <small>${esc(eventClient(event, quote))}${eventTime(event, quote) ? ` · ${esc(eventTime(event, quote))}` : ''}</small>
      <span class="operation-event__action">${esc(analysis.nextAction)}</span>
    </span>
    <span class="operation-event__health">${health.icon}<small>${health.label}</small></span>
  </button>`;
}

function emptyBlock(message) {
  return `<div class="dashboard-empty"><span>🌿</span><p>${esc(message)}</p></div>`;
}

export function render({ user }) {
  const data = operationalData();
  const nearest = data.future[0] || null;
  const upcoming = data.future.slice(0, 5);
  const actionQueue = buildPriorities(data.active);
  const mainPriority = actionQueue[0] || null;
  const secondaryPriorities = actionQueue.slice(1, 5);
  const priorities = data.urgent.slice(0, 5);

  return `
    <div class="page-grid dashboard-page">
      <section class="hero">
        <div class="hero-copy">
          <span class="hero-kicker"><img src="assets/botanica/folha.svg" alt=""> centro de operações</span>
          <h2>${greeting()}, ${esc(user.name)}!</h2>
          <p>Veja os próximos eventos, identifique riscos e resolva primeiro o que exige atenção.</p>
          <span class="hero-date">${longDate()}</span>
        </div>
        <img class="hero-tree" src="assets/botanica/arvore-oficial.png" alt="" aria-hidden="true">
      </section>

      <section class="metrics" aria-label="Resumo operacional">
        ${metricCard({ className: 'green', icon: 'folha.svg', label: 'Eventos hoje', value: String(data.todayEvents.length), note: data.todayEvents.length ? `${data.todayEvents.reduce((sum, item) => sum + eventGuests(item.event, item.quote), 0)} convidados previstos` : 'Nenhum evento programado' })}
        ${metricCard({ icon: 'broto.svg', label: 'Próximos 7 dias', value: String(data.weekEvents.length), note: `${data.future.length} evento(s) futuro(s)` })}
        ${metricCard({ className: 'warning', icon: 'semente.svg', label: 'Eventos em risco', value: String(data.risks.length), note: data.risks.some(item => item.analysis.health.status === 'late') ? 'Há evento(s) atrasado(s)' : 'Atenções operacionais' })}
        ${metricCard({ className: 'green', icon: 'muda.svg', label: 'Valores a receber', value: money(data.receivable), note: `${data.clients} cliente(s) cadastrado(s)` })}
      </section>

      <section class="assistant-panel panel" aria-label="Assistente operacional">
        <div class="panel-header">
          <div><h2>O que fazer agora?</h2><p>O sistema organizou as ações pelo risco e pela proximidade de cada evento.</p></div>
          <span class="assistant-badge">Assistente operacional</span>
        </div>
        ${mainPriority ? (() => {
          const level = priorityLevel(mainPriority.score);
          const { item } = mainPriority;
          return `<div class="assistant-main is-${level.key}">
            <div class="assistant-main__top">
              <span class="assistant-level">${esc(level.label)}</span>
              <span class="assistant-score" title="Pontuação interna de prioridade">${mainPriority.score}</span>
            </div>
            <div class="assistant-main__content">
              <span class="assistant-kind">${esc(mainPriority.kind)}</span>
              <h3>${esc(mainPriority.action)}</h3>
              <p><strong>${esc(eventName(item.event, item.quote))}</strong> · ${esc(eventClient(item.event, item.quote))} · ${esc(daysLabel(item.analysis.daysRemaining))}</p>
              <div class="assistant-reason"><small>Por que agora?</small><span>${esc(mainPriority.reason)}</span></div>
            </div>
            <button class="btn btn-primary" data-route="${esc(mainPriority.route)}">Resolver agora</button>
          </div>`;
        })() : emptyBlock('Nenhuma ação pendente. A operação está em dia.')}
        ${secondaryPriorities.length ? `<div class="assistant-secondary">
          <div class="assistant-secondary__title"><strong>Depois desta ação</strong><span>${secondaryPriorities.length} prioridade(s)</span></div>
          <div class="assistant-actions">
            ${secondaryPriorities.map(priority => {
              const item = priority.item;
              return `<button class="assistant-action" data-route="${esc(priority.route)}">
                <span class="assistant-action__score">${priority.score}</span>
                <span class="assistant-action__body"><strong>${esc(priority.action)}</strong><small>${esc(eventName(item.event, item.quote))} · ${esc(daysLabel(item.analysis.daysRemaining))}</small></span>
                <span class="assistant-action__go">→</span>
              </button>`;
            }).join('')}
          </div>
        </div>` : ''}
      </section>

      <section class="dashboard-columns dashboard-columns--primary">
        <article class="panel cycle-panel">
          <div class="panel-header">
            <div><h2>Próximo evento</h2><p>A festa mais próxima no calendário</p></div>
            ${nearest ? `<span class="badge green">${esc(daysLabel(nearest.analysis.daysRemaining))}</span>` : ''}
          </div>
          ${nearest ? `
            <div class="event-heading">
              <div><strong>${esc(eventName(nearest.event, nearest.quote))}</strong><span>${esc(nearest.quote?.pacote || nearest.event?.pacote || 'Pacote a definir')} · ${eventGuests(nearest.event, nearest.quote)} convidados</span></div>
              <button class="btn btn-ghost" data-route="eventos">Abrir eventos</button>
            </div>
            ${treeProgress({ stage: nearest.event.status || 'orcamento', progress: progressFor(nearest.event) })}
            <div class="next-action-strip"><small>Próxima ação recomendada</small><strong>${esc(nearest.analysis.nextAction)}</strong></div>
          ` : emptyBlock('Cadastre um evento para começar a acompanhar a operação.')}
        </article>

        <article class="panel attention-panel">
          <div class="panel-header"><div><h2>Precisa de atenção</h2><p>Prioridades organizadas por urgência</p></div><span class="attention-count">${data.urgent.length}</span></div>
          <div class="attention-list">
            ${priorities.length ? priorities.map(({ item, text }) => {
              const late = item.analysis.health.status === 'late';
              return `<button class="attention-item ${late ? 'is-urgent' : ''}" data-route="eventos">
                <span class="attention-mark"></span>
                <span><strong>${esc(text)}</strong><small>${esc(eventName(item.event, item.quote))} · ${esc(daysLabel(item.analysis.daysRemaining))}</small></span>
              </button>`;
            }).join('') : `<div class="attention-item good"><span class="attention-mark"></span><span><strong>Operação em dia</strong><small>Nenhuma prioridade urgente identificada.</small></span></div>`}
          </div>
        </article>
      </section>

      <section class="dashboard-columns dashboard-columns--secondary">
        <article class="panel">
          <div class="panel-header"><div><h2>Próximos eventos</h2><p>Data, saúde e próxima ação em uma única visão</p></div><span class="badge green">${data.future.length} futuro(s)</span></div>
          <div class="operation-events">
            ${upcoming.length ? upcoming.map(upcomingCard).join('') : emptyBlock('Nenhum evento futuro com data definida.')}
          </div>
        </article>

        <article class="panel shortcuts-panel">
          <div class="panel-header"><div><h2>Acesso rápido</h2><p>Ações frequentes do dia a dia</p></div></div>
          <div class="shortcut-grid">
            <button data-route="eventos"><img src="assets/botanica/semente.svg" alt=""><span><strong>Novo evento</strong><small>Iniciar uma festa</small></span></button>
            <button data-route="clientes"><img src="assets/botanica/broto.svg" alt=""><span><strong>Novo cliente</strong><small>Cadastrar contato</small></span></button>
            <button data-route="financeiro"><img src="assets/botanica/muda.svg" alt=""><span><strong>Financeiro</strong><small>Consultar lançamentos</small></span></button>
            <button data-route="agenda"><img src="assets/botanica/folha.svg" alt=""><span><strong>Ver agenda</strong><small>Próximas datas</small></span></button>
          </div>
          <div class="operation-summary">
            <div><span>Eventos ativos</span><strong>${data.active.length}</strong></div>
            <div><span>Pendências</span><strong>${data.urgent.length}</strong></div>
            <div><span>Em dia</span><strong>${data.active.filter(item => item.analysis.health.status === 'ok').length}</strong></div>
          </div>
        </article>
      </section>
    </div>`;
}
