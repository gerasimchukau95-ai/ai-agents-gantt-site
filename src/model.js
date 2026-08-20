const DAY = 86_400_000;

export const parseDate = value => new Date(`${value}T00:00:00Z`);
export const toISODate = date => date.toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / DAY);
export const addDays = (value, days) => toISODate(new Date(parseDate(value).getTime() + days * DAY));
export const inclusiveDays = (from, to) => daysBetween(from, to) + 1;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function effectiveStatus(item, today = toISODate(new Date())) {
  if (item.status !== "Завершено" && item.endDate && item.endDate < today) return "Просрочено";
  return item.status;
}

export function validateData(data) {
  const errors = [];
  if (!data?.project?.name?.trim()) errors.push("У проекта должно быть название.");
  if (!data?.project?.startDate || !data?.project?.endDate || data.project.startDate > data.project.endDate) {
    errors.push("Проверьте даты проекта.");
  }
  if (!Number.isFinite(Number(data?.project?.progress)) || data.project.progress < 0 || data.project.progress > 100) {
    errors.push("Готовность проекта должна быть от 0 до 100%.");
  }
  const workstreamIds = new Set(data.workstreams?.map(w => w.id));
  for (const w of data.workstreams || []) {
    if (!w.name?.trim()) errors.push("У каждой группы должно быть название.");
    if (Number(w.progress) < 0 || Number(w.progress) > 100) errors.push(`Проверьте готовность группы «${w.name}».`);
  }
  for (const t of data.tasks || []) {
    if (!workstreamIds.has(t.workstreamId)) errors.push(`Этап «${t.name}» не привязан к группе.`);
    if (!t.name?.trim()) errors.push("У каждого этапа должно быть название.");
    if (!t.startDate || !t.endDate || t.startDate > t.endDate) errors.push(`Проверьте даты этапа «${t.name}».`);
    if (t.startDate < data.project.startDate || t.endDate > data.project.endDate) errors.push(`Этап «${t.name}» выходит за период проекта.`);
    if (t.type === "milestone" && t.startDate !== t.endDate) errors.push(`Контрольная точка «${t.name}» должна занимать один день.`);
    if (Number(t.progress) < 0 || Number(t.progress) > 100) errors.push(`Проверьте выполнение этапа «${t.name}».`);
  }
  return [...new Set(errors)];
}

export function buildVisibleRows(data, collapsed = new Set()) {
  const rows = [{ type: "project", level: 0, item: data.project }];
  if (collapsed.has(data.project.id)) return rows;
  for (const w of [...data.workstreams].sort((a,b) => a.order - b.order)) {
    const children = data.tasks.filter(t => t.workstreamId === w.id).sort((a,b) => a.order - b.order);
    rows.push({ type: "workstream", level: 1, item: w, children });
    if (!collapsed.has(w.id)) children.forEach(t => rows.push({ type: t.type, level: 2, item: t }));
  }
  return rows;
}

export function groupRange(children, fallbackStart, fallbackEnd) {
  if (!children?.length) return { startDate: fallbackStart, endDate: fallbackEnd };
  return {
    startDate: children.reduce((v,t) => t.startDate < v ? t.startDate : v, children[0].startDate),
    endDate: children.reduce((v,t) => t.endDate > v ? t.endDate : v, children[0].endDate)
  };
}

export function moveItem(items, id, direction) {
  const ordered = [...items].sort((a,b) => a.order - b.order);
  const index = ordered.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return items;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  ordered.forEach((item, order) => { item.order = order + 1; });
  return items;
}
