import { STATUSES, cloneInitialData } from "./data.js";
import { SUPABASE_FUNCTION_URL } from "./config.js";
import {
  addDays, buildVisibleRows, clamp, daysBetween, effectiveStatus, groupRange,
  inclusiveDays, moveItem, parseDate, toISODate, validateData
} from "./model.js";

const root = document.querySelector("#app");
const LOCAL_KEY = "ai-agents-project-v1";
const DAY_WIDTH = 20;
const fmtDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const fmtDateShort = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmtDateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const periodMonthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" });

const state = {
  data: null, draft: null, editing: false, localMode: false, loading: true,
  loadError: "", collapsed: new Set(), modal: null, toastTimer: null,
  adminToken: sessionStorage.getItem("ai-agents-admin-token") || ""
};

const apiUrl = path => SUPABASE_FUNCTION_URL
  ? `${SUPABASE_FUNCTION_URL.replace(/\/$/, "")}${path}`
  : `/api/project${path}`;

const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const icon = (name) => ({
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6M10 11v5m4-5v5"/></svg>'
}[name] || "");

async function load() {
  state.loading = true;
  state.loadError = "";
  try {
    const response = await fetch(apiUrl(""), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    state.data = await response.json();
    state.localMode = false;
  } catch (error) {
    if (!SUPABASE_FUNCTION_URL) {
      state.localMode = true;
      try { state.data = JSON.parse(localStorage.getItem(LOCAL_KEY)) || cloneInitialData(); }
      catch { state.data = cloneInitialData(); }
    } else {
      state.data = null;
      state.loadError = "Не удалось загрузить общие данные проекта. Проверьте соединение и повторите попытку.";
    }
  }
  state.loading = false;
  render();
}

function currentData() { return state.editing ? state.draft : state.data; }
function statusBadge(status) { return `<span class="status" data-status="${esc(status)}">${esc(status)}</span>`; }
function input(name, value, type = "text", extra = "") {
  return `<input class="edit-field" type="${type}" data-field="${esc(name)}" value="${esc(value)}" ${extra}>`;
}
function select(name, value, options = STATUSES) {
  return `<select class="edit-field" data-field="${esc(name)}">${options.map(o => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
}

function projectPeriod(project) {
  const start = parseDate(project.startDate);
  const end = parseDate(project.endDate);
  const startMonth = periodMonthFmt.format(start);
  const endMonth = periodMonthFmt.format(end);
  return start.getUTCFullYear() === end.getUTCFullYear()
    ? `${startMonth} — ${endMonth} ${end.getUTCFullYear()}`
    : `${startMonth} ${start.getUTCFullYear()} — ${endMonth} ${end.getUTCFullYear()}`;
}

function render() {
  if (state.loading) {
    root.innerHTML = `<div class="load-state"><div class="load-spinner" aria-hidden="true"></div><p>Загружаем данные проекта…</p></div>`;
    return;
  }
  if (state.loadError) {
    root.innerHTML = `<div class="load-state load-error" role="alert"><h1>Сервер временно недоступен</h1><p>${esc(state.loadError)}</p><button class="btn btn-primary" data-action="retry-load">Повторить</button></div>`;
    bindEvents();
    return;
  }
  const data = currentData();
  root.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <p class="eyebrow">Статус единого проекта</p>
        <div class="headline-row">
          <div><h1>${esc(data.project.name)}</h1><p class="subtitle">Период: ${esc(projectPeriod(data.project))} · Плановое завершение ${fmt(data.project.endDate)}</p></div>
          <div class="header-actions">${state.editing
            ? `<button class="btn btn-ghost-light" data-action="cancel-edit">Отменить</button><button class="btn btn-light" data-action="save">${icon("save")}Сохранить изменения</button>`
            : `<button class="btn btn-light" data-action="start-edit">${icon("edit")}Редактировать</button>`}
          </div>
        </div>
        ${state.editing ? projectEditor(data.project) : ""}
      </div>
    </header>
    <main class="content" id="main">
      ${summary(data)}
      <section class="section" aria-labelledby="solutions-title">
        <div class="section-head"><div><h2 class="section-title" id="solutions-title">Разрабатываемые решения</h2><p class="section-copy">Панель и четыре специализированных агента</p></div></div>
        <div class="cards">${data.workstreams.filter(w => w.kind === "solution").sort((a,b) => a.order-b.order).map(solutionCard).join("")}</div>
      </section>
      <section class="section" aria-labelledby="gantt-title">
        <div class="section-head"><div><h2 class="section-title" id="gantt-title">Календарный план</h2><p class="section-copy">Иерархия проекта, этапы и контрольные точки за период ${esc(projectPeriod(data.project))}</p></div></div>
        ${gantt(data)}
      </section>
    </main>
    ${state.modal ? renderModal() : ""}
  </div>`;
  bindEvents();
}

function projectEditor(project) {
  return `<div class="project-editor">
    <label>Статус проекта${select("project.status", project.status)}</label>
    <label>Общая готовность, %${input("project.progress", project.progress, "number", 'min="0" max="100"')}</label>
    <label>Начало проекта${input("project.startDate", project.startDate, "date", `max="${esc(project.endDate)}"`)}</label>
    <label>Плановое завершение${input("project.endDate", project.endDate, "date", `min="${esc(project.startDate)}"`)}</label>
  </div>`;
}

function summary(data) {
  const tasks = data.tasks.filter(t => t.type === "task");
  const done = tasks.filter(t => effectiveStatus(t) === "Завершено").length;
  const overdue = tasks.filter(t => effectiveStatus(t) === "Просрочено").length;
  return `<section class="summary-grid" aria-label="Краткая сводка">
    <article class="metric"><div class="metric-label">Статус проекта</div><div class="metric-value">${statusBadge(data.project.status)}</div><div class="metric-note">Единый проект</div></article>
    <article class="metric"><div class="metric-label">Общая готовность</div><div class="metric-value">${esc(data.project.progress)}%</div><div class="progress" style="--progress:${clamp(Number(data.project.progress),0,100)}%"><span></span></div></article>
    <article class="metric"><div class="metric-label">Этапы</div><div class="metric-value">${done} / ${tasks.length}</div><div class="metric-note">завершено</div></article>
    <article class="metric"><div class="metric-label">Просрочено</div><div class="metric-value">${overdue}</div><div class="metric-note">определяется автоматически</div></article>
    <article class="metric"><div class="metric-label">Последнее обновление</div><div class="metric-value" style="font-size:16px">${formatUpdated(data.project.updatedAt)}</div><div class="metric-note">${state.localMode ? "Локальный режим разработки" : "Общие данные Supabase"}</div></article>
  </section>`;
}

function solutionCard(workstream) {
  const data = currentData();
  const tasks = data.tasks.filter(t => t.workstreamId === workstream.id);
  const completion = tasks.length ? tasks.reduce((max,t) => t.endDate > max ? t.endDate : max, tasks[0].endDate) : data.project.endDate;
  return `<article class="solution-card" data-workstream="${esc(workstream.id)}">
    <h3 class="card-name">${state.editing ? input(`workstream.${workstream.id}.name`, workstream.name) : esc(workstream.name)}</h3>
    <p class="card-label">Текущий этап</p>
    <div class="card-stage">${state.editing ? input(`workstream.${workstream.id}.currentStage`, workstream.currentStage) : esc(workstream.currentStage)}</div>
    <div class="card-meta">${state.editing ? select(`workstream.${workstream.id}.status`, workstream.status) : statusBadge(workstream.status)}
      <span class="card-progress">${state.editing ? input(`workstream.${workstream.id}.progress`, workstream.progress, "number", 'min="0" max="100" aria-label="Выполнение, %"') : `${esc(workstream.progress)}%`}</span></div>
    <div class="progress" style="--progress:${clamp(Number(workstream.progress),0,100)}%"><span></span></div>
    <div class="card-date">Плановое завершение: <strong>${fmt(completion)}</strong></div>
  </article>`;
}

function gantt(data) {
  const rows = buildVisibleRows(data, state.collapsed);
  const timelineWidth = inclusiveDays(data.project.startDate, data.project.endDate) * DAY_WIDTH;
  return `<div class="gantt-card">
    <div class="gantt-toolbar">
      <div class="legend"><span class="legend-item"><i class="legend-bar"></i>Этап</span><span class="legend-item"><i class="legend-diamond"></i>Контрольная точка</span><span class="legend-item"><i class="legend-weekend"></i>Выходной</span></div>
      ${state.editing ? `<div><button class="btn btn-secondary btn-sm" data-action="add-task">${icon("plus")}Этап</button> <button class="btn btn-secondary btn-sm" data-action="add-milestone">${icon("plus")}Milestone</button></div>` : ""}
    </div>
    <div class="gantt-scroll" tabindex="0" aria-label="Диаграмма Ганта с горизонтальной прокруткой">
      <div class="gantt">
        <div class="gantt-left"><div class="left-head"><div>Наименование</div><div>Начало</div><div>Окончание</div><div>Статус</div><div>Готово</div></div>${rows.map(rowLeft).join("")}</div>
        <div class="gantt-right" style="width:${timelineWidth}px"><div class="timeline-head">${timelineHeader(data.project)}</div><div class="timeline-body" style="height:${rows.length * 46}px">${dayGrid(data.project, rows.length)}${todayLine(data.project)}${rows.map(r => rowTimeline(r, data.project)).join("")}</div></div>
      </div>
    </div>
  </div>`;
}

function rowLeft(row) {
  const data = currentData();
  const item = row.item;
  let range = { startDate: item.startDate, endDate: item.endDate };
  if (row.type === "workstream") range = groupRange(row.children, data.project.startDate, data.project.endDate);
  const canCollapse = row.type === "project" || row.type === "workstream";
  const expanded = !state.collapsed.has(item.id);
  const status = row.type === "task" || row.type === "milestone" ? effectiveStatus(item) : item.status;
  const editableTask = state.editing && (row.type === "task" || row.type === "milestone");
  const dateBounds = `min="${esc(data.project.startDate)}" max="${esc(data.project.endDate)}"`;
  const name = editableTask ? input(`task.${item.id}.name`, item.name) : `<span class="name-text" title="${esc(item.name)}">${esc(item.name)}</span>`;
  const controls = editableTask ? `<span class="row-actions"><button class="icon-btn" data-action="move-up" data-id="${esc(item.id)}" title="Выше" aria-label="Переместить выше">${icon("up")}</button><button class="icon-btn" data-action="move-down" data-id="${esc(item.id)}" title="Ниже" aria-label="Переместить ниже">${icon("down")}</button><button class="icon-btn danger" data-action="delete-task" data-id="${esc(item.id)}" title="Удалить" aria-label="Удалить">${icon("trash")}</button></span>` : "";
  return `<div class="row-left ${editableTask ? "edit-task-row" : ""}" data-level="${row.level}" data-type="${row.type}">
    <div class="name-cell" style="--level:${row.level}">${canCollapse ? `<button class="collapse" data-action="collapse" data-id="${esc(item.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "Свернуть" : "Развернуть"} группу">${icon("chevron")}</button>` : `<span style="width:30px;flex:0 0 auto"></span>`}${name}${controls}</div>
    <div class="date-cell">${editableTask ? input(`task.${item.id}.startDate`, range.startDate, "date", dateBounds) : fmtShort(range.startDate)}</div>
    <div class="date-cell">${editableTask ? input(`task.${item.id}.endDate`, range.endDate, "date", `${dateBounds}${row.type === "milestone" ? " disabled" : ""}`) : fmtShort(range.endDate)}</div>
    <div>${editableTask ? select(`task.${item.id}.status`, item.status) : statusBadge(status)}</div>
    <div class="percent-cell">${editableTask ? input(`task.${item.id}.progress`, item.progress, "number", 'min="0" max="100"') : `${esc(item.progress)}%`}</div>
  </div>`;
}

function rowTimeline(row, project) {
  const data = currentData();
  let item = row.item;
  let range = { startDate: item.startDate, endDate: item.endDate };
  if (row.type === "workstream") range = groupRange(row.children, project.startDate, project.endDate);
  const left = daysBetween(project.startDate, range.startDate) * DAY_WIDTH;
  const width = inclusiveDays(range.startDate, range.endDate) * DAY_WIDTH;
  let visual = "";
  if (row.type === "milestone") {
    visual = `<div class="milestone ${state.editing ? "editable" : ""}" data-drag-id="${esc(item.id)}" data-drag-mode="milestone" style="left:${left + DAY_WIDTH/2}px" title="${esc(item.name)} · ${fmt(item.startDate)}"></div>`;
  } else {
    const group = row.type === "project" || row.type === "workstream";
    visual = `<div class="bar ${group ? "group" : ""} ${state.editing && !group ? "editable" : ""}" ${!group ? `data-drag-id="${esc(item.id)}" data-drag-mode="move"` : ""} style="left:${left}px;width:${Math.max(width,8)}px;--progress:${clamp(Number(item.progress),0,100)}%" title="${esc(item.name)} · ${fmt(range.startDate)}–${fmt(range.endDate)}">
      ${!group ? `<span class="bar-progress"></span><span class="bar-label">${esc(item.progress)}%</span>${state.editing ? `<i class="resize-handle start" data-drag-id="${esc(item.id)}" data-drag-mode="start"></i><i class="resize-handle end" data-drag-id="${esc(item.id)}" data-drag-mode="end"></i>` : ""}` : ""}
    </div>`;
  }
  return `<div class="row-timeline" data-level="${row.level}" data-type="${row.type}">${visual}</div>`;
}

function timelineHeader(project) {
  const start = parseDate(project.startDate), end = parseDate(project.endDate);
  const months = [], weeks = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const segStart = cursor < start ? start : cursor;
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth()+1, 1));
    const segEnd = next > end ? addDate(end, 1) : next;
    months.push(`<div class="month" style="left:${Math.max(0, Math.round((segStart-start)/86400000))*DAY_WIDTH}px;width:${Math.round((segEnd-segStart)/86400000)*DAY_WIDTH}px">${monthFmt.format(cursor)}</div>`);
    cursor = next;
  }
  cursor = new Date(start);
  while (cursor <= end) {
    const remaining = Math.round((end-cursor)/86400000)+1;
    const days = Math.min(7 - ((cursor.getUTCDay()+6)%7), remaining) || Math.min(7,remaining);
    weeks.push(`<div class="week" style="left:${Math.round((cursor-start)/86400000)*DAY_WIDTH}px;width:${days*DAY_WIDTH}px">${fmtDateShort.format(cursor)}</div>`);
    cursor = new Date(cursor.getTime()+days*86400000);
  }
  return `<div class="month-row">${months.join("")}</div><div class="week-row">${weeks.join("")}</div>`;
}

function dayGrid(project, rowCount) {
  const count = inclusiveDays(project.startDate, project.endDate), start = parseDate(project.startDate);
  return `<div class="grid-days" style="height:${rowCount*46}px">${Array.from({length:count},(_,i) => { const d = new Date(start.getTime()+i*86400000); return `<i class="day ${[0,6].includes(d.getUTCDay()) ? "weekend" : ""}"></i>`; }).join("")}</div>`;
}

function todayLine(project) {
  const today = toISODate(new Date());
  const outside = today < project.startDate || today > project.endDate;
  const left = outside ? 2 : daysBetween(project.startDate, today)*DAY_WIDTH + DAY_WIDTH/2;
  return `<div class="today-line ${outside ? "outside" : ""}" style="left:${left}px"><span>${outside ? "Сегодня — вне периода" : "Сегодня"}</span></div>`;
}

function bindEvents() {
  root.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", handleAction));
  root.querySelectorAll("[data-field]").forEach(el => el.addEventListener("change", handleField));
  root.querySelectorAll("[data-drag-id]").forEach(el => el.addEventListener("pointerdown", startDrag));
  if (state.modal) {
    const first = root.querySelector(".modal input, .modal select");
    first?.focus();
    root.querySelector(".modal-backdrop")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
  }
}

function handleAction(event) {
  const { action, id } = event.currentTarget.dataset;
  if (action === "retry-load") return load();
  if (action === "start-edit") return startEdit();
  if (action === "cancel-edit") { state.editing = false; state.draft = null; render(); return; }
  if (action === "save") return save();
  if (action === "collapse") { state.collapsed.has(id) ? state.collapsed.delete(id) : state.collapsed.add(id); render(); return; }
  if (action === "add-task") return openAdd("task");
  if (action === "add-milestone") return openAdd("milestone");
  if (action === "close-modal") return closeModal();
  if (action === "submit-login") return submitLogin();
  if (action === "submit-add") return submitAdd();
  if (action === "delete-task") return deleteTask(id);
  if (action === "move-up" || action === "move-down") {
    const task = state.draft.tasks.find(t => t.id === id);
    const siblings = state.draft.tasks.filter(t => t.workstreamId === task.workstreamId);
    moveItem(siblings, id, action === "move-up" ? -1 : 1); render();
  }
}

function handleField(event) {
  const path = event.currentTarget.dataset.field.split(".");
  let value = event.currentTarget.value;
  if (path.at(-1) === "progress") value = Math.round(clamp(Number(value) || 0, 0, 100));
  if (path[0] === "project") state.draft.project[path[1]] = value;
  if (path[0] === "workstream") state.draft.workstreams.find(w => w.id === path[1])[path[2]] = value;
  if (path[0] === "task") {
    const task = state.draft.tasks.find(t => t.id === path[1]);
    task[path[2]] = value;
    if (task.type === "milestone" && path[2] === "startDate") task.endDate = value;
  }
  render();
}

async function startEdit() {
  if (state.localMode) {
    state.draft = structuredClone(state.data); state.editing = true; render();
    toast("Локальный режим: изменения сохранятся в этом браузере."); return;
  }
  state.modal = { type: "login", error: "" }; render();
}

async function submitLogin() {
  const password = root.querySelector("#admin-password")?.value || "";
  const button = root.querySelector('[data-action="submit-login"]');
  button.disabled = true; button.textContent = "Проверяем…";
  try {
    const response = await fetch(apiUrl("/auth"), { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({password}) });
    if (!response.ok) throw new Error(response.status === 401 ? "Неверный пароль." : "Не удалось проверить пароль.");
    const body = await response.json();
    if (body.token) {
      state.adminToken = body.token;
      sessionStorage.setItem("ai-agents-admin-token", body.token);
    }
    state.modal = null; state.draft = structuredClone(state.data); state.editing = true; render();
  } catch (error) {
    state.modal.error = error.message; render();
  }
}

function openAdd(type) { state.modal = { type: "add", taskType: type, error: "" }; render(); }
function closeModal() { state.modal = null; render(); }
function renderModal() {
  if (state.modal.type === "login") return `<div class="modal-backdrop" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Режим редактирования</h2><p>Введите административный пароль. Проверка выполняется на сервере.</p><label class="form-group">Пароль<input class="edit-field" id="admin-password" type="password" autocomplete="current-password"></label>${state.modal.error ? `<div class="error" role="alert">${esc(state.modal.error)}</div>` : ""}<div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">Отмена</button><button class="btn btn-primary" data-action="submit-login">Продолжить</button></div></section></div>`;
  const type = state.modal.taskType;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${type === "milestone" ? "Новая контрольная точка" : "Новый этап"}</h2><p>Элемент появится внутри выбранной группы.</p><label class="form-group">Группа<select class="edit-field" id="add-workstream">${state.draft.workstreams.sort((a,b)=>a.order-b.order).map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("")}</select></label><label class="form-group">Название<input class="edit-field" id="add-name"></label><label class="form-group">Дата начала<input class="edit-field" id="add-start" type="date" min="${state.draft.project.startDate}" max="${state.draft.project.endDate}" value="${state.draft.project.startDate}"></label>${type === "task" ? `<label class="form-group">Дата окончания<input class="edit-field" id="add-end" type="date" min="${state.draft.project.startDate}" max="${state.draft.project.endDate}" value="${state.draft.project.startDate}"></label>` : ""}${state.modal.error ? `<div class="error">${esc(state.modal.error)}</div>` : ""}<div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">Отмена</button><button class="btn btn-primary" data-action="submit-add">Добавить</button></div></section></div>`;
}

function submitAdd() {
  const addedType = state.modal.taskType;
  const workstreamId = root.querySelector("#add-workstream").value;
  const name = root.querySelector("#add-name").value.trim();
  const startDate = root.querySelector("#add-start").value;
  const endDate = addedType === "milestone" ? startDate : root.querySelector("#add-end").value;
  if (!name || !startDate || !endDate || startDate > endDate) { state.modal.error = "Заполните название и корректные даты."; render(); return; }
  const siblings = state.draft.tasks.filter(t => t.workstreamId === workstreamId);
  state.draft.tasks.push({ id: crypto.randomUUID(), workstreamId, name, startDate, endDate, status:"Не начато", progress:0, order:siblings.length+1, type:addedType });
  state.modal = null; render(); toast(addedType === "milestone" ? "Контрольная точка добавлена." : "Этап добавлен.");
}

function deleteTask(id) {
  const task = state.draft.tasks.find(t => t.id === id);
  if (!task || !confirm(`Удалить «${task.name}»?`)) return;
  state.draft.tasks = state.draft.tasks.filter(t => t.id !== id);
  state.draft.tasks.filter(t => t.workstreamId === task.workstreamId).sort((a,b)=>a.order-b.order).forEach((t,i)=>t.order=i+1);
  render(); toast("Элемент удалён.");
}

async function save() {
  const errors = validateData(state.draft);
  if (errors.length) { toast(errors[0], "error"); return; }
  const payload = structuredClone(state.draft);
  payload.project.updatedAt = new Date().toISOString();
  try {
    if (state.localMode) localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    else {
      const response = await fetch(apiUrl(""), { method:"PUT", headers:{"Content-Type":"application/json", "Authorization":`Bearer ${state.adminToken}`}, body:JSON.stringify(payload) });
      if (!response.ok) {
        const body = await response.json().catch(()=>({}));
        const message = [body.error, body.detail].filter(Boolean).join(" ");
        throw new Error(message || "Сохранение не выполнено.");
      }
      await response.json();
    }
    state.draft = null; state.editing = false;
    if (state.localMode) {
      state.data = payload; render();
    } else {
      await load();
    }
    toast("Изменения сохранены и доступны всем.", "success");
  } catch (error) { toast(error.message, "error"); }
}

function startDrag(event) {
  if (!state.editing) return;
  event.preventDefault(); event.stopPropagation();
  const el = event.currentTarget, { dragId:id, dragMode:mode } = el.dataset;
  const task = state.draft.tasks.find(t => t.id === id);
  if (!task) return;
  const bar = el.classList.contains("resize-handle") ? el.parentElement : el;
  const originX = event.clientX, original = {startDate:task.startDate, endDate:task.endDate};
  bar.setPointerCapture?.(event.pointerId);
  const move = e => {
    const delta = Math.round((e.clientX-originX)/DAY_WIDTH);
    if (mode === "move") {
      const duration = daysBetween(original.startDate, original.endDate);
      let start = addDays(original.startDate, delta);
      start = start < state.draft.project.startDate ? state.draft.project.startDate : start;
      let end = addDays(start, duration);
      if (end > state.draft.project.endDate) { end = state.draft.project.endDate; start = addDays(end,-duration); }
      task.startDate = start; task.endDate = end;
    } else if (mode === "start") task.startDate = addDays(original.startDate, clamp(delta, daysBetween(original.startDate,state.draft.project.startDate), daysBetween(original.startDate,original.endDate)));
    else if (mode === "end") task.endDate = addDays(original.endDate, clamp(delta, daysBetween(original.endDate,original.startDate), daysBetween(original.endDate,state.draft.project.endDate)));
    else if (mode === "milestone") { const date = addDays(original.startDate, delta); task.startDate = task.endDate = date < state.draft.project.startDate ? state.draft.project.startDate : date > state.draft.project.endDate ? state.draft.project.endDate : date; }
    const left = daysBetween(state.draft.project.startDate, task.startDate)*DAY_WIDTH;
    if (mode === "milestone") bar.style.left = `${left+DAY_WIDTH/2}px`;
    else { bar.style.left = `${left}px`; bar.style.width = `${inclusiveDays(task.startDate,task.endDate)*DAY_WIDTH}px`; }
  };
  const up = () => { window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); render(); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, {once:true});
}

function toast(message, type = "") {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div"); el.className = `toast ${type}`; el.setAttribute("role","status"); el.textContent = message; document.body.append(el);
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(()=>el.remove(), 4200);
}

function fmt(value) { return value ? fmtDate.format(parseDate(value)) : "—"; }
function fmtShort(value) { return value ? fmtDateShort.format(parseDate(value)) : "—"; }
function formatUpdated(value) { try { return fmtDateTime.format(new Date(value)); } catch { return "—"; } }
function addDate(date, days) { return new Date(date.getTime()+days*86400000); }

load();
