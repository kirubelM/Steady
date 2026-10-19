/* ---------- Day view: the day as a calendar you can drag tasks around on ---------- */

const DAY_PX_PER_MIN = 64 / 60; // an hour is 64px tall
const DAY_SNAP = 15;
const snapMin = (m) => Math.round(m / DAY_SNAP) * DAY_SNAP;

// The hours the calendar shows: your working hours, stretched to fit anything outside them.
function dayRange(items) {
  let a = Math.floor(minutesOf(settings.workStart) / 60) * 60;
  let b = Math.ceil(minutesOf(settings.workEnd) / 60) * 60;
  if (b <= a) { a = 0; b = 24 * 60; }
  for (const it of items) {
    a = Math.min(a, Math.floor(it.startMin / 60) * 60);
    b = Math.max(b, Math.ceil(it.endMin / 60) * 60);
  }
  return [Math.max(0, a), Math.min(24 * 60, b)];
}

// Puts things that overlap side by side, like a calendar app: each gets a column and the column count of its group.
function layoutColumns(items) {
  const sorted = [...items].sort((x, y) => x.startMin - y.startMin || y.endMin - x.endMin);
  let group = [];
  let groupEnd = -1;
  const close = () => {
    const cols = Math.max(...group.map((g) => g.col)) + 1;
    group.forEach((g) => { g.cols = cols; });
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.startMin >= groupEnd) close();
    const taken = new Set(group.filter((g) => g.endMin > it.startMin).map((g) => g.col));
    let col = 0;
    while (taken.has(col)) col++;
    it.col = col;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length) close();
  return sorted;
}

// The day's open tasks that don't have a time yet.
function unscheduledTasks(day) {
  return openInOrder(day).filter((t) => !(t.block && t.block.day === day));
}

// Meetings and task blocks on `day`, in minutes after midnight.
function dayItems(day) {
  const midnight = atDay(day, 0);
  const toMin = (ms) => Math.max(0, Math.min(24 * 60, Math.round((ms - midnight) / 60000)));
  const meetings = (calendarOn() ? eventsOn(day) : []).filter((ev) => !ev.allDay)
    .map((ev) => ({ kind: 'meet', ev, startMin: toMin(ev.start), endMin: toMin(ev.end) }))
    .filter((m) => m.endMin > m.startMin);
  const tasks = taskBlocksOn(day).map((b) => ({ kind: 'task', task: b.task, startMin: b.task.block.startMin, endMin: b.task.block.startMin + b.task.block.mins }));
  return [...meetings, ...tasks];
}

const dayView = { range: [0, 0], scrolled: '' };

function renderDay() {
  const day = planDay;
  const today = todayKey();
  const isToday = day === today;
  const canEdit = day >= today;
  const canFocus = isToday && (S.state === 'idle' || S.state === 'breakPending');

  $('dayTitle').textContent = dayTitle(day);
  $('dayDate').textContent = new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('dayToday').hidden = isToday;
  $('dayRefresh').hidden = !calendarOn();
  $('dayRefresh').textContent = Cal.loading ? 'Updating…' : 'Refresh calendar';
  const info = scheduleSummary(day);
  $('daySummary').textContent = info.text;
  $('daySummary').classList.toggle('warn-text', !!Cal.error);
  $('dayWarning').hidden = !info.warning;
  $('dayWarning').textContent = info.warning || '';

  // Tasks without a time
  const loose = unscheduledTasks(day);
  $('dayTodo').innerHTML = loose.length
    ? loose.map((t) => {
      const color = projectById(t.projectId)?.color;
      return `<li class="day-todo${canEdit ? '' : ' fixed'}"${color ? ` style="--pc:${color}"` : ''} data-day-task="${t.id}"${canEdit ? ' draggable="true"' : ''}>
        <button class="day-todo-text" type="button" data-task-edit="${t.id}" title="Edit task">${esc(t.text)}</button>
        <span class="day-todo-len">${fmtMins(defaultBlockMins(t) * 60)}</span>
        ${canEdit ? `<button class="link" type="button" data-day-next="${t.id}" title="Schedule at the next free time">Next free time</button>` : ''}
      </li>`;
    }).join('')
    : `<li class="empty">${tasksFor(day).some((t) => !t.done) ? 'Everything has a time.' : 'No tasks for this day. Add some on the Plan tab.'}</li>`;
  $('dayTodoHint').hidden = !canEdit;

  // All-day events
  const allDay = calendarOn() ? eventsOn(day).filter((ev) => ev.allDay) : [];
  const many = (settings.calendars || []).length > 1;
  $('dayAllDay').hidden = !allDay.length;
  $('dayAllDay').innerHTML = allDay.map((ev) => `<span class="pchip" style="--pc:var(--muted)"${many ? ` title="${esc(ev.cal)}"` : ''}>${esc(ev.title)}</span>`).join('');

  // The calendar
  const items = layoutColumns(dayItems(day));
  const [a, b] = dayRange(items);
  dayView.range = [a, b];
  const y = (m) => ((m - a) * DAY_PX_PER_MIN).toFixed(1);
  const place = (it) => `top:${y(it.startMin)}px;height:${Math.max(18, (it.endMin - it.startMin) * DAY_PX_PER_MIN - 2).toFixed(1)}px;left:${(it.col / it.cols * 100).toFixed(3)}%;width:calc(${(100 / it.cols).toFixed(3)}% - 4px)`;
  const hours = [];
  for (let m = a; m <= b; m += 60) {
    hours.push(`<div class="cal-hour" style="top:${y(m)}px"><span>${m < b ? fmtTime(atDay(day, m)) : ''}</span></div>`);
  }
  const work = [minutesOf(settings.workStart), minutesOf(settings.workEnd)];
  const shade = work[1] > work[0]
    ? `<div class="cal-off" style="top:0;height:${y(Math.max(a, work[0]))}px"></div><div class="cal-off" style="top:${y(Math.min(b, work[1]))}px;bottom:0"></div>`
    : '';
  const blocks = items.map((it) => {
    if (it.kind === 'meet') {
      const ev = it.ev;
      return `<div class="cal-meet${ev.busy ? '' : ' free'}${it.endMin - it.startMin < 40 ? ' short' : ''}" style="${place(it)}" data-tip="${esc(`${fmtTime(ev.start)} – ${fmtTime(ev.end)}\n${ev.title}${many ? `\n${ev.cal}` : ''}${ev.busy ? '' : '\nShown as free'}`)}">
        <strong>${esc(ev.title)}</strong><span class="cal-when">${fmtTime(ev.start)} – ${fmtTime(ev.end)}</span></div>`;
    }
    const t = it.task;
    const color = projectById(t.projectId)?.color;
    const start = atDay(day, it.startMin);
    const end = atDay(day, it.endMin);
    const short = it.endMin - it.startMin < 40;
    return `<div class="cal-task${short ? ' short' : ''}${end < Date.now() ? ' past' : ''}${canEdit ? ' movable' : ''}" style="${place(it)}${color ? `;--bc:${color}` : ''}" data-cal-task="${t.id}" tabindex="0" role="button"
        aria-label="${esc(`${t.text}, ${fmtTime(start)} to ${fmtTime(end)}.${canEdit ? ' Arrow keys move it, Shift with arrows changes its length, Delete clears its time.' : ''}`)}">
        <strong>${esc(t.text)}</strong><span class="cal-when">${fmtTime(start)} – ${fmtTime(end)}</span>
        <span class="cal-task-actions">
          ${canFocus && end > Date.now() ? `<button type="button" data-block-start="${t.id}" title="Start focus" aria-label="Start focus on ${esc(t.text)}">▶</button>` : ''}
          ${canEdit ? `<button type="button" data-unblock="${t.id}" title="Clear the time" aria-label="Clear the time for ${esc(t.text)}">×</button>` : ''}
        </span>
        ${canEdit ? '<span class="cal-resize" data-cal-resize aria-hidden="true" title="Drag to change the length"></span>' : ''}
      </div>`;
  }).join('');
  const nowMin = (Date.now() - atDay(day, 0)) / 60000;
  const now = isToday && nowMin >= a && nowMin <= b ? `<div class="cal-now" style="top:${y(nowMin)}px"></div>` : '';
  $('dayCal').classList.toggle('editable', canEdit);
  $('dayCal').innerHTML = `<div class="cal-grid" style="height:${((b - a) * DAY_PX_PER_MIN).toFixed(0)}px">
      ${hours.join('')}<div class="cal-lane">${shade}${blocks}${now}</div>
    </div>`;
  $('dayEmpty').hidden = items.length > 0 || !canEdit;
}

// Scrolls the calendar to the current time (today) or the first thing on the day, once per day shown.
function scrollDayIntoView() {
  if (dayView.scrolled === planDay) return;
  dayView.scrolled = planDay;
  const lane = document.querySelector('#dayCal .cal-lane');
  if (!lane) return;
  const first = lane.querySelector('.cal-now') || lane.querySelector('.cal-task, .cal-meet');
  if (!first) return;
  const tab = $('tab-day');
  const top = first.getBoundingClientRect().top - tab.getBoundingClientRect().top + tab.scrollTop;
  tab.scrollTop = Math.max(0, top - 140);
}

/* ---------- Day view: events ---------- */

function bindDay() {
  const go = (day) => { planDay = day; renderPlan(); ensureCalendarFor(planDay); };
  $('dayPrev').addEventListener('click', () => go(shiftKey(planDay, -1)));
  $('dayNext').addEventListener('click', () => go(shiftKey(planDay, 1)));
  $('dayToday').addEventListener('click', () => go(todayKey()));
  $('dayRefresh').addEventListener('click', () => loadCalendar(true, planDay));

  const cal = $('dayCal');
  const side = $('daySide');
  const minuteAtY = (clientY) => {
    const r = cal.querySelector('.cal-lane').getBoundingClientRect();
    return dayView.range[0] + (clientY - r.top) / DAY_PX_PER_MIN;
  };
  const clampStart = (start, mins) => Math.max(dayView.range[0], Math.min(Math.max(dayView.range[0], dayView.range[1] - mins), start));
  const refocus = (id) => cal.querySelector(`[data-cal-task="${id}"]`)?.focus();

  // Clicks: buttons on blocks and in the side list.
  const onClick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.blockStart) startTask(b.dataset.blockStart);
    else if (b.dataset.unblock) unblockTask(b.dataset.unblock);
    else if (b.dataset.taskEdit) openTaskDialog(b.dataset.taskEdit);
    else if (b.dataset.dayNext) {
      const t = findTask(b.dataset.dayNext);
      if (t) setBlock(t.id, planDay, suggestStart(planDay, defaultBlockMins(t)), defaultBlockMins(t));
    }
  };
  cal.addEventListener('click', onClick);
  side.addEventListener('click', onClick);

  // Moving and resizing a block with the mouse (or pen, or touch).
  let drag = null;
  cal.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-cal-task]');
    if (!el || e.button !== 0 || e.target.closest('button')) return;
    const t = findTask(el.dataset.calTask);
    if (!t || !t.block) return;
    if (!cal.classList.contains('editable')) { drag = { el, t, click: true, x: e.clientX, y: e.clientY }; return; }
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag = {
      el, t, x: e.clientX, y: e.clientY, moved: false,
      resize: !!e.target.closest('[data-cal-resize]'),
      start: t.block.startMin, mins: t.block.mins,
      grab: minuteAtY(e.clientY) - t.block.startMin
    };
  });
  cal.addEventListener('pointermove', (e) => {
    if (!drag || drag.click) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y) + Math.abs(e.clientX - drag.x) < 5) return;
    drag.moved = true;
    drag.el.classList.add('moving');
    const m = minuteAtY(e.clientY);
    if (drag.resize) {
      drag.mins = Math.max(DAY_SNAP, Math.min(480, snapMin(m - drag.t.block.startMin), dayView.range[1] - drag.t.block.startMin));
    } else {
      drag.start = clampStart(snapMin(m - drag.grab), drag.mins);
    }
    drag.out = !drag.resize && !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#daySide');
    side.classList.toggle('drop-out', drag.out);
    drag.el.classList.toggle('leaving', drag.out);
    drag.el.style.top = `${((drag.start - dayView.range[0]) * DAY_PX_PER_MIN).toFixed(1)}px`;
    drag.el.style.height = `${Math.max(18, drag.mins * DAY_PX_PER_MIN - 2).toFixed(1)}px`;
    drag.el.querySelector('.cal-when').textContent = `${fmtTime(atDay(planDay, drag.start))} – ${fmtTime(atDay(planDay, drag.start + drag.mins))}`;
  });
  const endDrag = async (e, cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    side.classList.remove('drop-out');
    if (d.click || !d.moved) {
      if (!cancelled && Math.abs(e.clientY - d.y) + Math.abs(e.clientX - d.x) < 5) openTaskDialog(d.t.id);
      return;
    }
    if (cancelled) { renderDay(); return; }
    if (d.out) await unblockTask(d.t.id);
    else if (d.start !== d.t.block.startMin || d.mins !== d.t.block.mins) await setBlock(d.t.id, planDay, d.start, d.mins);
    else renderDay();
  };
  cal.addEventListener('pointerup', (e) => endDrag(e, false));
  cal.addEventListener('pointercancel', (e) => endDrag(e, true));

  // Keyboard: arrows move a block by 15 minutes, Shift+arrows change its length, Delete clears its time.
  cal.addEventListener('keydown', async (e) => {
    const el = e.target.closest?.('[data-cal-task]');
    if (!el || e.target !== el) return;
    const t = findTask(el.dataset.calTask);
    if (!t || !t.block) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskDialog(t.id); return; }
    if (!cal.classList.contains('editable')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); await unblockTask(t.id); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.key === 'ArrowUp' ? -DAY_SNAP : DAY_SNAP;
    if (e.shiftKey) await setBlock(t.id, planDay, t.block.startMin, Math.max(DAY_SNAP, t.block.mins + step));
    else await setBlock(t.id, planDay, Math.max(0, t.block.startMin + step), t.block.mins);
    refocus(t.id);
  });

  // Dragging a task from the side list onto the calendar.
  const isTaskDrag = (e) => [...(e.dataTransfer?.types || [])].includes('application/x-steady-task');
  side.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-day-task][draggable="true"]');
    if (!row) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.dayTask);
    e.dataTransfer.setData('application/x-steady-task', row.dataset.dayTask);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  side.addEventListener('dragend', () => {
    side.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging'));
    cal.querySelector('.cal-ghost')?.remove();
  });
  const ghostAt = (e) => {
    const lane = cal.querySelector('.cal-lane');
    let ghost = lane.querySelector('.cal-ghost');
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'cal-ghost'; lane.appendChild(ghost); }
    const start = clampStart(snapMin(minuteAtY(e.clientY)), DAY_SNAP);
    ghost.style.top = `${((start - dayView.range[0]) * DAY_PX_PER_MIN).toFixed(1)}px`;
    ghost.style.height = `${(60 * DAY_PX_PER_MIN).toFixed(1)}px`;
    ghost.dataset.time = fmtTime(atDay(planDay, start));
    return start;
  };
  cal.addEventListener('dragover', (e) => {
    if (!isTaskDrag(e) || !cal.classList.contains('editable') || !e.target.closest?.('.cal-grid')) return;
    e.preventDefault();
    ghostAt(e);
  });
  cal.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !cal.contains(e.relatedTarget)) cal.querySelector('.cal-ghost')?.remove();
  });
  cal.addEventListener('drop', (e) => {
    if (!isTaskDrag(e) || !cal.classList.contains('editable')) return;
    e.preventDefault();
    const start = ghostAt(e);
    cal.querySelector('.cal-ghost')?.remove();
    const t = findTask(e.dataTransfer.getData('application/x-steady-task'));
    if (t) setBlock(t.id, planDay, clampStart(start, defaultBlockMins(t)), defaultBlockMins(t));
  });
}
