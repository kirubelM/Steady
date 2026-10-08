const api = window.steady;
const $ = (id) => document.getElementById(id);

const RING_C = 2 * Math.PI * 120;
const IDLE_LIMIT_SEC = 120; // ignore activity when the keyboard/mouse has been idle this long
const RATING_LABELS = { 'on-track': 'On track', partly: 'Partly', sidetracked: 'Got sidetracked' };
const APP_NAMES = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera',
  code: 'VS Code', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook',
  olk: 'Outlook', onenote: 'OneNote', teams: 'Teams', 'ms-teams': 'Teams', slack: 'Slack',
  explorer: 'File Explorer', notepad: 'Notepad', spotify: 'Spotify', discord: 'Discord',
  zoom: 'Zoom', figma: 'Figma', notion: 'Notion', obsidian: 'Obsidian', acrobat: 'Acrobat',
  windowsterminal: 'Terminal', devenv: 'Visual Studio'
};
const IGNORED_APPS = new Set(['', 'idle', 'lockapp', 'electron', 'steady', 'searchhost', 'shellexperiencehost', 'startmenuexperiencehost']);

let data;
let settings;

const S = {
  state: 'idle',          // idle | focus | paused | checkin | break
  task: '',
  start: 0,
  total: 0,
  endsAt: 0,
  remaining: 0,
  pausedAt: 0,
  nextEyeAt: 0,
  distractions: [],
  distractSec: 0,
  lastDistractAt: 0,
  pendingSession: null,
  checkinKind: null,
  breakKind: 'short',
  breakStart: 0
};

let tally = {};
let lastLogAt = Date.now();
let lastIdle = 0;
let viewDay = dayKey(Date.now());
let nudgeTimer = null;

/* ---------- Helpers ---------- */

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtTime(t) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtMins(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function friendlyApp(raw) {
  const key = String(raw || '').toLowerCase();
  if (IGNORED_APPS.has(key)) return '';
  return APP_NAMES[key] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}
function topApps() {
  return Object.entries(tally)
    .map(([name, sec]) => ({ name, sec }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 5);
}
function tallyTotal() {
  return Object.values(tally).reduce((a, b) => a + b, 0);
}
function resetTally() { tally = {}; }
function sessionsToday() {
  const today = dayKey(Date.now());
  return data.entries.filter((e) => e.type === 'session' && dayKey(e.start) === today).length;
}
async function persist(...keys) {
  const patch = {};
  keys.forEach((k) => { patch[k] = data[k]; });
  await api.save(patch);
}

/* ---------- Timer rendering ---------- */

function renderTimer() {
  const now = Date.now();
  let rem;
  let frac = 0;
  const total = S.total || settings.focusMin * 60000;

  if (S.state === 'focus') rem = S.endsAt - now;
  else if (S.state === 'paused') rem = S.remaining;
  else if (S.state === 'checkin' || S.state === 'break') rem = 0;
  else rem = settings.focusMin * 60000;

  if (S.state === 'focus' || S.state === 'paused') frac = 1 - rem / total;
  if (S.state === 'checkin' || S.state === 'break') frac = 1;

  $('time').textContent = fmtClock(rem);
  $('phase').textContent = {
    idle: 'Ready', focus: 'Focusing', paused: 'Paused', checkin: 'Check in', break: 'On a break'
  }[S.state];
  $('ringProgress').style.strokeDashoffset = String(RING_C * (1 - Math.min(1, Math.max(0, frac))));
  document.body.dataset.state = S.state;

  const inSession = S.state === 'focus' || S.state === 'paused';
  $('startBtn').hidden = !(S.state === 'idle' || S.state === 'paused');
  $('startBtn').textContent = S.state === 'paused' ? 'Resume' : 'Start focus';
  $('pauseBtn').hidden = S.state !== 'focus';
  $('stopBtn').hidden = !inSession;

  $('task').hidden = inSession;
  $('task').disabled = S.state !== 'idle';
  document.querySelector('.task-field label').hidden = inSession;
  $('currentTask').hidden = !inSession;
  $('currentTask').textContent = S.task;

  let status;
  if (S.state === 'focus') status = `Until ${fmtTime(S.endsAt)}`;
  else if (S.state === 'paused') status = 'Paused';
  else if (S.state === 'break') status = 'Look away from the screen';
  else if (S.state === 'checkin') status = 'Log your session';
  else {
    const n = sessionsToday();
    status = n ? `${plural(n, 'session')} done today` : 'Ready when you are';
  }
  $('status').textContent = status;
  document.title = inSession ? `${fmtClock(rem)} – Steady` : 'Steady';
}

/* ---------- Focus session ---------- */

async function startFocus() {
  if (S.state === 'paused') {
    const pausedFor = Date.now() - S.pausedAt;
    S.endsAt = Date.now() + S.remaining;
    S.nextEyeAt += pausedFor;
    S.state = 'focus';
    renderTimer();
    return;
  }
  if (S.state !== 'idle') return;

  S.task = $('task').value.trim() || 'Untitled focus';
  S.total = settings.focusMin * 60000;
  S.start = Date.now();
  S.endsAt = S.start + S.total;
  S.nextEyeAt = S.start + settings.eyeEveryMin * 60000;
  S.distractions = [];
  S.distractSec = 0;
  S.lastDistractAt = 0;
  resetTally();
  S.state = 'focus';
  hideNudge();
  renderTimer();

  if (settings.blockSites && settings.blockedSites.length) {
    const r = await api.applyBlock(settings.blockedSites);
    if (!r.ok) showNudge(r.error, 'warn', false);
  }
}

function pauseFocus() {
  if (S.state !== 'focus') return;
  S.remaining = S.endsAt - Date.now();
  S.pausedAt = Date.now();
  S.state = 'paused';
  renderTimer();
}

function finishFocus(early) {
  if (S.state !== 'focus' && S.state !== 'paused') return;
  const end = Date.now();
  const remaining = S.state === 'paused' ? S.remaining : Math.max(0, S.endsAt - end);
  const focusSec = Math.round((S.total - (early ? remaining : 0)) / 1000);

  S.pendingSession = {
    id: uid(),
    type: 'session',
    start: S.start,
    end,
    task: S.task,
    plannedMin: Math.round(S.total / 60000),
    focusSec,
    early: !!early,
    apps: topApps(),
    distractions: S.distractions.slice(),
    distractSec: S.distractSec
  };
  S.state = 'checkin';
  renderTimer();
  if (settings.blockSites) api.clearBlock();

  if (!early) {
    api.notify('Focus session complete', 'Take a few seconds to log what you did.');
    api.focusWindow();
  }
  openCheckin('session');
}

/* ---------- Check-ins ---------- */

function openCheckin(kind) {
  S.checkinKind = kind;
  const dlg = $('checkin');
  let apps;

  if (kind === 'session') {
    const p = S.pendingSession;
    $('checkinTitle').textContent = p.early
      ? 'Session ended early. What did you get done?'
      : 'Session done. What did you get done?';
    $('checkinNote').value = p.task === 'Untitled focus' ? '' : p.task;
    $('checkinPrimary').textContent = 'Save and take a break';
    $('checkinSecondary').textContent = 'Save and skip the break';
    apps = p.apps;
    const n = p.distractions.length;
    $('checkinDrift').textContent = n
      ? `Drifted to distracting windows ${plural(n, 'time')}, about ${fmtMins(Math.max(60, p.distractSec))} in total.`
      : '';
  } else {
    $('checkinTitle').textContent = `What have you worked on since ${fmtTime(lastLogAt)}?`;
    $('checkinNote').value = '';
    $('checkinPrimary').textContent = 'Save';
    $('checkinSecondary').textContent = 'Skip this check-in';
    apps = topApps();
    $('checkinDrift').textContent = '';
  }

  $('checkinApps').textContent = apps.length
    ? 'Most used: ' + apps.slice(0, 3).map((a) => `${a.name} (${fmtMins(Math.max(60, a.sec))})`).join(', ')
    : '';
  document.querySelector('input[name="rating"][value="on-track"]').checked = true;

  if (!dlg.open) dlg.showModal();
  $('checkinNote').focus();
}

async function saveCheckin(primary) {
  const note = $('checkinNote').value.trim();
  const rating = document.querySelector('input[name="rating"]:checked')?.value || 'on-track';

  if (S.checkinKind === 'session') {
    const p = S.pendingSession;
    data.entries.push({ ...p, note: note || p.task, rating });
    S.pendingSession = null;
    await persist('entries');
    $('checkin').close();
    lastLogAt = Date.now();
    resetTally();

    if (primary) {
      const long = sessionsToday() % settings.longEvery === 0;
      S.breakKind = long ? 'long' : 'short';
      S.breakStart = Date.now();
      S.state = 'break';
      api.startBreak({
        kind: S.breakKind,
        minutes: long ? settings.longBreakMin : settings.shortBreakMin,
        strict: settings.strictBreaks
      });
    } else {
      S.state = 'idle';
      $('task').value = '';
    }
  } else {
    if (primary && note) {
      data.entries.push({
        id: uid(), type: 'checkin', start: lastLogAt, end: Date.now(), note, rating, apps: topApps()
      });
      await persist('entries');
    }
    $('checkin').close();
    lastLogAt = Date.now();
    resetTally();
  }
  S.checkinKind = null;
  renderTimer();
  renderLog();
}

async function onBreakEnded({ skipped }) {
  if (S.state !== 'break') return;
  data.entries.push({
    id: uid(), type: 'break', kind: S.breakKind, start: S.breakStart, end: Date.now(), skipped: !!skipped
  });
  await persist('entries');
  S.state = 'idle';
  lastLogAt = Date.now();
  resetTally();
  $('task').value = '';
  renderTimer();
  renderLog();
  showNudge(skipped ? 'Break skipped. What is next?' : 'Break over. What is next?', 'info', true);
  $('task').focus();
}

/* ---------- Activity and distractions ---------- */

function onActivity(info) {
  lastIdle = info.idle || 0;
  if (lastIdle >= IDLE_LIMIT_SEC) return;

  const name = friendlyApp(info.app);
  if (name) tally[name] = (tally[name] || 0) + 2;

  if (S.state !== 'focus') return;
  const title = String(info.title || '').toLowerCase();
  const hit = settings.distractionKeywords.find((k) => k.trim() && title.includes(k.trim().toLowerCase()));
  if (!hit) return;

  S.distractSec += 2;
  const now = Date.now();
  if (now - S.lastDistractAt > 60000) {
    S.lastDistractAt = now;
    const label = hit.replace(/[^\w\s.-]/g, '').trim() || hit.trim();
    S.distractions.push({ at: now, match: label });
    api.notify(`Drifting to ${label}?`, `You're focusing on: ${S.task}`);
    showNudge(`${label} is open. You're focusing on "${S.task}".`, 'warn', true);
  }
}

/* ---------- Tick ---------- */

function tick() {
  const now = Date.now();

  if (S.state === 'focus') {
    if (settings.eyeBreaks && now >= S.nextEyeAt) {
      if (S.endsAt - now > 60000) {
        api.notify('Eye break', 'Look at something about 20 feet (6 m) away for 20 seconds.');
      }
      S.nextEyeAt += settings.eyeEveryMin * 60000;
    }
    if (now >= S.endsAt) {
      finishFocus(false);
      return;
    }
  }

  if (S.state === 'idle' && settings.idleCheckins && !$('checkin').open &&
      now - lastLogAt >= settings.idleCheckinMin * 60000 && lastIdle < IDLE_LIMIT_SEC) {
    if (api.platform === 'win32' && tallyTotal() < 120) {
      // Barely any activity in this window, so there's nothing worth asking about.
      lastLogAt = now;
      resetTally();
    } else {
      api.notify('Quick check-in', `What have you worked on in the last ${settings.idleCheckinMin} minutes?`);
      api.focusWindow();
      openCheckin('checkin');
    }
  }

  renderTimer();
}

/* ---------- Nudge banner ---------- */

function showNudge(text, tone, autoHide) {
  $('nudgeText').textContent = text;
  $('nudge').dataset.tone = tone;
  $('nudge').hidden = false;
  clearTimeout(nudgeTimer);
  if (autoHide) nudgeTimer = setTimeout(hideNudge, 15000);
}
function hideNudge() {
  $('nudge').hidden = true;
}

/* ---------- Work log ---------- */

function renderLog() {
  if (!$('tab-insights').hidden) renderInsights();
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
  const breaks = entries.filter((e) => e.type === 'break' && !e.skipped).length;
  const drifts = sessions.reduce((a, e) => a + (e.distractions?.length || 0), 0);
  $('summary').textContent = sessions.length
    ? `${plural(sessions.length, 'session')}, ${fmtMins(focusSec)} focused, ${plural(breaks, 'break')} taken, ${plural(drifts, 'drift')}.`
    : '';

  if (!entries.length) {
    $('logList').innerHTML = `<li class="empty">${viewDay === today
      ? 'Nothing logged yet. Start a focus session and your check-ins will show up here.'
      : 'Nothing was logged on this day.'}</li>`;
    return;
  }

  $('logList').innerHTML = entries.map((e) => {
    const del = `<button class="del" data-del="${e.id}" type="button" aria-label="Delete this entry">×</button>`;
    if (e.type === 'break') {
      const label = e.kind === 'long' ? 'Long break' : 'Short break';
      return `<li class="entry break">
        <div class="when">${fmtTime(e.start)}</div>
        <div><p class="meta">${label}${e.skipped ? ', skipped' : ''}, ${fmtMins(Math.max(60, (e.end - e.start) / 1000))}</p></div>
        ${del}</li>`;
    }
    const apps = (e.apps || []).slice(0, 3).map((a) => esc(a.name)).join(', ');
    const parts = [];
    if (e.type === 'session') parts.push(`${fmtMins(e.focusSec || 0)} focused${e.early ? ' (ended early)' : ''}`);
    else parts.push('Check-in');
    if (apps) parts.push(apps);
    if (e.distractions?.length) parts.push(plural(e.distractions.length, 'drift'));
    return `<li class="entry ${e.type}">
      <div class="when">${fmtTime(e.start)} – ${fmtTime(e.end)}</div>
      <div>
        <p class="note">${esc(e.note)}</p>
        <p class="meta"><span class="chip ${esc(e.rating)}">${RATING_LABELS[e.rating] || 'On track'}</span>${parts.join('. ')}</p>
      </div>
      ${del}</li>`;
  }).join('');
}

function shiftDay(n) {
  const d = new Date(viewDay + 'T12:00');
  d.setDate(d.getDate() + n);
  const next = dayKey(d.getTime());
  if (next > dayKey(Date.now())) return;
  viewDay = next;
  renderLog();
}

async function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Start', 'End', 'Type', 'What I worked on', 'How it went', 'Focused minutes', 'Top apps', 'Drifts']];
  [...data.entries].sort((a, b) => a.start - b.start).forEach((e) => {
    rows.push([
      dayKey(e.start),
      fmtTime(e.start),
      fmtTime(e.end),
      e.type === 'break' ? `${e.kind} break${e.skipped ? ' (skipped)' : ''}` : e.type,
      e.note || '',
      e.type === 'break' ? '' : (RATING_LABELS[e.rating] || ''),
      e.type === 'session' ? Math.round((e.focusSec || 0) / 60) : '',
      (e.apps || []).map((a) => `${a.name} ${Math.round(a.sec / 60)}m`).join('; '),
      e.distractions ? e.distractions.length : ''
    ]);
  });
  const r = await api.exportCsv(rows.map((row) => row.map(q).join(',')).join('\r\n'));
  if (r.ok) showNudge(`Log exported to ${r.filePath}`, 'info', true);
}

/* ---------- History (what I worked on, by day) ---------- */

let logView = 'day';
const HISTORY_DAYS = 60;

function workSec(e) {
  if (e.type === 'session') return e.focusSec || 0;
  return Math.max(0, (e.end - e.start) / 1000);
}

function renderHistory() {
  const q = $('historySearch').value.trim().toLowerCase();
  const work = data.entries.filter((e) => (e.type === 'session' || e.type === 'checkin') && e.note);
  const matches = q ? work.filter((e) => e.note.toLowerCase().includes(q)) : work;

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
      const g = groups.get(key) || { note: e.note.trim(), sec: 0, count: 0, first: e.start, sidetracked: 0 };
      g.sec += workSec(e);
      g.count++;
      if (e.rating === 'sidetracked') g.sidetracked++;
      groups.set(key, g);
    });
    const dayTotal = byDay[k].reduce((a, e) => a + workSec(e), 0);
    const label = k === today
      ? 'Today'
      : new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: k.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });

    const items = [...groups.values()].map((g) => `<li>
        <span class="h-note">${esc(g.note)}</span>
        <span class="h-meta">${fmtTime(g.first)}${g.count > 1 ? `, ${g.count} times` : ''}${g.sidetracked ? ', got sidetracked' : ''}</span>
        <span class="h-time">${fmtMins(Math.max(60, g.sec))}</span>
      </li>`).join('');

    return `<section class="h-day">
      <div class="h-day-head">
        <h3>${esc(label)}</h3>
        <span class="h-total">${fmtMins(dayTotal)}</span>
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

/* ---------- Insights dashboard ---------- */

let insightRange = 7;

function rangeDays(n) {
  const out = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function fmtHour(h) {
  const hr = h % 24;
  if (hr === 0) return '12 AM';
  if (hr === 12) return '12 PM';
  return hr < 12 ? `${hr} AM` : `${hr - 12} PM`;
}
function shortHour(h) {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
function fmtAxisMins(v) {
  if (v === 0) return '0';
  if (v < 60) return `${Math.round(v)}m`;
  const h = v / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

function niceMax(max, steps) {
  const step = steps.find((s) => s * 4 >= max) || Math.ceil(max / 4);
  return step * 4;
}

function barChart({ labels, values, steps, fmtAxis, fmtTip, barClass, height = 170, labelEvery = 1, ariaLabel }) {
  const W = 640, H = height, padL = 40, padR = 6, padT = 10, padB = 24;
  const plotH = H - padT - padB;
  const max = niceMax(Math.max(0, ...values), steps);
  const n = values.length;
  const cw = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(36, cw * 0.62));
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;

  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line>`;
    svg += `<text class="axis" x="${padL - 6}" y="${y + 4}" text-anchor="end">${fmtAxis((max * i) / 4)}</text>`;
  }
  values.forEach((v, i) => {
    const h = max ? (v / max) * plotH : 0;
    const x = padL + i * cw + (cw - bw) / 2;
    const y = padT + plotH - h;
    if (v > 0) {
      svg += `<rect class="bar ${barClass(i)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2"><title>${esc(fmtTip(i, v))}</title></rect>`;
    }
    if (i % labelEvery === 0 || i === n - 1) {
      svg += `<text class="axis" x="${(padL + i * cw + cw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
    }
  });
  return svg + '</svg>';
}

function splitBar(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return '';
  return `<div class="split" aria-hidden="true">${parts
    .filter((p) => p.value > 0)
    .map((p) => `<span class="seg ${p.cls}" style="flex:${p.value}"></span>`)
    .join('')}</div>
    <p class="legend">${parts.map((p) =>
      `<span><i class="dot ${p.cls}"></i>${esc(p.label)} ${p.value} (${Math.round((p.value / total) * 100)}%)</span>`).join('')}</p>`;
}

function computeStreaks() {
  const days = new Set(data.entries.filter((e) => e.type === 'session').map((e) => dayKey(e.start)));
  const step = (key, n) => {
    const d = new Date(key + 'T12:00');
    d.setDate(d.getDate() + n);
    return dayKey(d.getTime());
  };
  let current = 0;
  let cursor = dayKey(Date.now());
  if (!days.has(cursor)) cursor = step(cursor, -1); // today isn't over yet
  while (days.has(cursor)) { current++; cursor = step(cursor, -1); }

  let longest = 0;
  let run = 0;
  let prev = null;
  [...days].sort().forEach((k) => {
    run = prev && step(prev, 1) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  });
  return { current, longest, activeToday: days.has(dayKey(Date.now())) };
}

function renderInsights() {
  const days = rangeDays(insightRange);
  const first = days[0];
  const inRange = data.entries.filter((e) => dayKey(e.start) >= first);
  const sessions = inRange.filter((e) => e.type === 'session');
  const breaks = inRange.filter((e) => e.type === 'break');

  if (!sessions.length) {
    $('insightSummary').textContent = '';
    $('insightBody').innerHTML = `<p class="empty-insight">No focus sessions in the last ${insightRange} days. Finish a few and your patterns will show up here.</p>`;
    return;
  }

  /* Summary */
  const totalSec = sessions.reduce((a, e) => a + (e.focusSec || 0), 0);
  const activeDays = new Set(sessions.map((e) => dayKey(e.start))).size;
  const onTrack = sessions.filter((e) => e.rating === 'on-track').length;
  $('insightSummary').textContent =
    `${fmtMins(totalSec)} focused across ${plural(sessions.length, 'session')} on ${plural(activeDays, 'day')}, ` +
    `about ${fmtMins(totalSec / activeDays)} on the days you worked. ` +
    `${Math.round((onTrack / sessions.length) * 100)}% of sessions went to plan.`;

  /* Focus time per day */
  const perDay = Object.fromEntries(days.map((k) => [k, 0]));
  sessions.forEach((e) => { perDay[dayKey(e.start)] += (e.focusSec || 0) / 60; });
  const dayVals = days.map((k) => perDay[k]);
  const today = dayKey(Date.now());
  const dayLabels = days.map((k) => {
    const d = new Date(k + 'T12:00');
    if (insightRange === 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.getDate() === 1 || k === first
      ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      : String(d.getDate());
  });
  const bestDayIdx = dayVals.indexOf(Math.max(...dayVals));
  const focusChart = barChart({
    labels: dayLabels,
    values: dayVals,
    steps: [5, 10, 15, 30, 60, 90, 120, 180, 240, 360],
    fmtAxis: fmtAxisMins,
    fmtTip: (i, v) => `${new Date(days[i] + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}: ${fmtMins(v * 60)}`,
    barClass: (i) => (days[i] === today ? 'today' : ''),
    labelEvery: insightRange === 7 ? 1 : insightRange === 30 ? 5 : 14,
    ariaLabel: 'Focus time per day'
  });
  const bestDayNote = `Your biggest day was ${new Date(days[bestDayIdx] + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} with ${fmtMins(dayVals[bestDayIdx] * 60)}.`;

  /* Best hours */
  const hourMins = new Array(24).fill(0);
  const startCounts = new Array(24).fill(0);
  const startOnTrack = new Array(24).fill(0);
  sessions.forEach((e) => {
    let t = e.start;
    let left = e.focusSec || 0;
    while (left > 0) {
      const d = new Date(t);
      const toNext = 3600 - (d.getMinutes() * 60 + d.getSeconds());
      const chunk = Math.min(left, toNext);
      hourMins[d.getHours()] += chunk / 60;
      t += chunk * 1000;
      left -= chunk;
    }
    const h = new Date(e.start).getHours();
    startCounts[h]++;
    if (e.rating === 'on-track') startOnTrack[h]++;
  });
  let usedHours = hourMins.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
  if (!usedHours.length) usedHours = [9];
  const hFrom = Math.max(0, Math.min(8, usedHours[0]) - 1);
  const hTo = Math.min(23, Math.max(18, usedHours[usedHours.length - 1]) + 1);
  let bestH = hFrom;
  let bestSum = -1;
  for (let h = hFrom; h < hTo; h++) {
    const s = hourMins[h] + hourMins[h + 1];
    if (s > bestSum) { bestSum = s; bestH = h; }
  }
  const hourRange = [];
  for (let h = hFrom; h <= hTo; h++) hourRange.push(h);
  const hourChart = barChart({
    labels: hourRange.map(shortHour),
    values: hourRange.map((h) => hourMins[h]),
    steps: [5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 600, 900, 1200],
    fmtAxis: fmtAxisMins,
    fmtTip: (i, v) => `${fmtHour(hourRange[i])}–${fmtHour(hourRange[i] + 1)}: ${fmtMins(v * 60)}`,
    barClass: (i) => (hourRange[i] === bestH || hourRange[i] === bestH + 1 ? 'hi' : 'soft'),
    labelEvery: hourRange.length > 14 ? 2 : 1,
    ariaLabel: 'Focus time by hour of day'
  });
  let hourNote = `Most of your focus happens between ${fmtHour(bestH)} and ${fmtHour(bestH + 2)}.`;
  let bestStart = -1;
  let bestRate = 0;
  startCounts.forEach((c, h) => {
    if (c >= 2) {
      const rate = startOnTrack[h] / c;
      if (rate > bestRate) { bestRate = rate; bestStart = h; }
    }
  });
  if (bestStart >= 0 && bestRate > 0) {
    hourNote += ` Sessions you start around ${fmtHour(bestStart)} go to plan most often (${Math.round(bestRate * 100)}%).`;
  }

  /* Top apps */
  const appTotals = {};
  inRange.forEach((e) => (e.apps || []).forEach((a) => { appTotals[a.name] = (appTotals[a.name] || 0) + a.sec; }));
  const apps = Object.entries(appTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const appMax = apps.length ? apps[0][1] : 1;
  const appsHtml = apps.length
    ? `<ul class="hbars">${apps.map(([name, sec]) => `<li>
        <span class="hb-name">${esc(name)}</span>
        <span class="hb-track"><span style="width:${Math.max(3, (sec / appMax) * 100).toFixed(1)}%"></span></span>
        <span class="hb-val">${fmtMins(Math.max(60, sec))}</span></li>`).join('')}</ul>`
    : '<p class="insight-note">App tracking works on Windows. Nothing recorded yet.</p>';

  /* Distractions */
  const driftPerDay = Object.fromEntries(days.map((k) => [k, 0]));
  const driftBy = {};
  sessions.forEach((e) => (e.distractions || []).forEach((d) => {
    driftPerDay[dayKey(e.start)]++;
    driftBy[d.match] = (driftBy[d.match] || 0) + 1;
  }));
  const driftVals = days.map((k) => driftPerDay[k]);
  const totalDrifts = driftVals.reduce((a, b) => a + b, 0);
  let driftHtml;
  if (!totalDrifts) {
    driftHtml = '<p class="insight-note">No drifts in this period. Nicely done.</p>';
  } else {
    const half = Math.floor(days.length / 2);
    const earlier = driftVals.slice(0, half).reduce((a, b) => a + b, 0);
    const later = driftVals.slice(half).reduce((a, b) => a + b, 0);
    const trend = later < earlier
      ? `Down from ${earlier} to ${later} compared with the first half of this period.`
      : later > earlier
        ? `Up from ${earlier} to ${later} compared with the first half of this period.`
        : 'About the same across the period.';
    const top = Object.entries(driftBy).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, c]) => `${esc(k)} (${c})`).join(', ');
    driftHtml = `<p class="insight-note">${plural(totalDrifts, 'drift')}. ${trend} Most often: ${top}.</p>` +
      barChart({
        labels: dayLabels,
        values: driftVals,
        steps: [1, 2, 3, 5, 10, 20, 50],
        fmtAxis: (v) => String(Math.round(v)),
        fmtTip: (i, v) => `${days[i]}: ${plural(v, 'drift')}`,
        barClass: () => 'drift',
        height: 120,
        labelEvery: insightRange === 7 ? 1 : insightRange === 30 ? 10 : 30,
        ariaLabel: 'Drifts per day'
      });
  }
  const ratingSplit = splitBar([
    { label: 'On track', value: onTrack, cls: 'ok' },
    { label: 'Partly', value: sessions.filter((e) => e.rating === 'partly').length, cls: 'mid' },
    { label: 'Sidetracked', value: sessions.filter((e) => e.rating === 'sidetracked').length, cls: 'bad' }
  ]);

  /* Breaks and streaks */
  const taken = breaks.filter((b) => !b.skipped).length;
  const skipped = breaks.length - taken;
  const restSec = breaks.filter((b) => !b.skipped).reduce((a, b) => a + (b.end - b.start) / 1000, 0);
  const st = computeStreaks();
  const streakNote = st.current === 0
    ? 'Finish a session today to start a new streak.'
    : st.activeToday
      ? 'You\'ve kept it going today.'
      : 'Finish a session today to keep it going.';

  $('insightBody').innerHTML = `
    <section class="insight">
      <h3>Focus time per day</h3>
      <p class="insight-note">${bestDayNote}</p>
      ${focusChart}
    </section>
    <section class="insight">
      <h3>Your best hours</h3>
      <p class="insight-note">${hourNote}</p>
      ${hourChart}
    </section>
    <section class="insight two-col">
      <div>
        <h3>Top apps</h3>
        ${appsHtml}
      </div>
      <div>
        <h3>Distractions</h3>
        ${driftHtml}
        <h4>How sessions went</h4>
        ${ratingSplit}
      </div>
    </section>
    <section class="insight">
      <h3>Breaks and streaks</h3>
      <div class="stats">
        <p><strong>${plural(st.current, 'day')}</strong> current streak</p>
        <p><strong>${plural(st.longest, 'day')}</strong> longest streak</p>
        <p><strong>${fmtMins(restSec)}</strong> spent resting</p>
      </div>
      <p class="insight-note">${streakNote}</p>
      ${breaks.length ? splitBar([
        { label: 'Taken', value: taken, cls: 'rest' },
        { label: 'Skipped', value: skipped, cls: 'skip' }
      ]) : '<p class="insight-note">No breaks recorded in this period yet.</p>'}
    </section>`;
}

/* ---------- Parking lot ---------- */

function renderParking() {
  const items = data.parking;
  $('parkList').innerHTML = items.length
    ? items.map((p) => `<li class="${p.done ? 'done' : ''}">
        <label><input type="checkbox" data-toggle="${p.id}" ${p.done ? 'checked' : ''}>
          <span>${esc(p.text)}</span></label>
        <time>${fmtTime(p.at)}</time>
        <button class="del" data-park-del="${p.id}" type="button" aria-label="Delete item">×</button>
      </li>`).join('')
    : '<li class="empty">Nothing parked. Your head is clear.</li>';
  $('clearDone').hidden = !items.some((p) => p.done);
}

async function addParking(text) {
  data.parking.unshift({ id: uid(), text, done: false, at: Date.now() });
  await persist('parking');
  renderParking();
}

/* ---------- Settings ---------- */

const NUM_FIELDS = {
  focusMin: [5, 180], shortBreakMin: [1, 60], longBreakMin: [1, 120], longEvery: [2, 12],
  eyeEveryMin: [5, 120], idleCheckinMin: [10, 240]
};
const BOOL_FIELDS = ['eyeBreaks', 'idleCheckins', 'strictBreaks', 'blockSites'];
const LIST_FIELDS = ['distractionKeywords', 'blockedSites'];

function fillSettingsForm() {
  const f = $('settingsForm');
  Object.keys(NUM_FIELDS).forEach((k) => { f.elements[k].value = settings[k]; });
  BOOL_FIELDS.forEach((k) => { f.elements[k].checked = !!settings[k]; });
  LIST_FIELDS.forEach((k) => { f.elements[k].value = (settings[k] || []).join('\n'); });
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

  Object.assign(settings, next);
  data.settings = settings;
  await persist('settings');
  fillSettingsForm();
  const inSession = S.state === 'focus' || S.state === 'paused';
  $('settingsSaved').textContent = inSession ? 'Saved. Timing changes apply from your next session.' : 'Saved.';
  setTimeout(() => { $('settingsSaved').textContent = ''; }, 4000);
  renderTimer();
}

/* ---------- Tabs and events ---------- */

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
  ['log', 'insights', 'parking', 'settings'].forEach((t) => { $(`tab-${t}`).hidden = t !== name; });
  if (name === 'insights') renderInsights();
}

function bind() {
  $('startBtn').addEventListener('click', startFocus);
  $('pauseBtn').addEventListener('click', pauseFocus);
  $('stopBtn').addEventListener('click', () => finishFocus(true));
  $('task').addEventListener('keydown', (e) => { if (e.key === 'Enter') startFocus(); });
  $('nudgeClose').addEventListener('click', hideNudge);

  $('checkinPrimary').addEventListener('click', () => saveCheckin(true));
  $('checkinSecondary').addEventListener('click', () => saveCheckin(false));
  $('checkinNote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveCheckin(true);
  });
  $('checkin').addEventListener('cancel', (e) => {
    e.preventDefault(); // a finished session always needs a decision
    if (S.checkinKind === 'checkin') saveCheckin(false);
  });

  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(1));
  $('exportBtn').addEventListener('click', exportCsv);
  document.querySelectorAll('[data-logview]').forEach((b) => b.addEventListener('click', () => setLogView(b.dataset.logview)));
  $('datePick').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v && v <= dayKey(Date.now())) { viewDay = v; renderLog(); }
  });
  $('historySearch').addEventListener('input', renderHistory);
  $('historyList').addEventListener('click', (e) => {
    const k = e.target.dataset?.openday;
    if (!k) return;
    viewDay = k;
    setLogView('day');
  });
  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    insightRange = Number(b.dataset.range);
    document.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderInsights();
  }));

  $('logList').addEventListener('click', async (e) => {
    const id = e.target.dataset?.del;
    if (!id) return;
    data.entries = data.entries.filter((x) => x.id !== id);
    await persist('entries');
    renderLog();
  });

  $('parkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('parkInput').value.trim();
    if (!text) return;
    $('parkInput').value = '';
    addParking(text);
  });
  $('parkList').addEventListener('change', async (e) => {
    const id = e.target.dataset?.toggle;
    if (!id) return;
    const item = data.parking.find((p) => p.id === id);
    if (item) item.done = e.target.checked;
    await persist('parking');
    renderParking();
  });
  $('parkList').addEventListener('click', async (e) => {
    const id = e.target.dataset?.parkDel;
    if (!id) return;
    data.parking = data.parking.filter((p) => p.id !== id);
    await persist('parking');
    renderParking();
  });
  $('clearDone').addEventListener('click', async () => {
    data.parking = data.parking.filter((p) => !p.done);
    await persist('parking');
    renderParking();
  });

  $('settingsForm').addEventListener('submit', saveSettings);
}

async function init() {
  data = await api.load();
  settings = data.settings;
  bind();
  fillSettingsForm();
  renderTimer();
  renderLog();
  renderParking();
  api.onActivity(onActivity);
  api.onBreakEnded(onBreakEnded);
  api.onQuickPark(() => {
    showTab('parking');
    $('parkInput').focus();
  });
  let knownToday = dayKey(Date.now());
  setInterval(() => {
    // Roll the log over to the new day at midnight if it was showing "today".
    const today = dayKey(Date.now());
    if (today !== knownToday) {
      if (viewDay === knownToday) viewDay = today;
      knownToday = today;
      renderLog();
      renderTimer();
    }
  }, 60000);
  setInterval(tick, 1000);
}

init();
