/* ---------- Calendar on the day page ---------- */

const Cal = {
  rangeStart: 0,
  rangeEnd: 0,
  events: [],
  error: null,
  loading: false,
  loadedAt: 0,
  notified: new Set(),
  warnedSession: 0
};

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
  if (settings.calendarSource === 'off') {
    Cal.events = [];
    Cal.error = null;
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
  if (settings.calendarSource === 'off') return;
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
  const busy = eventsOn(day)
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

function renderSchedule(day, sessionsNeeded) {
  const box = $('scheduleSection');
  const off = settings.calendarSource === 'off';
  const isPast = day < dayKey(Date.now());
  box.hidden = off && isPast;
  if (box.hidden) return;

  const p = currentPreset();
  const startMin = minutesOf(settings.workStart);
  const endMin = minutesOf(settings.workEnd);
  const dayStart = atDay(day, startMin);
  const dayEnd = atDay(day, endMin);
  const span = Math.max(1, dayEnd - dayStart);
  const events = off ? [] : eventsOn(day);
  const timed = events.filter((ev) => !ev.allDay);
  const allDay = events.filter((ev) => ev.allDay);
  const blocks = freeBlocks(day);
  const freeMs = blocks.reduce((a, [s, e]) => a + (e - s), 0);
  const fit = sessionsThatFit(blocks);
  const isToday = day === dayKey(Date.now());

  // Timeline across working hours
  const pct = (t) => Math.max(0, Math.min(100, ((t - dayStart) / span) * 100));
  const segs = [];
  timed.forEach((ev) => {
    const a = pct(ev.start);
    const b = pct(ev.end);
    if (b <= 0 || a >= 100 || b - a <= 0) return;
    segs.push(`<span class="tl-meet${ev.busy ? '' : ' free'}" style="left:${a}%;width:${Math.max(0.6, b - a)}%" data-tip="${esc(`${fmtTime(ev.start)} – ${fmtTime(ev.end)}\n${ev.title}${ev.busy ? '' : '\nShown as free'}`)}"></span>`);
  });
  blocks.forEach(([a, b]) => {
    segs.push(`<span class="tl-free" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%" data-tip="${esc(`Free ${fmtTime(a)} – ${fmtTime(b)}\n${fmtMins((b - a) / 1000)}`)}"></span>`);
  });
  if (isToday && Date.now() > dayStart && Date.now() < dayEnd) segs.push(`<span class="tl-now" style="left:${pct(Date.now())}%"></span>`);
  const hours = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 120) {
    hours.push(`<span class="tl-hour" style="left:${pct(atDay(day, m))}%">${shortHourLabel(m / 60)}</span>`);
  }

  let summary;
  if (off) {
    summary = 'Connect your calendar in Settings to see meetings here and how much focus time you really have.';
  } else if (Cal.error) {
    summary = Cal.error;
  } else if (!freeMs) {
    summary = isToday && Date.now() > dayEnd ? 'Your working hours are over for today.' : 'No free time left in your working hours.';
  } else {
    summary = `${fmtMins(freeMs / 1000)} free${isToday ? ' for the rest of the day' : ''}, room for about ${plural(fit, 'session')} of ${p.focusMin} minutes.`;
    if (sessionsNeeded && sessionsNeeded > fit) summary += ` Your plan needs about ${sessionsNeeded}, so something may have to move to another day.`;
    else if (sessionsNeeded) summary += ` Your plan needs about ${sessionsNeeded}, so it fits.`;
  }

  box.innerHTML = `
    <div class="sched-head">
      <h3>Schedule</h3>
      <span class="muted-note">${esc(settings.workStart)} to ${esc(settings.workEnd)}</span>
      ${off ? '' : `<button class="link" type="button" id="calRefresh">${Cal.loading ? 'Updating…' : 'Refresh'}</button>`}
    </div>
    <p class="insight-note${Cal.error ? ' warn-text' : ''}">${esc(summary)}</p>
    ${off ? '' : `<div class="timeline" aria-hidden="true">${segs.join('')}<div class="tl-hours">${hours.join('')}</div></div>`}
    ${allDay.length ? `<p class="allday">${allDay.map((ev) => `<span class="pchip" style="--pc:var(--muted)">${esc(ev.title)}</span>`).join('')}</p>` : ''}
    ${timed.length ? `<ul class="meet-list">${timed.map((ev) => `<li class="${ev.end < Date.now() ? 'past' : ''}">
        <span class="when">${fmtTime(ev.start)} – ${fmtTime(ev.end)}</span>
        <span>${esc(ev.title)}${ev.busy ? '' : ' <span class="muted-note">(free)</span>'}</span>
      </li>`).join('')}</ul>` : (off || Cal.error ? '' : '<p class="insight-note">No meetings.</p>')}
  `;
  const btn = $('calRefresh');
  if (btn) btn.onclick = () => loadCalendar(true, day);
}

function shortHourLabel(h) {
  if (h === 0 || h === 24) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/* ---------- Meeting reminders while you work ---------- */

function calendarTick(now) {
  if (settings.calendarSource === 'off') return;
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

/* ---------- Settings: test the connection ---------- */

async function testCalendar() {
  $('calTestResult').textContent = 'Checking…';
  const f = $('settingsForm');
  const prev = { source: settings.calendarSource, url: settings.calendarUrl };
  // Test what's in the form, even before saving.
  settings.calendarSource = f.elements.calendarSource.value;
  settings.calendarUrl = f.elements.calendarUrl.value.trim();
  await persist('settings');
  const start = atDay(dayKey(Date.now()), 0);
  const res = await api.fetchCalendar(start, start + 7 * 86400000, true);
  if (res.ok && !res.off) {
    const n = res.events.length;
    $('calTestResult').textContent = `Connected. Found ${plural(n, 'event')} in the next 7 days.`;
    loadCalendar(true);
  } else if (res.off) {
    $('calTestResult').textContent = 'Choose where your calendar comes from first.';
  } else {
    $('calTestResult').textContent = res.error;
    settings.calendarSource = prev.source;
    settings.calendarUrl = prev.url;
    await persist('settings');
  }
}

function updateCalendarFields() {
  const f = $('settingsForm');
  const src = f.elements.calendarSource.value;
  $('calUrlRow').hidden = src !== 'link';
  $('calOutlookNote').hidden = src !== 'outlook';
  $('calLinkNote').hidden = src !== 'link';
  $('calTestRow').hidden = src === 'off';
}
