/* ---------- Select several tasks and change them together ---------- */

// `on` is select mode (each row shows a tick box and a click picks it); `ids` are the picked tasks.
// Outside select mode, Ctrl+click picks a task and turns it on, and Shift+click picks a range.
const sel = { on: false, ids: new Set(), anchor: null, picking: null /* 'day' or 'due' while a date box is showing */ };

// The ids from `from` to `to` inclusive, whichever way round they are in `order`.
function rangeIds(order, from, to) {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

// The open tasks the list shows right now, top to bottom: what a range runs over and what "select all" picks.
const visibleOpenIds = () => viewTasks(tasksFor(planDay)).filter((t) => !t.done).map((t) => t.id);

function friendlyDay(day) {
  const today = todayKey();
  if (day === today) return 'today';
  if (day === shiftKey(today, 1)) return 'tomorrow';
  return new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/* ---------- Changing many tasks, with one Undo ---------- */

// Runs `fn` on each task (return false to leave one alone), saves once, and offers a single Undo that restores
// every task to how it was. `message` is text, or a function of how many changed.
async function editTasks(ids, fn, message) {
  const tasks = ids.map(findTask).filter(Boolean);
  const before = tasks.map((t) => JSON.parse(JSON.stringify(t)));
  let changed = 0;
  tasks.forEach((t) => { if (fn(t) !== false) changed++; });
  if (!changed) return 0;
  await persist('tasks');
  renderPlan();
  if (message) {
    showNudge(typeof message === 'function' ? message(changed) : message, 'info', true, {
      label: 'Undo',
      fn: async () => {
        before.forEach((copy) => {
          const t = findTask(copy.id);
          if (t) { Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, copy); } else data.tasks.push(copy);
        });
        await persist('tasks');
        renderPlan();
      }
    });
  }
  return changed;
}

const bulkSetProject = (ids, projectId) => editTasks(ids, (t) => {
  if ((t.projectId || null) === (projectId || null)) return false;
  t.projectId = projectId || null;
}, (n) => (projectId ? `${plural(n, 'task')} set to ${projectName(projectId)}.` : `${plural(n, 'task')} taken out of their project.`));

const bulkSetEst = (ids, est) => editTasks(ids, (t) => {
  if ((t.est || 0) === est) return false;
  t.est = est;
}, (n) => (est ? `Estimate set to ${plural(est, 'session')} for ${plural(n, 'task')}.` : `Estimate cleared for ${plural(n, 'task')}.`));

// A time a task had on another day doesn't come along, and it goes to the end of that day's list.
const bulkMoveDay = (ids, day) => editTasks(ids, (t) => {
  if (t.day === day) return false;
  if (t.block && t.block.day !== day) t.block = null;
  t.day = day;
  t.order = nextOrder(day);
}, (n) => `Moved ${plural(n, 'task')} to ${friendlyDay(day)}.`);

const bulkSetDue = (ids, due) => editTasks(ids, (t) => {
  if ((t.due || null) === (due || null)) return false;
  t.due = due || null;
}, (n) => (due ? `${plural(n, 'task')} due ${friendlyDay(due)}.` : `Due date cleared for ${plural(n, 'task')}.`));

// Star them all, or unstar them all when every one is already starred.
function bulkToggleStar(ids) {
  const tasks = ids.map(findTask).filter(Boolean);
  const on = !tasks.every((t) => t.starred);
  return editTasks(ids, (t) => { if (!!t.starred === on) return false; t.starred = on; },
    (n) => `${on ? 'Starred' : 'Unstarred'} ${plural(n, 'task')}.`);
}

function bulkDone(ids) {
  const today = todayKey();
  if (typeof playChime === 'function') playChime('task');
  const finished = [];
  return editTasks(ids, (t) => {
    if (t.done) return false;
    t.done = true;
    t.doneAt = Date.now();
    if (t.day < today) { t.day = today; t.order = nextOrder(today); } // finishing a leftover counts as today's work
    finished.push(t.id);
  }, (n) => `Marked ${plural(n, 'task')} done.${unblockedText(finished)}`);
}

// Delete them all; Undo brings them (and what was waiting on them) back.
async function bulkDelete(ids) {
  const tasks = ids.map(findTask).filter(Boolean);
  if (!tasks.length) return 0;
  const copies = tasks.map((t) => JSON.parse(JSON.stringify(t)));
  const skips = { ...(data.meta.recurSkips || {}) };
  tasks.forEach((t) => rememberSkip(t));
  const relink = unlinkBlockers(ids);
  data.tasks = data.tasks.filter((t) => !ids.includes(t.id));
  await persist('tasks', 'meta');
  renderPlan();
  showNudge(`Deleted ${plural(tasks.length, 'task')}.`, 'info', true, {
    label: 'Undo',
    fn: async () => {
      copies.forEach((c) => { if (!findTask(c.id)) data.tasks.push(c); });
      data.meta.recurSkips = skips;
      relink();
      await persist('tasks', 'meta');
      renderPlan();
    }
  });
  return tasks.length;
}

/* ---------- Select mode ---------- */

function setSelectMode(on) {
  sel.on = !!on;
  if (!on) { sel.ids.clear(); sel.anchor = null; sel.picking = null; }
  renderPlan();
}

function pickTask(id, on) {
  if (on) { sel.ids.add(id); sel.anchor = id; } else sel.ids.delete(id);
}

function pickRangeTo(id) {
  rangeIds(visibleOpenIds(), sel.anchor || id, id).forEach((x) => sel.ids.add(x));
}

// Updates the ticks and the bar without redrawing the list, so scrolling and typing stay put.
function refreshPicks() {
  document.querySelectorAll('#taskList [data-task-row]').forEach((li) => {
    const on = sel.ids.has(li.dataset.taskRow);
    li.classList.toggle('picked', on);
    const box = li.querySelector('[data-task-pick]');
    if (box) box.checked = on;
  });
  renderBulkBar();
}

/* ---------- The bar ---------- */

function bulkSelect(key, label, options) {
  return `<select data-bulk-set="${key}" aria-label="${label}"><option value="" selected disabled>${label}…</option>`
    + options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('') + '</select>';
}

// A few useful days as [date, label], leaving out repeats ("Friday" when today is Friday).
function bulkDays(extra = []) {
  const today = todayKey();
  const list = [[today, 'Today'], [shiftKey(today, 1), 'Tomorrow'], ...extra, [nextWeekday(shiftKey(today, 1), 1), 'Next Monday']];
  const seen = new Set();
  return list.filter(([d]) => !seen.has(d) && seen.add(d));
}

function renderBulkBar() {
  const bar = $('bulkBar');
  if (!bar) return;
  bar.hidden = !sel.on;
  if (!sel.on) { bar.innerHTML = ''; return; }
  const n = sel.ids.size;
  const today = todayKey();
  if (!n) {
    bar.innerHTML = `<span class="bulk-hint">Click tasks to pick them. Shift+click picks a range, Ctrl+A picks them all.</span>
      <button class="link" type="button" data-bulk="all">Select all</button>`;
    return;
  }
  const projects = activeProjects().map((p) => [p.id, p.name]);
  const dateBox = (key, label) => `<label class="bulk-date">${label} <input type="date" data-bulk-date="${key}"${key === 'day' ? ` min="${today}"` : ''}></label>`;
  const starAll = [...sel.ids].map(findTask).filter(Boolean).every((t) => t.starred);
  bar.innerHTML = `<div class="bulk-count" aria-live="polite"><strong>${n} selected</strong>
      <button class="link" type="button" data-bulk="all">All</button><button class="link" type="button" data-bulk="clear">Clear</button></div>
    <div class="bulk-fields">
      ${bulkSelect('project', 'Project', [['none', 'No project'], ...projects])}
      ${bulkSelect('est', 'Estimate', [['0', 'No estimate'], ['1', '1 session'], ['2', '2 sessions'], ['3', '3 sessions'], ['4', '4 sessions'], ['6', '6 sessions']])}
      ${sel.picking === 'day' ? dateBox('day', 'Move to') : bulkSelect('day', 'Move to', [...bulkDays().map(([d, l]) => [d, l]), ['pick', 'Pick a date…']])}
      ${sel.picking === 'due' ? dateBox('due', 'Due') : bulkSelect('due', 'Due', [['none', 'No due date'], ...bulkDays([[nextWeekday(today, 5), 'Friday']]), ['pick', 'Pick a date…']])}
    </div>
    <div class="bulk-actions">
      <button class="btn small" type="button" data-bulk="star">${icon(starAll ? 'starOn' : 'star')} ${starAll ? 'Unstar' : 'Star'}</button>
      <button class="btn small" type="button" data-bulk="block">${icon('lock')} Blocked by…</button>
      <button class="btn small" type="button" data-bulk="done">${icon('check')} Done</button>
      <button class="btn small danger" type="button" data-bulk="delete">${icon('trash')} Delete</button>
    </div>`;
  if (sel.picking) bar.querySelector('[data-bulk-date]')?.focus();
}

// Called from renderPlan: the Select button, and the bar for what's picked.
function renderBulk() {
  const open = visibleOpenIds();
  [...sel.ids].forEach((id) => { if (!open.includes(id)) sel.ids.delete(id); }); // moved away, finished or filtered out
  if (sel.anchor && !open.includes(sel.anchor)) sel.anchor = null;
  const btn = $('selectBtn');
  btn.hidden = open.length < 2 && !sel.on;
  btn.setAttribute('aria-pressed', String(sel.on));
  btn.textContent = sel.on ? 'Cancel' : 'Select';
  $('taskList').classList.toggle('selecting', sel.on);
  renderBulkBar();
}

async function runBulk(action) {
  const ids = [...sel.ids];
  if (!ids.length && action !== 'all' && action !== 'clear') return;
  if (action === 'all') { visibleOpenIds().forEach((id) => sel.ids.add(id)); refreshPicks(); }
  else if (action === 'clear') { sel.ids.clear(); sel.anchor = null; sel.picking = null; refreshPicks(); }
  else if (action === 'star') await bulkToggleStar(ids);
  else if (action === 'block') openBlocksFor(ids);
  else if (action === 'done') { await bulkDone(ids); sel.ids.clear(); refreshPicks(); }
  else if (action === 'delete') { await bulkDelete(ids); sel.ids.clear(); refreshPicks(); }
}

async function applyBulkSet(key, value) {
  const ids = [...sel.ids];
  if (key === 'day' || key === 'due') {
    if (value === 'pick') { sel.picking = key; renderBulkBar(); return; }
    sel.picking = null;
  }
  if (key === 'project') await bulkSetProject(ids, value === 'none' ? null : value);
  else if (key === 'est') await bulkSetEst(ids, Number(value) || 0);
  else if (key === 'day') await bulkMoveDay(ids, value);
  else if (key === 'due') await bulkSetDue(ids, value === 'none' ? null : value);
}

function bindBulk() {
  $('selectBtn').addEventListener('click', () => setSelectMode(!sel.on));

  const list = $('taskList');
  // Stop a Shift+click from selecting text on its way to picking a range.
  list.addEventListener('mousedown', (e) => { if (e.shiftKey && !e.ctrlKey && e.target.closest('[data-task-row]')) e.preventDefault(); });
  // Picking comes first, before a row's own click (which opens the editor). A row's buttons still work.
  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-task-row]');
    if (!row || row.classList.contains('done')) return;
    const id = row.dataset.taskRow;
    const modifier = (e.ctrlKey || e.metaKey) && !e.shiftKey; // Ctrl+Shift is for making a subtask
    const range = e.shiftKey && !e.ctrlKey && !e.metaKey;
    if (!modifier && !range && !sel.on) return;
    if (e.target.closest('.task-actions, .subtasks, .time-form, .task-note-edit, .task-note, select, textarea')) return;
    if (e.target.closest('input') && !e.target.closest('[data-task-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!sel.on) {
      sel.on = true;
      sel.ids.add(id);
      sel.anchor = id;
      renderPlan(); // the rows grow their tick boxes
      return;
    }
    if (range) pickRangeTo(id);
    else pickTask(id, !sel.ids.has(id));
    refreshPicks();
  }, true);

  const bar = $('bulkBar');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulk]');
    if (b) runBulk(b.dataset.bulk);
  });
  bar.addEventListener('change', (e) => {
    const set = e.target.closest('[data-bulk-set]');
    if (set) { applyBulkSet(set.dataset.bulkSet, set.value); return; }
    const date = e.target.closest('[data-bulk-date]');
    if (date && date.value) applyBulkSet(date.dataset.bulkDate, date.value);
  });

  document.addEventListener('keydown', (e) => {
    if (!sel.on) return;
    if (e.key === 'Escape' && !document.querySelector('dialog[open]') && !document.querySelector('.row-menu')) { setSelectMode(false); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'a' && !isTyping(document.activeElement)) {
      e.preventDefault();
      runBulk('all');
    }
  });
}
