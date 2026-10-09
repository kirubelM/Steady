const api = window.steady;
const $ = (id) => document.getElementById(id);

const RING_C = 2 * Math.PI * 120;
const IDLE_LIMIT_SEC = 120; // ignore activity when the keyboard/mouse has been idle this long
const MEETING_CLEAR_MS = 30000; // how long a call must be over before a held break starts
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
const MEETING_TITLES = /powerpoint slide show|google meet|^meet [-–]|zoom meeting|webex/i;

let data;
let settings;

const S = {
  state: 'idle',          // idle | focus | paused | checkin | break | breakPending
  task: '',
  taskId: null,
  start: 0,
  total: 0,
  endsAt: 0,
  remaining: 0,
  pausedAt: 0,
  autoPaused: false,
  nextEyeAt: 0,
  distractions: [],
  distractSec: 0,
  lastDistractAt: 0,
  pendingSession: null,
  checkinKind: null,
  breakKind: 'short',
  breakMinutes: 5,
  breakStart: 0,
  breakSnoozes: 0,
  pendingReason: null,    // 'meeting' | 'snooze'
  breakDueAt: 0
};

let tally = {};
let lastLogAt = Date.now();
let lastIdle = 0;
let miniShown = false; // whether the mini timer is on screen (sent by the main process)
let inMeeting = false;
let meetingClearSince = Date.now();
let viewDay = dayKey(Date.now());
let selectedPresetId = null;
let nudgeTimer = null;
let nudgeActionFn = null;

/* ---------- Helpers ---------- */

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftKey(key, n) {
  const d = new Date(key + 'T12:00');
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
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
// Focus seconds today, including the session in progress.
function todayFocusSec() {
  const today = dayKey(Date.now());
  let sec = data.entries
    .filter((e) => e.type === 'session' && dayKey(e.start) === today)
    .reduce((a, e) => a + (e.focusSec || 0), 0);
  if (S.state === 'focus') sec += Math.max(0, (S.total - (S.endsAt - Date.now())) / 1000);
  if (S.state === 'paused') sec += Math.max(0, (S.total - S.remaining) / 1000);
  return sec;
}
async function persist(...keys) {
  const patch = {};
  keys.forEach((k) => { patch[k] = data[k]; });
  await api.save(patch);
}
const meetingHold = () => settings.meetingAware && inMeeting;

/* ---------- Session presets ---------- */

function presetById(id) {
  return settings.presets.find((p) => p.id === id) || null;
}
function currentPreset() {
  return presetById(selectedPresetId) || presetById(settings.presetId) || settings.presets[0];
}
async function selectPreset(id, remember = true) {
  if (!presetById(id)) return;
  selectedPresetId = id;
  if (remember && settings.presetId !== id) {
    settings.presetId = id;
    await persist('settings');
  }
  renderPresetBar();
  renderTimer();
}
function renderPresetBar() {
  const cur = currentPreset();
  $('presetBar').innerHTML = settings.presets.map((p) =>
    `<button type="button" data-preset="${p.id}" aria-pressed="${p.id === cur.id}" title="${esc(p.name)}: ${p.focusMin} min focus, ${p.breakMin} min break">
      <span class="p-min">${p.focusMin}</span><span class="p-name">${esc(p.name)}</span></button>`).join('');
}

/* ---------- Timer rendering ---------- */

function currentRemaining() {
  if (S.state === 'focus') return Math.max(0, S.endsAt - Date.now());
  if (S.state === 'paused') return S.remaining;
  if (S.state === 'breakPending' && S.pendingReason === 'snooze') return Math.max(0, S.breakDueAt - Date.now());
  if (S.state === 'breakPending') return S.breakMinutes * 60000; // the break that's waiting
  if (S.state === 'idle') return currentPreset().focusMin * 60000;
  return 0;
}

function renderTimer() {
  const total = S.total || currentPreset().focusMin * 60000;
  const rem = currentRemaining();
  let frac = 0;
  if (S.state === 'focus' || S.state === 'paused') frac = 1 - rem / total;
  if (['checkin', 'break', 'breakPending'].includes(S.state)) frac = 1;

  $('time').textContent = fmtClock(rem);
  $('phase').textContent = {
    idle: 'Ready',
    focus: 'Focusing',
    paused: S.autoPaused ? 'Paused while away' : 'Paused',
    checkin: 'Check in',
    break: 'On a break',
    breakPending: S.pendingReason === 'snooze' ? 'Break snoozed' : 'Break waiting'
  }[S.state];
  $('ringProgress').style.strokeDashoffset = String(RING_C * (1 - Math.min(1, Math.max(0, frac))));
  $('ringProgress').style.opacity = frac > 0.001 ? '1' : '0';
  document.body.dataset.state = S.state;

  const inSession = S.state === 'focus' || S.state === 'paused';
  const pending = S.state === 'breakPending';
  $('startBtn').hidden = !(S.state === 'idle' || S.state === 'paused');
  $('startBtn').textContent = S.state === 'paused' ? 'Resume' : 'Start focus';
  $('pauseBtn').hidden = S.state !== 'focus';
  $('stopBtn').hidden = !inSession;
  $('breakNowBtn').hidden = !pending;
  $('skipBreakBtn').hidden = !pending;

  const showInput = S.state === 'idle';
  $('presetBar').hidden = !showInput;
  $('focusProjectRow').hidden = !showInput;
  $('task').hidden = !showInput;
  document.querySelector('.task-field label').hidden = !showInput;
  $('currentTask').hidden = !inSession;
  $('currentTask').textContent = S.task;
  if (typeof renderNextUp === 'function') renderNextUp();

  let status;
  if (S.state === 'focus') status = `Until ${fmtTime(S.endsAt)}`;
  else if (S.state === 'paused') status = S.autoPaused ? `Paused at ${fmtTime(S.pausedAt)}` : 'Paused';
  else if (S.state === 'break') status = 'Look away from the screen';
  else if (S.state === 'checkin') status = 'Log your session';
  else if (pending) status = S.pendingReason === 'meeting' ? 'Break starts after your call' : `Break at ${fmtTime(S.breakDueAt)}`;
  else {
    status = '';
  }
  $('status').textContent = status;
  document.title = inSession ? `${fmtClock(rem)} – Steady` : 'Steady';

  if (typeof renderGoal === 'function') renderGoal();
  if (typeof renderFocusSubs === 'function') renderFocusSubs();
  if (typeof syncSound === 'function') syncSound();
  if (S.state === 'focus' || S.state === 'paused') {
    $('currentProject').innerHTML = projectChip(S.projectId);
  }
  $('currentProject').hidden = !(S.state === 'focus' || S.state === 'paused') || !S.projectId;

  api.publishState({
    state: S.state,
    remaining: rem,
    total: S.state === 'breakPending' ? S.snoozeTotal || 1 : total,
    task: S.task,
    start: S.start,
    autoPaused: S.autoPaused,
    pendingReason: S.pendingReason,
    goalSec: (settings.dailyGoalMin || 0) * 60,
    todaySec: todayFocusSec()
  });
}

/* ---------- Focus session ---------- */

function resumeFocus() {
  if (S.state !== 'paused') return;
  const pausedFor = Date.now() - S.pausedAt;
  S.endsAt = Date.now() + S.remaining;
  S.nextEyeAt += pausedFor;
  S.autoPaused = false;
  S.state = 'focus';
  renderTimer();
}

async function startFocus(opts = {}) {
  if (S.state === 'paused') return resumeFocus();
  if (S.state === 'breakPending') await recordBreak(true);
  if (S.state !== 'idle') return;

  const text = (opts.text ?? $('task').value).trim();
  S.task = text || 'Untitled focus';
  S.taskId = opts.taskId ?? (typeof matchTask === 'function' ? matchTask(S.task) : null);
  S.subId = opts.subId || null;
  const task = S.taskId && typeof findTask === 'function' ? findTask(S.taskId) : null;
  if (task && task.presetId && presetById(task.presetId) && !opts.keepPreset) selectedPresetId = task.presetId;
  renderPresetBar();
  const preset = currentPreset();
  if (task && task.presetId !== preset.id) { task.presetId = preset.id; persist('tasks'); }
  S.presetId = preset.id;
  S.sessionBreakMin = preset.breakMin;
  S.projectId = (task && task.projectId) || $('focusProject').value || null;
  S.total = preset.focusMin * 60000;
  S.start = Date.now();
  S.endsAt = S.start + S.total;
  S.nextEyeAt = S.start + settings.eyeEveryMin * 60000;
  S.distractions = [];
  S.distractSec = 0;
  S.lastDistractAt = 0;
  S.autoPaused = false;
  resetTally();
  S.state = 'focus';
  hideNudge();
  renderTimer();
  if (typeof renderPlan === 'function') renderPlan();
  if (typeof afterSessionStart === 'function') afterSessionStart();

  if (settings.blockSites && settings.blockedSites.length) {
    const r = await api.applyBlock(settings.blockedSites);
    if (!r.ok) showNudge(r.error, 'warn', false);
  }
}

function pauseFocus() {
  if (S.state !== 'focus') return;
  S.remaining = S.endsAt - Date.now();
  S.pausedAt = Date.now();
  S.autoPaused = false;
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
    taskId: S.taskId,
    subId: S.subId || null,
    projectId: S.projectId || null,
    presetId: S.presetId,
    plannedMin: Math.round(S.total / 60000),
    focusSec: Math.max(0, focusSec),
    early: !!early,
    apps: topApps(),
    distractions: S.distractions.slice(),
    distractSec: S.distractSec
  };
  S.state = 'checkin';
  S.autoPaused = false;
  closeAwayDialog();
  if (typeof afterSessionEnd === 'function') afterSessionEnd();
  renderTimer();
  if (settings.blockSites) api.clearBlock();

  if (!early) {
    if (meetingHold()) {
      api.notify('Focus session complete', 'Log it when your call is over. Your break will wait.');
    } else {
      api.notify('Focus session complete', 'Take a few seconds to log what you did.');
      api.focusWindow();
    }
  }
  openCheckin('session');
}

/* ---------- Stepping away ---------- */

function autoPause(idleSec) {
  const awayStart = Date.now() - idleSec * 1000;
  S.remaining = Math.min(S.total, Math.max(0, S.endsAt - awayStart));
  S.pausedAt = awayStart;
  S.autoPaused = true;
  S.state = 'paused';
  renderTimer();
}

function onReturnFromAway() {
  const awayMs = Date.now() - S.pausedAt;
  $('awayTitle').textContent = `Welcome back. You were away for ${fmtMins(Math.max(60, awayMs / 1000))}.`;
  $('awayText').textContent = `Steady paused "${S.task}" at ${fmtTime(S.pausedAt)} when your computer went quiet.`;
  $('awayCount').textContent = 'I was still working (count it)';
  const dlg = $('awayDialog');
  if (!dlg.open) dlg.showModal();
  api.focusWindow();
}

function closeAwayDialog() {
  if ($('awayDialog').open) $('awayDialog').close();
}

function handleAway(choice) {
  closeAwayDialog();
  if (S.state !== 'paused') return;
  if (choice === 'count') {
    const awayMs = Date.now() - S.pausedAt;
    S.remaining -= awayMs;
    S.pausedAt = Date.now();
    if (S.remaining <= 0) {
      S.remaining = 0;
      S.state = 'focus';
      S.endsAt = Date.now();
      S.autoPaused = false;
      finishFocus(false);
      return;
    }
    resumeFocus();
  } else if (choice === 'resume') {
    resumeFocus();
  } else if (choice === 'end') {
    finishFocus(true);
  }
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
    $('checkinProject').innerHTML = projectOptions(p.projectId);
    const task = p.taskId && typeof findTask === 'function' ? findTask(p.taskId) : null;
    const sub = task && p.subId ? (task.subtasks || []).find((x) => x.id === p.subId) : null;
    $('checkinDoneRow').hidden = sub ? sub.done : !task || task.done;
    $('checkinDone').checked = false;
    if (sub) $('checkinDoneLabel').textContent = `Mark the subtask "${sub.text}" as done`;
    else if (task) $('checkinDoneLabel').textContent = `Mark "${task.text}" as done in my plan`;
  } else {
    $('checkinTitle').textContent = `What have you worked on since ${fmtTime(lastLogAt)}?`;
    $('checkinNote').value = '';
    $('checkinPrimary').textContent = 'Save';
    $('checkinSecondary').textContent = 'Skip this check-in';
    apps = topApps();
    $('checkinDrift').textContent = '';
    $('checkinDoneRow').hidden = true;
    $('checkinProject').innerHTML = projectOptions(null);
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
  const projectId = $('checkinProject').value || null;

  if (S.checkinKind === 'session') {
    const p = S.pendingSession;
    data.entries.push({ ...p, note: note || p.task, rating, projectId });
    S.pendingSession = null;
    if (!$('checkinDoneRow').hidden && $('checkinDone').checked) {
      if (p.subId && typeof setSubtaskDone === 'function') await setSubtaskDone(p.taskId, p.subId, true);
      else if (typeof setTaskDone === 'function') await setTaskDone(p.taskId, true);
    }
    await persist('entries');
    $('checkin').close();
    lastLogAt = Date.now();
    resetTally();
    if (typeof checkGoal === 'function') checkGoal();
    if (typeof checkProjectGoals === 'function') checkProjectGoals();

    if (primary) {
      requestBreak();
    } else {
      S.state = 'idle';
      $('task').value = '';
    }
  } else {
    if (primary && note) {
      data.entries.push({
        id: uid(), type: 'checkin', start: lastLogAt, end: Date.now(), note, rating, projectId, apps: topApps()
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
  if (typeof renderPlan === 'function') renderPlan();
}

/* ---------- Breaks ---------- */

function requestBreak() {
  const long = sessionsToday() % settings.longEvery === 0;
  S.breakKind = long ? 'long' : 'short';
  S.breakMinutes = long ? settings.longBreakMin : (S.sessionBreakMin || currentPreset().breakMin);
  S.breakSnoozes = 0;
  if (meetingHold()) holdBreak('meeting');
  else launchBreak();
}

function launchBreak() {
  S.state = 'break';
  S.pendingReason = null;
  S.breakStart = Date.now();
  hideNudge();
  api.startBreak({
    kind: S.breakKind,
    minutes: S.breakMinutes,
    strict: settings.strictBreaks,
    snoozesLeft: settings.maxSnoozes - S.breakSnoozes,
    snoozeMin: settings.snoozeMin
  });
  renderTimer();
}

function holdBreak(reason, dueAt = 0) {
  S.state = 'breakPending';
  S.pendingReason = reason;
  S.breakDueAt = dueAt;
  S.snoozeTotal = dueAt ? dueAt - Date.now() : 1;
  if (reason === 'meeting') {
    showNudge('Looks like you\'re in a call or presenting. Your break will start once you\'re done.', 'info', false);
  } else {
    showNudge(`Break snoozed until ${fmtTime(dueAt)}.`, 'info', true);
  }
  renderTimer();
}

function onBreakSnoozed() {
  if (S.state !== 'break') return;
  S.breakSnoozes++;
  holdBreak('snooze', Date.now() + settings.snoozeMin * 60000);
}

async function recordBreak(skipped) {
  data.entries.push({
    id: uid(),
    type: 'break',
    kind: S.breakKind,
    start: S.breakStart || Date.now(),
    end: Date.now(),
    skipped: !!skipped,
    snoozes: S.breakSnoozes
  });
  await persist('entries');
  S.state = 'idle';
  S.pendingReason = null;
  S.breakStart = 0;
  lastLogAt = Date.now();
  resetTally();
  $('task').value = '';
  renderTimer();
  renderLog();
}

async function onBreakEnded({ skipped }) {
  if (S.state !== 'break') return;
  await recordBreak(skipped);
  showNudge(skipped ? 'Break skipped. What is next?' : 'Break over. What is next?', 'info', true);
  $('task').focus();
}

async function skipPendingBreak() {
  if (S.state !== 'breakPending') return;
  hideNudge();
  await recordBreak(true);
}

/* ---------- Activity, calls and distractions ---------- */

function onActivity(info) {
  const now = Date.now();
  const idle = info.idle || 0;
  lastIdle = idle;

  const title = String(info.title || '');
  inMeeting = !!(info.mic || info.presenting || MEETING_TITLES.test(title));
  if (inMeeting) meetingClearSince = 0;
  else if (!meetingClearSince) meetingClearSince = now;

  // Stepping away: pause automatically, then ask on return.
  if (S.state === 'focus' && settings.idleAutoPause && idle >= settings.idlePauseMin * 60 && !meetingHold()) {
    autoPause(idle);
    return;
  }
  if (S.state === 'paused' && S.autoPaused && idle < 5) {
    S.autoPaused = false; // only ask once
    onReturnFromAway();
  }

  if (idle >= IDLE_LIMIT_SEC) return;

  const name = friendlyApp(info.app);
  if (name) tally[name] = (tally[name] || 0) + 2;

  if (S.state !== 'focus') return;
  const lower = title.toLowerCase();
  const hit = settings.distractionKeywords.find((k) => k.trim() && lower.includes(k.trim().toLowerCase()));
  if (!hit) return;

  S.distractSec += 2;
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
      if (S.endsAt - now > 60000 && !meetingHold()) {
        api.notify('Eye break', 'Look at something about 20 feet (6 m) away for 20 seconds.');
      }
      S.nextEyeAt += settings.eyeEveryMin * 60000;
    }
    if (now >= S.endsAt) {
      finishFocus(false);
      return;
    }
  }

  if (S.state === 'breakPending') {
    if (S.pendingReason === 'snooze' && now >= S.breakDueAt) {
      if (meetingHold()) holdBreak('meeting');
      else {
        api.notify('Break time', 'Your snoozed break is starting.');
        launchBreak();
      }
    } else if (S.pendingReason === 'meeting' && !meetingHold() &&
               meetingClearSince && now - meetingClearSince >= MEETING_CLEAR_MS) {
      api.notify('Call over', 'Starting your break now.');
      launchBreak();
    }
  }

  if (S.state === 'idle' && settings.idleCheckins && !$('checkin').open && !anyDialogOpen() &&
      now - lastLogAt >= settings.idleCheckinMin * 60000 && lastIdle < IDLE_LIMIT_SEC && !meetingHold()) {
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

  if (typeof reviewTick === 'function') reviewTick(now);
  if (typeof calendarTick === 'function' && now % 60000 < 1000) calendarTick(now);
  else if (typeof calendarTick === 'function' && S.state === 'focus' && Cal.warnedSession !== S.start && Cal.events.length) calendarTick(now);
  renderTimer();
}

function anyDialogOpen() {
  return [...document.querySelectorAll('dialog')].some((d) => d.open);
}

/* ---------- Nudge banner ---------- */

function showNudge(text, tone, autoHide, action) {
  $('nudgeText').textContent = text;
  $('nudge').dataset.tone = tone;
  $('nudge').dataset.kind = '';
  $('nudge').hidden = false;
  nudgeActionFn = action ? action.fn : null;
  $('nudgeAction').hidden = !action;
  if (action) $('nudgeAction').textContent = action.label;
  clearTimeout(nudgeTimer);
  if (autoHide) nudgeTimer = setTimeout(hideNudge, 15000);
}
function hideNudge() {
  $('nudge').hidden = true;
  $('nudge').dataset.kind = '';
  nudgeActionFn = null;
}
