/* ---------- Due dates and priority ---------- */

// How a task's due date reads today, or null if it has none (or is finished).
function dueStatus(t, today = todayKey()) {
  if (!t || !t.due || t.done) return null;
  const diff = Math.round((new Date(t.due + 'T12:00') - new Date(today + 'T12:00')) / 86400000);
  const date = new Date(t.due + 'T12:00');
  if (diff < 0) return { kind: 'overdue', days: -diff, label: diff === -1 ? 'Overdue by a day' : `Overdue by ${-diff} days` };
  if (diff === 0) return { kind: 'today', days: 0, label: 'Due today' };
  if (diff === 1) return { kind: 'soon', days: 1, label: 'Due tomorrow' };
  if (diff < 7) return { kind: 'soon', days: diff, label: `Due ${date.toLocaleDateString([], { weekday: 'long' })}` };
  return { kind: 'later', days: diff, label: `Due ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}` };
}

const isUrgent = (t) => { const d = dueStatus(t); return !!d && (d.kind === 'overdue' || d.kind === 'today'); };

// Starred and urgent tasks float to the top, even in "My order".
const floatsUp = (t) => !!t.starred || isUrgent(t);

// The "Priority" sort: starred, then by due date (soonest first), then your own order.
function priorityCompare(a, b) {
  if (!!b.starred - !!a.starred) return !!b.starred - !!a.starred;
  const da = a.due || '9999-99-99';
  const db = b.due || '9999-99-99';
  return da < db ? -1 : da > db ? 1 : 0;
}

async function toggleStar(id) {
  const t = findTask(id);
  if (!t) return;
  t.starred = !t.starred;
  await persist('tasks');
  renderPlan();
}

/* ---------- Time blocks: reserving time on the schedule for a task ---------- */

// Default length for a block: the sessions the task still needs, at its usual session length.
function defaultBlockMins(t) {
  const p = (t.presetId && presetById(t.presetId)) || currentPreset();
  const sessions = Math.max(1, sessionsLeft(t));
  return Math.min(240, sessions * p.focusMin + (sessions - 1) * p.breakMin);
}

// The day's task blocks as times, earliest first.
function taskBlocksOn(day) {
  return data.tasks
    .filter((t) => t.block && t.block.day === day && !t.done)
    .map((t) => ({ task: t, start: atDay(day, t.block.startMin), end: atDay(day, t.block.startMin + t.block.mins) }))
    .sort((a, b) => a.start - b.start);
}

// Blocks a task from startMin (minutes after midnight, rounded to 15) for `mins` minutes on `day`.
// The task moves to that day if it was planned for another one.
async function setBlock(id, day, startMin, mins) {
  const t = findTask(id);
  if (!t) return null;
  const len = Math.max(15, Math.min(480, Math.round((mins || defaultBlockMins(t)) / 5) * 5));
  const start = Math.max(0, Math.min(24 * 60 - len, Math.round(startMin / 15) * 15));
  t.block = { day, startMin: start, mins: len };
  if (t.day !== day) { t.day = day; t.order = nextOrder(day); }
  await persist('tasks');
  renderPlan();
  return t.block;
}

async function unblockTask(id) {
  const t = findTask(id);
  if (!t || !t.block) return;
  t.block = null;
  await persist('tasks');
  renderPlan();
}

/* ---------- Scheduling a task at a time, from its row in the list ---------- */

let timeFor = null; // task whose "Schedule a time" form is open

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const BLOCK_LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240];

// Where a new block should start: the first free stretch of the day long enough for it, on a quarter hour.
function suggestStart(day, mins = 0) {
  const free = freeBlocks(day).map(([a, b]) => [Math.ceil((a - atDay(day, 0)) / 60000 / 15) * 15, (b - atDay(day, 0)) / 60000]);
  const first = free.find(([a, b]) => b - a >= mins) || free[0];
  let min = first ? first[0] : minutesOf(settings.workStart);
  if (!first && day === todayKey()) min = Math.max(min, Math.ceil((Date.now() - atDay(day, 0)) / 60000 / 15) * 15);
  return Math.min(min, 24 * 60 - 15);
}

function timeButton(t) {
  const label = t.block ? fmtTime(atDay(t.block.day, t.block.startMin)) : '';
  return `<button class="time-btn${t.block ? ' on' : ''}" type="button" data-task-time="${t.id}" aria-expanded="${timeFor === t.id}"
    aria-label="${t.block ? `Scheduled at ${esc(label)}. Change the time for` : 'Schedule a time for'} ${esc(t.text)}" title="${t.block ? 'Change the time' : 'Schedule a time'}">
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${t.block ? `<span>${esc(label)}</span>` : ''}</button>`;
}

function timeFormHtml(t, day) {
  const start = t.block ? t.block.startMin : suggestStart(day, defaultBlockMins(t));
  const mins = t.block ? t.block.mins : defaultBlockMins(t);
  const lengths = BLOCK_LENGTHS.includes(mins) ? BLOCK_LENGTHS : [...BLOCK_LENGTHS, mins].sort((a, b) => a - b);
  return `<form class="time-form" data-time-form="${t.id}">
      <label>Start <input type="time" step="900" value="${hhmm(start)}" data-time-start required></label>
      <label>for <select data-time-mins>${lengths.map((m) => `<option value="${m}"${m === mins ? ' selected' : ''}>${fmtMins(m * 60)}</option>`).join('')}</select></label>
      <button class="btn small primary" type="submit">${t.block ? 'Update' : 'Schedule'}</button>
      ${t.block ? `<button class="link" type="button" data-time-clear="${t.id}">Remove time</button>` : ''}
      <button class="link" type="button" data-time-cancel>Cancel</button>
    </form>`;
}

function toggleTimeForm(id) {
  timeFor = timeFor === id ? null : id;
  renderPlan();
  if (timeFor) document.querySelector(`[data-time-form="${id}"] [data-time-start]`)?.focus();
}

function closeTimeForm() {
  const id = timeFor;
  timeFor = null;
  renderPlan();
  document.querySelector(`[data-task-time="${id}"]`)?.focus();
}

async function saveTimeForm(form) {
  const id = form.dataset.timeForm;
  const value = form.querySelector('[data-time-start]').value;
  if (!value) return;
  const [h, m] = value.split(':').map(Number);
  timeFor = null;
  const block = await setBlock(id, planDay, h * 60 + m, Number(form.querySelector('[data-time-mins]').value));
  if (block) showNudge(`Scheduled for ${fmtTime(atDay(block.day, block.startMin))}. Steady will remind you when it's time.`, 'info', true);
}

/* ---------- Typing a time when adding a task: "Write report 2pm 1h" ---------- */

// Minutes after midnight from an hour, optional minutes and am/pm. Bare hours before 7 mean the afternoon.
function clockMinutes(h, m, ap) {
  let hour = Number(h);
  const min = Number(m || 0);
  if (hour > 23 || min > 59) return null;
  const mer = (ap || '').toLowerCase().replace(/\./g, '');
  if (mer.startsWith('p') && hour < 12) hour += 12;
  else if (mer.startsWith('a') && hour === 12) hour = 0;
  else if (!mer && hour >= 1 && hour < 7) hour += 12;
  return hour * 60 + min;
}

// Finds a start time (and optionally a length) in a task's text. Returns the text without them, or null.
// A time needs am/pm, a colon, "at" or "noon", so "Call 3 vendors" stays as it is.
function parseTaskTime(input) {
  let text = ` ${input} `;
  let startMin = null;
  let mins = 0;
  const cut = (m) => { text = text.replace(m[0], ' '); };
  const AP = '(a\\.?m\\.?|p\\.?m\\.?|a|p)';
  const range = text.match(new RegExp(`\\s(?:from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${AP}?\\s*(?:-|–|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${AP}?(?=[\\s,.]|$)`, 'i'));
  if (range && (range[3] || range[6] || range[2] || range[5])) {
    const endAp = range[6] || '';
    const a = clockMinutes(range[1], range[2], range[3] || endAp);
    const b = clockMinutes(range[4], range[5], endAp || range[3]);
    if (a !== null && b !== null && b > a) { startMin = a; mins = b - a; cut(range); }
  }
  if (startMin === null) {
    const patterns = [
      new RegExp(`\\s(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${AP}(?=[\\s,.]|$)`, 'i'),
      /\s(?:at\s+)?(\d{1,2}):(\d{2})(?=[\s,.]|$)/i,
      /\sat\s+(\d{1,2})(?=[\s,.]|$)/i
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      const v = clockMinutes(m[1], m[2], m[3]);
      if (v !== null) { startMin = v; cut(m); break; }
    }
    const noon = startMin === null && text.match(/\s(?:at\s+)?noon(?=[\s,.]|$)/i);
    if (noon) { startMin = 720; cut(noon); }
  }
  if (startMin === null) return null;
  if (!mins) {
    const hm = text.match(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\s*(?:(\d+)\s*(?:m|mins?|minutes?))?(?=[\s,.]|$)/i);
    const mOnly = !hm && text.match(/\s(?:for\s+)?(\d+)\s*(?:m|mins?|minutes?)(?=[\s,.]|$)/i);
    if (hm) { mins = Math.round(Number(hm[1]) * 60) + Number(hm[2] || 0); cut(hm); }
    else if (mOnly) { mins = Number(mOnly[1]); cut(mOnly); }
  }
  const rest = text.replace(/\s+/g, ' ').replace(/[\s,]+(at|for|from)?[\s,]*$/i, '').trim();
  if (!rest) return null;
  return { text: rest, startMin, mins: mins ? Math.max(15, Math.min(480, mins)) : 0 };
}

/* ---------- Quick add: "Send invoice fri 2pm #Client ! every week" ---------- */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAY_RE = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
const MONTH_RE = '(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\\.?';
const WORD_END = '(?=[\\s,.]|$)';

// "mon", "tues", "thurs" and the full names; returns 0-6, or -1.
const weekdayIndex = (word) => WEEKDAYS.findIndex((d) => d.startsWith(String(word).toLowerCase()));
// The next `wd` on or after `from` (today counts).
const nextWeekday = (from, wd) => shiftKey(from, (wd - new Date(from + 'T12:00').getDay() + 7) % 7);

// Reads the extras out of a new task's text: a day, a time and length, a repeat, a #project and ! for a star.
// Anything it doesn't recognise stays in the text. `baseDay` is where the task goes when no day is typed.
function parseQuickAdd(input, baseDay = todayKey(), today = todayKey()) {
  const typed = String(input || '').trim();
  let text = ` ${typed} `;
  const out = { text: '', day: baseDay, dayTyped: false, startMin: null, mins: 0, freq: null, projectId: null, starred: false };
  // Removes the first match of `re` when `fn` accepts it (anything but false).
  const take = (re, fn) => {
    const m = text.match(re);
    if (!m || fn(m) === false) return false;
    text = text.replace(m[0], ' ');
    return true;
  };
  const rx = (src) => new RegExp(src, 'i');
  const setDay = (day) => { out.day = day; out.dayTyped = true; };
  const dateOf = (mon, date) => {
    const mi = MONTHS.findIndex((x) => x.startsWith(mon.replace('.', '').toLowerCase().slice(0, 3)));
    const d = Number(date);
    if (mi < 0 || d < 1 || d > 31) return false;
    const key = (y) => `${y}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const y = Number(today.slice(0, 4));
    setDay(key(y) < today ? key(y + 1) : key(y)); // a date already past this year means next year
  };

  // Repeats ("every Friday" also sets the first day)
  take(rx(`\\s(?:every\\s+day|daily)${WORD_END}`), () => { out.freq = 'daily'; })
    || take(rx(`\\s(?:every\\s+weekday|weekdays)${WORD_END}`), () => { out.freq = 'weekdays'; })
    || take(rx(`\\severy\\s+${WEEKDAY_RE}${WORD_END}`), (m) => { out.freq = 'weekly'; setDay(nextWeekday(today, weekdayIndex(m[1]))); })
    || take(rx(`\\s(?:every\\s+week|weekly)${WORD_END}`), () => { out.freq = 'weekly'; })
    || take(rx(`\\s(?:every\\s+month|monthly)${WORD_END}`), () => { out.freq = 'monthly'; });

  // A star and a project
  take(rx(`\\s!${WORD_END}`), () => { out.starred = true; });
  take(rx(`\\s#([^\\s#,]+)${WORD_END}`), (m) => {
    const flat = (n) => n.toLowerCase().replace(/\s+/g, '');
    const want = m[1].toLowerCase();
    const p = activeProjects().find((x) => flat(x.name) === want) || activeProjects().find((x) => flat(x.name).startsWith(want));
    if (!p) return false; // not a project, so "#3" stays in the text
    out.projectId = p.id;
  });

  // A day written out
  if (!out.dayTyped) {
    take(rx(`\\s(?:today|tonight)${WORD_END}`), () => setDay(today))
      || take(rx(`\\s(?:tomorrow|tmrw|tmr)${WORD_END}`), () => setDay(shiftKey(today, 1)))
      || take(rx(`\\snext\\s+week${WORD_END}`), () => setDay(nextWeekday(shiftKey(today, 1), 1)))
      || take(rx(`\\sin\\s+(\\d{1,2})\\s+(days?|weeks?)${WORD_END}`), (m) => setDay(shiftKey(today, Number(m[1]) * (/^w/i.test(m[2]) ? 7 : 1))))
      || take(rx(`\\s(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?${WORD_END}`), (m) => dateOf(m[1], m[2]))
      || take(rx(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}${WORD_END}`), (m) => dateOf(m[2], m[1]))
      || take(rx(`\\s(on|next|this|by)\\s+${WEEKDAY_RE}${WORD_END}`), (m) => setDay(nextWeekday(m[1].toLowerCase() === 'next' ? shiftKey(today, 1) : today, weekdayIndex(m[2]))));
  }

  // A time and length
  let rest = text.replace(/\s+/g, ' ').trim();
  const when = parseTaskTime(rest);
  if (when) rest = when.text;

  // A bare weekday counts only as the last word, and not "sun", "sat" or "wed",
  // so "Prep Monday standup notes" and "Fix the sun shade" stay as they are.
  if (!out.dayTyped) {
    const last = rest.match(/\s(mon|tue|tues|thu|thur|thurs|fri|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
    if (last) { setDay(nextWeekday(today, weekdayIndex(last[1]))); rest = rest.slice(0, last.index); }
  }
  // A time only applies today or later; on a past day it stays part of the text.
  if (when && out.day >= today) { out.startMin = when.startMin; out.mins = when.mins; }
  else if (when) rest = text.replace(/\s+/g, ' ').trim();
  out.text = rest.replace(/[\s,]+(on|at|for|from|by)?[\s,]*$/i, '').trim() || typed; // only extras typed: keep the words
  return out;
}

// True when the quick add found anything beyond plain text.
const quickAddFound = (q) => !!(q.dayTyped || q.startMin !== null || q.freq || q.projectId || q.starred);

// What a quick add will do, in words: "Friday, Oct 24 · 2:00 PM – 3:00 PM · Client · Starred · Repeats every Friday".
function quickAddSummary(q, baseDay = planDay) {
  const bits = [];
  if (q.dayTyped && q.day !== baseDay) bits.push(dayTitle(q.day) === 'Today' || dayTitle(q.day) === 'Tomorrow'
    ? dayTitle(q.day) : new Date(q.day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));
  if (q.startMin !== null) bits.push(`${fmtTime(atDay(q.day, q.startMin))}${q.mins ? ` – ${fmtTime(atDay(q.day, q.startMin + q.mins))}` : ''}`);
  if (q.projectId) bits.push(projectName(q.projectId));
  if (q.starred) bits.push('Starred');
  if (q.freq) bits.push(repeatLabel({ freq: q.freq, weekday: weekdayOf(q.day), monthday: monthdayOf(q.day) }));
  return bits.join(' · ') || dayTitle(q.day);
}

// Adds a task from quick-add text, with its day, time, project, star and repeat. Returns the task (or null).
async function addQuickTask(input, { baseDay = todayKey(), est = 0, projectId = null } = {}) {
  const today = todayKey();
  const q = parseQuickAdd(input, baseDay, today);
  if (!q.text) return null;
  const id = await addTask(q.text, est, q.day, q.projectId || projectId);
  const t = findTask(id);
  if (q.starred) t.starred = true;
  if (q.freq) {
    await setRepeat(t, q.freq);
    const r = recurById(t.recurId);
    if (r && q.startMin !== null) r.block = { startMin: q.startMin, mins: q.mins || defaultBlockMins(t) }; // later copies get the same time
  }
  if (q.starred || q.freq) await persist('tasks', 'recurring');
  if (q.startMin !== null) await setBlock(id, q.day, q.startMin, q.mins || defaultBlockMins(t));
  else renderPlan();
  return { task: t, parsed: q };
}

// Shows what quick add will do before the task is added.
function showTimeHint() {
  const q = parseQuickAdd($('taskInput').value, planDay);
  const found = $('taskInput').value.trim() && quickAddFound(q);
  $('timeHint').hidden = !found;
  if (!found) return;
  $('timeHint').textContent = `"${q.text}": ${quickAddSummary(q)}.`;
}

/* ---------- Plan vs. done ---------- */

// Every task scheduled on `day`, finished or not, with the focus time spent on it that day.
function planVsDone(day) {
  const scheduled = data.tasks
    .filter((t) => t.block && t.block.day === day)
    .sort((a, b) => a.block.startMin - b.block.startMin)
    .map((t) => ({
      task: t,
      start: atDay(day, t.block.startMin),
      end: atDay(day, t.block.startMin + t.block.mins),
      done: !!t.done,
      sec: data.entries.filter((e) => e.type === 'session' && e.taskId === t.id && dayKey(e.start) === day)
        .reduce((a, e) => a + (e.focusSec || 0), 0)
    }));
  const workedSec = data.entries.filter((e) => WORK_TYPES.includes(e.type) && dayKey(e.start) === day)
    .reduce((a, e) => a + workSec(e), 0);
  return {
    scheduled,
    plannedSec: scheduled.reduce((a, s) => a + (s.end - s.start) / 1000, 0),
    workedSec,
    doneCount: scheduled.filter((s) => s.done).length
  };
}

// Today's blocks whose time has passed without the task being finished (and that you're not working on now).
function missedBlocks(now = Date.now()) {
  const busyWith = (S.state === 'focus' || S.state === 'paused') ? S.taskId : null;
  return taskBlocksOn(dayKey(now)).filter((b) => b.end <= now && b.task.id !== busyWith);
}

// Moves a block to the next free stretch today that fits it, or to tomorrow when nothing does.
async function rescheduleBlock(id, where = 'next') {
  const t = findTask(id);
  if (!t || !t.block) return;
  const mins = t.block.mins;
  const today = todayKey();
  let day = where === 'tomorrow' ? shiftKey(today, 1) : today;
  let start = null;
  if (where !== 'tomorrow') {
    const midnight = atDay(today, 0);
    const fit = freeBlocks(today)
      .map(([a, b]) => [Math.ceil((a - midnight) / 60000 / 15) * 15, (b - midnight) / 60000])
      .find(([a, b]) => b - a >= mins);
    if (fit) start = fit[0];
    else day = shiftKey(today, 1);
  }
  if (start === null) start = suggestStart(day, mins);
  const block = await setBlock(id, day, start, mins);
  if (block) showNudge(`Moved "${t.text}" to ${day === today ? '' : 'tomorrow at '}${fmtTime(atDay(block.day, block.startMin))}.`, 'info', true);
}

/* ---------- Schedule my day: every task without a time, into the day's free time ---------- */

// Gives each open task on `day` without a time (and, today, each block you missed) the first free stretch
// of working time that fits it, around meetings and other blocks: starred first, then by due date, then your order.
// Returns what was placed and what didn't fit, and saves once.
async function scheduleDay(day = planDay) {
  const today = todayKey();
  if (day < today) return { placed: [], unfit: [], undo: null };
  const missed = day === today ? missedBlocks().map((b) => b.task) : [];
  const loose = openInOrder(day).filter((t) => !(t.block && t.block.day === day));
  const queue = [...loose, ...missed.filter((t) => !loose.includes(t))]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => priorityCompare(a.t, b.t) || a.i - b.i) // keeps your order among equals
    .map((x) => x.t);
  const before = new Map(queue.map((t) => [t, t.block ? { ...t.block } : null]));
  queue.forEach((t) => { if (missed.includes(t)) t.block = null; }); // their old time is past
  const midnight = atDay(day, 0);
  const placed = [];
  const unfit = [];
  for (const t of queue) {
    const mins = (missed.includes(t) && before.get(t)?.mins) || defaultBlockMins(t); // a missed block keeps its length
    // freeBlocks counts the blocks placed so far, so each task gets the next stretch.
    const fit = freeBlocks(day)
      .map(([a, b]) => [Math.ceil((a - midnight) / 60000 / 15) * 15, (b - midnight) / 60000])
      .find(([a, b]) => b - a >= mins);
    if (!fit) { unfit.push(t); continue; }
    t.block = { day, startMin: fit[0], mins };
    placed.push(t);
  }
  // A missed block that found no new time keeps its old one, so "Move to tomorrow" is still offered.
  before.forEach((b, t) => { if (!t.block && b && unfit.includes(t)) t.block = b; });
  await persist('tasks');
  renderPlan();
  const undo = async () => {
    before.forEach((b, t) => { if (findTask(t.id)) t.block = b; });
    await persist('tasks');
    renderPlan();
  };
  return { placed, unfit, undo };
}

// The button: schedules each day (today on, in the week view) and says what happened, with one Undo for all of it.
async function scheduleDayAndTell(days = [planDay]) {
  const runs = [];
  for (const d of days.filter((x) => x >= todayKey())) runs.push(await scheduleDay(d));
  const placed = runs.flatMap((r) => r.placed);
  const unfit = runs.flatMap((r) => r.unfit);
  const undo = async () => { for (const r of runs.reverse()) await r.undo?.(); };
  if (!placed.length && !unfit.length) { showNudge('Every task already has a time.', 'info', true); return; }
  if (!placed.length) { showNudge(`There's no free time left in your working hours for ${plural(unfit.length, 'task')}.`, 'warn', true); return; }
  const lastDay = placed.reduce((a, t) => (t.block.day > a ? t.block.day : a), '');
  const last = placed.filter((t) => t.block.day === lastDay).reduce((a, t) => Math.max(a, t.block.startMin + t.block.mins), 0);
  const by = days.length > 1 ? `${new Date(lastDay + 'T12:00').toLocaleDateString([], { weekday: 'long' })} ${fmtTime(atDay(lastDay, last))}` : fmtTime(atDay(lastDay, last));
  showNudge(`Scheduled ${plural(placed.length, 'task')}, done by ${by}.${unfit.length
    ? ` ${plural(unfit.length, 'task')} didn't fit in your working hours: ${unfit.map((t) => `"${t.text}"`).join(', ')}.` : ''}`,
  unfit.length ? 'warn' : 'info', true, { label: 'Undo', fn: undo });
}

// Runs from the timer tick: a heads-up 5 minutes before a block, a reminder (or an automatic start) when it begins,
// and an offer to move it when it ends unfinished.
const blockNotified = new Set();
function blockTick(now) {
  const today = dayKey(now);
  const free = S.state === 'idle' || S.state === 'breakPending';
  const once = (key) => (blockNotified.has(key) ? false : (blockNotified.add(key), true));
  for (const b of taskBlocksOn(today)) {
    const key = `${b.task.id}|${b.start}`;
    if (settings.blockHeadsUp !== false && now >= b.start - 5 * 60000 && now < b.start - 4 * 60000 && once(`soon|${key}`)) {
      api.notify(`"${b.task.text}" starts at ${fmtTime(b.start)}`, 'In 5 minutes.');
      if (S.state === 'focus' && S.taskId !== b.task.id) showNudge(`"${b.task.text}" is scheduled to start at ${fmtTime(b.start)}. Time to wrap up.`, 'info', true);
    }
    if (now >= b.start && now <= b.start + 60000 && once(key)) {
      if (free && settings.blockAutoStart) {
        api.notify(`Started "${b.task.text}"`, `Scheduled until ${fmtTime(b.end)}.`);
        startTask(b.task.id);
        showNudge(`Started focusing on "${b.task.text}" because it was scheduled now.`, 'info', true);
      } else {
        api.notify(`Time for "${b.task.text}"`, `Scheduled until ${fmtTime(b.end)}.`);
        if (free) {
          showNudge(`It's ${fmtTime(b.start)}: time for "${b.task.text}".`, 'info', false, { label: 'Start focus', fn: () => startTask(b.task.id) });
        } else if (S.taskId !== b.task.id) {
          showNudge(`"${b.task.text}" was scheduled to start now. Finish this session first.`, 'info', true);
        }
      }
    }
    if (now >= b.end && now <= b.end + 2 * 60000 && missedBlocks(now).some((m) => m.task.id === b.task.id) && once(`missed|${key}`)) {
      showNudge(`"${b.task.text}" was scheduled until ${fmtTime(b.end)} and isn't done.`, 'info', false,
        { label: 'Move to next free time', fn: () => rescheduleBlock(b.task.id, 'next') });
      if (!$('tab-plan').hidden || !$('tab-day').hidden) renderPlan(); // show it as missed
    }
  }
}

/* ---------- Plan my day ---------- */

// Rough minutes a task still needs.
function taskMinutes(t) {
  const p = (t.presetId && presetById(t.presetId)) || currentPreset();
  return Math.max(1, sessionsLeft(t) || 1) * p.focusMin;
}

// Things that could join today's plan: leftovers, tasks due soon but planned later, and parked thoughts.
function planCandidates(today = todayKey()) {
  const out = [];
  const short = (k) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  leftoverTasks().forEach((t) => out.push({
    kind: 'task', id: t.id, text: t.text, mins: taskMinutes(t), urgent: floatsUp(t),
    why: dueStatus(t)?.label || (t.starred ? 'Starred' : `Left over from ${short(t.day)}`)
  }));
  data.tasks
    .filter((t) => !t.done && t.day > today && t.due && t.due <= shiftKey(today, 1))
    .forEach((t) => out.push({ kind: 'task', id: t.id, text: t.text, mins: taskMinutes(t), urgent: true, why: `${dueStatus(t).label}, planned for ${short(t.day)}` }));
  (data.parking || []).filter((p) => !p.done).forEach((p) => out.push({
    kind: 'parking', id: p.id, text: p.text, mins: currentPreset().focusMin, urgent: false, why: 'From your parking lot'
  }));
  return out;
}

// Picks what fits in `budgetMin`: urgent items always, then leftovers, then parked thoughts.
function suggestPlan(candidates, budgetMin) {
  const rank = (c) => (c.urgent ? 0 : c.kind === 'task' ? 1 : 2);
  const ordered = candidates.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i);
  const picked = new Set();
  let used = 0;
  for (const { c } of ordered) {
    if (c.urgent || used + c.mins <= budgetMin) {
      picked.add(`${c.kind}:${c.id}`);
      used += c.mins;
    }
  }
  return { picked, used };
}

let planChoices = [];

function openPlanDialog() {
  const today = todayKey();
  const freeMin = Math.round(freeBlocks(today).reduce((a, [s, e]) => a + (e - s), 0) / 60000);
  const needMin = openTodayTasks().filter((t) => !t.block).reduce((a, t) => a + taskMinutes(t), 0);
  planChoices = planCandidates(today);
  const { picked } = suggestPlan(planChoices, Math.max(0, freeMin - needMin));
  planChoices.forEach((c) => { c.on = picked.has(`${c.kind}:${c.id}`); });
  $('planIntro').textContent = planChoices.length
    ? `You have about ${fmtMins(freeMin * 60)} free today, and today's tasks need about ${fmtMins(needMin * 60)}. The ticked items fit in the rest.`
    : 'Nothing is waiting: no leftovers, nothing due soon and an empty parking lot. Your plan is up to date.';
  renderPlanChoices();
  $('planDialog').showModal();
}

function renderPlanChoices() {
  $('planList').innerHTML = planChoices.map((c, i) => `<li>
      <label><input type="checkbox" data-plan-pick="${i}" ${c.on ? 'checked' : ''}>
        <span class="plan-pick-text"><strong>${esc(c.text)}</strong><span>${esc(c.why)}</span></span>
        <span class="plan-pick-mins">${fmtMins(c.mins * 60)}</span>
      </label>
    </li>`).join('');
  const total = planChoices.filter((c) => c.on).reduce((a, c) => a + c.mins, 0);
  $('planTotal').textContent = planChoices.length ? `Adding ${plural(planChoices.filter((c) => c.on).length, 'item')}, about ${fmtMins(total * 60)}.` : '';
  $('planApply').disabled = !planChoices.some((c) => c.on);
}

async function applyPlan() {
  const today = todayKey();
  const chosen = planChoices.filter((c) => c.on);
  const taskIds = chosen.filter((c) => c.kind === 'task').map((c) => c.id);
  if (taskIds.length) await moveToDay(taskIds, today);
  for (const c of chosen.filter((x) => x.kind === 'parking')) {
    await addTask(c.text, 0, today);
    data.parking = data.parking.filter((p) => p.id !== c.id);
  }
  await persist('parking');
  renderParking();
  $('planDialog').close();
  renderPlan();
  if (chosen.length) showNudge(`Added ${plural(chosen.length, 'item')} to today's plan.`, 'info', true);
}

/* ---------- After a break: offer the next task (never starts on its own) ---------- */

// The task to suggest: the one you were just on if it's still open, otherwise the top of today's list.
function nextTaskAfterBreak() {
  const last = [...data.entries].reverse().find((e) => e.type === 'session');
  const same = last && last.taskId ? findTask(last.taskId) : null;
  if (same && !same.done && same.day <= todayKey()) return same;
  return viewTasks(todayTasks()).find((t) => !t.done) || null;
}

function promptNextTask(skipped) {
  const next = settings.nextPrompt !== false ? nextTaskAfterBreak() : null;
  const lead = skipped ? 'Break skipped.' : 'Break over.';
  if (next) {
    showNudge(`${lead} Ready to start "${next.text}"?`, 'info', false, { label: 'Start focus', fn: () => startTask(next.id) });
  } else {
    showNudge(`${lead} What is next?`, 'info', true);
  }
}

/* ---------- Session goals ---------- */

function goalStats(entries) {
  const withGoal = entries.filter((e) => e.type === 'session' && e.goal);
  return {
    set: withGoal.length,
    hit: withGoal.filter((e) => e.goalHit === 'yes').length,
    partly: withGoal.filter((e) => e.goalHit === 'partly').length
  };
}

/* ---------- Welcome for a fresh install ---------- */

function shouldWelcome() {
  if (data.meta.welcomed) return false;
  // Anyone who already has data skips the welcome.
  if ((data.entries || []).length || (data.tasks || []).length || (data.projects || []).length) {
    data.meta.welcomed = true;
    persist('meta');
    return false;
  }
  return true;
}

let welcomeStep = 1;
function showWelcomeStep(n) {
  welcomeStep = n;
  document.querySelectorAll('[data-welcome-step]').forEach((el) => { el.hidden = Number(el.dataset.welcomeStep) !== n; });
  document.querySelectorAll('.welcome-dots i').forEach((d, i) => d.classList.toggle('on', i < n));
}

function openWelcome() {
  showWelcomeStep(1);
  $('welcome').showModal();
}

let welcomeDone = false;

async function finishWelcome(startNow) {
  // Finishing must happen once, even if a button click and the dialog's cancel both arrive.
  if (welcomeDone) return;
  welcomeDone = true;
  const goal = Number(document.querySelector('input[name="welcomeGoal"]:checked')?.value ?? 240);
  settings.dailyGoalMin = goal;
  const projectName = $('welcomeProject').value.trim();
  const taskText = $('welcomeTask').value.trim();
  const projectId = projectName ? await addProject(projectName) : null;
  if (taskText) await addTask(taskText, 0, todayKey(), projectId);
  data.meta.welcomed = true;
  await persist('settings', 'meta');
  fillSettingsForm();
  renderTimer();
  $('welcome').close();
  if (startNow) {
    const t = taskText ? openTodayTasks().find((x) => x.text === taskText) : null;
    if (t) startTask(t.id); else $('task').focus();
  }
}

/* ---------- Events ---------- */

function bindPlanning() {
  $('planDayBtn').addEventListener('click', openPlanDialog);
  $('planList').addEventListener('change', (e) => {
    const i = e.target.dataset?.planPick;
    if (i === undefined) return;
    planChoices[Number(i)].on = e.target.checked;
    renderPlanChoices();
  });
  $('planApply').addEventListener('click', applyPlan);
  $('planCancel').addEventListener('click', () => $('planDialog').close());

  $('scheduleSection').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.openDay !== undefined) showTab('day');
    else if (b.dataset.blockStart) startTask(b.dataset.blockStart);
    else if (b.dataset.reschedNext) rescheduleBlock(b.dataset.reschedNext, 'next');
    else if (b.dataset.reschedTomorrow) rescheduleBlock(b.dataset.reschedTomorrow, 'tomorrow');
  });

  $('welcomeNext1').addEventListener('click', () => showWelcomeStep(2));
  $('welcomeNext2').addEventListener('click', () => showWelcomeStep(3));
  $('welcomeBack2').addEventListener('click', () => showWelcomeStep(1));
  $('welcomeBack3').addEventListener('click', () => showWelcomeStep(2));
  $('welcomeStart').addEventListener('click', () => finishWelcome(true));
  $('welcomeExplore').addEventListener('click', () => finishWelcome(false));
  $('welcome').addEventListener('cancel', (e) => { e.preventDefault(); if ($('welcome').open) finishWelcome(false); });
}
