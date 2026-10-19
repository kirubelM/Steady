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

const dayView = { range: [0, 0], scrolled: '', showDone: false, moveDone: false, mode: 'day' };
try {
  dayView.showDone = localStorage.getItem('dayShowDone') === '1';
  dayView.moveDone = localStorage.getItem('dayMoveDone') === '1';
  dayView.mode = localStorage.getItem('dayMode') === 'week' ? 'week' : 'day';
} catch { /* storage unavailable */ }

// Monday to Sunday of the week holding `day`.
function weekOf(day) {
  const monday = shiftKey(day, -((new Date(day + 'T12:00').getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftKey(monday, i));
}

// The days the calendar shows right now.
const shownDays = () => (dayView.mode === 'week' ? weekOf(planDay) : [planDay]);

// What actually happened on `day`: sessions, check-ins and logged work as spans; finished things as points.
function doneOnDay(day) {
  const midnight = atDay(day, 0);
  const toMin = (ms) => Math.max(0, Math.min(24 * 60, (ms - midnight) / 60000));
  return workEntries()
    .filter((e) => WORK_TYPES.includes(e.type) && dayKey(e.start) === day)
    .map((e) => {
      const startMin = toMin(e.start);
      const point = !!(e.taskCompletion || e.subtaskCompletion || e.parkingCompletion) || e.end - e.start < 60000;
      // A point still needs room on screen, so give it about 20 minutes when laying things out.
      return { kind: 'done', entry: e, point, startMin, endMin: point ? startMin + 20 : Math.max(startMin + 1, toMin(e.end)) };
    });
}

const DONE_SNAP = 5; // finished things keep closer to their real times than plans do

// Moves something finished to `start` (ms) on the same day, keeping its length. Never into the future.
async function moveDoneItem(id, start) {
  const midnight = atDay(dayKey(start), 0);
  if (id.startsWith('task:') || id.startsWith('subtask:')) {
    const [, taskId, subId] = id.split(':');
    const item = subId ? findSub(taskId, subId) : findTask(taskId);
    if (!item || !item.done) return;
    item.doneAt = Math.max(midnight, Math.min(start, Date.now()));
    await persist('tasks');
  } else {
    const e = data.entries.find((x) => x.id === id);
    if (!e) return;
    const len = e.end - e.start;
    e.start = Math.max(midnight, Math.min(start, Date.now() - len));
    e.end = e.start + len;
    await persist('entries');
  }
  renderPlan();
  renderLog();
}

function doneTitle(e) {
  if (e.type === 'session') return e.note || e.task || 'Focus session';
  if (e.type === 'checkin') return e.note || 'Check-in';
  return e.note || 'Logged work';
}

function renderDay() {
  const week = dayView.mode === 'week';
  const day = planDay;
  const days = shownDays();
  const today = todayKey();
  const isToday = day === today;
  const canFocus = S.state === 'idle' || S.state === 'breakPending';
  const many = (settings.calendars || []).length > 1;
  const short = (k) => new Date(k + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

  document.querySelectorAll('[data-day-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dayMode === dayView.mode)));
  $('dayPrev').setAttribute('aria-label', week ? 'Previous week' : 'Previous day');
  $('dayNext').setAttribute('aria-label', week ? 'Next week' : 'Next day');
  $('dayTitle').textContent = week ? (days.includes(today) ? 'This week' : `Week of ${short(days[0])}`) : dayTitle(day);
  $('dayDate').textContent = week
    ? `${short(days[0])} – ${short(days[6])}`
    : new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('dayToday').hidden = week ? days.includes(today) : isToday;
  renderCalButtons();
  const info = week ? weekSummary(days) : scheduleSummary(day);
  $('daySummary').textContent = info.text;
  $('daySummary').classList.toggle('warn-text', !!Cal.error);
  $('dayWarning').hidden = !info.warning;
  $('dayWarning').textContent = info.warning || '';

  // Tasks without a time: the day's, or the whole week's in week view
  const loose = days.flatMap((d) => unscheduledTasks(d));
  const anyEditable = days.some((d) => d >= today);
  $('dayTodo').innerHTML = loose.length
    ? loose.map((t) => {
      const color = projectById(t.projectId)?.color;
      const movable = anyEditable;
      return `<li class="day-todo${movable ? '' : ' fixed'}"${color ? ` style="--pc:${color}"` : ''} data-day-task="${t.id}"${movable ? ' draggable="true"' : ''}>
        <button class="day-todo-text" type="button" data-task-edit="${t.id}" title="Edit task">${esc(t.text)}</button>
        <span class="day-todo-len">${week ? `${esc(new Date(t.day + 'T12:00').toLocaleDateString([], { weekday: 'short' }))} · ` : ''}${fmtMins(defaultBlockMins(t) * 60)}</span>
        ${movable ? `<button class="link" type="button" data-day-next="${t.id}" title="Schedule at the next free time">Next free time</button>` : ''}
      </li>`;
    }).join('')
    : `<li class="empty">${days.some((d) => tasksFor(d).some((t) => !t.done)) ? 'Everything has a time.' : `No tasks for this ${week ? 'week' : 'day'}. Add some on the Plan tab.`}</li>`;
  $('dayTodoHint').hidden = !anyEditable;

  // All-day events (day view only; the week view keeps its columns uncluttered)
  const allDay = !week && calendarOn() ? eventsOn(day).filter((ev) => ev.allDay) : [];
  $('dayAllDay').hidden = !allDay.length;
  $('dayAllDay').innerHTML = allDay.map((ev) => `<span class="pchip" style="--pc:var(--muted)"${many ? ` title="${esc(ev.cal)}"` : ''}>${esc(ev.title)}</span>`).join('');

  // What's done: day view only
  const showDone = !week && dayView.showDone && day <= today;
  const done = showDone ? layoutColumns(doneOnDay(day)) : [];
  $('dayDoneToggle').hidden = week || day > today;
  $('dayShowDone').checked = dayView.showDone;
  const moveDone = showDone && dayView.moveDone;
  $('dayMoveDone').hidden = !showDone;
  $('dayMoveDone').setAttribute('aria-pressed', String(moveDone));
  $('dayDoneCount').textContent = !week && day <= today ? `(${doneOnDay(day).length})` : '';

  // The calendar
  const cols = days.map((d) => ({ day: d, items: layoutColumns(dayItems(d)) }));
  const [a, b] = dayRange([...cols.flatMap((c) => c.items), ...done]);
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
  const missedIds = new Set(days.includes(today) ? missedBlocks().map((m) => m.task.id) : []);
  const nowMin = (Date.now() - atDay(today, 0)) / 60000;
  const nowLine = nowMin >= a && nowMin <= b ? `<div class="cal-now" style="top:${y(nowMin)}px"></div>` : '';

  const blockHtml = (it, colDay) => {
    if (it.kind === 'meet') {
      const ev = it.ev;
      return `<div class="cal-meet${ev.busy ? '' : ' free'}${it.endMin - it.startMin < 40 ? ' short' : ''}" style="${place(it)}" data-tip="${esc(`${fmtTime(ev.start)} – ${fmtTime(ev.end)}\n${ev.title}${many ? `\n${ev.cal}` : ''}${ev.busy ? '' : '\nShown as free'}`)}">
        <strong>${esc(ev.title)}</strong><span class="cal-when">${fmtTime(ev.start)} – ${fmtTime(ev.end)}</span></div>`;
    }
    const t = it.task;
    const canEdit = colDay >= today;
    const color = projectById(t.projectId)?.color;
    const start = atDay(colDay, it.startMin);
    const end = atDay(colDay, it.endMin);
    const isShort = it.endMin - it.startMin < 40;
    const missed = missedIds.has(t.id);
    const keys = canEdit ? ` Arrow keys move it${week ? ', Left and Right move it a day' : ''}, Shift with arrows changes its length, Delete clears its time.` : '';
    return `<div class="cal-task${isShort ? ' short' : ''}${end < Date.now() ? ' past' : ''}${missed ? ' missed' : ''}${canEdit ? ' movable' : ''}" style="${place(it)}${color ? `;--bc:${color}` : ''}" data-cal-task="${t.id}" data-cal-day="${colDay}" tabindex="0" role="button"
        aria-label="${esc(`${t.text}, ${week ? `${new Date(colDay + 'T12:00').toLocaleDateString([], { weekday: 'long' })} ` : ''}${fmtTime(start)} to ${fmtTime(end)}.${keys}`)}">
        <strong>${esc(t.text)}</strong><span class="cal-when">${fmtTime(start)} – ${fmtTime(end)}</span>
        <span class="cal-task-actions">
          ${canFocus && colDay === today && end > Date.now() ? `<button type="button" data-block-start="${t.id}" title="Start focus" aria-label="Start focus on ${esc(t.text)}">▶</button>` : ''}
          ${missed ? `<button type="button" data-resched-next="${t.id}" title="Move to the next free time" aria-label="Move ${esc(t.text)} to the next free time">↻</button><button type="button" data-resched-tomorrow="${t.id}" title="Move to tomorrow" aria-label="Move ${esc(t.text)} to tomorrow">→</button>` : ''}
          ${canEdit ? `<button type="button" data-unblock="${t.id}" title="Clear the time" aria-label="Clear the time for ${esc(t.text)}">×</button>` : ''}
        </span>
        ${canEdit ? '<span class="cal-resize" data-cal-resize aria-hidden="true" title="Drag to change the length"></span>' : ''}
      </div>`;
  };

  const doneBlocks = done.map((it) => {
    const e = it.entry;
    const color = projectById(e.projectId)?.color;
    const title = doneTitle(e);
    const when = it.point ? fmtTime(e.start) : `${fmtTime(e.start)} – ${fmtTime(e.end)}`;
    const label = `${entryLabel(e)}: ${title}, ${when}.${moveDone ? ' Drag, or use the Up and Down arrow keys, to change its time.' : ''}`;
    const style = it.point
      ? `top:${y(it.startMin)}px;height:20px;left:${(it.col / it.cols * 100).toFixed(3)}%;width:calc(${(100 / it.cols).toFixed(3)}% - 4px)`
      : place(it);
    return `<button type="button" class="cal-done${it.point ? ' point' : ` kind-${e.type}`}${!it.point && it.endMin - it.startMin < 40 ? ' short' : ''}${moveDone ? ' movable' : ''}" style="${style}${color ? `;--bc:${color}` : ''}"
        data-done-entry="${esc(e.id)}" data-done-start="${e.start}" data-done-len="${it.point ? 0 : e.end - e.start}" aria-label="${esc(label)} Click to edit." data-tip="${esc(`${when}\n${entryLabel(e)}\n${title}`)}">
        ${it.point ? '<span class="cal-check" aria-hidden="true">✓</span>' : `<span class="cal-done-icon" aria-hidden="true">${typeIcon(e.type)}</span>`}<strong>${esc(title)}</strong>${it.point ? '' : `<span class="cal-when">${when}</span>`}
      </button>`;
  }).join('');

  const colsHtml = cols.map((c, i) => `<div class="cal-col cal-plan${c.day < today ? ' past-day' : ''}${c.day === today ? ' today' : ''}" data-col-day="${c.day}"${week ? ` style="left:${(i / 7 * 100).toFixed(3)}%;right:auto;width:${(100 / 7).toFixed(3)}%"` : ''}>
      ${c.items.map((it) => blockHtml(it, c.day)).join('')}${week && c.day === today ? nowLine : ''}</div>`).join('');
  const head = week
    ? `<div class="cal-days-head">${days.map((d) => `<button type="button" class="${d === today ? 'today' : ''}" data-open-day="${d}" title="Open this day">
        <span>${esc(new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' }))}</span><strong>${new Date(d + 'T12:00').getDate()}</strong></button>`).join('')}</div>`
    : showDone ? `<div class="cal-cols" aria-hidden="true"><span>Planned</span><span>Done${done.length ? '' : ' · nothing yet'}</span></div>` : '';

  $('dayCal').classList.toggle('editable', anyEditable);
  $('dayCal').classList.toggle('with-done', showDone);
  $('dayCal').classList.toggle('moving-done', moveDone);
  $('dayCal').classList.toggle('week', week);
  $('daySide').parentElement.classList.toggle('wide-cal', showDone || week); // more columns: a narrower list, and it stacks sooner
  $('dayCal').innerHTML = `${head}
    <div class="cal-grid" style="height:${((b - a) * DAY_PX_PER_MIN).toFixed(0)}px">
      ${hours.join('')}<div class="cal-lane">${shade}${colsHtml}${showDone ? `<div class="cal-col cal-actual" aria-label="What you did">${doneBlocks}</div>` : ''}${!week && isToday ? nowLine : ''}</div>
    </div>`;
  $('dayEmpty').hidden = cols.some((c) => c.items.length) || !anyEditable || showDone;
}

// The week's scheduled and free time, from today on.
function weekSummary(days) {
  const today = todayKey();
  const ahead = days.filter((d) => d >= today);
  const blocked = days.reduce((a, d) => a + taskBlocksOn(d).reduce((s, b) => s + (b.end - b.start), 0), 0);
  const free = ahead.reduce((a, d) => a + freeBlocks(d).reduce((s, [x, y]) => s + (y - x), 0), 0);
  const text = `${blocked ? `${fmtMins(blocked / 1000)} scheduled for tasks this week. ` : 'Nothing scheduled this week yet. '}${ahead.length ? `${fmtMins(free / 1000)} free in your working hours${ahead.length < 7 ? ' from today on' : ''}.` : ''}`;
  return { text, warning: calendarOn() && !Cal.error ? Cal.warning : null };
}

// Scrolls the calendar to the current time (today) or the first thing on the day, once per day shown.
function scrollDayIntoView() {
  const key = `${dayView.mode}:${shownDays()[0]}`;
  if (dayView.scrolled === key) return;
  dayView.scrolled = key;
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
  const go = (day) => { planDay = day; renderPlan(); ensureCalendarFor(planDay); ensureCalendarFor(shownDays()[6] || planDay); };
  const step = () => (dayView.mode === 'week' ? 7 : 1);
  $('dayPrev').addEventListener('click', () => go(shiftKey(planDay, -step())));
  $('dayNext').addEventListener('click', () => go(shiftKey(planDay, step())));
  $('dayToday').addEventListener('click', () => go(todayKey()));
  $('dayShowDone').addEventListener('change', (e) => {
    dayView.showDone = e.target.checked;
    try { localStorage.setItem('dayShowDone', dayView.showDone ? '1' : '0'); } catch { /* storage unavailable */ }
    renderDay();
  });
  $('dayMoveDone').addEventListener('click', () => {
    dayView.moveDone = !dayView.moveDone;
    try { localStorage.setItem('dayMoveDone', dayView.moveDone ? '1' : '0'); } catch { /* storage unavailable */ }
    renderDay();
  });
  const setMode = (mode) => {
    dayView.mode = mode;
    try { localStorage.setItem('dayMode', mode); } catch { /* storage unavailable */ }
    dayView.scrolled = '';
    go(planDay);
    scrollDayIntoView();
  };
  document.querySelectorAll('[data-day-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.dayMode)));

  const cal = $('dayCal');
  const side = $('daySide');
  const today = () => todayKey();
  const minuteAtY = (clientY) => {
    const r = cal.querySelector('.cal-lane').getBoundingClientRect();
    return dayView.range[0] + (clientY - r.top) / DAY_PX_PER_MIN;
  };
  // The day column under a point (the nearest one when between columns).
  const colAt = (clientX) => {
    const colsEls = [...cal.querySelectorAll('[data-col-day]')];
    let best = colsEls[0];
    let dist = Infinity;
    for (const c of colsEls) {
      const r = c.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < dist) { dist = d; best = c; }
    }
    return best;
  };
  const clampStart = (start, mins) => Math.max(dayView.range[0], Math.min(Math.max(dayView.range[0], dayView.range[1] - mins), start));
  const refocus = (id) => cal.querySelector(`[data-cal-task="${id}"]`)?.focus();
  const refocusDone = (id) => cal.querySelector(`[data-done-entry="${CSS.escape(id)}"]`)?.focus();
  const clearNest = () => document.querySelectorAll('#tab-day .drop-into, #tab-day .as-sub').forEach((r) => r.classList.remove('drop-into', 'as-sub'));
  let doneDragEnd = 0; // when a finished item was last dropped, so the click that follows doesn't open it

  // Clicks: buttons on blocks, day headers and the side list.
  const onClick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.blockStart) startTask(b.dataset.blockStart);
    else if (b.dataset.unblock) unblockTask(b.dataset.unblock);
    else if (b.dataset.taskEdit) openTaskDialog(b.dataset.taskEdit);
    else if (b.dataset.doneEntry) { if (Date.now() - doneDragEnd > 300) openEntryDialog(b.dataset.doneEntry); }
    else if (b.dataset.reschedNext) rescheduleBlock(b.dataset.reschedNext, 'next');
    else if (b.dataset.reschedTomorrow) rescheduleBlock(b.dataset.reschedTomorrow, 'tomorrow');
    else if (b.dataset.openDay) { planDay = b.dataset.openDay; setMode('day'); }
    else if (b.dataset.dayNext) {
      const t = findTask(b.dataset.dayNext);
      if (!t) return;
      const day = t.day < today() ? today() : t.day;
      setBlock(t.id, day, suggestStart(day, defaultBlockMins(t)), defaultBlockMins(t));
    }
  };
  cal.addEventListener('click', onClick);
  side.addEventListener('click', onClick);

  // Moving and resizing a block with the mouse (or pen, or touch). In the week view it can also move between days.
  let drag = null;
  cal.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-cal-task]');
    if (!el || e.button !== 0 || e.target.closest('button')) return;
    const t = findTask(el.dataset.calTask);
    if (!t || !t.block) return;
    if (!el.classList.contains('movable')) { drag = { el, t, click: true, x: e.clientX, y: e.clientY }; return; }
    e.preventDefault();
    cal.setPointerCapture(e.pointerId); // on the calendar, so the block can be redrawn while it moves
    const col = el.closest('[data-col-day]');
    drag = {
      el, t, x: e.clientX, y: e.clientY, moved: false,
      resize: !!e.target.closest('[data-cal-resize]'),
      day: el.dataset.calDay, fromDay: el.dataset.calDay, fromLeft: col.getBoundingClientRect().left,
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
      if (dayView.mode === 'week') {
        const col = colAt(e.clientX);
        if (col && col.dataset.colDay >= today()) {
          drag.day = col.dataset.colDay;
          drag.el.style.transform = `translateX(${(col.getBoundingClientRect().left - drag.fromLeft).toFixed(0)}px)`;
        }
      }
    }
    // Ctrl+Shift: drop onto another task to make this one its subtask.
    clearNest();
    drag.nest = null;
    if (!drag.resize && nestKeys(e)) {
      const over = document.elementsFromPoint(e.clientX, e.clientY)
        .map((x) => x.closest('[data-cal-task], [data-day-task]')).find((x) => x && x !== drag.el);
      const nestId = over && (over.dataset.calTask || over.dataset.dayTask);
      if (nestId && nestId !== drag.t.id) { drag.nest = nestId; over.classList.add('drop-into'); }
    }
    drag.el.classList.toggle('nesting', !!drag.nest);
    drag.out = !drag.resize && !drag.nest && !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#daySide');
    side.classList.toggle('drop-out', drag.out);
    drag.el.classList.toggle('leaving', drag.out);
    drag.el.style.top = `${((drag.start - dayView.range[0]) * DAY_PX_PER_MIN).toFixed(1)}px`;
    drag.el.style.height = `${Math.max(18, drag.mins * DAY_PX_PER_MIN - 2).toFixed(1)}px`;
    const label = `${fmtTime(atDay(drag.day, drag.start))} – ${fmtTime(atDay(drag.day, drag.start + drag.mins))}`;
    drag.el.querySelector('.cal-when').textContent = dayView.mode === 'week' && drag.day !== drag.fromDay
      ? `${new Date(drag.day + 'T12:00').toLocaleDateString([], { weekday: 'short' })} ${label}` : label;
  });
  const endDrag = async (e, cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    side.classList.remove('drop-out');
    clearNest();
    if (d.click || !d.moved) {
      if (!cancelled && Math.abs(e.clientY - d.y) + Math.abs(e.clientX - d.x) < 5) openTaskDialog(d.t.id);
      return;
    }
    if (cancelled) { renderDay(); return; }
    if (d.nest && nestKeys(e)) { if (!(await nestTask(d.t.id, d.nest))) renderDay(); }
    else if (d.out) await unblockTask(d.t.id);
    else if (d.day !== d.fromDay || d.start !== d.t.block.startMin || d.mins !== d.t.block.mins) await setBlock(d.t.id, d.day, d.start, d.mins);
    else renderDay();
  };
  cal.addEventListener('pointerup', (e) => endDrag(e, false));
  cal.addEventListener('pointercancel', (e) => endDrag(e, true));

  // Moving finished things to the time they really happened, while "Move done items" is on.
  let doneDrag = null;
  cal.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cal-done.movable');
    if (!el || e.button !== 0) return;
    const startMin = (Number(el.dataset.doneStart) - atDay(planDay, 0)) / 60000;
    doneDrag = { el, id: el.dataset.doneEntry, x: e.clientX, y: e.clientY, pointerId: e.pointerId, moved: false,
      startMin, start: startMin, len: Number(el.dataset.doneLen) / 60000, grab: minuteAtY(e.clientY) - startMin };
  });
  cal.addEventListener('pointermove', (e) => {
    const d = doneDrag;
    if (!d) return;
    if (!d.moved) {
      if (Math.abs(e.clientY - d.y) + Math.abs(e.clientX - d.x) < 5) return;
      d.moved = true;
      cal.setPointerCapture(d.pointerId);
      d.el.classList.add('moving');
    }
    const [a, b] = dayView.range;
    const nowMin = (Date.now() - atDay(planDay, 0)) / 60000;
    const latest = Math.min(b, nowMin) - d.len;
    d.start = Math.max(a, Math.min(latest, Math.round((minuteAtY(e.clientY) - d.grab) / DONE_SNAP) * DONE_SNAP));
    d.el.style.top = `${((d.start - a) * DAY_PX_PER_MIN).toFixed(1)}px`;
    const when = d.el.querySelector('.cal-when');
    if (when) when.textContent = `${fmtTime(atDay(planDay, d.start))} – ${fmtTime(atDay(planDay, d.start + d.len))}`;
    else d.el.dataset.time = fmtTime(atDay(planDay, d.start));
  });
  const endDoneDrag = async (cancelled) => {
    const d = doneDrag;
    doneDrag = null;
    if (!d || !d.moved) return;
    doneDragEnd = Date.now();
    if (cancelled || Math.abs(d.start - d.startMin) < 0.5) { renderDay(); return; }
    await moveDoneItem(d.id, atDay(planDay, d.start));
    refocusDone(d.id);
  };
  cal.addEventListener('pointerup', () => endDoneDrag(false));
  cal.addEventListener('pointercancel', () => endDoneDrag(true));
  cal.addEventListener('keydown', async (e) => {
    const el = e.target.closest?.('.cal-done.movable');
    if (!el || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const start = Number(el.dataset.doneStart) + (e.key === 'ArrowUp' ? -DONE_SNAP : DONE_SNAP) * 60000;
    if (dayKey(start) !== planDay) return;
    await moveDoneItem(el.dataset.doneEntry, start);
    refocusDone(el.dataset.doneEntry);
  });

  // Keyboard: arrows move a block by 15 minutes (Left/Right by a day in the week view),
  // Shift+arrows change its length, Delete clears its time.
  cal.addEventListener('keydown', async (e) => {
    const el = e.target.closest?.('[data-cal-task]');
    if (!el || e.target !== el) return;
    const t = findTask(el.dataset.calTask);
    if (!t || !t.block) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskDialog(t.id); return; }
    if (!el.classList.contains('movable')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); await unblockTask(t.id); return; }
    if (dayView.mode === 'week' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const day = shiftKey(t.block.day, e.key === 'ArrowLeft' ? -1 : 1);
      if (day < today() || !shownDays().includes(day)) return;
      await setBlock(t.id, day, t.block.startMin, t.block.mins);
      refocus(t.id);
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const stepMin = e.key === 'ArrowUp' ? -DAY_SNAP : DAY_SNAP;
    if (e.shiftKey) await setBlock(t.id, t.block.day, t.block.startMin, Math.max(DAY_SNAP, t.block.mins + stepMin));
    else await setBlock(t.id, t.block.day, Math.max(0, t.block.startMin + stepMin), t.block.mins);
    refocus(t.id);
  });

  // Dragging a task from the side list onto the calendar.
  // Holding Ctrl+Shift while dropping onto another task (in the list or on the calendar) makes it a subtask instead.
  const isTaskDrag = (e) => [...(e.dataTransfer?.types || [])].includes('application/x-steady-task');
  let sideDragId = null;
  side.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-day-task][draggable="true"]');
    if (!row) return;
    sideDragId = row.dataset.dayTask;
    e.dataTransfer.effectAllowed = 'all'; // Ctrl+Shift asks the system for a link drop
    e.dataTransfer.setData('text/plain', row.dataset.dayTask);
    e.dataTransfer.setData('application/x-steady-task', row.dataset.dayTask);
    requestAnimationFrame(() => row.classList.add('dragging'));
  });
  // The task a Ctrl+Shift drop would nest under, marked; null when there isn't one.
  const nestTargetAt = (e) => {
    clearNest();
    if (!sideDragId || !nestKeys(e)) return null;
    const el = e.target.closest?.('[data-day-task], [data-cal-task]');
    const target = el && (el.dataset.dayTask || el.dataset.calTask);
    if (!target || target === sideDragId) return null;
    el.classList.add('drop-into');
    side.querySelector('.day-todo.dragging')?.classList.add('as-sub');
    return target;
  };
  side.addEventListener('dragover', (e) => {
    if (!isTaskDrag(e) || !nestTargetAt(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
  });
  side.addEventListener('drop', (e) => {
    if (!isTaskDrag(e)) return;
    const target = nestTargetAt(e);
    clearNest();
    if (!target) return;
    e.preventDefault();
    nestTask(sideDragId, target);
  });
  side.addEventListener('dragend', () => {
    sideDragId = null;
    clearNest();
    side.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging', 'as-sub'));
    cal.querySelector('.cal-ghost')?.remove();
  });
  // Shows where a drop would land; returns the day and start, or null over a past day.
  const ghostAt = (e) => {
    const col = colAt(e.clientX);
    if (!col || col.dataset.colDay < today()) { cal.querySelector('.cal-ghost')?.remove(); return null; }
    let ghost = cal.querySelector('.cal-ghost');
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'cal-ghost'; }
    if (ghost.parentElement !== col) col.appendChild(ghost);
    const start = clampStart(snapMin(minuteAtY(e.clientY)), DAY_SNAP);
    ghost.style.top = `${((start - dayView.range[0]) * DAY_PX_PER_MIN).toFixed(1)}px`;
    ghost.style.height = `${(60 * DAY_PX_PER_MIN).toFixed(1)}px`;
    ghost.dataset.time = fmtTime(atDay(col.dataset.colDay, start));
    return { day: col.dataset.colDay, start };
  };
  cal.addEventListener('dragover', (e) => {
    if (!isTaskDrag(e) || !e.target.closest?.('.cal-grid')) return;
    if (nestKeys(e)) {
      cal.querySelector('.cal-ghost')?.remove();
      if (nestTargetAt(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; }
      return;
    }
    clearNest();
    if (ghostAt(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  });
  cal.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !cal.contains(e.relatedTarget)) { cal.querySelector('.cal-ghost')?.remove(); clearNest(); }
  });
  cal.addEventListener('drop', (e) => {
    if (!isTaskDrag(e)) return;
    if (nestKeys(e)) {
      const target = nestTargetAt(e);
      clearNest();
      cal.querySelector('.cal-ghost')?.remove();
      if (target) { e.preventDefault(); nestTask(sideDragId, target); }
      return;
    }
    const spot = ghostAt(e);
    cal.querySelector('.cal-ghost')?.remove();
    if (!spot) return;
    e.preventDefault();
    const t = findTask(e.dataTransfer.getData('application/x-steady-task'));
    if (t) setBlock(t.id, spot.day, clampStart(spot.start, defaultBlockMins(t)), defaultBlockMins(t));
  });
}
