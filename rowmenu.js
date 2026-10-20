/* ---------- The row menu: a "⋯" button and right-click on tasks and subtasks ---------- */

let rowMenuClose = null;

// Shows a menu of `items` ({ label, icon, fn, danger } or 'sep') at a point, or under an element.
function openRowMenu(at, items, title = '') {
  closeRowMenu();
  const menu = document.createElement('div');
  menu.className = 'menu row-menu';
  menu.setAttribute('role', 'menu');
  if (title) menu.setAttribute('aria-label', title);
  menu.innerHTML = items.filter(Boolean).map((it, i) => (it === 'sep'
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button type="button" class="menu-item${it.danger ? ' danger' : ''}" role="menuitem" data-row-item="${i}">${it.icon ? icon(it.icon) : '<span class="ico"></span>'}<span>${esc(it.label)}</span>${it.hint ? `<span class="muted-note">${esc(it.hint)}</span>` : ''}</button>`)).join('');
  document.body.appendChild(menu);
  const list = items.filter(Boolean);
  // Place it, keeping it on screen.
  const r = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
  const w = menu.offsetWidth || 220;
  const h = menu.offsetHeight || 200;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, at instanceof Element ? r.right - w : r.left));
  const y = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;right:auto`;
  const opener = document.activeElement;
  const close = (refocus) => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    window.removeEventListener('blur', blur);
    document.removeEventListener('scroll', blur, true);
    rowMenuClose = null;
    if (refocus && opener && document.contains(opener)) opener.focus();
  };
  const outside = (e) => { if (!menu.contains(e.target)) close(false); };
  const blur = () => close(false);
  const keys = (e) => {
    const buttons = [...menu.querySelectorAll('.menu-item')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') close(false);
  };
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-row-item]');
    if (!b) return;
    const it = list[Number(b.dataset.rowItem)];
    close(false);
    if (it && it.fn) it.fn();
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', blur, true);
  }, 0);
  document.addEventListener('keydown', keys, true);
  window.addEventListener('blur', blur);
  menu.querySelector('.menu-item')?.focus();
  rowMenuClose = close;
}
function closeRowMenu() { if (rowMenuClose) rowMenuClose(false); }

// A copy of a task on the same day, right after it, with its subtasks unticked. No time, no repeat.
async function duplicateTask(id) {
  const t = findTask(id);
  if (!t) return null;
  const copy = {
    id: uid(), text: t.text, day: t.day, est: t.est || 0, projectId: t.projectId || null, presetId: t.presetId || null,
    done: false, doneAt: null, createdAt: Date.now(), order: 0,
    ...(t.note ? { note: t.note } : {}), ...(t.due ? { due: t.due } : {}),
    subtasks: (t.subtasks || []).map((s) => ({ id: uid(), text: s.text, done: false, ...(s.note ? { note: s.note } : {}) }))
  };
  const list = tasksFor(t.day);
  list.splice(list.indexOf(t) + 1, 0, copy);
  data.tasks.push(copy);
  list.forEach((x, n) => { x.order = n; });
  await persist('tasks');
  renderPlan();
  return copy;
}

// Deletes a task with a chance to bring it back.
async function deleteTaskUndoable(id) {
  const t = findTask(id);
  if (!t) return;
  const copy = JSON.parse(JSON.stringify(t));
  const skips = { ...(data.meta.recurSkips || {}) };
  await deleteTask(id);
  showNudge(`Deleted "${copy.text}".`, 'info', true, {
    label: 'Undo',
    fn: async () => {
      if (findTask(copy.id)) return;
      data.tasks.push(copy);
      data.meta.recurSkips = skips;
      await persist('tasks', 'meta');
      renderPlan();
    }
  });
}

// Moves a task to another day; a time it had on its old day doesn't come along.
async function moveTaskToDay(id, day) {
  const t = findTask(id);
  if (!t) return;
  if (t.block && t.block.day !== day) t.block = null;
  await moveToDay([id], day);
  const label = day === todayKey() ? 'today' : day === shiftKey(todayKey(), 1) ? 'tomorrow' : new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  showNudge(`Moved "${t.text}" to ${label}.`, 'info', true, { label: 'Show', fn: () => { planDay = day; renderPlan(); } });
}

// The menu for a task, wherever it shows (the Plan list, the Day list or the calendar).
function taskMenuItems(id, where = 'plan') {
  const t = findTask(id);
  if (!t) return [];
  const today = todayKey();
  const open = !t.done;
  const canFocus = S.state === 'idle' || S.state === 'breakPending';
  const others = openInOrder(t.day).filter((x) => x.id !== t.id);
  const tomorrow = shiftKey(today, 1);
  return [
    open && canFocus && t.day <= today && { label: 'Focus on this', icon: 'play', fn: () => startTask(t.id) },
    open && t.day >= today && where === 'plan' && planDay === t.day && { label: t.block ? 'Change the time' : 'Schedule a time', icon: 'clock', fn: () => toggleTimeForm(t.id) },
    open && t.day >= today && where !== 'plan' && !t.block && { label: 'Next free time', icon: 'clock', fn: () => setBlock(t.id, t.day, suggestStart(t.day, defaultBlockMins(t)), defaultBlockMins(t)) },
    open && t.block && { label: 'Clear the time', icon: 'close', fn: () => unblockTask(t.id) },
    open && { label: t.starred ? 'Unstar' : 'Star', icon: t.starred ? 'starOn' : 'star', fn: () => toggleStar(t.id) },
    { label: t.note ? 'Edit note' : 'Add a note', icon: 'note', fn: () => {
      if (where === 'plan') { openTaskNote(t.id); return; }
      openTaskDialog(t.id); setTimeout(() => $('taskEditNote')?.focus(), 50);
    } },
    open && where === 'plan' && { label: 'Add a subtask', icon: 'plus', fn: () => { subAddFor = t.id; updateSubtasks(t.id, (x) => { x.subsHidden = false; }).then(() => document.querySelector(`[data-sub-add="${t.id}"] input`)?.focus()); } },
    'sep',
    open && t.day !== today && { label: 'Move to today', icon: 'next', fn: () => moveTaskToDay(t.id, today) },
    open && t.day !== tomorrow && { label: 'Move to tomorrow', icon: 'next', fn: () => moveTaskToDay(t.id, tomorrow) },
    open && { label: 'Move to next week', icon: 'calendar', hint: 'Monday', fn: () => moveTaskToDay(t.id, nextWeekday(shiftKey(today, 1), 1)) },
    open && others.length && { label: 'Make it a subtask of…', icon: 'subtask', fn: () => openRowMenu(rowMenuAnchor || { x: 200, y: 200 }, others.slice(0, 12).map((o) => ({ label: o.text, fn: () => nestTask(t.id, o.id) })), 'Make it a subtask of') },
    { label: 'Duplicate', icon: 'copy', fn: () => duplicateTask(t.id) },
    'sep',
    { label: 'Edit task', icon: 'note', fn: () => openTaskDialog(t.id) },
    { label: 'Delete', icon: 'trash', danger: true, fn: () => deleteTaskUndoable(t.id) }
  ];
}

function subMenuItems(taskId, subId) {
  const t = findTask(taskId);
  const s = findSub(taskId, subId);
  if (!t || !s) return [];
  const canFocus = S.state === 'idle' || S.state === 'breakPending';
  return [
    !s.done && canFocus && { label: 'Focus on just this', icon: 'play', fn: () => startSubtask(taskId, subId) },
    { label: s.note ? 'Edit note' : 'Add a note', icon: 'note', fn: () => document.querySelector(`[data-sub-note="${taskId}"][data-sub-id="${subId}"]`)?.click() },
    { label: 'Make it a task of its own', icon: 'promote', fn: () => document.querySelector(`[data-sub-promote="${taskId}"][data-sub-id="${subId}"]`)?.click() },
    { label: 'Rename', icon: 'note', fn: () => document.querySelector(`[data-sub-rename="${taskId}"][data-sub-id="${subId}"]`)?.click() },
    'sep',
    { label: 'Delete', icon: 'trash', danger: true, fn: () => updateSubtasks(taskId, (x) => { x.subtasks = x.subtasks.filter((y) => y.id !== subId); }) }
  ];
}

let rowMenuAnchor = null; // where the last menu opened, so a follow-up menu ("Make it a subtask of…") opens there too

function bindRowMenus() {
  const openFor = (target, at) => {
    const sub = target.closest('[data-sub-row]');
    if (sub && sub.closest('#taskList')) return openRowMenu(at, subMenuItems(sub.dataset.subRow, sub.dataset.subId), 'Subtask');
    const row = target.closest('[data-task-row], [data-day-task], [data-cal-task]');
    if (!row) return false;
    const id = row.dataset.taskRow || row.dataset.dayTask || row.dataset.calTask;
    const where = row.dataset.taskRow ? 'plan' : 'day';
    return openRowMenu(at, taskMenuItems(id, where), 'Task');
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-row-menu]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    rowMenuAnchor = b;
    openFor(b, b);
  });
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return; // keep copy and paste there
    const row = e.target.closest('#taskList [data-task-row], #taskList [data-sub-row], #dayTodo [data-day-task], #dayCal [data-cal-task]');
    if (!row) return;
    e.preventDefault();
    rowMenuAnchor = { x: e.clientX, y: e.clientY };
    openFor(e.target, rowMenuAnchor);
  });
  // The menu key and Shift+F10 open it for the focused row, like a right-click.
  document.addEventListener('keydown', (e) => {
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    const row = document.activeElement?.closest?.('#taskList [data-task-row], #taskList [data-sub-row], #dayTodo [data-day-task], #dayCal [data-cal-task]');
    if (!row) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    rowMenuAnchor = { x: r.left + 24, y: r.top + 20 };
    openFor(document.activeElement, rowMenuAnchor);
  });
}
