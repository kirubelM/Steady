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

const LEFTOVER_SORTS = { oldest: 'Oldest first', newest: 'Newest first', project: 'By project', az: 'A to Z' };
let leftoverSort = 'oldest';
try { leftoverSort = localStorage.getItem('leftoverSort') || 'oldest'; } catch { /* storage unavailable */ }
if (!LEFTOVER_SORTS[leftoverSort]) leftoverSort = 'oldest';

function sortLeftovers(list) {
  const name = (t) => projectName(t.projectId).toLowerCase();
  const by = {
    oldest: (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order),
    newest: (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.order - b.order),
    project: (a, b) => (!name(a) - !name(b)) || name(a).localeCompare(name(b)) || (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order),
    az: (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
  }[leftoverSort];
  return list.slice().sort(by);
}

// "3 days ago" for a day key before today.
function ageLabel(day) {
  const n = Math.round((new Date(todayKey() + 'T12:00') - new Date(day + 'T12:00')) / 86400000);
  return n === 1 ? 'yesterday' : `${n} days ago`;
}

let freshTaskId = null; // the task just added, so it can ease in

async function addTask(text, est = 0, day = todayKey(), projectId = null) {
  const id = uid();
  freshTaskId = id;
  data.tasks.push({
    id, text: text.trim(), day, est: Number(est) || 0, projectId: projectId || null,
    done: false, doneAt: null, createdAt: Date.now(), order: nextOrder(day)
  });
  await persist('tasks');
  renderPlan();
  return id;
}

async function setTaskDone(id, done) {
  const t = findTask(id);
  if (!t) return;
  if (done && !t.done && typeof playChime === 'function') playChime('task');
  t.done = !!done;
  t.doneAt = done ? Date.now() : null;
  // Finishing a leftover counts as today's work.
  if (done && t.day < todayKey()) { t.day = todayKey(); t.order = nextOrder(t.day); }
  await persist('tasks');
  renderPlan();
}

// The day's open tasks as "My order" shows them: starred and urgent ones first, then your order.
function openInOrder(day) {
  return tasksFor(day).filter((x) => !x.done).sort((a, b) => floatsUp(b) - floatsUp(a));
}

// Saves `list` as the day's order. Says so when a starred or urgent task keeps its place at the top.
async function saveOrder(list, t, want) {
  list.forEach((x, n) => { x.order = n; });
  await persist('tasks');
  renderPlan();
  if (openInOrder(t.day).indexOf(t) !== want) {
    showNudge('Starred and due tasks stay at the top of the list. Unstar a task to move it below the others.', 'info', true);
  }
}

async function moveTask(id, dir) {
  const t = findTask(id);
  if (!t) return;
  const list = openInOrder(t.day);
  const i = list.indexOf(t);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveOrder(list, t, j);
}

// Drag and drop: put task `id` just before or after `targetId`, going by the order the list shows.
async function placeTask(id, targetId, after) {
  const t = findTask(id);
  if (!t || id === targetId) return;
  const list = openInOrder(t.day).filter((x) => x.id !== id);
  const i = list.findIndex((x) => x.id === targetId);
  if (i < 0) return;
  const want = after ? i + 1 : i;
  list.splice(want, 0, t);
  await saveOrder(list, t, want);
}

// Ctrl+Shift drag and drop: task `id` becomes a subtask of `parentId`, bringing its own subtasks along.
// Sessions logged against it now count for the parent. Undo puts everything back.
async function nestTask(id, parentId) {
  const t = findTask(id);
  const parent = findTask(parentId);
  if (!t || !parent || id === parentId) return false;
  if ((S.state === 'focus' || S.state === 'paused') && S.taskId === t.id) {
    showNudge(`"${t.text}" is in focus right now. End the session before making it a subtask.`, 'info', true);
    return false;
  }
  const before = { task: JSON.parse(JSON.stringify(t)), subs: (parent.subtasks || []).map((s) => ({ ...s })) };
  const sub = { id: uid(), text: t.text, done: !!t.done, doneAt: t.done ? t.doneAt || Date.now() : null, ...(t.note ? { note: t.note } : {}) };
  const carried = (t.subtasks || []).map((s) => ({ ...s }));
  parent.subtasks = [...(parent.subtasks || []), sub, ...carried];
  parent.subsHidden = false;
  const moved = data.entries.filter((e) => e.taskId === t.id).map((e) => [e, e.subId || null]);
  moved.forEach(([e]) => { e.taskId = parent.id; e.subId = e.subId && carried.some((s) => s.id === e.subId) ? e.subId : sub.id; });
  rememberSkip(t);
  data.tasks = data.tasks.filter((x) => x.id !== t.id);
  await persist('tasks', 'entries', 'meta');
  renderPlan();
  showNudge(`"${t.text}" is now a subtask of "${parent.text}".`, 'info', true, {
    label: 'Undo',
    fn: async () => {
      if (findTask(before.task.id)) return;
      const p = findTask(parent.id);
      if (p) p.subtasks = before.subs;
      data.tasks.push(before.task);
      moved.forEach(([e, subId]) => { e.taskId = before.task.id; e.subId = subId; });
      await persist('tasks', 'entries');
      renderPlan();
    }
  });
  return true;
}

// The drag counts as "make it a subtask" while Ctrl (or Cmd) and Shift are held.
// Windows runs its own loop during a drag, so drag events often arrive without the keys set and key
// events stop. So it also counts when the keys were down as the drag began, or when the system
// offers a "link" drop, which is what Ctrl+Shift asks it for.
const heldKeys = { nest: false, atDragStart: false };
const keysDown = (e) => !!((e.ctrlKey || e.metaKey) && e.shiftKey);
for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'mousedown', 'mousemove']) {
  addEventListener(type, (e) => { heldKeys.nest = keysDown(e); }, true);
}
addEventListener('dragstart', (e) => { heldKeys.atDragStart = keysDown(e) || heldKeys.nest; }, true);
addEventListener('dragend', () => { heldKeys.atDragStart = false; }, true);
addEventListener('blur', () => { heldKeys.nest = false; heldKeys.atDragStart = false; });
const nestKeys = (e) => keysDown(e) || (e.type?.startsWith('drag') || e.type === 'drop'
  ? heldKeys.atDragStart || e.dataTransfer?.dropEffect === 'link'
  : heldKeys.nest);

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
  await addTask(p.text, 0, todayKey(), p.projectId);
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
  if (reducedMotion()) return;
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
      ? (doneN === tasks.length ? 'All done' : (() => {
        const overdue = tasks.filter((x) => dueStatus(x)?.kind === 'overdue').length;
        const starred = tasks.filter((x) => x.starred && !x.done).length;
        const flags = [overdue ? `${overdue} overdue` : '', starred ? `${starred} starred` : ''].filter(Boolean);
        // Keep it to two short lines: flags win over the sessions estimate.
        return flags.length
          ? `${flags.join(', ')}, ${tasks.length - doneN} to go`
          : `${tasks.length - doneN} to go${glanceSessions ? `, about ${plural(glanceSessions, 'session')}` : ''}`;
      })())
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
let subNoteFor = null; // { taskId, subId } while a subtask's note is open
let taskNoteFor = null; // task whose note is open right in the list
let subPromote = null; // { taskId, subId } while asking whether a new task keeps the project
let subOpening = null; // task whose subtask list was just opened, so it can slide in

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
    ${!s.done && canFocus ? `<button class="sub-act" type="button" data-sub-focus="${t.id}" data-sub-id="${s.id}" aria-label="Focus on ${esc(s.text)}" title="Focus on just this">${icon('play')}</button>` : ''}
    <button class="sub-act${s.note ? ' has-note' : ''}" type="button" data-sub-note="${t.id}" data-sub-id="${s.id}" aria-label="${s.note ? 'Edit the note on' : 'Add a note to'} ${esc(s.text)}" title="${s.note ? 'Edit note' : 'Add a note'}">${icon('note')}</button>
    <button class="sub-act" type="button" data-sub-promote="${t.id}" data-sub-id="${s.id}" aria-label="Make ${esc(s.text)} a task of its own" title="Make it a task of its own">${icon('promote')}</button>
    <button class="sub-act more" type="button" data-row-menu aria-label="More for ${esc(s.text)}" title="More">${icon('more')}</button>
    <button class="sub-act del" type="button" data-sub-del="${t.id}" data-sub-id="${s.id}" aria-label="Remove subtask ${esc(s.text)}" title="Remove">${icon('close')}</button>
  </li>${subExtras(t, s)}`;
}

// Under a subtask: its note (or the box to write one), and the "keep the project?" question when it becomes a task.
function subExtras(t, s) {
  const here = (x) => x && x.taskId === t.id && x.subId === s.id;
  let out = '';
  if (here(subNoteFor)) {
    out += `<li class="sub-note-edit"><textarea data-sub-note-text="${t.id}" data-sub-id="${s.id}" rows="2" maxlength="2000" placeholder="A note for later, like who to follow up with" aria-label="Note on ${esc(s.text)}">${esc(s.note || '')}</textarea>
      <span class="field-note">Ctrl+Enter saves, Esc cancels</span></li>`;
  } else if (s.note) {
    out += `<li class="sub-note"><button type="button" data-sub-note="${t.id}" data-sub-id="${s.id}" title="Edit note">${esc(s.note)}</button></li>`;
  }
  if (here(subPromote)) {
    const p = projectById(t.projectId);
    out += `<li class="sub-promote" role="group" aria-label="Make it a task">Make "${esc(s.text)}" a task:
      <button class="btn small" type="button" data-promote-keep="${t.id}" data-sub-id="${s.id}">Keep ${p ? esc(p.name) : 'the project'}</button>
      <button class="btn small quiet" type="button" data-promote-none="${t.id}" data-sub-id="${s.id}">No project</button>
      <button class="link" type="button" data-promote-cancel>Cancel</button></li>`;
  }
  return out;
}

// Turns a subtask into a task of its own on the parent's day, right after the parent. It keeps its note and
// whether it's done, and sessions spent on it move with it. Undo puts it back.
async function promoteSubtask(taskId, subId, keepProject) {
  const t = findTask(taskId);
  const s = findSub(taskId, subId);
  subPromote = null;
  if (!t || !s) return null;
  if ((S.state === 'focus' || S.state === 'paused') && S.taskId === t.id && S.subId === s.id) {
    showNudge(`"${s.text}" is in focus right now. End the session before making it a task.`, 'info', true);
    renderPlan();
    return null;
  }
  const before = { subs: t.subtasks.map((x) => ({ ...x })), order: tasksFor(t.day).map((x) => [x, x.order]) };
  const task = {
    id: uid(), text: s.text, day: t.day, est: 0, projectId: keepProject ? t.projectId || null : null,
    done: !!s.done, doneAt: s.done ? s.doneAt || Date.now() : null, createdAt: Date.now(), order: 0,
    ...(s.note ? { note: s.note } : {})
  };
  t.subtasks = t.subtasks.filter((x) => x.id !== s.id);
  const list = tasksFor(t.day);
  list.splice(list.indexOf(t) + 1, 0, task);
  data.tasks.push(task);
  list.forEach((x, n) => { x.order = n; });
  const moved = data.entries.filter((e) => e.taskId === t.id && e.subId === s.id);
  moved.forEach((e) => { e.taskId = task.id; e.subId = null; });
  await persist('tasks', 'entries');
  renderPlan();
  showNudge(`"${task.text}" is now a task of its own${task.projectId ? ` in ${projectName(task.projectId)}` : ''}.`, 'info', true, {
    label: 'Undo',
    fn: async () => {
      if (!findTask(task.id)) return;
      data.tasks = data.tasks.filter((x) => x.id !== task.id);
      const p = findTask(t.id);
      if (p) p.subtasks = before.subs;
      before.order.forEach(([x, o]) => { x.order = o; });
      moved.forEach((e) => { e.taskId = t.id; e.subId = s.id; });
      await persist('tasks', 'entries');
      renderPlan();
    }
  });
  return task;
}

async function saveTaskNote(id, text) {
  taskNoteFor = null;
  const t = findTask(id);
  if (!t) { renderPlan(); return; }
  const clean = String(text || '').trim();
  if (clean) t.note = clean; else delete t.note;
  await persist('tasks');
  renderPlan();
}

// Opens a task's note right in the list, without the editor.
function openTaskNote(id) {
  taskNoteFor = id;
  renderPlan();
  const box = document.querySelector(`[data-task-note-text="${id}"]`);
  if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
}

async function saveSubNote(taskId, subId, text) {
  subNoteFor = null;
  const s = findSub(taskId, subId);
  if (!s) { renderPlan(); return; }
  const clean = String(text || '').trim();
  if (clean) s.note = clean; else delete s.note;
  await updateSubtasks(taskId, () => {});
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
  const opening = subOpening === t.id;
  return `<div class="subtasks">${toggle}
    <ul class="subtask-list${opening ? ' opening' : ''}">${subs.map((s) => subtaskRow(t, s, canFocus)).join('')}</ul>
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
  if (s.done !== !!done) s.doneAt = done ? Date.now() : null;
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
      const t = findTask(b.dataset.subToggle);
      subOpening = t && t.subsHidden ? t.id : null;
      updateSubtasks(b.dataset.subToggle, (x) => { x.subsHidden = !x.subsHidden; }).then(() => { subOpening = null; });
    } else if (b.dataset.subDel) {
      updateSubtasks(b.dataset.subDel, (t) => { t.subtasks = t.subtasks.filter((s) => s.id !== subId); });
    } else if (b.dataset.subFocus) {
      startSubtask(b.dataset.subFocus, subId);
    } else if (b.dataset.taskNote) {
      openTaskNote(b.dataset.taskNote);
    } else if (b.dataset.subNote) {
      subNoteFor = { taskId: b.dataset.subNote, subId };
      renderPlan();
      const box = list.querySelector('[data-sub-note-text]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (b.dataset.subPromote) {
      const t = findTask(b.dataset.subPromote);
      if (t && t.projectId) { subPromote = { taskId: t.id, subId }; renderPlan(); list.querySelector('[data-promote-keep]')?.focus(); }
      else promoteSubtask(b.dataset.subPromote, subId, false);
    } else if (b.dataset.promoteKeep) {
      promoteSubtask(b.dataset.promoteKeep, subId, true);
    } else if (b.dataset.promoteNone) {
      promoteSubtask(b.dataset.promoteNone, subId, false);
    } else if (b.dataset.promoteCancel !== undefined) {
      subPromote = null;
      renderPlan();
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
    const taskNote = e.target.dataset?.taskNoteText;
    if (taskNote) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); saveTaskNote(taskNote, e.target.value); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); taskNoteFor = null; renderPlan(); }
      return;
    }
    const note = e.target.dataset?.subNoteText;
    if (note) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); saveSubNote(note, e.target.dataset.subId, e.target.value); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); subNoteFor = null; renderPlan(); }
      return;
    }
    if (e.key === 'Escape' && subPromote) { e.preventDefault(); subPromote = null; renderPlan(); return; }
    if (e.target.classList.contains('sub-edit')) {
      if (e.key === 'Enter') { e.preventDefault(); finishRename(e.target, true); }
      if (e.key === 'Escape') { e.preventDefault(); finishRename(e.target, false); }
      return;
    }
    if (e.key === 'Escape' && e.target.closest('[data-sub-add]')) { subAddFor = null; renderPlan(); }
  });
  list.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('sub-edit') && subEditing) { finishRename(e.target, true); return; }
    const taskNote = e.target.dataset?.taskNoteText;
    if (taskNote && taskNoteFor) { saveTaskNote(taskNote, e.target.value); return; } // clicking away keeps what you wrote
    const note = e.target.dataset?.subNoteText;
    if (note && subNoteFor) { saveSubNote(note, e.target.dataset.subId, e.target.value); return; } // clicking away keeps what you wrote
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
      g.manual.push(e);
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
  $('planDayBtn').hidden = !isToday;
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
  const timeForm = timeFor ? document.querySelector(`[data-time-form="${timeFor}"]`) : null;
  const typedTime = timeForm ? { start: timeForm.querySelector('[data-time-start]').value, mins: timeForm.querySelector('[data-time-mins]').value } : null;
  if (timeFor && (!(isToday || isFuture) || !open.some((t) => t.id === timeFor))) timeFor = null;
  const shown = viewTasks(tasks);
  const dragOk = taskView.sort === 'manual' && taskView.project === 'all';
  taskReorderOk = dragOk;
  renderTaskView(tasks, shown);
  $('taskList').innerHTML = shown.length
    ? shown.map((t) => {
      const meta = taskMeta(t);
      const color = projectById(t.projectId)?.color;
      const progress = taskProgress(t);
      const movable = !t.done;
      const due = dueStatus(t);
      const timed = !t.done && (isToday || isFuture);
      return `<li class="task${t.done ? ' done' : ''}${t.id === freshTaskId ? ' fresh' : ''}"${color ? ` style="--pc:${color}"` : ''} data-task-row="${t.id}"${movable && timeFor !== t.id && taskNoteFor !== t.id ? ' draggable="true"' : ''}>
        ${movable ? '<span class="task-grip" aria-hidden="true" title="Drag to reorder. Hold Ctrl+Shift and drop it on another task to make it a subtask."></span>' : ''}
        <input type="checkbox" data-task-done="${t.id}" ${t.done ? 'checked' : ''} aria-label="Mark ${esc(t.text)} as done">
        <button class="task-main" type="button" data-task-edit="${t.id}" title="Edit task">
          <span class="task-text">${esc(t.text)}</span>
          <span class="task-meta">${projectChip(t.projectId)}${due ? `<span class="due-chip due-${due.kind}">${esc(due.label)}</span>` : ''}${t.block && !t.done && !timed ? `<span class="block-chip">${fmtTime(atDay(t.block.day, t.block.startMin))}</span>` : ''}${meta ? `<span>${esc(meta)}</span>` : ''}</span>
          ${progress !== null && !t.done ? `<span class="task-progress" aria-hidden="true"><span style="width:${(progress * 100).toFixed(0)}%"></span></span>` : ''}
        </button>
        <div class="task-actions">
          ${timed ? timeButton(t) : ''}
          ${t.done ? '' : `<button class="star-btn${t.starred ? ' on' : ''}" type="button" data-task-star="${t.id}" aria-pressed="${!!t.starred}" aria-label="${t.starred ? 'Unstar' : 'Star'} ${esc(t.text)}" title="${t.starred ? 'Starred' : 'Star this task'}">${icon(t.starred ? 'starOn' : 'star')}</button>
          ${(t.subtasks || []).length ? '' : `<button class="icon-btn small" type="button" data-sub-new="${t.id}" aria-label="Add a subtask to ${esc(t.text)}" title="Add subtask">${icon('plus')}</button>`}
          ${isToday ? `<button class="btn small" type="button" data-task-start="${t.id}" ${canFocus ? '' : 'disabled'}>Focus</button>` : ''}`}
          <button class="note-btn${t.note ? ' on' : ''}" type="button" data-task-note="${t.id}" aria-label="${t.note ? 'Edit the note on' : 'Add a note to'} ${esc(t.text)}" title="${t.note ? 'Edit note' : 'Add a note'}">${icon('note')}</button>
          <button class="row-more" type="button" data-row-menu aria-label="More for ${esc(t.text)}" title="More (or right-click)">${icon('more')}</button>
        </div>
        ${timed && timeFor === t.id ? timeFormHtml(t, planDay) : ''}
        ${taskNoteFor === t.id
          ? `<div class="task-note-edit"><textarea data-task-note-text="${t.id}" rows="2" maxlength="2000" placeholder="A note for later, like who to follow up with" aria-label="Note on ${esc(t.text)}">${esc(t.note || '')}</textarea>
              <span class="field-note">Ctrl+Enter saves, Esc cancels</span></div>`
          : t.note ? `<button class="task-note" type="button" data-task-note="${t.id}" title="Edit note">${esc(t.note)}</button>` : ''}
        ${subtaskBlock(t, canFocus)}
      </li>`;
    }).join('')
    : tasks.length
      ? '<li class="empty">No tasks match. <button class="link" type="button" data-view-reset>Show all tasks</button></li>'
      : isFuture ? emptyState('sprout', 'Nothing planned yet', 'Add a few things you want to get done that day.')
        : isToday ? emptyState('sprout', 'A fresh start', 'Add the few things that would make today a good day.')
          : emptyState('sprout', 'No tasks were planned for this day', '');

  freshTaskId = null;

  const left = isToday ? leftoverTasks() : [];
  $('leftoverSection').hidden = !left.length;
  $('leftoverCount').textContent = left.length;
  $('leftoverSort').innerHTML = Object.entries(LEFTOVER_SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('leftoverSort').value = leftoverSort;
  $('leftoverSort').parentElement.hidden = left.length < 2;
  $('leftoverList').innerHTML = sortLeftovers(left).map((t) => {
    const from = new Date(t.day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `<li class="task leftover">
      <button class="task-main" type="button" data-task-edit="${t.id}" title="Edit task">
        <span class="task-text">${esc(t.text)}</span>
        <span class="task-meta">${projectChip(t.projectId)}<span>Planned for ${esc(from)}</span><span class="leftover-age">${esc(ageLabel(t.day))}</span></span>
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
      ? items.map((g, index) => {
        const meta = [];
        if (g.taskDone) meta.push(`Task finished at ${fmtTime(g.taskDone.doneAt)}`);
        if (g.sessions) meta.push(plural(g.sessions, 'focus session'));
        if (g.manual.length && !g.sessions) meta.push(g.manual.length > 1 ? `Added ${g.manual.length} times` : `Added at ${fmtTime(g.manual[0].end)}`);
        const color = projectById(g.projectId)?.color;
        return `<li class="done-item${g.taskDone ? ' is-task' : ''}"${color ? ` style="--pc:${color}"` : ''}>
          <span class="done-mark" aria-hidden="true">${g.taskDone ? '✓' : '•'}</span>
          <div class="task-main">
            <span class="task-text">${esc(g.text)}</span>
            <span class="task-meta">${projectChip(g.projectId)}<span>${esc(meta.join(', '))}</span></span>
          </div>
          <span class="done-time">${g.sec ? fmtMins(Math.max(60, g.sec)) : ''}</span>
          <button class="done-edit-btn" type="button" data-done-edit="${index}" aria-label="Edit ${esc(g.text)}">Edit <span aria-hidden="true">&#9998;</span></button>
        </li>`;
      }).join('')
      : isToday ? emptyState('check', 'Nothing finished yet', 'Sessions, completed tasks and anything you log show up here.')
        : emptyState('check', 'Nothing was logged on this day', '');
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
  if (timeFor && typedTime) {
    const form = document.querySelector(`[data-time-form="${timeFor}"]`);
    if (form) {
      form.querySelector('[data-time-start]').value = typedTime.start;
      form.querySelector('[data-time-mins]').value = typedTime.mins;
    }
  }

  $('taskOptions').innerHTML = [...openTodayTasks(), ...leftoverTasks()].map((t) => `<option value="${esc(t.text)}"></option>`).join('');
  if (tasks.length && isToday && $('nudge').dataset.kind === 'plan') hideNudge();
  lastNextUp = null;
  renderNextUp();
  if (!$('tab-day').hidden) renderDay();
}

let doneFormOpen = false;

let lastNextUp = null;
function renderNextUp() {
  // The top of the list as you see it, so starred and overdue tasks come first.
  const next = S.state === 'idle' && !$('task').value.trim() ? viewTasks(todayTasks()).find((t) => !t.done) : null;
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
  ['manual', 'My order'], ['priority', 'Priority'], ['project', 'Project'], ['left', 'Most sessions left'],
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
    // Starred and urgent tasks float up; otherwise your own order.
    manual: (a, b) => floatsUp(b) - floatsUp(a),
    priority: priorityCompare,
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

let taskReorderOk = true; // false while the list is sorted or filtered

function bindTaskDrag() {
  const list = $('taskList');
  let dragId = null;
  const clearDrop = () => list.querySelectorAll('.drop-before, .drop-after, .drop-into')
    .forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const targetRow = (e) => e.target.closest?.('[data-task-row][draggable="true"]');

  list.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('[data-sub-row]')) return; // a subtask is being dragged
    const row = e.target.closest?.('[data-task-row]');
    if (!row || row.getAttribute('draggable') !== 'true') return;
    dragId = row.dataset.taskRow;
    e.dataTransfer.effectAllowed = 'all'; // Ctrl+Shift asks the system for a link drop, which nests the task
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.setData('application/x-steady-task', dragId);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  list.addEventListener('dragover', (e) => {
    if (dragId && nestKeys(e)) {
      // Ctrl+Shift: drop onto another task to make this one its subtask, whatever the sort.
      const row = targetRow(e);
      if (!row) return;
      e.preventDefault();
      clearDrop();
      if (row.dataset.taskRow === dragId) { e.dataTransfer.dropEffect = 'none'; return; }
      e.dataTransfer.dropEffect = 'link';
      row.classList.add('drop-into');
      list.querySelector('.task.dragging')?.classList.add('as-sub');
      return;
    }
    const row = dragId && taskReorderOk && targetRow(e);
    if (!row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDrop();
    list.querySelector('.task.dragging')?.classList.remove('as-sub');
    if (row.dataset.taskRow === dragId) return;
    // Judge by the task's own line, not its subtasks, so tall rows behave.
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + Math.min(r.height / 2, 28) ? 'drop-before' : 'drop-after');
  });
  list.addEventListener('drop', (e) => {
    if (dragId && nestKeys(e)) {
      const row = targetRow(e);
      if (!row) return;
      e.preventDefault();
      const id = dragId;
      dragId = null;
      clearDrop();
      if (row.dataset.taskRow !== id) nestTask(id, row.dataset.taskRow);
      return;
    }
    const row = dragId && taskReorderOk && targetRow(e);
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
    list.querySelectorAll('.task.dragging').forEach((r) => r.classList.remove('dragging', 'as-sub'));
  });

  list.addEventListener('keydown', async (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const row = e.target.closest('[data-task-row]');
    if (!row || e.target.matches('input[type="text"]') || row.getAttribute('draggable') !== 'true' || !taskReorderOk) return;
    e.preventDefault();
    const id = row.dataset.taskRow;
    await moveTask(id, e.key === 'ArrowUp' ? -1 : 1);
    list.querySelector(`[data-task-edit="${id}"]`)?.focus();
  });
}

/* ---------- Ctrl+Shift drag: make a task a subtask of another ---------- */

// The browser won't start an ordinary drag while Shift is held (Shift+press extends a text selection),
// so a press with Ctrl+Shift on a task in the Plan list or the Day list starts this drag instead.
// The calendar's blocks handle Ctrl+Shift in their own drag (day.js).
function bindNestDrag() {
  let nd = null;
  let swallowClickUntil = 0;
  const SOURCES = '#taskList [data-task-row][draggable="true"], #dayTodo [data-day-task][draggable="true"]';
  const idOf = (el) => el.dataset.taskRow || el.dataset.dayTask || el.dataset.calTask;
  const clear = () => document.querySelectorAll('.drop-into').forEach((r) => r.classList.remove('drop-into'));
  const finish = () => {
    if (!nd) return;
    clear();
    nd.ghost?.remove();
    nd.row.classList.remove('dragging', 'as-sub');
    document.body.classList.remove('nest-dragging');
    nd = null;
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !keysDown(e) || e.target.closest('input, select, textarea')) return;
    const row = e.target.closest(SOURCES);
    if (!row) return;
    e.preventDefault(); // no text selection
    nd = { row, id: idOf(row), x: e.clientX, y: e.clientY, moved: false, target: null, pointerId: e.pointerId };
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!nd) return;
    if (!nd.moved) {
      if (Math.abs(e.clientX - nd.x) + Math.abs(e.clientY - nd.y) < 5) return;
      nd.moved = true;
      try { nd.row.setPointerCapture(nd.pointerId); } catch { /* pointer already gone */ }
      const t = findTask(nd.id);
      nd.ghost = document.createElement('div');
      nd.ghost.className = 'nest-ghost';
      nd.ghost.textContent = t ? t.text : '';
      document.body.appendChild(nd.ghost);
      nd.row.classList.add('dragging');
      document.body.classList.add('nest-dragging');
    }
    nd.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    clear();
    const tab = nd.row.closest('.tab');
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-task-row][draggable="true"], [data-day-task], [data-cal-task]');
    nd.target = over && tab?.contains(over) && idOf(over) !== nd.id ? idOf(over) : null;
    if (nd.target) over.classList.add('drop-into');
    nd.row.classList.toggle('as-sub', !!nd.target);
    nd.ghost.classList.toggle('on-target', !!nd.target);
  }, true);

  document.addEventListener('pointerup', (e) => {
    if (!nd) return;
    const { moved, id, target } = nd;
    finish();
    if (!moved) return;
    swallowClickUntil = Date.now() + 300;
    if (target) nestTask(id, target);
  }, true);
  document.addEventListener('pointercancel', finish, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nd) { e.preventDefault(); finish(); } }, true);
  // The press was taken over, so the click that follows it isn't a click on the row.
  document.addEventListener('click', (e) => {
    if (Date.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

/* ---------- Task editor ---------- */

let editingTaskId = null;
let editingSubs = []; // working copy, saved with the task

function renderSubEditor() {
  $('taskEditSubs').innerHTML = editingSubs.map((s, i) => `<li>
      <input type="checkbox" data-esub-done="${i}" ${s.done ? 'checked' : ''} aria-label="Done">
      <input type="text" value="${esc(s.text)}" data-esub-text="${i}" maxlength="140" aria-label="Subtask">
      <button class="del" type="button" data-esub-del="${i}" aria-label="Remove subtask">${icon('close')}</button>
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

// The "Finished on / at" fields appear with the Done box, starting from the saved time or right now.
function showTaskDoneWhen(doneAt) {
  const done = $('taskEditDone').checked;
  $('taskEditWhen').hidden = !done;
  if (done) {
    const at = doneAt || Date.now();
    $('taskEditDoneDate').value = dayKey(at);
    $('taskEditDoneTime').value = toTimeInput(at);
  }
  $('taskEditDoneDate').max = todayKey();
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
  $('taskEditNote').value = t.note || '';
  $('taskEditDone').checked = !!t.done;
  showTaskDoneWhen(t.doneAt);
  $('taskEditError').textContent = '';
  $('taskEditPark').hidden = !!t.done;
  const r = recurById(t.recurId);
  $('taskEditRepeat').innerHTML = REPEAT_OPTIONS.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
  $('taskEditRepeat').value = r ? r.freq : '';
  editingSubs = (t.subtasks || []).map((x) => ({ ...x }));
  $('taskEditDue').value = t.due || '';
  $('taskEditStar').checked = !!t.starred;
  $('taskEditBlockStart').value = t.block ? hhmm(t.block.startMin) : '';
  $('taskEditBlockMins').value = t.block ? String(t.block.mins) : '';
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
  const done = $('taskEditDone').checked;
  let finishedAt = null;
  if (done) {
    finishedAt = new Date(`${$('taskEditDoneDate').value}T${$('taskEditDoneTime').value}`).getTime();
    if (!Number.isFinite(finishedAt)) { $('taskEditError').textContent = 'Pick the date and time it was finished.'; return; }
    if (finishedAt > Date.now()) { $('taskEditError').textContent = 'That time is in the future.'; return; }
  }
  t.text = text;
  t.projectId = $('taskEditProject').value || null;
  t.est = Number($('taskEditEst').value) || 0;
  t.presetId = $('taskEditPreset').value || null;
  const day = $('taskEditDay').value;
  if (day && day !== t.day) { t.day = day; t.order = nextOrder(day); }
  t.done = done;
  t.doneAt = finishedAt;
  if ($('taskEditSubInput').value.trim()) addSubFromEditor(); // typed but not added yet
  t.subtasks = editingSubs.filter((x) => x.text.trim()).map(s => {
    const old = (t.subtasks || []).find(x => x.id === s.id);
    return { ...s, doneAt: s.done ? (old?.done && old.doneAt ? old.doneAt : Date.now()) : null };
  });
  t.due = $('taskEditDue').value || null;
  const note = $('taskEditNote').value.trim();
  if (note) t.note = note; else delete t.note;
  t.starred = $('taskEditStar').checked;
  const blockStart = $('taskEditBlockStart').value;
  if (blockStart) {
    const [h, m] = blockStart.split(':').map(Number);
    const len = Number($('taskEditBlockMins').value) || defaultBlockMins(t);
    t.block = { day: t.day, startMin: Math.round((h * 60 + m) / 15) * 15, mins: Math.max(15, Math.min(480, len)) };
  } else {
    t.block = null;
  }
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
    addQuickTask(text, { baseDay: planDay, est: $('taskEst').value, projectId: $('taskProject').value || null }).then((added) => {
      const q = added && added.parsed;
      if (q && q.day !== planDay) showNudge(`Added "${q.text}" for ${quickAddSummary(q)}.`, 'info', true, { label: 'Show', fn: () => { planDay = q.day; renderPlan(); } });
    });
    $('taskInput').value = '';
    showTimeHint();
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
  $('doneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = $('doneInput').value.trim();
    if (!typed) return;
    const minutes = $('doneMinutes').value;
    const chosen = $('doneProject').value;
    $('doneInput').value = '';
    $('doneMinutes').value = '';
    $('doneInput').focus();
    const { text, projectId } = await takeProjectTag(typed, chosen);
    addDoneItem(text, minutes, projectId, planDay);
  });

  const onListClick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.doneEdit !== undefined) openDoneEditor(Number(b.dataset.doneEdit));
    else if (b.dataset.taskStart) startTask(b.dataset.taskStart);
    else if (b.dataset.taskStar) toggleStar(b.dataset.taskStar);
    else if (b.dataset.taskTime) toggleTimeForm(b.dataset.taskTime);
    else if (b.dataset.timeClear) { timeFor = null; unblockTask(b.dataset.timeClear); }
    else if (b.dataset.timeCancel !== undefined) closeTimeForm();
    else if (b.dataset.taskToday) moveToToday([b.dataset.taskToday]);
    else if (b.dataset.taskEdit) openTaskDialog(b.dataset.taskEdit);
    else if (b.dataset.entryEdit) openEntryDialog(b.dataset.entryEdit);
  };
  $('taskList').addEventListener('click', onListClick);
  $('leftoverList').addEventListener('click', onListClick);
  $('doneList').addEventListener('click', onListClick);
  $('doneEditClose').addEventListener('click', () => $('doneEditDialog').close());
  $('doneEditChoices').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $('doneEditDialog').close();
    if (b.dataset.taskEdit) openTaskDialog(b.dataset.taskEdit);
    else if (b.dataset.entryEdit) openEntryDialog(b.dataset.entryEdit);
  });
  $('taskList').addEventListener('change', (e) => {
    const id = e.target.dataset?.taskDone;
    if (!id) return;
    const row = e.target.closest('.task');
    const reduce = reducedMotion();
    if (e.target.checked && row && !reduce) {
      row.classList.add('completing');
      setTimeout(() => setTaskDone(id, true), 650);
    } else {
      setTaskDone(id, e.target.checked);
    }
  });
  $('taskList').addEventListener('submit', (e) => {
    const form = e.target.closest('[data-time-form]');
    if (!form) return;
    e.preventDefault();
    saveTimeForm(form);
  });
  $('taskList').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.closest('[data-time-form]')) { e.stopPropagation(); closeTimeForm(); }
  });
  bindSubtasks();
  bindTaskDrag();
  bindNestDrag();
  bindTaskView();
  $('leftoverSort').addEventListener('change', (e) => {
    leftoverSort = e.target.value;
    try { localStorage.setItem('leftoverSort', leftoverSort); } catch { /* storage unavailable */ }
    renderPlan();
  });
  $('moveAllBtn').addEventListener('click', () => moveToToday(leftoverTasks().map((t) => t.id)));
  $('dismissNote').addEventListener('click', async () => {
    data.meta.tomorrowNote = null;
    await persist('meta');
    renderPlan();
  });

  $('planPrev').addEventListener('click', () => { planDay = shiftKey(planDay, -1); glanceCountUp = true; renderPlan(); ensureCalendarFor(planDay); playEnter($('tab-plan')); });
  $('planNext').addEventListener('click', () => { planDay = shiftKey(planDay, 1); glanceCountUp = true; renderPlan(); ensureCalendarFor(planDay); playEnter($('tab-plan')); });
  $('planToday').addEventListener('click', () => { planDay = todayKey(); glanceCountUp = true; renderPlan(); playEnter($('tab-plan')); });

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
  $('taskEditDone').addEventListener('change', () => showTaskDoneWhen(null));
  $('taskEditPark').addEventListener('click', async () => {
    const id = editingTaskId;
    $('taskDialog').close();
    await taskToParking(id);
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
  $('taskInput').addEventListener('input', showTimeHint);
  $('taskProject').addEventListener('change', showEstHint);
  $('taskForm').addEventListener('submit', () => setTimeout(showEstHint, 0));

  $('nextUpBtn').addEventListener('click', () => {
    const id = $('nextUpBtn').dataset.taskId;
    if (id) startTask(id);
  });
  $('task').addEventListener('input', renderNextUp);
}

function openDoneEditor(index) {
  const group = doneItems(planDay)[index];
  if (!group) return;
  const choices = [
    ...(group.taskDone ? [{kind:'task',id:group.taskDone.id,title:'Completed task',detail:'Title, project, subtasks and completion'}] : []),
    ...group.manual.map(e => ({kind:'entry',id:e.id,title:entryLabel(e),detail:fmtTime(e.start) + (workSec(e) ? ' / ' + fmtMins(workSec(e)) : '')}))
  ];
  if (choices.length === 1) {
    if (choices[0].kind === 'task') openTaskDialog(choices[0].id);
    else openEntryDialog(choices[0].id);
    return;
  }
  $('doneEditName').textContent = group.text;
  $('doneEditChoices').innerHTML = choices.map(c => '<button class="done-edit-choice" type="button" data-' + c.kind + '-edit="' + c.id + '"><span><strong>' + esc(c.title) + '</strong><small>' + esc(c.detail) + '</small></span><span aria-hidden="true">&#8250;</span></button>').join('');
  $('doneEditDialog').showModal();
}
