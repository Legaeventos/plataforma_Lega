const STAGES = [
  { key: 'orcamento', label: 'Orçamento', asset: 'semente.svg' },
  { key: 'aceito', label: 'Orçamento aceito', asset: 'broto.svg' },
  { key: 'contrato', label: 'Contrato assinado', asset: 'muda.svg' },
  { key: 'entrada', label: 'Entrada paga', asset: 'arvore-jovem.svg' },
  { key: 'preparacao', label: 'Preparação', asset: 'arvore-jovem.svg' },
  { key: 'realizado', label: 'Evento realizado', asset: 'arvore-oficial.png' }
];

export function treeProgress({ stage = 'preparacao', progress = 68, compact = false } = {}) {
  const current = Math.max(0, STAGES.findIndex(item => item.key === stage));
  const item = STAGES[current] || STAGES[0];
  return `
    <section class="tree-progress ${compact ? 'tree-progress--compact' : ''}" aria-label="Ciclo da Festa: ${item.label}">
      <div class="tree-progress__visual">
        <span class="tree-progress__halo"></span>
        <img src="assets/botanica/${item.asset}" alt="" class="tree-progress__image">
      </div>
      <div class="tree-progress__content">
        <span class="tree-progress__eyebrow">Ciclo da Festa</span>
        <strong>${item.label}</strong>
        <span>${stage === 'preparacao' ? `${progress}% da preparação concluída` : 'Etapa atual do evento'}</span>
        <div class="tree-progress__track" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, progress))}%"></i></div>
        <ol class="tree-progress__steps">
          ${STAGES.map((step, index) => `<li class="${index < current ? 'done' : index === current ? 'current' : ''}"><span></span><small>${step.label}</small></li>`).join('')}
        </ol>
      </div>
    </section>`;
}
