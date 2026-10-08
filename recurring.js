/* ---------- Recurring tasks ---------- */

const REPEAT_OPTIONS = [
  { id: '', label: 'Doesn\'t repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday (Mon to Fri)' },
  { id: 'weekly', label: 'Every week on this day' },
  { id: 'monthly', label: 'Every month on this date' }
];
const RECUR_AHEAD_DAYS = 14;

function recurById(id) {
  return (data.recurring || []).find((r) => r.id === id) || null;
}

function weekdayOf(day) { return new Date(day + 'T12:00').getDay(); }
function monthdayOf(day) { return new Date(day + 'T12:00').getDate(); }

function recurMatches(r, day) {
  if (!r || r.stopped || day < r.startDay) return false;
  const wd = weekdayOf(day);
  switch (r.freq) {
    case 'daily': return true;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'weekly': return wd === r.weekday;
    case 'monthly': {
      const d = new Date(day + 'T12:00');
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return monthdayOf(day) === Math.min(r.monthday, last); // the 31st falls back to the month's last day
    }
    default: return false;
  }
}

function repeatLabel(r) {
  if (!r) return '';
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ord = (n) => {
    const v = n % 100;
    return n + (v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  };
  return {
    daily: 'Repeats every day',
    weekdays: 'Repeats every weekday',
    weekly: `Repeats every ${names[r.weekday]}`,
    monthly: `Repeats monthly on the ${ord(r.monthday)}`
  }[r.freq] || '';
}

const skipKey = (r, day) => `${r.id}|${day}`;

// Creates the task for each repeating rule on the given day, once.
function materializeDay(day) {
  let changed = false;
  data.meta.recurSkips = data.meta.recurSkips || {};
  for (const r of data.recurring || []) {
    if (!recurMatches(r, day)) continue;
    if (data.meta.recurSkips[skipKey(r, day)]) continue;
    if (data.tasks.some((t) => t.recurId === r.id && t.day === day)) continue;
    data.tasks.push({
      id: uid(), text: r.text, day, est: r.est || 0, projectId: r.projectId || null, presetId: r.presetId || null,
      recurId: r.id, done: false, doneAt: null, createdAt: Date.now(), order: nextOrder(day)
    });
    changed = true;
  }
  return changed;
}

// Today plus whatever future day is being looked at (so you can plan ahead).
async function materializeRecurring(extraDay) {
  const today = dayKey(Date.now());
  let changed = materializeDay(today);
  if (extraDay && extraDay > today && extraDay <= shiftKey(today, RECUR_AHEAD_DAYS)) {
    changed = materializeDay(extraDay) || changed;
  }
  // Forget skip markers older than two months.
  const cutoff = shiftKey(today, -60);
  for (const k of Object.keys(data.meta.recurSkips || {})) {
    if (k.split('|')[1] < cutoff) { delete data.meta.recurSkips[k]; changed = true; }
  }
  if (changed) await persist('tasks', 'meta');
  return changed;
}

// Called when a task is deleted, so its repeat doesn't bring it straight back that day.
function rememberSkip(task) {
  if (!task || !task.recurId) return;
  data.meta.recurSkips = data.meta.recurSkips || {};
  data.meta.recurSkips[`${task.recurId}|${task.day}`] = true;
}

async function setRepeat(task, freq) {
  const today = dayKey(Date.now());
  if (!freq) {
    if (task.recurId) await stopRecurring(task.recurId, task.id);
    return;
  }
  let r = recurById(task.recurId);
  if (!r) {
    r = { id: uid(), createdAt: Date.now() };
    data.recurring.push(r);
    task.recurId = r.id;
  }
  Object.assign(r, {
    text: task.text, projectId: task.projectId || null, est: task.est || 0, presetId: task.presetId || null,
    freq, weekday: weekdayOf(task.day), monthday: monthdayOf(task.day),
    startDay: task.day < today ? today : task.day, stopped: false
  });
  // Keep upcoming copies in line with the edited task.
  data.tasks.forEach((t) => {
    if (t.recurId === r.id && t.id !== task.id && !t.done && t.day > today) {
      if (recurMatches(r, t.day)) Object.assign(t, { text: r.text, projectId: r.projectId, est: r.est, presetId: r.presetId });
      else t._remove = true;
    }
  });
  data.tasks = data.tasks.filter((t) => !t._remove);
  await persist('recurring', 'tasks');
}

async function stopRecurring(recurId, keepTaskId) {
  const today = dayKey(Date.now());
  data.recurring = data.recurring.filter((r) => r.id !== recurId);
  // Remove copies planned for future days; keep today's and anything already done.
  data.tasks = data.tasks.filter((t) => !(t.recurId === recurId && t.id !== keepTaskId && !t.done && t.day > today));
  data.tasks.forEach((t) => { if (t.recurId === recurId) t.recurId = null; });
  await persist('recurring', 'tasks');
  renderRecurringSettings();
  renderPlan();
}

function renderRecurringSettings() {
  const list = data.recurring || [];
  $('recurringList').innerHTML = list.length
    ? list.map((r) => `<li>
        <span class="recur-text">${esc(r.text)} ${projectChip(r.projectId)}</span>
        <span class="recur-rule">${esc(repeatLabel(r))}</span>
        <button class="link" type="button" data-recur-stop="${r.id}">Stop repeating</button>
      </li>`).join('')
    : '<li class="empty">No repeating tasks. Open any task in your plan and choose how often it repeats.</li>';
}

function bindRecurring() {
  $('recurringList').addEventListener('click', (e) => {
    const id = e.target.dataset?.recurStop;
    if (id) stopRecurring(id);
  });
}
