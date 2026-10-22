/* ---------- Work log ---------- */

const WORK_TYPES = ['session', 'checkin', 'manual'];

function entryLabel(e) {
  return e.parkingCompletion ? 'Parking item completed' : e.subtaskCompletion ? 'Subtask completed' : e.taskCompletion ? 'Task completed' : ENTRY_TYPES[e.type]?.label || 'Added by you';
}
function workEntries() {
 return [...data.entries, ...data.tasks.filter(t => t.done && t.doneAt).map(t => ({id: 'task:' + t.id, type: 'manual', taskCompletion: t.id, note: t.text, projectId: t.projectId, start: t.doneAt, end: t.doneAt})),
 ...data.tasks.flatMap(t => (t.subtasks || []).filter(s => s.done && s.doneAt).map(s => ({
   id: 'subtask:' + t.id + ':' + s.id, type: 'manual', subtaskCompletion: s.id, taskId: t.id,
   note: t.text + ': ' + s.text, projectId: t.projectId, start: s.doneAt, end: s.doneAt
 })))];
}
function workSec(e) {
  if (e.type === 'session') return e.focusSec || 0;
  return Math.max(0, (e.end - e.start) / 1000);
}

function renderLog() {
  if (!$('tab-insights').hidden && typeof renderInsights === 'function') renderInsights();
  if (logView === 'history') renderHistory();
  $('datePick').value = viewDay;
  $('datePick').max = dayKey(Date.now());
  const today = dayKey(Date.now());
  const entries = workEntries()
    .filter((e) => dayKey(e.start) === viewDay)
    .sort((a, b) => b.start - a.start);

  $('dayLabel').textContent = viewDay === today
    ? 'Today'
    : new Date(viewDay + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  $('nextDay').disabled = viewDay === today;

  const sessions = entries.filter((e) => e.type === 'session');
  const focusSec = sessions.reduce((a, e) => a + (e.focusSec || 0), 0);
  const otherSec = entries.filter((e) => e.type === 'checkin' || e.type === 'manual').reduce((a, e) => a + workSec(e), 0);
  const breaks = entries.filter((e) => e.type === 'break' && !e.skipped).length;
  const drifts = sessions.reduce((a, e) => a + (e.distractions?.length || 0), 0);
  const parts = [];
  if (sessions.length) parts.push(`${plural(sessions.length, 'session')}, ${fmtMins(focusSec)} focused`);
  if (otherSec) parts.push(`${fmtMins(otherSec)} logged outside sessions`);
  if (breaks) parts.push(`${plural(breaks, 'break')} taken`);
  if (drifts) parts.push(plural(drifts, 'drift'));
  $('summary').textContent = parts.length ? parts.join(', ') + '.' : '';

  if (!entries.length) {
    renderLogFilter(entries);
    $('logList').innerHTML = viewDay === today
      ? emptyState('clock', 'Nothing logged yet', 'Start a focus session, or use "Add entry" to record something you did.')
      : emptyState('clock', 'Nothing was logged on this day', 'Use "Add entry" to fill it in.');
    return;
  }

  const shown = logType === 'all' ? entries : entries.filter((e) => e.type === logType);
  renderLogFilter(entries);
  $('logList').innerHTML = shown.length ? shown.map(entryHtml).join('')
    : emptyState('clock', `No ${ENTRY_TYPES[logType].plural} on this day`, '');
}

/* ---------- Work log entries: each kind has its own color, icon and label ---------- */

const ENTRY_TYPES = {
  session: { label: 'Focus session', plural: 'focus sessions', short: 'Sessions', icon: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/>' },
  checkin: { label: 'Check-in', plural: 'check-ins', short: 'Check-ins', icon: '<path d="M2.5 3.5h11v7.5H7.5L4.5 13.5V11h-2z"/>' },
  manual: { label: 'Added by you', plural: 'entries you added', short: 'Added', icon: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/>' },
  break: { label: 'Break', plural: 'breaks', short: 'Breaks', icon: '<path d="M3 6h8v3.5A3.5 3.5 0 0 1 7.5 13h-1A3.5 3.5 0 0 1 3 9.5z"/><path d="M11 7h1a1.75 1.75 0 0 1 0 3.5h-1"/><path d="M5.5 2.5v1.5M8.5 2.5v1.5"/>' }
};
let logType = 'all';
try { logType = localStorage.getItem('logType') || 'all'; } catch { /* storage unavailable */ }
if (!ENTRY_TYPES[logType] && logType !== 'all') logType = 'all';

const typeIcon = (type) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ENTRY_TYPES[type].icon}</svg>`;

function renderLogFilter(entries) {
  const counts = { all: entries.length };
  entries.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
  $('logFilter').hidden = !entries.length;
  $('logFilter').innerHTML = [['all', 'All'], ...Object.entries(ENTRY_TYPES).map(([k, v]) => [k, v.short])]
    .filter(([k]) => k === 'all' || counts[k])
    .map(([k, label]) => `<button type="button" class="lf-chip t-${k}" data-log-type="${k}" aria-pressed="${logType === k}">
      ${k === 'all' ? '' : `<span class="lf-dot">${typeIcon(k)}</span>`}${label}<span class="lf-count">${counts[k] || 0}</span></button>`).join('');
}

function entryHtml(e) {
  const type = ENTRY_TYPES[e.type] ? e.type : 'manual';
  const color = projectById(e.projectId)?.color;
  const node = `<span class="entry-node" aria-hidden="true">${typeIcon(type)}</span>`;
  if (type === 'break') {
    const label = e.kind === 'long' ? 'Long break' : 'Short break';
    return `<li class="entry t-break${e.skipped ? ' skipped' : ''}">
      ${node}
      <div class="when">${fmtTime(e.start)}</div>
      <div class="entry-body"><p class="meta"><span class="type-badge">${e.skipped ? 'Skipped break' : label}</span>${fmtMins(Math.max(60, (e.end - e.start) / 1000))}${e.snoozes ? `, snoozed ${plural(e.snoozes, 'time')}` : ''}</p></div>
      <div class="entry-actions"><button class="del" data-del="${e.id}" type="button" aria-label="Delete this break">${icon('close')}</button></div>
    </li>`;
  }
  const meta = [];
  if (type === 'session') meta.push(`${fmtMins(e.focusSec || 0)} focused${e.early ? ' (ended early)' : ''}`);
  else if (workSec(e)) meta.push(fmtMins(workSec(e)));
  if (e.distractions?.length) meta.push(plural(e.distractions.length, 'drift'));
  const goal = type === 'session' && e.goal
    ? `<p class="entry-goal goal-${e.goalHit || 'none'}">◎ ${esc(e.goal)}${e.goalHit ? ` <span>${{ yes: 'reached', partly: 'partly reached', no: 'not reached' }[e.goalHit]}</span>` : ''}</p>`
    : '';
  const when = e.end > e.start ? `${fmtTime(e.start)} – ${fmtTime(e.end)}` : fmtTime(e.start);
  // The type keeps its own color; a session's project shows on its left edge and chip.
  return `<li class="entry t-${type}"${color && type === 'session' ? ` style="--edge:${color}"` : ''}>
    ${node}
    <div class="when">${when}</div>
    <div class="entry-body">
      <span class="type-badge">${entryLabel(e)}</span>
      <p class="note">${esc(e.note)}</p>
      ${goal}
      ${appChips(e.apps)}
      <p class="meta">${e.rating ? `<span class="chip ${esc(e.rating)}">${RATING_LABELS[e.rating]}</span>` : ''}${projectChip(e.projectId)}${meta.join('. ')}</p>
    </div>
    <div class="entry-actions">
      <button class="link" data-edit="${e.id}" type="button">Edit</button>
    </div>
  </li>`;
}

// The apps used during a session, one readable chip each, longest first.
function appChips(apps) {
  const list = (apps || []).filter((a) => a && a.name).sort((a, b) => (b.sec || 0) - (a.sec || 0));
  if (!list.length) return '';
  const more = list.length - 5;
  const chips = list.slice(0, 5).map((a) =>
    `<span class="app-chip">${esc(a.name)}${a.sec >= 60 ? ` <small>${fmtMins(a.sec)}</small>` : ''}</span>`).join('');
  return `<p class="entry-apps" aria-label="Apps used">${chips}${more > 0 ? `<span class="app-more">+${more} more</span>` : ''}</p>`;
}

function bindLogFilter() {
  $('logFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-log-type]');
    if (!b) return;
    logType = b.dataset.logType;
    try { localStorage.setItem('logType', logType); } catch { /* storage unavailable */ }
    renderLog();
  });
}

function shiftDay(n) {
  const next = shiftKey(viewDay, n);
  if (next > dayKey(Date.now())) return;
  viewDay = next;
  renderLog();
}

async function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Start', 'End', 'Type', 'What I worked on', 'Project', 'How it went', 'Minutes', 'Top apps', 'Drifts']];
  workEntries().sort((a, b) => a.start - b.start).forEach((e) => {
    rows.push([
      dayKey(e.start),
      fmtTime(e.start),
      fmtTime(e.end),
      e.type === 'break' ? `${e.kind} break${e.skipped ? ' (skipped)' : ''}` : e.parkingCompletion || e.taskCompletion || e.subtaskCompletion ? entryLabel(e) : e.type === 'manual' ? 'added' : e.type,
      e.note || '',
      projectName(e.projectId),
      e.type === 'break' ? '' : (RATING_LABELS[e.rating] || ''),
      e.type === 'break' ? Math.round((e.end - e.start) / 60000) : Math.round(workSec(e) / 60),
      (e.apps || []).map((a) => `${a.name} ${Math.round(a.sec / 60)}m`).join('; '),
      e.distractions ? e.distractions.length : ''
    ]);
  });
  const r = await api.exportCsv(rows.map((row) => row.map(q).join(',')).join('\r\n'));
  if (r.ok) showNudge(`Log exported to ${r.filePath}`, 'info', true);
}

/* ---------- Entry editor (edit anything in the log, or add something you did) ---------- */

let editingEntryId = null;
function fillEntryTasks() {
 $('entryTask').innerHTML = '<option value="">Write my own</option>' + tasksFor($('entryDate').value).map(t => '<option value="' + t.id + '">' + esc(t.text) + '</option>').join('');
}

function toTimeInput(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openEntryDialog(id, day) {
  if (id?.startsWith('subtask:')) { openTaskDialog(id.split(':')[1]); return; }
  if (id?.startsWith('task:')) { openTaskDialog(id.slice(5)); return; }
  const e = id ? data.entries.find((x) => x.id === id) : null;
  editingEntryId = e ? e.id : null;
  const now = Date.now();
  const startDefault = day && day !== dayKey(now) ? new Date(day + 'T09:00').getTime() : now - 30 * 60000;

  $('entryTitle').textContent = e ? 'Edit entry' : 'Add something you did';
  $('entryNote').value = e ? e.note || '' : '';
  $('entryProject').innerHTML = projectOptions(e ? e.projectId : null);
  $('entryDate').value = dayKey(e ? e.start : startDefault);
  $('entryDate').max = dayKey(now);
  $('entryStart').value = toTimeInput(e ? e.start : startDefault);
  $('entryMinutes').value = e ? Math.round(workSec(e) / 60) : 30;
  $('entryRating').value = e && e.rating ? e.rating : '';
  $('entryDelete').hidden = !e;
  $('entryKind').textContent = e ? entryLabel(e) : '';
  $('entryError').textContent = '';
  fillEntryTasks();
  $('entryTask').value = e?.taskId || '';
  $('entryDialog').showModal();
  $('entryNote').focus();
}

async function saveEntryDialog() {
  const typed = $('entryNote').value.trim();
  const date = $('entryDate').value;
  const time = $('entryStart').value;
  const mins = Math.max(0, Math.round(Number($('entryMinutes').value) || 0));
  if (!typed) { $('entryError').textContent = 'Describe what you worked on.'; $('entryNote').focus(); return; }
  if (!date || !time) { $('entryError').textContent = 'Pick a date and start time.'; return; }
  const start = new Date(`${date}T${time}`).getTime();
  if (start > Date.now()) { $('entryError').textContent = 'The start time is in the future.'; return; }

  const rating = $('entryRating').value || null;
  const { text: note, projectId } = await takeProjectTag(typed, $('entryProject').value || null); // "#project" beats the picker
  let e = editingEntryId ? data.entries.find((x) => x.id === editingEntryId) : null;
  if (!e) {
    e = { id: uid(), type: 'manual' };
    data.entries.push(e);
  }
  e.taskId = $('entryTask').value || null;
  e.note = note;
  e.projectId = projectId;
  e.rating = rating || (e.type === 'manual' ? null : e.rating || 'on-track');
  e.start = start;
  e.end = start + mins * 60000;
  if (e.type === 'session') e.focusSec = mins * 60;

  const parked = e.parkingCompletion && data.parking.find((p) => p.id === e.parkingCompletion);
  if (parked) { parked.text = note; parked.projectId = projectId; parked.doneAt = start; await persist('parking'); }
  await persist('entries');
  $('entryDialog').close();
  renderParking();
  viewDay = dayKey(start) <= dayKey(Date.now()) ? dayKey(start) : viewDay;
  renderLog();
  renderPlan();
  renderTimer();
}

async function deleteEntry(id) {
  const entry = data.entries.find(e => e.id === id);
  if (entry?.parkingCompletion) {
    const item = data.parking.find(p => p.id === entry.parkingCompletion);
    if (item) { item.done = false; item.doneAt = null; await persist('parking'); }
  }
  data.entries = data.entries.filter((x) => x.id !== id);
  await persist('entries');
  renderParking();
  renderLog();
  renderPlan();
  renderTimer();
}

/* ---------- History (what I worked on, by day) ---------- */

let logView = 'day';
const HISTORY_DAYS = 60;

function renderHistory() {
  const q = $('historySearch').value.trim().toLowerCase();
  const work = workEntries().filter((e) => WORK_TYPES.includes(e.type) && e.note);
  const matches = q
    ? work.filter((e) => e.note.toLowerCase().includes(q) || projectName(e.projectId).toLowerCase().includes(q))
    : work;

  const byDay = {};
  matches.forEach((e) => { (byDay[dayKey(e.start)] ||= []).push(e); });
  let dayKeys = Object.keys(byDay).sort().reverse();
  const truncated = !q && dayKeys.length > HISTORY_DAYS;
  if (truncated) dayKeys = dayKeys.slice(0, HISTORY_DAYS);

  if (!dayKeys.length) {
    $('historySummary').textContent = '';
    $('historyList').innerHTML = `<p class="empty">${q
      ? `Nothing in your log mentions "${esc(q)}".`
      : 'Nothing logged yet. Your days will appear here after your first check-in.'}</p>`;
    return;
  }

  if (q) {
    const total = matches.reduce((a, e) => a + workSec(e), 0);
    $('historySummary').textContent =
      `"${$('historySearch').value.trim()}" shows up on ${plural(dayKeys.length, 'day')}, about ${fmtMins(total)} in total.`;
  } else {
    $('historySummary').textContent = truncated
      ? `Showing your last ${HISTORY_DAYS} days with entries. Search to look further back.`
      : '';
  }

  const today = dayKey(Date.now());
  $('historyList').innerHTML = dayKeys.map((k) => {
    // Group repeated notes on the same day, e.g. three sessions on "Budget draft".
    const groups = new Map();
    byDay[k].sort((a, b) => a.start - b.start).forEach((e) => {
      const key = e.note.trim().toLowerCase();
      const g = groups.get(key) || { note: e.note.trim(), sec: 0, count: 0, first: e.start, sidetracked: 0, projectId: null };
      g.sec += workSec(e);
      g.count++;
      g.projectId = g.projectId || e.projectId || null;
      if (e.rating === 'sidetracked') g.sidetracked++;
      groups.set(key, g);
    });
    const dayTotal = byDay[k].reduce((a, e) => a + workSec(e), 0);
    const label = k === today
      ? 'Today'
      : new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: k.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });

    const items = [...groups.values()].map((g) => `<li>
        <span class="h-note">${esc(g.note)}</span>
        <span class="h-meta">${projectChip(g.projectId)}${fmtTime(g.first)}${g.count > 1 ? `, ${g.count} times` : ''}${g.sidetracked ? ', got sidetracked' : ''}</span>
        <span class="h-time">${g.sec ? fmtMins(Math.max(60, g.sec)) : ''}</span>
      </li>`).join('');

    return `<section class="h-day">
      <div class="h-day-head">
        <h3>${esc(label)}</h3>
        <span class="h-total">${dayTotal ? fmtMins(dayTotal) : ''}</span>
        <button class="link" type="button" data-openday="${k}">Open day</button>
      </div>
      <ul class="h-items">${items}</ul>
    </section>`;
  }).join('');
}

function setLogView(view) {
  logView = view;
  document.querySelectorAll('[data-logview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.logview === view)));
  $('logDay').hidden = view !== 'day';
  $('logHistory').hidden = view !== 'history';
  if (view === 'history') renderHistory();
  else renderLog();
}

/* ---------- Parking lot ---------- */

let parkFilter = 'all'; // 'all', 'none' or a project id
let parkSort = 'newest';
try {
  parkFilter = localStorage.getItem('parkFilter') || 'all';
  parkSort = localStorage.getItem('parkSort') || 'newest';
} catch { /* storage unavailable */ }
const PARK_SORTS = { newest: 'Newest first', oldest: 'Oldest first', project: 'By project', az: 'A to Z' };
if (!PARK_SORTS[parkSort]) parkSort = 'newest';

const parkShows = (projectId) => parkFilter === 'all' || (parkFilter === 'none' ? !projectId : projectId === parkFilter);

function sortParking(items) {
  const name = (p) => projectName(p.projectId).toLowerCase();
  const by = {
    newest: (a, b) => (b.at || 0) - (a.at || 0),
    oldest: (a, b) => (a.at || 0) - (b.at || 0),
    project: (a, b) => (!name(a) - !name(b)) || name(a).localeCompare(name(b)) || (b.at || 0) - (a.at || 0),
    az: (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
  }[parkSort];
  return items.slice().sort(by);
}

function completedParkingGroups() {
  const entries = data.entries.filter(e => e.parkingCompletion).map(e => ({
    id: e.parkingCompletion, text: e.note, doneAt: e.start, entryId: e.id,
    projectId: e.projectId || data.parking.find(p => p.id === e.parkingCompletion)?.projectId || null
  }));
  const logged = new Set(entries.map(e => e.id));
  entries.push(...data.parking.filter(p => p.done && !logged.has(p.id)).map(p => ({
    id: p.id, text: p.text, doneAt: p.doneAt || null, entryId: null, projectId: p.projectId || null
  })));
  const groups = new Map();
  entries.filter(item => parkShows(item.projectId)).sort((a,b) => (b.doneAt || 0) - (a.doneAt || 0)).forEach(item => {
    const day = item.doneAt ? dayKey(item.doneAt) : 'unknown';
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(item);
  });
  return [...groups].map(([day, items]) => ({day, items}));
}

function renderParkTools() {
  const used = new Set(data.parking.map(p => p.projectId).filter(Boolean));
  const list = (data.projects || []).filter(p => !p.archived || used.has(p.id));
  if (parkFilter !== 'all' && parkFilter !== 'none' && !projectById(parkFilter)) parkFilter = 'all';
  $('parkFilter').innerHTML = '<option value="all">All projects</option><option value="none">No project</option>' +
    list.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
  $('parkFilter').value = parkFilter;
  $('parkSort').innerHTML = Object.entries(PARK_SORTS).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('');
  $('parkSort').value = parkSort;
}

function renderParking() {
  renderParkTools();
  const all = data.parking.filter(p => !p.done);
  const items = sortParking(all.filter(p => parkShows(p.projectId)));
  $('parkList').innerHTML = items.length
    ? items.map(p => '<li><label><input type="checkbox" data-toggle="' + p.id + '"><span>' + esc(p.text) + '</span></label>' +
      projectChip(p.projectId) + '<time>' + fmtTime(p.at) + '</time>' +
      '<button class="link small-link" data-park-edit="' + p.id + '" type="button">Edit</button>' +
      '<button class="link small-link" data-park-task="' + p.id + '" type="button">Add to today\'s plan</button>' +
      '<button class="del" data-park-del="' + p.id + '" type="button" aria-label="Delete item">&times;</button></li>').join('')
    : all.length
      ? '<li class="empty">Nothing parked under this filter. <button class="link" type="button" data-park-reset>Show all</button></li>'
      : emptyState('note', 'Nothing parked', 'Add a thought here to come back to later.');
  const groups = completedParkingGroups();
  $('parkCompletedSummary').textContent = groups.reduce((n,g) => n + g.items.length, 0) + ' completed';
  $('parkCompleted').innerHTML = groups.length ? groups.map(g => {
    const label = g.day === 'unknown' ? 'Completion date unknown' : g.day === todayKey() ? 'Today' :
      new Date(g.day + 'T12:00').toLocaleDateString([], {weekday:'long', month:'short', day:'numeric', year:'numeric'});
    return '<details class="park-day" open><summary>' + esc(label) + ' (' + g.items.length + ')</summary><ul class="park-list">' +
      g.items.map(item => '<li class="done"><span class="park-completed-text">' + esc(item.text) + '</span>' +
        projectChip(item.projectId) +
        (item.doneAt ? '<time>' + fmtTime(item.doneAt) + '</time>' : '') +
        '<button class="link" type="button" data-park-edit="' + item.id + '">Edit</button>' +
        '<button class="link" type="button" data-park-reopen="' + item.id + '">Reopen</button></li>').join('') + '</ul></details>';
  }).join('') : '<p class="summary">Completed parking items will appear here, grouped by day, and in your work log.</p>';
}

/* Edit a parked item: its words, project, and when it was finished (set before or changed after the fact). */
let editingParkId = null;

function openParkDialog(id) {
  const entry = data.entries.find(e => e.parkingCompletion === id);
  const item = data.parking.find(p => p.id === id)
    || (entry ? { id, text: entry.note, at: entry.start, done: true, doneAt: entry.start, projectId: entry.projectId || null } : null);
  if (!item) return;
  editingParkId = id;
  const at = item.done ? (entry?.start || item.doneAt || Date.now()) : Date.now();
  $('parkEditText').value = item.text;
  $('parkEditProject').innerHTML = projectOptions(entry?.projectId || item.projectId || null);
  $('parkEditDone').checked = !!item.done;
  $('parkEditDate').value = dayKey(at);
  $('parkEditDate').max = todayKey();
  $('parkEditTime').value = toTimeInput(at);
  $('parkEditWhen').hidden = !item.done;
  $('parkEditPlan').hidden = !!item.done;
  $('parkEditError').textContent = '';
  $('parkDialog').showModal();
  $('parkEditText').focus();
}

async function saveParkDialog() {
  const text = $('parkEditText').value.trim();
  if (!text) { $('parkEditError').textContent = 'Write what it is.'; $('parkEditText').focus(); return; }
  const done = $('parkEditDone').checked;
  let when = null;
  if (done) {
    when = new Date(`${$('parkEditDate').value}T${$('parkEditTime').value}`).getTime();
    if (!Number.isFinite(when)) { $('parkEditError').textContent = 'Pick the date and time it was finished.'; return; }
    if (when > Date.now()) { $('parkEditError').textContent = 'That time is in the future.'; return; }
  }
  const id = editingParkId;
  const projectId = $('parkEditProject').value || null;
  const old = data.entries.find(e => e.parkingCompletion === id);
  let item = data.parking.find(p => p.id === id);
  if (!item) {
    item = { id, text, at: old ? old.start : Date.now(), done: false, doneAt: null };
    data.parking.unshift(item);
  }
  item.text = text;
  item.projectId = projectId;
  item.done = done;
  item.doneAt = when;
  data.entries = data.entries.filter(e => e.parkingCompletion !== id);
  if (done) data.entries.push({
    id: old?.id || uid(), type: 'manual', parkingCompletion: id, note: text, projectId, start: when, end: when
  });
  await persist('parking', 'entries');
  $('parkDialog').close();
  renderParking();
  renderLog();
  renderPlan();
}

async function reopenParking(id) {
  let item = data.parking.find(p => p.id === id);
  if (!item) {
    const entry = data.entries.find(e => e.parkingCompletion === id);
    if (!entry) return;
    item = {id, text: entry.note, at: entry.start, done: true, doneAt: entry.start, projectId: entry.projectId || null};
    data.parking.unshift(item);
  }
  await setParkingDone(id, false);
}

// Keep a saved completion entry so clearing the parking lot preserves the day's history.
async function setParkingDone(id, done) {
  const item = data.parking.find(p => p.id === id);
  if (!item || item.done === !!done) return;
  item.done = !!done;
  item.doneAt = done ? Date.now() : null;
  data.entries = data.entries.filter(e => e.parkingCompletion !== id);
  if (done) data.entries.push({
    id: uid(), type: 'manual', parkingCompletion: id, note: item.text, projectId: item.projectId || null,
    start: item.doneAt, end: item.doneAt
  });
  await persist('parking', 'entries');
  renderParking();
  renderLog();
  renderPlan();
}

async function addParking(text, projectId = null) {
  data.parking.unshift({ id: uid(), text, projectId: projectId || null, done: false, at: Date.now() });
  await persist('parking');
  renderParking();
}

// Plan to parking lot, for a task that is not for today after all.
async function taskToParking(id) {
  const t = findTask(id);
  if (!t) return;
  data.parking.unshift({ id: uid(), text: t.text, projectId: t.projectId || null, done: false, at: Date.now() });
  await persist('parking');
  await deleteTask(id);
  renderParking();
  showNudge(`Moved "${t.text}" to the parking lot.`, 'info', true, { label: 'Open parking lot', fn: () => showTab('parking') });
}

/* ---------- Settings ---------- */

const NUM_FIELDS = {
  longBreakMin: [1, 120], longEvery: [2, 12],
  eyeEveryMin: [5, 120], idleCheckinMin: [10, 240], snoozeMin: [1, 30], maxSnoozes: [0, 5],
  idlePauseMin: [1, 60], dailyGoalMin: [0, 720], weeklyReviewDay: [0, 6], appLogKeepDays: [0, 3650]
};
const BOOL_FIELDS = ['eyeBreaks', 'idleCheckins', 'strictBreaks', 'blockSites', 'startAtLogin', 'startMinimized',
  'meetingAware', 'idleAutoPause', 'reviewEnabled', 'weeklyReview', 'compactAuto', 'soundInBreaks',
  'projectTint', 'dayTint', 'chimes', 'nextPrompt', 'blockHeadsUp', 'blockAutoStart',
  'focusDnd', 'focusBlockApps', 'strictFocus', 'appTimeline'];
const TEXT_FIELDS = {
  motion: (v) => (['system', 'full', 'reduced'].includes(v) ? v : null),
  reviewTime: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null),
  miniMode: (v) => (['off', 'focus', 'always'].includes(v) ? v : null),
  theme: (v) => (['system', 'light', 'dark'].includes(v) ? v : null),
  accent: (v) => (['pine', 'ocean', 'plum', 'terracotta', 'graphite', 'rose', 'indigo', 'sunflower'].includes(v) ? v : null),
  palette: (v) => (PALETTES.some(([id]) => id === v) ? v : null),
  look: (v) => (['classic', 'notion', 'linear', 'things'].includes(v) ? v : null),
  corners: (v) => (['rounded', 'sharp'].includes(v) ? v : null),
  density: (v) => (['comfortable', 'compact'].includes(v) ? v : null),
  font: (v) => (['segoe', 'serif', 'mono', 'classic'].includes(v) ? v : null),
  ringStyle: (v) => (['classic', 'thin', 'segmented', 'clock'].includes(v) ? v : null),
  workStart: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null),
  workEnd: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null)
};
const LIST_FIELDS = ['distractionKeywords', 'blockedSites', 'blockedApps'];

function renderPresetSettings() {
  $('presetSettings').innerHTML = settings.presets.map((p) => `<li>
      <input type="text" value="${esc(p.name)}" data-preset-name="${p.id}" maxlength="20" aria-label="Preset name">
      <label><input type="number" min="5" max="180" value="${p.focusMin}" data-preset-focus="${p.id}" aria-label="${esc(p.name)} focus minutes"> min focus</label>
      <label><input type="number" min="1" max="60" value="${p.breakMin}" data-preset-break="${p.id}" aria-label="${esc(p.name)} break minutes"> min break</label>
    </li>`).join('');
}

function fillSettingsForm() {
  const f = $('settingsForm');
  Object.keys(NUM_FIELDS).forEach((k) => { f.elements[k].value = settings[k]; });
  BOOL_FIELDS.forEach((k) => { f.elements[k].checked = !!settings[k]; });
  LIST_FIELDS.forEach((k) => { f.elements[k].value = (settings[k] || []).join('\n'); });
  Object.keys(TEXT_FIELDS).forEach((k) => { f.elements[k].value = settings[k]; });
  renderPresetSettings();
  if (typeof renderCalendarSettings === 'function') renderCalendarSettings();
  api.startupSupported().then((ok) => {
    f.elements.startAtLogin.disabled = !ok;
    f.elements.startMinimized.disabled = !ok;
    $('startupNote').hidden = ok;
  });
}

async function saveSettings(ev) {
  ev.preventDefault();
  const f = $('settingsForm');
  const next = { ...settings };
  for (const [k, [min, max]] of Object.entries(NUM_FIELDS)) {
    const v = Math.round(Number(f.elements[k].value));
    next[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : settings[k];
  }
  BOOL_FIELDS.forEach((k) => { next[k] = f.elements[k].checked; });
  LIST_FIELDS.forEach((k) => {
    next[k] = f.elements[k].value.split('\n').map((s) => s.trim()).filter(Boolean);
  });
  Object.entries(TEXT_FIELDS).forEach(([k, check]) => {
    const v = check(String(f.elements[k].value));
    if (v !== null) next[k] = v;
  });
  const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  next.presets = settings.presets.map((p) => ({
    ...p,
    name: (document.querySelector(`[data-preset-name="${p.id}"]`).value.trim() || p.name).slice(0, 20),
    focusMin: clamp(document.querySelector(`[data-preset-focus="${p.id}"]`).value, 5, 180, p.focusMin),
    breakMin: clamp(document.querySelector(`[data-preset-break="${p.id}"]`).value, 1, 60, p.breakMin)
  }));

  if (minutesOf(next.workEnd) <= minutesOf(next.workStart)) {
    $('settingsSaved').textContent = 'Your workday has to end after it starts.';
    return;
  }
  const themeChanged = next.theme !== settings.theme;
  Object.assign(settings, next);
  data.settings = settings;
  await persist('settings');
  await api.applyStartup();
  if (themeChanged) api.setTheme();
  applyAppearance();
  fillSettingsForm();
  const inSession = S.state === 'focus' || S.state === 'paused';
  $('settingsSaved').textContent = inSession ? 'Saved. Timing changes apply from your next session.' : 'Saved.';
  setTimeout(() => { $('settingsSaved').textContent = ''; }, 4000);
  renderPresetBar();
  renderTimer();
  renderPlan();
  if (!$('tab-insights').hidden) renderInsights();
}

/* ---------- Settings sections: one category at a time ---------- */

const SETTINGS_CATS = [
  ['focus', 'Focus'], ['breaks', 'Breaks'], ['plan', 'Projects and tasks'], ['calendar', 'Calendar'],
  ['distractions', 'Sites and apps'], ['protection', 'Focus protection'], ['timeline', 'App timeline'],
  ['appearance', 'Appearance and startup'], ['data', 'Data and backups'], ['help', 'Help and about']
];
let settingsCat = 'focus';
try { settingsCat = localStorage.getItem('settingsCat') || 'focus'; } catch { /* storage unavailable */ }

// Search: every section whose words match, from all categories at once. Clearing it goes back to the category.
function searchSettings(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) { $('settingsNoMatch').hidden = true; showSettingsCat(settingsCat); return; }
  const words = q.split(/\s+/);
  let found = 0;
  document.querySelectorAll('#tab-settings [data-cat]').forEach((el) => {
    const text = el.textContent.toLowerCase() + ' ' + [...el.querySelectorAll('option')].map((o) => o.textContent.toLowerCase()).join(' ');
    el.hidden = !words.every((w) => text.includes(w));
    if (!el.hidden) found++;
  });
  document.querySelectorAll('#tab-settings .settings').forEach((box) => {
    box.hidden = ![...box.querySelectorAll('[data-cat]')].some((el) => !el.hidden);
  });
  document.querySelectorAll('#settingsNav [data-cat-btn]').forEach((b) => b.setAttribute('aria-current', 'false'));
  $('settingsNoMatch').hidden = !!found;
  $('settingsNoMatch').textContent = found ? '' : `No settings match "${query.trim()}".`;
}

function showSettingsCat(cat) {
  if (!SETTINGS_CATS.some(([id]) => id === cat)) cat = 'focus';
  if ($('settingsSearch') && $('settingsSearch').value) $('settingsSearch').value = '';
  $('settingsNoMatch') && ($('settingsNoMatch').hidden = true);
  settingsCat = cat;
  try { localStorage.setItem('settingsCat', cat); } catch { /* storage unavailable */ }
  $('settingsNav').innerHTML = SETTINGS_CATS.map(([id, label]) =>
    `<button type="button" data-cat-btn="${id}" aria-current="${id === cat ? 'page' : 'false'}">${esc(label)}</button>`).join('');
  document.querySelectorAll('#tab-settings [data-cat]').forEach((el) => { el.hidden = el.dataset.cat !== cat; });
  // Hide wrappers (and the Save button's form) that have nothing to show in this category.
  document.querySelectorAll('#tab-settings .settings').forEach((box) => {
    box.hidden = ![...box.querySelectorAll('[data-cat]')].some((el) => !el.hidden);
  });
  $('tab-settings').scrollTop = 0;
  playEnter(document.querySelector('.settings-body'));
  if (cat === 'distractions') renderBlockPermission();
}

/* Site blocking: the one-time permission to edit the hosts file. */
async function renderBlockPermission(message) {
  const st = await api.blockStatus();
  $('blockPermRow').hidden = !st.supported;
  if (!st.supported) return;
  $('blockAllowBtn').hidden = st.allowed;
  $('blockRevokeBtn').hidden = !st.allowed;
  $('blockPermText').textContent = message || (st.allowed
    ? 'Site blocking is allowed. Steady can edit the hosts file without running as administrator. A site already open in your browser may keep loading for about a minute after a session starts.'
    : 'Blocking sites means editing the Windows hosts file. Allow it once and it keeps working after updates and restarts. Windows will show one admin prompt.');
}

function bindBlockPermission() {
  const run = async (btn, fn, done) => {
    btn.disabled = true;
    $('blockPermText').textContent = 'Waiting for Windows…';
    const r = await fn();
    btn.disabled = false;
    renderBlockPermission(r.ok ? done : r.error);
  };
  $('blockAllowBtn').addEventListener('click', () => run($('blockAllowBtn'), api.allowBlocking,
    'Done. Site blocking is allowed and will work in your next focus session.'));
  $('blockRevokeBtn').addEventListener('click', () => run($('blockRevokeBtn'), api.removeBlockingPermission,
    'Permission removed. Blocking will need it again before it can work.'));
  $('appTimelineClear').addEventListener('click', async () => {
    if (!confirm('Delete every day of your app timeline? This can\'t be undone.')) return;
    await api.clearAppTimeline();
    appDays.clear();
    showNudge('Your app timeline was deleted.', 'info', true);
    if (typeof renderDay === 'function' && !$('tab-day').hidden) renderDay();
  });
}

// Whole-app color themes: [id, name, light background, dark background, text color for the preview].
const PALETTES = [
  ['steady', 'Steady', '#F6F8F7', '#1B2427', '#1F2D33'],
  ['paper', 'Paper', '#F8F3E8', '#25211B', '#2F2A22'],
  ['nord', 'Nord', '#ECEFF4', '#2E3440', '#2E3440'],
  ['forest', 'Forest', '#F1F6EF', '#19231A', '#1E2B1F'],
  ['rose', 'Rosé', '#FAF2F4', '#271C20', '#36242A'],
  ['pure', 'Pure', '#FFFFFF', '#000000', '#111111'],
  ['contrast', 'High contrast', '#FFFFFF', '#000000', '#000000']
];

// Theme, accent, style options and the time-of-day tint. `s` lets the settings form preview unsaved choices.
function applyAppearance(s = settings) {
  applyMotion(s.motion);
  const root = document.documentElement.dataset;
  root.accent = s.accent || 'pine';
  root.palette = s.palette || 'steady';
  root.look = s.look || 'classic';
  const pick = document.querySelector('.palette-pick');
  if (pick) pick.classList.toggle('off', root.look !== 'classic'); // a look brings its own colors
  if ($('paletteOffNote')) $('paletteOffNote').hidden = root.look === 'classic';
  root.corners = s.corners || 'rounded';
  root.density = s.density || 'comfortable';
  root.font = s.font || 'segoe';
  root.ring = s.ringStyle || 'classic';
  applyDayTint();
}

// Shows appearance choices as soon as they're picked; Save keeps them, leaving Settings without saving puts them back.
function previewAppearance() {
  const f = $('settingsForm');
  const pick = {};
  ['accent', 'palette', 'look', 'corners', 'density', 'font', 'ringStyle'].forEach((k) => {
    const v = TEXT_FIELDS[k](String(f.elements[k].value));
    pick[k] = v === null ? settings[k] : v;
  });
  applyAppearance({ ...settings, ...pick });
}

// A faint wash over the page that shifts from cool morning light to warm evening light.
function applyDayTint() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const stops = [
    [0, '70, 80, 140, 0.07'], [6, '120, 160, 210, 0.07'], [10, '120, 170, 200, 0.03'],
    [13, '255, 255, 255, 0'], [16, '235, 180, 100, 0.05'], [19, '225, 130, 90, 0.08'], [22, '90, 80, 150, 0.08'], [24, '70, 80, 140, 0.07']
  ];
  let i = 0;
  while (i < stops.length - 2 && h >= stops[i + 1][0]) i++;
  const [h0, c0] = stops[i];
  const [h1, c1] = stops[i + 1];
  const t = (h - h0) / (h1 - h0);
  const a = c0.split(',').map(Number);
  const b = c1.split(',').map(Number);
  const mix = a.map((v, k) => (k < 3 ? Math.round(v + (b[k] - v) * t) : +(v + (b[k] - v) * t).toFixed(3)));
  document.documentElement.style.setProperty('--daytint', settings.dayTint === false ? 'transparent' : `rgba(${mix.join(', ')})`);
}

function bindSettingsNav() {
  applyAppearance();
  setInterval(applyDayTint, 10 * 60000);
  bindBlockPermission();
  $('settingsSearch').addEventListener('input', (e) => searchSettings(e.target.value));
  $('settingsSearch').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; searchSettings(''); } });
  $('settingsNav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat-btn]');
    if (b) showSettingsCat(b.dataset.catBtn);
  });
  showSettingsCat(settingsCat);

  api.appVersion().then((v) => {
    $('appVersion').textContent = v;
    $('appVersionHint').textContent = `v${v}`;
    $('appVersionHint').title = `Steady ${v}`;
  });
  const msg = $('updateMsg');
  $('checkUpdatesBtn').addEventListener('click', async () => {
    msg.textContent = 'Checking…';
    $('checkUpdatesBtn').disabled = true;
    const r = await api.checkUpdates();
    $('checkUpdatesBtn').disabled = false;
    $('installUpdateBtn').hidden = r.state !== 'ready';
    msg.textContent = {
      dev: 'Updates only work in the installed app.',
      latest: "You're up to date.",
      downloading: `Downloading version ${r.version}. You'll get a notification when it's ready to install.`,
      ready: `Version ${r.version} is ready to install.`,
      error: "Couldn't check for updates. Check your internet connection and try again."
    }[r.state] || '';
  });
  $('installUpdateBtn').addEventListener('click', () => api.installUpdate());
}
