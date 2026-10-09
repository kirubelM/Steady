/* ---------- Plan: a page for each day ---------- */

const todayKey = () => dayKey(Date.now());
let planDay = todayKey();

function findTask(id) {
  return data.tasks.find((t) => t.id === id) || null;
}

function tasksFor(day) {
  return data.tasks
    .filter((t) => t.day === day)
    .sort((a, b) => (a.done - b.done) || (a.order - b.order));
}
function todayTasks() { return tasksFor(todayKey()); }
function openTodayTasks() { return todayTasks().filter((t) => !t.done); }

function leftoverTasks() {
  const today = todayKey();
  return data.tasks
    .filter((t) => !t.done && t.day < today && !t.recurId) // repeating tasks come back on their own
    .sort((a, b) => (a.day === b.day ? a.order - b.order : (a.day < b.day ? -1 : 1)));
}

// Link a typed focus to a planned task when the text matches one.
function matchTask(text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return null;
  const t = [...openTodayTasks(), ...leftoverTasks()].find((x) => x.text.trim().toLowerCase() === q);
  return t ? t.id : null;
}

function taskStats(id) {
  const sessions = data.entries.filter((e) => e.type === 'session' && e.taskId === id);
  return { count: sessions.length, sec: sessions.reduce((a, e) => a + (e.focusSec || 0), 0) };
}

function nextOrder(day) {
  const same = data.tasks.filter((t) => t.day === day);
  return same.length ? Math.max(...same.map((t) => t.order)) + 1 : 0;
}

let freshTaskId = null; // the task just added, so it can ease in

async function addTask(text, est = 0, day = todayKey(), projectId = null) {
  freshTaskId = uid();
  data.tasks.push({
    id: freshTaskId, text: text.trim(), day, est: Number(est) || 0, projectId: projectId || null,
    done: false, doneAt: null, createdAt: Date.now(), order: nextOrder(day)
  });
  await persist('tasks');
  renderPlan();
}

async function setTaskDone(id, done) {
  const t = findTask(id);
  if (!t) return;
  t.done = !!done;
  t.doneAt = done ? Date.now() : null;
  // Finishing a leftover counts as today's work.
  if (done && t.day < todayKey()) { t.day = todayKey(); t.order = nextOrder(t.day); }
  await persist('tasks');
  renderPlan();
}

async function moveTask(id, dir) {
  const t = findTask(id);
  if (!t) return;
  const list = tasksFor(t.day).filter((x) => !x.done);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  if (list[i].order === list[j].order) list[j].order += dir; // repair ties from older data
  await persist('tasks');
  renderPlan();
}

// Drag and drop: put task `id` just before or after `targetId` among the day's open tasks.
async function placeTask(id, targetId, after) {
  const t = findTask(id);
  if (!t || id === targetId) return;
  const list = tasksFor(t.day).filter((x) => !x.done && x.id !== id);
  const i = list.findIndex((x) => x.id === targetId);
  if (i < 0) return;
  list.splice(after ? i + 1 : i, 0, t);
  list.forEach((x, n) => { x.order = n; });
  await persist('tasks');
  renderPlan();
}

async function moveToDay(ids, day) {
  ids.forEach((id) => {
    const t = findTask(id);
    if (t) { t.day = day; t.order = nextOrder(day); }
  });
  await persist('tasks');
  renderPlan();
}
const moveToToday = (ids) => moveToDay(ids, todayKey());

async function deleteTask(id) {
  rememberSkip(findTask(id));
  data.tasks = data.tasks.filter((t) => t.id !== id);
  await persist('tasks', 'meta');
  renderPlan();
}

async function parkingToTask(id) {
  const p = data.parking.find((x) => x.id === id);
  if (!p) return;
  await addTask(p.text);
  data.parking = data.parking.filter((x) => x.id !== id);
  await persist('parking');
  renderParking();
  showNudge(`Added "${p.text}" to today's plan.`, 'info', true, { label: 'Open plan', fn: () => { planDay = todayKey(); showTab('plan'); } });
}

function startTask(id) {
  const t = findTask(id);
  if (!t) return;
  if (S.state !== 'idle' && S.state !== 'breakPending') {
    showNudge('Finish or end your current session before starting another.', 'info', true);
    return;
  }
  startFocus({ taskId: t.id, text: t.text });
}

// 0..1 from ticked subtasks, or from sessions against the estimate; null when there's nothing to measure.
function taskProgress(t) {
  const subs = t.subtasks || [];
  if (subs.length) return subs.filter((s) => s.done).length / subs.length;
  if (t.est) return Math.min(1, taskStats(t.id).count / t.est);
  return null;
}

function taskMeta(t) {
  const { count, sec } = taskStats(t.id);
  const parts = [];
  const active = (S.state === 'focus' || S.state === 'paused') && S.taskId === t.id;
  if (active) parts.push('In progress');
  if (!t.est && count) parts.push(plural(count, 'session'));
  if (sec) parts.push(fmtMins(sec));
  if (t.done && t.doneAt) parts.push(`done at ${fmtTime(t.doneAt)}`);
  const r = t.recurId && recurById(t.recurId);
  if (r) parts.push(`↻ ${repeatLabel(r).replace('Repeats ', '')}`);
  return parts.join(', ');
}

/* ---------- Greeting ---------- */

function renderGreeting(isToday, openCount) {
  const el = $('planGreeting');
  el.hidden = !isToday;
  if (!isToday) return;
  const h = new Date().getHours();
  const hello = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const free = typeof freeBlocks === 'function' ? freeBlocks(todayKey()).reduce((a, [s, e]) => a + (e - s), 0) : 0;
  const parts = [];
  if (openCount) parts.push(plural(openCount, 'task'));
  if (free >= 15 * 60000) parts.push(`${fmtMins(free / 1000)} free`);
  el.textContent = parts.length ? `${hello}. ${parts.join(' and ')} today.` : `${hello}.`;
}

/* ---------- At a glance: the day's key numbers above the plan ---------- */

let glanceCountUp = true; // count the numbers up the next time the tiles are drawn

// Numbers in the tiles roll up from zero when the Plan page opens.
function animateGlance() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('glance').querySelectorAll('[data-num]').forEach((el) => {
    const target = Number(el.dataset.num);
    const kind = el.dataset.kind;
    const final = el.textContent;
    const fmt = (n) => kind === 'secs' ? (n >= 60 ? fmtMins(n) : '0 min')
      : kind === 'of' ? `${Math.round(n)} of ${el.dataset.of}`
        : kind === 'days' ? plural(Math.round(n), 'day') : String(Math.round(n));
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 800);
      el.textContent = p < 1 ? fmt(target * (1 - Math.pow(1 - p, 3))) : final;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}


let glanceAt = 0;
let glanceSessions = 0; // sessions the open tasks still need, from renderPlan
let lastGlance = '';

function glanceRing(pct, met) {
  const c = 2 * Math.PI * 20;
  return `<svg class="g-ring${met ? ' met' : ''}" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="20" class="g-ring-track"></circle>
    <circle cx="24" cy="24" r="20" class="g-ring-fill" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}"></circle>
  </svg>`;
}

function glanceTile(label, value, sub, extra = '', num = null) {
  const data = num ? ` data-num="${num.n}" data-kind="${num.kind}"${num.of !== undefined ? ` data-of="${num.of}"` : ''}` : '';
  return `<div class="g-tile">${extra}<div class="g-body">
    <p class="g-label">${esc(label)}</p>
    <p class="g-value"${data}>${esc(value)}</p>
    ${sub ? `<p class="g-sub">${esc(sub)}</p>` : ''}
  </div></div>`;
}

// Called from renderPlan and every second from the timer; does real work at most every 10 s.
function renderGlance(force = false) {
  const box = $('glance');
  const today = todayKey();
  const isToday = planDay === today;
  if (planDay > today) { box.hidden = true; return; }
  if (!force && Date.now() - glanceAt < 10000) return;
  glanceAt = Date.now();

  const tiles = [];
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  const focusSec = isToday ? todayFocusSec() : data.entries
    .filter((e) => e.type === 'session' && dayKey(e.start) === planDay)
    .reduce((a, e) => a + (e.focusSec || 0), 0);
  const pct = goalSec ? Math.min(1, focusSec / goalSec) : 0;
  tiles.push(glanceTile(
    isToday ? 'Focus today' : 'Focus',
    focusSec ? fmtMins(focusSec) : '0 min',
    goalSec ? (focusSec >= goalSec ? 'Goal reached' : `of ${fmtMins(goalSec)} goal`) : '',
    goalSec ? glanceRing(pct, focusSec >= goalSec) : '',
    { n: Math.round(focusSec), kind: 'secs' }
  ));

  const tasks = tasksFor(planDay);
  const doneN = tasks.filter((t) => t.done).length;
  tiles.push(glanceTile(
    'Tasks',
    tasks.length ? `${doneN} of ${tasks.length}` : 'None yet',
    tasks.length
      ? (doneN === tasks.length ? 'All done' : `${tasks.length - doneN} to go${glanceSessions ? `, about ${plural(glanceSessions, 'session')}` : ''}`)
      : 'Add a few below',
    `<div class="g-bar" aria-hidden="true"><span style="width:${tasks.length ? (doneN / tasks.length) * 100 : 0}%"></span></div>`,
    tasks.length ? { n: doneN, kind: 'of', of: tasks.length } : null
  ));

  if (typeof calendarOn === 'function' && calendarOn() && isToday) {
    const now = Date.now();
    const next = eventsOn(today).find((ev) => ev.busy && !ev.allDay && ev.end > now);
    if (next) {
      const mins = Math.round((next.start - now) / 60000);
      tiles.push(glanceTile('Next meeting', next.title,
        next.start <= now ? `Now, until ${fmtTime(next.end)}` : mins < 60 ? `In ${plural(mins, 'min')}` : `At ${fmtTime(next.start)}`));
    } else {
      const free = freeBlocks(today).reduce((a, [s, e]) => a + (e - s), 0);
      tiles.push(glanceTile('Next meeting', 'None left today', free ? `${fmtMins(free / 1000)} free` : ''));
    }
  } else {
    const n = data.entries.filter((e) => e.type === 'session' && dayKey(e.start) === planDay).length;
    tiles.push(glanceTile('Sessions', String(n), n ? 'focus sessions' : 'none yet'));
  }

  if (isToday && typeof computeStreaks === 'function') {
    const st = computeStreaks();
    tiles.push(glanceTile('Streak', plural(st.current, 'day'),
      st.activeToday ? 'Focused today' : st.current ? 'Focus today to keep it going' : 'Start one today', '',
      { n: st.current, kind: 'days' }));
  }

  const html = tiles.join('');
  box.hidden = false;
  if (html !== lastGlance) { lastGlance = html; box.innerHTML = html; }
  if (glanceCountUp) { glanceCountUp = false; animateGlance(); }
}

/* ---------- Subtasks: a checklist inside a task ---------- */

let subAddFor = null; // task whose "Add a subtask" box is open
let subEditing = null; // { taskId, subId } while a subtask is being renamed
let subDrag = null; // { taskId, subId } while a subtask is being dragged

function findSub(taskId, subId) {
  const t = findTask(taskId);
  return t ? (t.subtasks || []).find((s) => s.id === subId) || null : null;
}

function subtaskRow(t, s, canFocus) {
  const editing = subEditing && subEditing.taskId === t.id && subEditing.subId === s.id;
  const focused = (S.state === 'focus' || S.state === 'paused') && S.taskId === t.id && S.subId === s.id;
  return `<li class="sub-row${s.done ? ' done' : ''}${focused ? ' focused' : ''}" draggable="${editing ? 'false' : 'true'}" data-sub-row="${t.id}" data-sub-id="${s.id}">
    <span class="sub-grip" aria-hidden="true" title="Drag to reorder"></span>
    <input type="checkbox" data-sub-done="${t.id}" data-sub-id="${s.id}" ${s.done ? 'checked' : ''} aria-label="Mark ${esc(s.text)} as done">
    ${editing
      ? `<input class="sub-edit" type="text" value="${esc(s.text)}" maxlength="140" data-sub-edit="${t.id}" data-sub-id="${s.id}" aria-label="Rename subtask">`
      : `<button class="sub-text" type="button" data-sub-rename="${t.id}" data-sub-id="${s.id}" title="Click to rename">${esc(s.text)}</button>`}
    ${focused ? '<span class="sub-now">In focus</span>' : ''}
    ${!s.done && canFocus ? `<button class="sub-act" type="button" data-sub-focus="${t.id}" data-sub-id="${s.id}" aria-label="Focus on ${esc(s.text)}" title="Focus on just this">▶</button>` : ''}
    <button class="sub-act del" type="button" data-sub-del="${t.id}" data-sub-id="${s.id}" aria-label="Remove subtask ${esc(s.text)}" title="Remove">×</button>
  </li>`;
}

function subtaskBlock(t, canFocus) {
  const subs = t.subtasks || [];
  const adding = !t.done && subAddFor === t.id;
  if (!subs.length && !adding) return '';
  const done = subs.filter((s) => s.done).length;
  const hidden = !!t.subsHidden && !adding;
  const toggle = subs.length
    ? `<button class="sub-toggle" type="button" data-sub-toggle="${t.id}" aria-expanded="${!hidden}">
        <span class="sub-caret" aria-hidden="true"></span>${hidden
          ? `Show ${plural(subs.length, 'subtask')}`
          : 'Hide subtasks'}<span class="sub-count">${done}/${subs.length}</span></button>`
    : '';
  if (hidden) return `<div class="subtasks">${toggle}</div>`;
  const add = t.done ? '' : adding
    ? `<form class="subtask-add" data-sub-add="${t.id}"><input type="text" maxlength="140" placeholder="Add a subtask and press Enter" aria-label="Add a subtask to ${esc(t.text)}" autocomplete="off"></form>`
    : `<button class="link sub-add-link" type="button" data-sub-new="${t.id}">+ Add subtask</button>`;
  return `<div class="subtasks">${toggle}
    <ul class="subtask-list">${subs.map((s) => subtaskRow(t, s, canFocus)).join('')}</ul>
    ${add}
  </div>`;
}

async function addSubtask(id, text) {
  const t = findTask(id);
  const clean = String(text || '').trim();
  if (!t || !clean) return;
  t.subtasks = [...(t.subtasks || []), { id: uid(), text: clean, done: false }];
  await persist('tasks');
  renderPlan();
}

async function updateSubtasks(id, fn) {
  const t = findTask(id);
  if (!t) return;
  fn(t);
  await persist('tasks');
  renderPlan();
  renderFocusSubs(true);
}

async function setSubtaskDone(taskId, subId, done) {
  const t = findTask(taskId);
  const s = findSub(taskId, subId);
  if (!t || !s) return;
  s.done = !!done;
  await updateSubtasks(taskId, () => {});
  const subs = t.subtasks || [];
  if (done && !t.done && subs.length > 1 && subs.every((x) => x.done)) {
    showNudge(`All subtasks of "${t.text}" are done.`, 'info', true, { label: 'Mark task done', fn: () => setTaskDone(t.id, true) });
  }
}

function startSubtask(taskId, subId) {
  const t = findTask(taskId);
  const s = findSub(taskId, subId);
  if (!t || !s) return;
  if (S.state !== 'idle' && S.state !== 'breakPending') {
    showNudge('Finish or end your current session before starting another.', 'info', true);
    return;
  }
  startFocus({ taskId: t.id, subId: s.id, text: `${t.text}: ${s.text}` });
}

async function finishRename(input, save) {
  const { subEdit: taskId, subId } = input.dataset;
  subEditing = null;
  const text = input.value.trim();
  if (save && text) await updateSubtasks(taskId, () => { findSub(taskId, subId).text = text; });
  else renderPlan();
}

/* The checklist under the timer while you focus on a task that has subtasks. */
let lastFocusSubs = '';
function renderFocusSubs(force = false) {
  const box = $('focusSubs');
  if (!box) return;
  const inSession = S.state === 'focus' || S.state === 'paused';
  const t = inSession && S.taskId ? findTask(S.taskId) : null;
  const subs = (t && t.subtasks) || [];
  const key = inSession && subs.length ? `${t.id}|${S.subId}|${subs.map((s) => s.id + s.done + s.text).join(',')}` : '';
  if (!force && key === lastFocusSubs) return;
  lastFocusSubs = key;
  box.hidden = !key;
  if (!key) { box.innerHTML = ''; return; }
  const done = subs.filter((s) => s.done).length;
  box.innerHTML = `<p class="focus-subs-head">Subtasks <span>${done} of ${subs.length} done</span></p>
    <ul>${subs.map((s) => `<li class="${s.done ? 'done' : ''}${s.id === S.subId ? ' current' : ''}">
      <label><input type="checkbox" data-fsub="${s.id}" ${s.done ? 'checked' : ''}><span>${esc(s.text)}</span></label>
    </li>`).join('')}</ul>`;
}

function bindSubtasks() {
  const list = $('taskList');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { subId } = b.dataset;
    if (b.dataset.subNew) {
      subAddFor = b.dataset.subNew;
      updateSubtasks(subAddFor, (t) => { t.subsHidden = false; });
    } else if (b.dataset.subToggle) {
      subAddFor = null;
      updateSubtasks(b.dataset.subToggle, (t) => { t.subsHidden = !t.subsHidden; });
    } else if (b.dataset.subDel) {
      updateSubtasks(b.dataset.subDel, (t) => { t.subtasks = t.subtasks.filter((s) => s.id !== subId); });
    } else if (b.dataset.subFocus) {
      startSubtask(b.dataset.subFocus, subId);
    } else if (b.dataset.subRename) {
      subEditing = { taskId: b.dataset.subRename, subId };
      renderPlan();
      const input = list.querySelector('.sub-edit');
      if (input) { input.focus(); input.select(); }
    }
  });
  list.addEventListener('change', (e) => {
    const { subDone, subId } = e.target.dataset || {};
    if (subDone) setSubtaskDone(subDone, subId, e.target.checked);
  });
  list.addEventListener('submit', (e) => {
    const id = e.target.dataset?.subAdd;
    if (!id) return;
    e.preventDefault();
    const input = e.target.querySelector('input');
    const text = input.value;
    input.value = '';
    subAddFor = id; // keep the box open for the next one
    addSubtask(id, text);
  });
  list.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('sub-edit')) {
      if (e.key === 'Enter') { e.preventDefault(); finishRename(e.target, true); }
      if (e.key === 'Escape') { e.preventDefault(); finishRename(e.target, false); }
      return;
    }
    if (e.key === 'Escape' && e.target.closest('[data-sub-add]')) { subAddFor = null; renderPlan(); }
  });
  list.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('sub-edit') && subEditing) { finishRename(e.target, true); return; }
    const form = e.target.closest('[data-sub-add]');
    // Close an empty add box once you click elsewhere.
    if (form && !e.target.value.trim() && subAddFor === form.dataset.subAdd) {
      setTimeout(() => {
        if (subAddFor === form.dataset.subAdd && !document.activeElement?.closest('[data-sub-add]')) { subAddFor = null; renderPlan(); }
      }, 150);
    }
  });

  // Drag a subtask within its task to reorder.
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-sub-row]');
    if (!row) return;
    subDrag = { taskId: row.dataset.subRow, subId: row.dataset.subId };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.subId);
    row.classList.add('dragging');
  });
  list.addEventListener('dragover', (e) => {
    const row = e.target.closest?.('[data-sub-row]');
    if (!subDrag || !row || row.dataset.subRow !== subDrag.taskId) return;
    e.preventDefault();
    list.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  list.addEventListener('drop', (e) => {
    const row = e.target.closest?.('[data-sub-row]');
    if (!subDrag || !row || row.dataset.subRow !== subDrag.taskId) return;
    e.preventDefault();
    const before = row.classList.contains('drop-before');
    const { taskId, subId } = subDrag;
    const targetId = row.dataset.subId;
    subDrag = null;
    if (targetId === subId) { renderPlan(); return; }
    updateSubtasks(taskId, (t) => {
      const moving = t.subtasks.find((s) => s.id === subId);
      const rest = t.subtasks.filter((s) => s.id !== subId);
      const i = rest.findIndex((s) => s.id === targetId);
      rest.splice(before ? i : i + 1, 0, moving);
      t.subtasks = rest;
    });
  });
  list.addEventListener('dragend', () => {
    subDrag = null;
    list.querySelectorAll('.dragging, .drop-before, .drop-after').forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  $('focusSubs').addEventListener('change', (e) => {
    const subId = e.target.dataset?.fsub;
    if (subId && S.taskId) setSubtaskDone(S.taskId, subId, e.target.checked);
  });
}

/* ---------- Done list: finished tasks plus everything logged that day ---------- */

function doneItems(day) {
  const groups = new Map();
  const keyOf = (text) => text.trim().toLowerCase();

  data.entries
    .filter((e) => dayKey(e.start) === day && ['session', 'checkin', 'manual'].includes(e.type) && e.note)
    .sort((a, b) => a.start - b.start)
    .forEach((e) => {
      const k = keyOf(e.note);
      const g = groups.get(k) || { text: e.note.trim(), sec: 0, sessions: 0, manual: [], first: e.start, projectId: null, taskDone: null };
      g.sec += workSec(e);
      if (e.type === 'session') g.sessions++;
      if (e.type === 'manual') g.manual.push(e);
      g.projectId = g.projectId || e.projectId || null;
      groups.set(k, g);
    });

  data.tasks
    .filter((t) => t.done && t.doneAt && dayKey(t.doneAt) === day)
    .forEach((t) => {
      const k = keyOf(t.text);
      const g = groups.get(k) || { text: t.text, sec: 0, sessions: 0, manual: [], first: t.doneAt, projectId: null, taskDone: null };
      g.taskDone = t;
      g.projectId = g.projectId || t.projectId || null;
      groups.set(k, g);
    });

  return [...groups.values()].sort((a, b) => a.first - b.first);
}

async function addDoneItem(text, minutes, projectId, day) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  let end;
  if (day === todayKey()) end = Date.now();
  else end = new Date(day + 'T12:00').getTime() + mins * 60000;
  data.entries.push({
    id: uid(), type: 'manual', start: end - mins * 60000, end, note: text.trim(), projectId: projectId || null
  });
  await persist('entries');
  renderPlan();
  renderLog();
}

/* ---------- Rendering ---------- */

function dayTitle(day) {
  const today = todayKey();
  if (day === today) return 'Today';
  if (day === shiftKey(today, 1)) return 'Tomorrow';
  if (day === shiftKey(today, -1)) return 'Yesterday';
  return new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long' });
}

function renderPlan() {
  const today = todayKey();
  const isToday = planDay === today;
  const isFuture = planDay > today;
  let made = materializeDay(today);
  if (isFuture && planDay <= shiftKey(today, RECUR_AHEAD_DAYS)) made = materializeDay(planDay) || made;
  if (made) persist('tasks', 'meta');
  const tasks = tasksFor(planDay);
  const open = tasks.filter((t) => !t.done);
  const canFocus = isToday && (S.state === 'idle' || S.state === 'breakPending');

  $('planTitle').textContent = dayTitle(planDay);
  renderGreeting(isToday, open.length);
  $('planDate').textContent = new Date(planDay + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('planToday').hidden = isToday;
  $('reviewBtn').hidden = isFuture;
  $('taskInput').placeholder = isToday ? 'Add a task for today' : isFuture ? `Add a task for ${dayTitle(planDay).toLowerCase()}` : 'Add a task for this day';

  const note = data.meta.tomorrowNote;
  const showNote = !!(note && note.forDay === planDay && note.text);
  $('tomorrowNote').hidden = !showNote;
  if (showNote) {
    $('tomorrowNoteLabel').textContent = isToday ? 'Your note from yesterday:' : 'Your note for this day:';
    $('tomorrowNoteText').textContent = note.text;
  }

  const estLeft = open.reduce((a, t) => a + Math.max(0, (t.est || 0) - taskStats(t.id).count), 0);
  const presetMin = currentPreset().focusMin;
  const realistic = typeof realisticSessions === 'function' ? realisticSessions(open) : null;
  let summary = '';
  if (tasks.length) {
    summary = `${tasks.length - open.length} of ${tasks.length} done.`;
    if (estLeft) summary += ` About ${plural(estLeft, 'session')} left, roughly ${fmtMins(estLeft * presetMin * 60)}.`;
    if (realistic && realistic.sessions > estLeft) {
      summary += ` Going by your past estimates, plan for about ${realistic.sessions}.`;
    }
  }
  $('planSummary').textContent = isFuture ? summary : '';
  glanceSessions = realistic && realistic.sessions > estLeft ? realistic.sessions : estLeft;
  if (typeof renderSchedule === 'function') renderSchedule(planDay, realistic ? realistic.sessions : estLeft);
  renderGlance(true);
  if (typeof renderProjectGoals === 'function') renderProjectGoals();

  const typedSub = subAddFor ? document.querySelector(`[data-sub-add="${subAddFor}"] input`)?.value || '' : '';
  const shown = viewTasks(tasks);
  const dragOk = taskView.sort === 'manual' && taskView.project === 'all';
  renderTaskView(tasks, shown);
  $('taskList').innerHTML = shown.length
    ? shown.map((t) => {
      const meta = taskMeta(t);
      const color = projectById(t.projectId)?.color;
      const progress = taskProgress(t);
      const movable = dragOk && !t.done && open.length > 1;
      return `<li class="task${t.done ? ' done' : ''}${t.id === freshTaskId ? ' fresh' : ''}"${color ? ` style="--pc:${color}"` : ''} data-task-row="${t.id}"${movable ? ' draggable="true"' : ''}>
        ${movable ? '<span class="task-grip" aria-hidden="true" title="Drag to reorder (or Alt+↑ / Alt+↓)"></span>' : ''}
        <input type="checkbox" data-task-done="${t.id}" ${t.done ? 'checked' : ''} aria-label="Mark ${esc(t.text)} as done">
        <button class="task-main" type="button" data-task-edit="${t.id}" title="Edit task">
          <span class="task-text">${esc(t.text)}</span>
          <span class="task-meta">${projectChip(t.projectId)}${meta ? `<span>${esc(meta)}</span>` : ''}</span>
          ${progress !== null && !t.done ? `<span class="task-progress" aria-hidden="true"><span style="width:${(progress * 100).toFixed(0)}%"></span></span>` : ''}
        </button>
        <div class="task-actions">
          ${t.done ? '' : `${(t.subtasks || []).length ? '' : `<button class="icon-btn small" type="button" data-sub-new="${t.id}" aria-label="Add a subtask to ${esc(t.text)}" title="Add subtask">+</button>`}
          ${isToday ? `<button class="btn small" type="button" data-task-start="${t.id}" ${canFocus ? '' : 'disabled'}>Focus</button>` : ''}`}
        </div>
        ${subtaskBlock(t, canFocus)}
      </li>`;
    }).join('')
    : tasks.length
      ? '<li class="empty">No tasks match. <button class="link" type="button" data-view-reset>Show all tasks</button></li>'
      : `<li class="empty">${isFuture ? 'Nothing planned yet.' : isToday ? 'No tasks yet. Add the few things that would make today a good day.' : 'No tasks were planned for this day.'}</li>`;

  freshTaskId = null;

  const left = isToday ? leftoverTasks() : [];
  $('leftoverSection').hidden = !left.length;
  $('leftoverList').innerHTML = left.map((t) => {
    const from = new Date(t.day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `<li class="task leftover">
      <button class="task-main" type="button" data-task-edit="${t.id}" title="Edit task">
        <span class="task-text">${esc(t.text)}</span>
        <span class="task-meta">${projectChip(t.projectId)}<span>Planned for ${esc(from)}</span></span>
      </button>
      <div class="task-actions">
        <button class="btn small" type="button" data-task-today="${t.id}">Move to today</button>
      </div>
    </li>`;
  }).join('');

  // Done list
  $('doneSection').hidden = isFuture;
  if (!isFuture) {
    const items = doneItems(planDay);
    const total = items.reduce((a, g) => a + g.sec, 0);
    $('doneSummary').textContent = items.length ? `${plural(items.length, 'thing')}${total ? `, ${fmtMins(total)} logged` : ''}.` : '';
    $('doneList').innerHTML = items.length
      ? items.map((g) => {
        const meta = [];
        if (g.taskDone) meta.push(`Task finished at ${fmtTime(g.taskDone.doneAt)}`);
        if (g.sessions) meta.push(plural(g.sessions, 'focus session'));
        if (g.manual.length && !g.sessions) meta.push(g.manual.length > 1 ? `Added ${g.manual.length} times` : `Added at ${fmtTime(g.manual[0].end)}`);
        const editable = g.manual.length === 1 && !g.sessions;
        const color = projectById(g.projectId)?.color;
        return `<li class="done-item${g.taskDone ? ' is-task' : ''}"${color ? ` style="--pc:${color}"` : ''}>
          <span class="done-mark" aria-hidden="true">${g.taskDone ? '✓' : '•'}</span>
          ${editable
            ? `<button class="task-main" type="button" data-entry-edit="${g.manual[0].id}" title="Edit">`
            : '<div class="task-main">'}
            <span class="task-text">${esc(g.text)}</span>
            <span class="task-meta">${projectChip(g.projectId)}<span>${esc(meta.join(', '))}</span></span>
          ${editable ? '</button>' : '</div>'}
          <span class="done-time">${g.sec ? fmtMins(Math.max(60, g.sec)) : ''}</span>
        </li>`;
      }).join('')
      : `<li class="empty">${isToday ? 'Nothing yet. Finished sessions, completed tasks and anything you add here show up in this list.' : 'Nothing was logged on this day.'}</li>`;
  }

  $('doneForm').hidden = !doneFormOpen;
  $('doneOpen').hidden = doneFormOpen;

  // Notes for the day (don't overwrite while typing)
  if (document.activeElement !== $('dayNotes') || $('dayNotes').dataset.day !== planDay) {
    $('dayNotes').value = (data.notes && data.notes[planDay]) || '';
    $('dayNotes').dataset.day = planDay;
  }
  $('notesSaved').textContent = '';

  if (subAddFor) {
    const input = document.querySelector(`[data-sub-add="${subAddFor}"] input`);
    if (input) { input.value = typedSub; input.focus(); }
  }

  $('taskOptions').innerHTML = [...openTodayTasks(), ...leftoverTasks()].map((t) => `<option value="${esc(t.text)}"></option>`).join('');
  if (tasks.length && isToday && $('nudge').dataset.kind === 'plan') hideNudge();
  lastNextUp = null;
  renderNextUp();
}

let doneFormOpen = false;

let lastNextUp = null;
function renderNextUp() {
  const next = S.state === 'idle' && !$('task').value.trim() ? openTodayTasks()[0] : null;
  const label = next ? next.id + next.text : '';
  if (label === lastNextUp) return;
  lastNextUp = label;
  $('nextUp').hidden = !next;
  if (next) {
    $('nextUpBtn').textContent = next.text;
    $('nextUpBtn').dataset.taskId = next.id;
    $('nextUpBtn').title = 'Start focusing on this';
  }
}

async function maybeNudgePlan() {
  const today = todayKey();
  if (data.meta.planNudgeDay === today || todayTasks().length) return;
  data.meta.planNudgeDay = today;
  await persist('meta');
  const left = leftoverTasks().length;
  showNudge(
    left
      ? `Plan your day. You have ${plural(left, 'unfinished task')} from before.`
      : 'Plan your day: add the few things you want to get done.',
    'info', false, { label: 'Open plan', fn: () => { planDay = todayKey(); showTab('plan'); } }
  );
  $('nudge').dataset.kind = 'plan';
}

/* ---------- Filtering and sorting the To do list ---------- */

const TASK_SORTS = [
  ['manual', 'My order'], ['project', 'Project'], ['left', 'Most sessions left'],
  ['progress', 'Least progress'], ['name', 'Name A–Z'], ['newest', 'Newest first']
];
const taskView = { project: 'all', sort: 'manual', hideDone: false };
try { Object.assign(taskView, JSON.parse(localStorage.getItem('taskView') || '{}')); } catch { /* storage unavailable */ }

function saveTaskView() {
  try { localStorage.setItem('taskView', JSON.stringify(taskView)); } catch { /* storage unavailable */ }
}

function sessionsLeft(t) {
  return t.est ? Math.max(0, t.est - taskStats(t.id).count) : 0;
}

// The day's tasks as the To do list shows them: filtered, sorted, open ones first.
function viewTasks(tasks) {
  let list = tasks;
  if (taskView.project === 'none') list = list.filter((t) => !t.projectId);
  else if (taskView.project !== 'all') list = list.filter((t) => t.projectId === taskView.project);
  if (taskView.hideDone) list = list.filter((t) => !t.done);
  const byName = (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  const cmp = {
    manual: () => 0,
    project: (a, b) => (projectName(a.projectId) || '￿').localeCompare(projectName(b.projectId) || '￿'),
    left: (a, b) => sessionsLeft(b) - sessionsLeft(a),
    progress: (a, b) => (taskProgress(a) ?? 0) - (taskProgress(b) ?? 0),
    name: byName,
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  }[taskView.sort] || (() => 0);
  // tasksFor() already gives open-then-done in your order; a stable sort keeps that as the tie-breaker.
  return list.slice().sort((a, b) => (a.done - b.done) || cmp(a, b));
}

function renderTaskView(tasks, shown) {
  const box = $('taskView');
  box.hidden = tasks.length < 2 && taskView.project === 'all' && !taskView.hideDone;
  if (box.hidden) return;
  const used = new Set(tasks.map((t) => t.projectId || 'none'));
  const projects = activeProjects().filter((p) => used.has(p.id) || p.id === taskView.project);
  $('taskFilter').innerHTML = `<option value="all">All projects</option>` +
    projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') +
    (used.has('none') || taskView.project === 'none' ? '<option value="none">No project</option>' : '');
  $('taskFilter').value = taskView.project;
  if ($('taskFilter').value !== taskView.project) { taskView.project = 'all'; $('taskFilter').value = 'all'; }
  $('taskSort').innerHTML = TASK_SORTS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  $('taskSort').value = taskView.sort;
  $('taskHideDone').checked = taskView.hideDone;
  const hidden = tasks.length - shown.length;
  const notes = [];
  if (hidden) notes.push(`${plural(hidden, 'task')} hidden`);
  if (taskView.sort !== 'manual' || taskView.project !== 'all') notes.push('Switch to My order and All projects to drag');
  $('taskViewNote').innerHTML = notes.length
    ? `${esc(notes.join('. '))}. <button class="link" type="button" data-view-reset>Reset</button>`
    : '';
  $('taskViewNote').hidden = !notes.length;
}

function bindTaskView() {
  const changed = () => { saveTaskView(); renderPlan(); };
  $('taskFilter').addEventListener('change', (e) => { taskView.project = e.target.value; changed(); });
  $('taskSort').addEventListener('change', (e) => { taskView.sort = e.target.value; changed(); });
  $('taskHideDone').addEventListener('change', (e) => { taskView.hideDone = e.target.checked; changed(); });
  document.querySelector('#taskList').closest('.plan-section').addEventListener('click', (e) => {
    if (!e.target.closest('[data-view-reset]')) return;
    Object.assign(taskView, { project: 'all', sort: 'manual', hideDone: false });
    changed();
  });
}

/* ---------- Reordering tasks: drag a row, or Alt+Up / Alt+Down ---------- */

function bindTaskDrag() {
  const list = $('taskList');
  let dragId = null;
  const clearDrop = () => list.querySelectorAll('.drop-before, .drop-after')
    .forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  const targetRow = (e) => e.target.closest?.('[data-task-row][draggable="true"]');

  list.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('[data-sub-row]')) return; // a subtask is being dragged
    const row = e.target.closest?.('[data-task-row]');
    if (!row || row.getAttribute('draggable') !== 'true') return;
    dragId = row.dataset.taskRow;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  list.addEventListener('dragover', (e) => {
    const row = dragId && targetRow(e);
    if (!row) return;
    e.preventDefault();
    clearDrop();
    if (row.dataset.taskRow === dragId) return;
    // Judge by the task's own line, not its subtasks, so tall rows behave.
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + Math.min(r.height / 2, 28) ? 'drop-before' : 'drop-after');
  });
  list.addEventListener('drop', (e) => {
    const row = dragId && targetRow(e);
    if (!row) return;
    e.preventDefault();
    const after = row.classList.contains('drop-after');
    const id = dragId;
    dragId = null;
    clearDrop();
    placeTask(id, row.dataset.taskRow, after);
  });
  list.addEventListener('dragend', () => {
    dragId = null;
    clearDrop();
    list.querySelectorAll('.task.dragging').forEach((r) => r.classList.remove('dragging'));
  });

  list.addEventListener('keydown', async (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const row = e.target.closest('[data-task-row]');
    if (!row || e.target.matches('input[type="text"]') || row.getAttribute('draggable') !== 'true') return;
    e.preventDefault();
    const id = row.dataset.taskRow;
    await moveTask(id, e.key === 'ArrowUp' ? -1 : 1);
    list.querySelector(`[data-task-edit="${id}"]`)?.focus();
  });
}

/* ---------- Task editor ---------- */

let editingTaskId = null;
let editingSubs = []; // working copy, saved with the task

function renderSubEditor() {
  $('taskEditSubs').innerHTML = editingSubs.map((s, i) => `<li>
      <input type="checkbox" data-esub-done="${i}" ${s.done ? 'checked' : ''} aria-label="Done">
      <input type="text" value="${esc(s.text)}" data-esub-text="${i}" maxlength="140" aria-label="Subtask">
      <button class="del" type="button" data-esub-del="${i}" aria-label="Remove subtask">×</button>
    </li>`).join('');
}

function addSubFromEditor() {
  const text = $('taskEditSubInput').value.trim();
  if (!text) return;
  editingSubs.push({ id: uid(), text, done: false });
  $('taskEditSubInput').value = '';
  renderSubEditor();
  $('taskEditSubInput').focus();
}

function openTaskDialog(id) {
  const t = findTask(id);
  if (!t) return;
  editingTaskId = id;
  $('taskEditText').value = t.text;
  $('taskEditProject').innerHTML = projectOptions(t.projectId);
  $('taskEditEst').value = String(t.est || 0);
  if (![...$('taskEditEst').options].some((o) => o.value === String(t.est || 0))) $('taskEditEst').value = '0';
  $('taskEditDay').value = t.day;
  $('taskEditPreset').innerHTML = '<option value="">Whatever is selected</option>' + settings.presets
    .map((p) => `<option value="${p.id}" ${p.id === t.presetId ? 'selected' : ''}>${esc(p.name)} (${p.focusMin} min)</option>`).join('');
  $('taskEditDone').checked = !!t.done;
  const r = recurById(t.recurId);
  $('taskEditRepeat').innerHTML = REPEAT_OPTIONS.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
  $('taskEditRepeat').value = r ? r.freq : '';
  editingSubs = (t.subtasks || []).map((x) => ({ ...x }));
  $('taskEditSubInput').value = '';
  renderSubEditor();
  $('taskDialog').showModal();
  $('taskEditText').focus();
}

async function saveTaskDialog() {
  const t = findTask(editingTaskId);
  if (!t) return $('taskDialog').close();
  const text = $('taskEditText').value.trim();
  if (!text) { $('taskEditText').focus(); return; }
  t.text = text;
  t.projectId = $('taskEditProject').value || null;
  t.est = Number($('taskEditEst').value) || 0;
  t.presetId = $('taskEditPreset').value || null;
  const day = $('taskEditDay').value;
  if (day && day !== t.day) { t.day = day; t.order = nextOrder(day); }
  const done = $('taskEditDone').checked;
  if (done !== t.done) { t.done = done; t.doneAt = done ? Date.now() : null; }
  if ($('taskEditSubInput').value.trim()) addSubFromEditor(); // typed but not added yet
  t.subtasks = editingSubs.filter((x) => x.text.trim());
  const freq = $('taskEditRepeat').value;
  if (freq || t.recurId) await setRepeat(t, freq);
  await persist('tasks');
  renderRecurringSettings();
  $('taskDialog').close();
  renderPlan();
}

/* ---------- Events ---------- */

function bindPlan() {
  $('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('taskInput').value.trim();
    if (!text) return;
    addTask(text, $('taskEst').value, planDay, $('taskProject').value || null);
    $('taskInput').value = '';
    $('taskEst').value = '0';
    $('taskInput').focus();
  });

  $('doneOpen').addEventListener('click', () => {
    doneFormOpen = true;
    renderPlan();
    $('doneInput').focus();
  });
  $('doneForm').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { doneFormOpen = false; renderPlan(); }
  });
  $('doneForm').addEventListener('focusout', () => {
    // Fold the form away again once you leave it empty.
    setTimeout(() => {
      if (!$('doneForm').contains(document.activeElement) && !$('doneInput').value.trim() && !$('doneMinutes').value) {
        doneFormOpen = false;
        renderPlan();
      }
    }, 150);
  });
  $('doneForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('doneInput').value.trim();
    if (!text) return;
    addDoneItem(text, $('doneMinutes').value, $('doneProject').value, planDay);
    $('doneInput').value = '';
    $('doneMinutes').value = '';
    $('doneInput').focus();
  });

  const onListClick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.taskStart) startTask(b.dataset.taskStart);
    else if (b.dataset.taskToday) moveToToday([b.dataset.taskToday]);
    else if (b.dataset.taskEdit) openTaskDialog(b.dataset.taskEdit);
    else if (b.dataset.entryEdit) openEntryDialog(b.dataset.entryEdit);
  };
  $('taskList').addEventListener('click', onListClick);
  $('leftoverList').addEventListener('click', onListClick);
  $('doneList').addEventListener('click', onListClick);
  $('taskList').addEventListener('change', (e) => {
    const id = e.target.dataset?.taskDone;
    if (!id) return;
    const row = e.target.closest('.task');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (e.target.checked && row && !reduce) {
      row.classList.add('completing');
      setTimeout(() => setTaskDone(id, true), 650);
    } else {
      setTaskDone(id, e.target.checked);
    }
  });
  bindSubtasks();
  bindTaskDrag();
  bindTaskView();
  $('moveAllBtn').addEventListener('click', () => moveToToday(leftoverTasks().map((t) => t.id)));
  $('dismissNote').addEventListener('click', async () => {
    data.meta.tomorrowNote = null;
    await persist('meta');
    renderPlan();
  });

  $('planPrev').addEventListener('click', () => { planDay = shiftKey(planDay, -1); renderPlan(); ensureCalendarFor(planDay); });
  $('planNext').addEventListener('click', () => { planDay = shiftKey(planDay, 1); renderPlan(); ensureCalendarFor(planDay); });
  $('planToday').addEventListener('click', () => { planDay = todayKey(); renderPlan(); });

  let notesTimer = null;
  $('dayNotes').addEventListener('input', () => {
    const day = $('dayNotes').dataset.day || planDay;
    clearTimeout(notesTimer);
    $('notesSaved').textContent = '';
    notesTimer = setTimeout(async () => {
      const text = $('dayNotes').value;
      if (text.trim()) data.notes[day] = text;
      else delete data.notes[day];
      await persist('notes');
      $('notesSaved').textContent = 'Saved';
    }, 700);
  });

  $('taskEditSave').addEventListener('click', saveTaskDialog);
  $('taskEditCancel').addEventListener('click', () => $('taskDialog').close());
  $('taskEditDelete').addEventListener('click', async () => {
    await deleteTask(editingTaskId);
    $('taskDialog').close();
  });
  $('taskEditText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveTaskDialog(); } });
  $('taskEditSubAdd').addEventListener('click', addSubFromEditor);
  $('taskEditSubInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSubFromEditor(); } });
  $('taskEditSubs').addEventListener('click', (e) => {
    const i = e.target.closest('[data-esub-del]')?.dataset.esubDel;
    if (i === undefined) return;
    editingSubs.splice(Number(i), 1);
    renderSubEditor();
  });
  $('taskEditSubs').addEventListener('input', (e) => {
    const { esubText, esubDone } = e.target.dataset;
    if (esubText !== undefined) editingSubs[Number(esubText)].text = e.target.value;
    if (esubDone !== undefined) editingSubs[Number(esubDone)].done = e.target.checked;
  });
  $('taskEditSubs').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.esubText !== undefined) { e.preventDefault(); $('taskEditSubInput').focus(); }
  });

  const showEstHint = () => {
    const est = Number($('taskEst').value);
    const hint = est ? estimateHint($('taskProject').value || null) : '';
    $('estHint').textContent = hint;
    $('estHint').hidden = !hint;
  };
  $('taskEst').addEventListener('change', showEstHint);
  $('taskProject').addEventListener('change', showEstHint);
  $('taskForm').addEventListener('submit', () => setTimeout(showEstHint, 0));

  $('nextUpBtn').addEventListener('click', () => {
    const id = $('nextUpBtn').dataset.taskId;
    if (id) startTask(id);
  });
  $('task').addEventListener('input', renderNextUp);
}
