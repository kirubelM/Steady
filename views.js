/* ---------- Work log ---------- */

const WORK_TYPES = ['session', 'checkin', 'manual'];

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
  const entries = data.entries
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
    $('logList').innerHTML = viewDay === today
      ? emptyState('clock', 'Nothing logged yet', 'Start a focus session, or use "Add entry" to record something you did.')
      : emptyState('clock', 'Nothing was logged on this day', 'Use "Add entry" to fill it in.');
    return;
  }

  $('logList').innerHTML = entries.map((e) => {
    if (e.type === 'break') {
      const label = e.kind === 'long' ? 'Long break' : 'Short break';
      return `<li class="entry break">
        <div class="when">${fmtTime(e.start)}</div>
        <div><p class="meta">${label}${e.skipped ? ', skipped' : ''}${e.snoozes ? `, snoozed ${plural(e.snoozes, 'time')}` : ''}, ${fmtMins(Math.max(60, (e.end - e.start) / 1000))}</p></div>
        <div class="entry-actions"><button class="del" data-del="${e.id}" type="button" aria-label="Delete this break">×</button></div>
      </li>`;
    }
    const apps = (e.apps || []).slice(0, 3).map((a) => esc(a.name)).join(', ');
    const meta = [];
    if (e.type === 'session') meta.push(`${fmtMins(e.focusSec || 0)} focused${e.early ? ' (ended early)' : ''}`);
    else if (e.type === 'checkin') meta.push(`Check-in, ${fmtMins(workSec(e))}`);
    else meta.push(workSec(e) ? `Added by you, ${fmtMins(workSec(e))}` : 'Added by you');
    if (apps) meta.push(apps);
    if (e.distractions?.length) meta.push(plural(e.distractions.length, 'drift'));
    const when = e.end > e.start ? `${fmtTime(e.start)} – ${fmtTime(e.end)}` : fmtTime(e.start);
    return `<li class="entry ${e.type}">
      <div class="when">${when}</div>
      <div>
        <p class="note">${esc(e.note)}</p>
        <p class="meta">${e.rating ? `<span class="chip ${esc(e.rating)}">${RATING_LABELS[e.rating]}</span>` : ''}${projectChip(e.projectId)}${meta.join('. ')}</p>
      </div>
      <div class="entry-actions">
        <button class="link" data-edit="${e.id}" type="button">Edit</button>
      </div>
    </li>`;
  }).join('');
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
  [...data.entries].sort((a, b) => a.start - b.start).forEach((e) => {
    rows.push([
      dayKey(e.start),
      fmtTime(e.start),
      fmtTime(e.end),
      e.type === 'break' ? `${e.kind} break${e.skipped ? ' (skipped)' : ''}` : e.type === 'manual' ? 'added' : e.type,
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

function toTimeInput(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openEntryDialog(id, day) {
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
  $('entryKind').textContent = !e ? '' : e.type === 'session' ? 'Focus session' : e.type === 'checkin' ? 'Check-in' : 'Added by you';
  $('entryError').textContent = '';
  $('entryDialog').showModal();
  $('entryNote').focus();
}

async function saveEntryDialog() {
  const note = $('entryNote').value.trim();
  const date = $('entryDate').value;
  const time = $('entryStart').value;
  const mins = Math.max(0, Math.round(Number($('entryMinutes').value) || 0));
  if (!note) { $('entryError').textContent = 'Describe what you worked on.'; $('entryNote').focus(); return; }
  if (!date || !time) { $('entryError').textContent = 'Pick a date and start time.'; return; }
  const start = new Date(`${date}T${time}`).getTime();
  if (start > Date.now()) { $('entryError').textContent = 'The start time is in the future.'; return; }

  const rating = $('entryRating').value || null;
  const projectId = $('entryProject').value || null;
  let e = editingEntryId ? data.entries.find((x) => x.id === editingEntryId) : null;
  if (!e) {
    e = { id: uid(), type: 'manual' };
    data.entries.push(e);
  }
  e.note = note;
  e.projectId = projectId;
  e.rating = rating || (e.type === 'manual' ? null : e.rating || 'on-track');
  e.start = start;
  e.end = start + mins * 60000;
  if (e.type === 'session') e.focusSec = mins * 60;

  await persist('entries');
  $('entryDialog').close();
  viewDay = dayKey(start) <= dayKey(Date.now()) ? dayKey(start) : viewDay;
  renderLog();
  renderPlan();
  renderTimer();
}

async function deleteEntry(id) {
  data.entries = data.entries.filter((x) => x.id !== id);
  await persist('entries');
  renderLog();
  renderPlan();
  renderTimer();
}

/* ---------- History (what I worked on, by day) ---------- */

let logView = 'day';
const HISTORY_DAYS = 60;

function renderHistory() {
  const q = $('historySearch').value.trim().toLowerCase();
  const work = data.entries.filter((e) => WORK_TYPES.includes(e.type) && e.note);
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

function renderParking() {
  const items = data.parking;
  $('parkList').innerHTML = items.length
    ? items.map((p) => `<li class="${p.done ? 'done' : ''}">
        <label><input type="checkbox" data-toggle="${p.id}" ${p.done ? 'checked' : ''}>
          <span>${esc(p.text)}</span></label>
        <time>${fmtTime(p.at)}</time>
        ${p.done ? '' : `<button class="link small-link" data-park-task="${p.id}" type="button">Add to today's plan</button>`}
        <button class="del" data-park-del="${p.id}" type="button" aria-label="Delete item">×</button>
      </li>`).join('')
    : emptyState('note', 'Nothing parked', 'Your head is clear. Press Ctrl+Shift+Space from any app to jot a thought down.');
  $('clearDone').hidden = !items.some((p) => p.done);
}

async function addParking(text) {
  data.parking.unshift({ id: uid(), text, done: false, at: Date.now() });
  await persist('parking');
  renderParking();
}

/* ---------- Settings ---------- */

const NUM_FIELDS = {
  longBreakMin: [1, 120], longEvery: [2, 12],
  eyeEveryMin: [5, 120], idleCheckinMin: [10, 240], snoozeMin: [1, 30], maxSnoozes: [0, 5],
  idlePauseMin: [1, 60], dailyGoalMin: [0, 720], weeklyReviewDay: [0, 6]
};
const BOOL_FIELDS = ['eyeBreaks', 'idleCheckins', 'strictBreaks', 'blockSites', 'startAtLogin', 'startMinimized',
  'meetingAware', 'idleAutoPause', 'reviewEnabled', 'weeklyReview', 'compactAuto', 'soundInBreaks',
  'projectTint', 'dayTint', 'chimes'];
const TEXT_FIELDS = {
  reviewTime: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null),
  miniMode: (v) => (['off', 'focus', 'always'].includes(v) ? v : null),
  theme: (v) => (['system', 'light', 'dark'].includes(v) ? v : null),
  accent: (v) => (['pine', 'ocean', 'plum', 'terracotta', 'graphite'].includes(v) ? v : null),
  workStart: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null),
  workEnd: (v) => (/^\d{2}:\d{2}$/.test(v) ? v : null)
};
const LIST_FIELDS = ['distractionKeywords', 'blockedSites'];

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
  ['distractions', 'Distractions'], ['appearance', 'Appearance and startup'], ['data', 'Data and backups'], ['help', 'Help and about']
];
let settingsCat = 'focus';
try { settingsCat = localStorage.getItem('settingsCat') || 'focus'; } catch { /* storage unavailable */ }

function showSettingsCat(cat) {
  if (!SETTINGS_CATS.some(([id]) => id === cat)) cat = 'focus';
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
}

// Accent color and the time-of-day tint.
function applyAppearance() {
  document.documentElement.dataset.accent = settings.accent || 'pine';
  applyDayTint();
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
