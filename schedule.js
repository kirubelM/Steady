/* ---------- Calendar on the day page ---------- */

const Cal = {
  rangeStart: 0,
  rangeEnd: 0,
  events: [],
  error: null,
  warning: null,
  loading: false,
  loadedAt: 0,
  notified: new Set(),
  warnedSession: 0
};

const calendarOn = () => (settings.calendars || []).length > 0;

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
function atDay(day, minutes) {
  const d = new Date(day + 'T00:00');
  d.setMinutes(minutes);
  return d.getTime();
}

async function loadCalendar(force = false, aroundDay = dayKey(Date.now())) {
  if (!calendarOn()) {
    Cal.events = [];
    Cal.error = null;
    Cal.warning = null;
    Cal.loadedAt = Date.now();
    return;
  }
  if (Cal.loading) return;
  Cal.loading = true;
  const today = dayKey(Date.now());
  const from = aroundDay < today ? aroundDay : today;
  const start = new Date(shiftKey(from, -1) + 'T00:00').getTime();
  const end = new Date(shiftKey(aroundDay > today ? aroundDay : today, 15) + 'T00:00').getTime();
  try {
    const res = await api.fetchCalendar(start, end, force);
    if (res.ok) {
      Cal.events = res.events || [];
      Cal.error = null;
      const failed = res.failed || [];
      Cal.warning = failed.length
        ? `Couldn't load ${failed.map((f) => f.name).join(' and ')}: ${failed[0].error}`
        : null;
      Cal.rangeStart = start;
      Cal.rangeEnd = end;
    } else {
      Cal.error = res.error;
    }
  } catch (e) {
    Cal.error = 'Couldn\'t load your calendar.';
    api.log('warn', 'Calendar load failed', String(e));
  }
  Cal.loading = false;
  Cal.loadedAt = Date.now();
  if (!$('tab-plan').hidden) renderPlan();
}

function ensureCalendarFor(day) {
  if (!calendarOn()) return;
  const t = new Date(day + 'T12:00').getTime();
  if (t < Cal.rangeStart || t > Cal.rangeEnd) loadCalendar(false, day);
}

function eventsOn(day) {
  const s = atDay(day, 0);
  const e = s + 86400000;
  return Cal.events.filter((ev) => ev.end > s && ev.start < e);
}

// Free stretches within working hours, after meetings marked busy are taken out.
function freeBlocks(day) {
  let from = atDay(day, minutesOf(settings.workStart));
  const to = atDay(day, minutesOf(settings.workEnd));
  if (day === dayKey(Date.now())) from = Math.max(from, Date.now());
  if (to <= from) return [];
  const blocked = typeof taskBlocksOn === 'function' ? taskBlocksOn(day).map((b) => ({ start: b.start, end: b.end, busy: true })) : [];
  const busy = [...eventsOn(day), ...blocked]
    .filter((ev) => ev.busy && !ev.allDay)
    .map((ev) => [Math.max(ev.start, from), Math.min(ev.end, to)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const blocks = [];
  let cursor = from;
  for (const [a, b] of busy) {
    if (a > cursor) blocks.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (to > cursor) blocks.push([cursor, to]);
  return blocks.filter(([a, b]) => b - a >= 15 * 60000);
}

function sessionsThatFit(blocks) {
  const p = currentPreset();
  const cycle = (p.focusMin + p.breakMin) * 60000;
  return blocks.reduce((n, [a, b]) => n + Math.floor((b - a + p.breakMin * 60000) / cycle), 0);
}

let lastSessionsNeeded = 0; // from the Plan page, so the Day view can say whether the plan fits

// One line about the day's free time, plus any calendar warning. Shared by the Plan page and the Day view.
function scheduleSummary(day, sessionsNeeded = lastSessionsNeeded) {
  const off = !calendarOn();
  const p = currentPreset();
  const isToday = day === dayKey(Date.now());
  const dayEnd = atDay(day, minutesOf(settings.workEnd));
  const timed = off ? [] : eventsOn(day).filter((ev) => !ev.allDay);
  const blocks = freeBlocks(day);
  const freeMs = blocks.reduce((a, [s, e]) => a + (e - s), 0);
  const fit = sessionsThatFit(blocks);
  const taskBlocks = typeof taskBlocksOn === 'function' ? taskBlocksOn(day) : [];
  const blockedMs = taskBlocks.reduce((a, b) => a + (b.end - b.start), 0);
  let text;
  if (off && !freeMs) {
    text = 'Connect your calendar in Settings to see meetings here too.';
  } else if (off) {
    text = `${fmtMins(freeMs / 1000)} free${isToday ? ' for the rest of the day' : ''}${blockedMs ? ` after ${fmtMins(blockedMs / 1000)} scheduled for tasks` : ''}. Connect your calendar in Settings to see meetings here too.`;
  } else if (Cal.error) {
    text = Cal.error;
  } else if (!freeMs) {
    text = isToday && Date.now() > dayEnd ? 'Your working hours are over for today.' : 'No free time left in your working hours.';
  } else {
    text = `${!timed.length ? 'No meetings. ' : ''}${blockedMs ? `${fmtMins(blockedMs / 1000)} scheduled for tasks. ` : ''}${fmtMins(freeMs / 1000)} free${isToday ? ' for the rest of the day' : ''}, room for about ${plural(fit, 'session')} of ${p.focusMin} minutes.`;
    if (sessionsNeeded && sessionsNeeded > fit) text += ` Your plan needs about ${sessionsNeeded}, so something may have to move to another day.`;
    else if (sessionsNeeded) text += ` Your plan needs about ${sessionsNeeded}, so it fits.`;
  }
  return { text, warning: !off && !Cal.error ? Cal.warning : null };
}

// What's on now or next today: a scheduled task or a busy meeting.
function upNext(day, now = Date.now()) {
  const tasks = (typeof taskBlocksOn === 'function' ? taskBlocksOn(day) : [])
    .map((b) => ({ title: b.task.text, start: b.start, end: b.end, taskId: b.task.id }));
  const meets = (calendarOn() ? eventsOn(day) : []).filter((ev) => ev.busy && !ev.allDay)
    .map((ev) => ({ title: ev.title, start: ev.start, end: ev.end, taskId: null }));
  return [...tasks, ...meets].filter((x) => x.end > now).sort((a, b) => a.start - b.start)[0] || null;
}

// The Plan page keeps a short summary; the full calendar lives on the Day tab.
function renderSchedule(day, sessionsNeeded) {
  const box = $('scheduleSection');
  const isPast = day < dayKey(Date.now());
  lastSessionsNeeded = sessionsNeeded || 0;
  box.hidden = !calendarOn() && isPast && !taskBlocksOn(day).length;
  if (box.hidden) return;
  const isToday = day === dayKey(Date.now());
  const info = scheduleSummary(day, sessionsNeeded);
  const next = isToday ? upNext(day) : null;
  const canFocus = S.state === 'idle' || S.state === 'breakPending';
  box.innerHTML = `
    <div class="sched-head">
      <h3>Schedule</h3>
      <span class="muted-note">${esc(settings.workStart)} to ${esc(settings.workEnd)}</span>
      <button class="link" type="button" data-open-day>Open Day view</button>
    </div>
    <p class="insight-note${Cal.error ? ' warn-text' : ''}">${esc(info.text)}</p>
    ${info.warning ? `<p class="insight-note warn-text">${esc(info.warning)}</p>` : ''}
    ${next ? `<p class="sched-next"><span>${next.start <= Date.now() ? 'Now' : 'Next'}:</span> <strong>${esc(next.title)}</strong>
      <span class="muted-note">${fmtTime(next.start)} – ${fmtTime(next.end)}</span>
      ${next.taskId && canFocus ? `<button class="link" type="button" data-block-start="${next.taskId}">Focus</button>` : ''}</p>` : ''}
  `;
}

function shortHourLabel(h) {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/* ---------- Meeting reminders while you work ---------- */

function calendarTick(now) {
  if (!calendarOn()) return;
  if (now - Cal.loadedAt > 10 * 60000 && !Cal.loading) loadCalendar(false);
  const today = dayKey(now);
  for (const ev of eventsOn(today)) {
    if (!ev.busy || ev.allDay) continue;
    const key = `${ev.title}|${ev.start}`;
    const until = ev.start - now;
    if (until > 0 && until <= 5 * 60000 && !Cal.notified.has(key)) {
      Cal.notified.add(key);
      api.notify(`Meeting in ${Math.max(1, Math.round(until / 60000))} min`, `${ev.title} at ${fmtTime(ev.start)}`);
      if (S.state === 'focus') showNudge(`"${ev.title}" starts at ${fmtTime(ev.start)}. Wrap up or end the session early.`, 'warn', true);
    }
  }
  // Heads-up when a session will run into a meeting.
  if (S.state === 'focus' && Cal.warnedSession !== S.start) {
    const clash = eventsOn(today).find((ev) => ev.busy && !ev.allDay && ev.start > now && ev.start < S.endsAt);
    if (clash) {
      Cal.warnedSession = S.start;
      showNudge(`Heads up: "${clash.title}" starts at ${fmtTime(clash.start)}, before this session ends.`, 'info', false);
    }
  }
}

/* ---------- Settings: connected calendars ---------- */

const CAL_KIND_LABEL = { outlook: 'Classic Outlook', link: 'Calendar link' };

function renderCalendarSettings() {
  const list = settings.calendars || [];
  $('calendarList').innerHTML = list.length
    ? list.map((c) => `<li>
        <input type="text" value="${esc(c.name)}" data-cal-name="${c.id}" maxlength="30" aria-label="Calendar name">
        <span class="cal-kind">${CAL_KIND_LABEL[c.kind]}</span>
        <button class="link" type="button" data-cal-test="${c.id}">Test</button>
        <button class="del" type="button" data-cal-del="${c.id}" aria-label="Remove ${esc(c.name)}">×</button>
      </li>`).join('')
    : '<li class="empty">No calendars connected yet.</li>';
  updateCalendarFields();
}

function updateCalendarFields() {
  const kind = $('calAddKind').value;
  $('calUrlRow').hidden = kind !== 'link';
  $('calOutlookNote').hidden = kind !== 'outlook';
  $('calLinkNote').hidden = kind !== 'link';
  $('calAddName').placeholder = kind === 'outlook' ? 'Name, e.g. Outlook' : 'Name, e.g. Work or Personal';
}

async function testCalendarSource(cal) {
  const start = atDay(dayKey(Date.now()), 0);
  const res = await api.testCalendar(cal, start, start + 7 * 86400000);
  return res.ok
    ? { ok: true, msg: `Connected to ${cal.name}. Found ${plural(res.events.length, 'event')} in the next 7 days.` }
    : { ok: false, msg: res.error };
}

async function calendarsChanged() {
  await persist('settings');
  renderCalendarSettings();
  loadCalendar(true, planDay);
}

async function addCalendar() {
  const out = $('calTestResult');
  const kind = $('calAddKind').value;
  const list = settings.calendars;
  let url = '';
  if (kind === 'outlook') {
    if (list.some((c) => c.kind === 'outlook')) { out.textContent = 'Classic Outlook is already connected.'; return; }
  } else {
    url = $('calAddUrl').value.trim();
    if (!/^(https|webcal):\/\//i.test(url)) { out.textContent = 'Paste a calendar link that starts with https:// or webcal://.'; return; }
    if (list.some((c) => c.url === url)) { out.textContent = 'That calendar is already connected.'; return; }
  }
  const name = ($('calAddName').value.trim() || (kind === 'outlook' ? 'Outlook' : `Calendar ${list.length + 1}`)).slice(0, 30);
  const cal = kind === 'outlook' ? { id: uid(), kind, name } : { id: uid(), kind, name, url };
  out.textContent = 'Checking…';
  $('calAddBtn').disabled = true;
  const res = await testCalendarSource(cal);
  $('calAddBtn').disabled = false;
  out.textContent = res.msg;
  if (!res.ok) return;
  list.push(cal);
  $('calAddName').value = '';
  $('calAddUrl').value = '';
  await calendarsChanged();
}

function bindCalendars() {
  $('calAddKind').addEventListener('change', updateCalendarFields);
  $('calAddBtn').addEventListener('click', addCalendar);
  // These fields sit inside the settings form; Enter should add the calendar, not save settings.
  ['calAddName', 'calAddUrl'].forEach((id) => $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCalendar(); }
  }));
  $('calendarList').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const out = $('calTestResult');
    if (b.dataset.calTest) {
      const cal = settings.calendars.find((c) => c.id === b.dataset.calTest);
      out.textContent = 'Checking…';
      out.textContent = (await testCalendarSource(cal)).msg;
    } else if (b.dataset.calDel) {
      const cal = settings.calendars.find((c) => c.id === b.dataset.calDel);
      if (!confirm(`Remove "${cal.name}"? Its meetings will no longer show in Steady.`)) return;
      settings.calendars = settings.calendars.filter((c) => c.id !== cal.id);
      out.textContent = '';
      await calendarsChanged();
    }
  });
  // Enter in a name box would otherwise submit the settings form.
  $('calendarList').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset?.calName) { e.preventDefault(); e.target.blur(); }
  });
  $('calendarList').addEventListener('change', async (e) => {
    const cal = settings.calendars.find((c) => c.id === e.target.dataset?.calName);
    if (!cal || !e.target.value.trim()) return;
    cal.name = e.target.value.trim().slice(0, 30);
    await calendarsChanged();
  });
}
