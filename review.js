/* ---------- Daily goal ---------- */

let lastGoalText = null;

function renderGoal() {
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  $('goal').hidden = !goalSec;
  if (!goalSec) return;
  const done = todayFocusSec();
  const pct = Math.min(100, (done / goalSec) * 100);
  const text = done >= goalSec
    ? `Goal reached: ${fmtMins(done)} focused today`
    : `${fmtMins(done)} of ${fmtMins(goalSec)} today`;
  if (text !== lastGoalText) {
    lastGoalText = text;
    $('goalText').textContent = text;
  }
  $('goalFill').style.width = `${pct.toFixed(1)}%`;
  $('goal').classList.toggle('met', done >= goalSec);
  if (typeof renderGlance === 'function' && !$('tab-plan').hidden) renderGlance();
}

// A short burst around the timer ring when the day's goal is reached.
function celebrate() {
  const box = $('ringBurst');
  if (!box) return;
  box.innerHTML = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const d = 115 + (i % 3) * 16;
    return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;animation-delay:${(i % 4) * 40}ms${i % 2 ? ';background:#9FD4C8' : ''}"></i>`;
  }).join('');
  box.classList.remove('go');
  void box.offsetWidth;
  box.classList.add('go');
  setTimeout(() => { box.classList.remove('go'); box.innerHTML = ''; }, 1600);
}

async function checkGoal() {
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  const today = dayKey(Date.now());
  if (!goalSec || data.meta.goalHitDay === today || todayFocusSec() < goalSec) return;
  data.meta.goalHitDay = today;
  await persist('meta');
  api.notify('Daily goal reached', `You've focused for ${fmtMins(todayFocusSec())} today.`);
  celebrate();
  showNudge(`You hit today's focus goal of ${fmtMins(goalSec)}. Anything more is a bonus.`, 'info', true);
}

/* ---------- Milestones: noted quietly in the review and in Insights ---------- */

const MILESTONES = [
  { id: 'streak7', kind: 'streak', n: 7, title: '7-day streak' },
  { id: 'streak30', kind: 'streak', n: 30, title: '30-day streak' },
  { id: 'streak100', kind: 'streak', n: 100, title: '100-day streak' },
  { id: 'hours10', kind: 'hours', n: 10, title: '10 hours focused' },
  { id: 'hours50', kind: 'hours', n: 50, title: '50 hours focused' },
  { id: 'hours100', kind: 'hours', n: 100, title: '100 hours focused' },
  { id: 'hours250', kind: 'hours', n: 250, title: '250 hours focused' },
  { id: 'hours500', kind: 'hours', n: 500, title: '500 hours focused' }
];

function milestoneProgress() {
  const hours = data.entries.filter((e) => e.type === 'session').reduce((a, e) => a + (e.focusSec || 0), 0) / 3600;
  const streak = typeof computeStreaks === 'function' ? computeStreaks().current : 0;
  return { hours, streak };
}

async function checkMilestones() {
  const firstRun = !data.meta.milestones;
  data.meta.milestones = data.meta.milestones || {};
  const { hours, streak } = milestoneProgress();
  let changed = firstRun;
  for (const m of MILESTONES) {
    if (data.meta.milestones[m.id]) continue;
    if ((m.kind === 'streak' ? streak : hours) >= m.n) {
      // Ones already passed before this version are recorded without showing up in today's review.
      data.meta.milestones[m.id] = firstRun ? 'earlier' : dayKey(Date.now());
      changed = true;
    }
  }
  if (changed) await persist('meta');
}

function milestonesOn(key) {
  const got = data.meta.milestones || {};
  return MILESTONES.filter((m) => got[m.id] === key);
}

function nextMilestones() {
  const got = data.meta.milestones || {};
  const { hours, streak } = milestoneProgress();
  return ['streak', 'hours'].map((kind) => {
    const m = MILESTONES.find((x) => x.kind === kind && !got[x.id]);
    if (!m) return null;
    const left = kind === 'streak' ? m.n - streak : Math.ceil(m.n - hours);
    return { ...m, left: Math.max(1, left) };
  }).filter(Boolean);
}

function milestoneBadges(list) {
  return `<div class="badges">${list.map((m) => `<span class="badge ${m.kind}"><svg viewBox="0 0 24 24" aria-hidden="true">${m.kind === 'streak'
    ? '<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/>'
    : '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M10 3h4"/>'}</svg>${esc(m.title)}</span>`).join('')}</div>`;
}

function goalMetOn(key) {
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  if (!goalSec) return false;
  const sec = data.entries
    .filter((e) => e.type === 'session' && dayKey(e.start) === key)
    .reduce((a, e) => a + (e.focusSec || 0), 0);
  return sec >= goalSec;
}

/* ---------- Reviews ---------- */

let reviewMode = 'day';
let reviewText = '';

function groupWork(entries) {
  const groups = new Map();
  entries
    .filter((e) => WORK_TYPES.includes(e.type) && e.note)
    .forEach((e) => {
      const key = e.note.trim().toLowerCase();
      const g = groups.get(key) || { note: e.note.trim(), sec: 0, count: 0, projectId: null };
      g.sec += workSec(e);
      g.count++;
      g.projectId = g.projectId || e.projectId || null;
      groups.set(key, g);
    });
  return [...groups.values()].sort((a, b) => b.sec - a.sec);
}

function projectTotals(entries) {
  const totals = new Map();
  entries.filter((e) => WORK_TYPES.includes(e.type)).forEach((e) => {
    const k = e.projectId && projectById(e.projectId) ? e.projectId : 'none';
    totals.set(k, (totals.get(k) || 0) + workSec(e));
  });
  return [...totals.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
    .map(([id, sec]) => ({ id, name: id === 'none' ? 'No project' : projectName(id), color: projectById(id)?.color, sec }));
}

function projectBlock(rows) {
  if (!(data.projects || []).length || !rows.length) return '';
  const max = rows[0].sec;
  return `<h3>Time by project</h3><div class="rv-projects">${rows.map((r) => `
    <div class="rv-proj">
      <span class="rv-proj-name"><i class="dot" style="background:${r.color || 'var(--muted)'}"></i>${esc(r.name)}</span>
      <span class="rv-day-track"><span style="width:${((r.sec / max) * 100).toFixed(1)}%;background:${r.color || 'var(--muted)'}"></span></span>
      <span class="rv-time">${fmtMins(Math.max(60, r.sec))}</span>
    </div>`).join('')}</div>`;
}

function weekKeys(refKey) {
  const d = new Date(refKey + 'T12:00');
  const monday = shiftKey(refKey, -((d.getDay() + 6) % 7));
  const today = dayKey(Date.now());
  return Array.from({ length: 7 }, (_, i) => shiftKey(monday, i)).filter((k) => k <= today);
}

const longDate = (k) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const shortDate = (k) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

function listHtml(items, cls = '') {
  return `<ul class="rv-list ${cls}">${items.join('')}</ul>`;
}

// The day as a strip: sessions as solid blocks (in project colors), other logged work lighter, breaks in amber.
function dayStrip(key, entries) {
  const timed = entries.filter((e) => e.start && e.end && e.end > e.start);
  if (!timed.length) return '';
  const minutes = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  const workStart = typeof minutesOf === 'function' ? minutesOf(settings.workStart) : 540;
  const workEnd = typeof minutesOf === 'function' ? minutesOf(settings.workEnd) : 1020;
  const from = Math.floor(Math.min(workStart, ...timed.map((e) => minutes(e.start))) / 60) * 60;
  const to = Math.ceil(Math.max(workEnd, ...timed.map((e) => minutes(e.end))) / 60) * 60;
  const span = Math.max(60, to - from);
  const pct = (m) => (((m - from) / span) * 100).toFixed(2);
  const blocks = timed.map((e) => {
    const a = minutes(e.start);
    const b = Math.max(a + 2, minutes(e.end));
    const color = projectById(e.projectId)?.color;
    const cls = e.type === 'session' ? 'sess' : e.type === 'break' ? 'brk' : 'other';
    const label = `${fmtTime(e.start)} – ${fmtTime(e.end)}${e.note ? `
${e.note}` : ''}`;
    return `<span class="rv-blk ${cls}" style="left:${pct(a)}%;width:${(((b - a) / span) * 100).toFixed(2)}%${color && cls !== 'brk' ? `;--bc:${color}` : ''}" title="${esc(label)}"></span>`;
  }).join('');
  const hours = [];
  for (let m = from; m <= to; m += span > 600 ? 180 : 120) hours.push(`<span style="left:${pct(m)}%">${shortHourLabel(m / 60)}</span>`);
  return `<div class="rv-strip" aria-hidden="true">${blocks}</div><div class="rv-strip-hours" aria-hidden="true">${hours.join('')}</div>`;
}

// The longest run of focus, joining sessions separated by short breaks (15 minutes or less).
function bestStretch(sessions) {
  const list = sessions.filter((e) => e.start && e.end).sort((a, b) => a.start - b.start);
  let best = null;
  let cur = null;
  for (const e of list) {
    if (cur && e.start - cur.end <= 15 * 60000) { cur.end = Math.max(cur.end, e.end); cur.sec += e.focusSec || 0; cur.n++; }
    else { cur = { start: e.start, end: e.end, sec: e.focusSec || 0, n: 1 }; }
    if (!best || cur.sec > best.sec) best = { ...cur };
  }
  return best && best.n > 1 ? best : null;
}

function buildDay(key) {
  const today = dayKey(Date.now());
  const entries = data.entries.filter((e) => dayKey(e.start) === key);
  const sessions = entries.filter((e) => e.type === 'session');
  const focusSec = sessions.reduce((a, e) => a + (e.focusSec || 0), 0);
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  const onTrack = sessions.filter((e) => e.rating === 'on-track').length;
  const drifts = sessions.reduce((a, e) => a + (e.distractions?.length || 0), 0);
  const breaks = entries.filter((e) => e.type === 'break');
  const work = groupWork(entries);
  const finished = data.tasks.filter((t) => t.done && t.doneAt && dayKey(t.doneAt) === key);
  const open = key === today ? openTodayTasks() : [];
  const parked = data.parking.filter((p) => !p.done).length;

  let headline = sessions.length
    ? `You focused for <strong>${fmtMins(focusSec)}</strong> across ${plural(sessions.length, 'session')}.`
    : 'No focus sessions logged on this day.';
  if (goalSec && sessions.length) {
    headline += focusSec >= goalSec
      ? ` That beats your ${fmtMins(goalSec)} goal.`
      : ` That's ${Math.round((focusSec / goalSec) * 100)}% of your ${fmtMins(goalSec)} goal.`;
  }
  const detail = [];
  if (sessions.length) detail.push(`${Math.round((onTrack / sessions.length) * 100)}% of sessions went to plan`);
  if (breaks.length) detail.push(`${breaks.filter((b) => !b.skipped).length} of ${plural(breaks.length, 'break')} taken`);
  if (drifts) detail.push(plural(drifts, 'drift'));

  let html = `<p class="rv-headline">${headline}</p>`;
  if (goalSec) html += `<div class="rv-bar"><span style="width:${Math.min(100, (focusSec / goalSec) * 100).toFixed(1)}%"></span></div>`;
  if (detail.length) html += `<p class="rv-detail">${esc(detail.join(', '))}.</p>`;
  const earned = milestonesOn(key);
  if (earned.length) html += `<p class="rv-milestone">Milestone reached</p>${milestoneBadges(earned)}`;

  const strip = dayStrip(key, entries.filter((e) => WORK_TYPES.includes(e.type) || e.type === 'break'));
  if (strip) {
    html += `<h3>Your day</h3>${strip}`;
    const best = bestStretch(sessions);
    if (best) html += `<p class="rv-detail">Your best stretch was ${fmtTime(best.start)} – ${fmtTime(best.end)}: ${fmtMins(best.sec)} of focus across ${best.n} sessions.</p>`;
  }

  if (work.length) {
    html += `<h3>What you worked on</h3>` + listHtml(work.map((g) =>
      `<li><span>${esc(g.note)} ${projectChip(g.projectId)}</span><span class="rv-time">${g.sec ? fmtMins(Math.max(60, g.sec)) : ''}</span></li>`));
  }
  html += projectBlock(projectTotals(entries));
  if (finished.length) {
    html += `<h3>Finished</h3>` + listHtml(finished.map((t) => `<li><span>${esc(t.text)}</span></li>`), 'done');
  }
  if (open.length) {
    html += `<h3>Still open</h3>` + listHtml(open.map((t) => `<li><span>${esc(t.text)}</span></li>`), 'open');
  }
  if (parked) {
    html += `<p class="rv-detail">${plural(parked, 'thought')} still in your parking lot. Worth a quick look before you stop.</p>`;
  }
  if (key === today) {
    const tomorrow = shiftKey(today, 1);
    const existing = data.meta.tomorrowNote && data.meta.tomorrowNote.forDay === tomorrow ? data.meta.tomorrowNote.text : '';
    html += `<label class="rv-note-label" for="reviewNote">Note for tomorrow</label>
      <textarea id="reviewNote" rows="2" maxlength="300" placeholder="Start with the intro draft. Ask Sam about numbers.">${esc(existing)}</textarea>`;
  }

  const lines = [longDate(key)];
  lines.push(sessions.length
    ? `Focused ${fmtMins(focusSec)} across ${plural(sessions.length, 'session')}${goalSec ? ` (goal ${fmtMins(goalSec)})` : ''}`
    : 'No focus sessions');
  if (work.length) lines.push('', 'Worked on:', ...work.map((g) => `- ${g.note}${g.projectId ? ` [${projectName(g.projectId)}]` : ''}${g.sec ? ` (${fmtMins(Math.max(60, g.sec))})` : ''}`));
  if (finished.length) lines.push('', 'Finished:', ...finished.map((t) => `- ${t.text}`));
  if (open.length) lines.push('', 'Still open:', ...open.map((t) => `- ${t.text}`));

  return { title: key === today ? 'Your day' : longDate(key), html, text: lines.join('\n'), openCount: open.length };
}

function buildWeek(refKey) {
  const keys = weekKeys(refKey);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const entries = data.entries.filter((e) => { const k = dayKey(e.start); return k >= first && k <= last; });
  const sessions = entries.filter((e) => e.type === 'session');
  const totalSec = sessions.reduce((a, e) => a + (e.focusSec || 0), 0);
  const goalSec = (settings.dailyGoalMin || 0) * 60;
  const perDay = keys.map((k) => ({
    k,
    sec: sessions.filter((e) => dayKey(e.start) === k).reduce((a, e) => a + (e.focusSec || 0), 0)
  }));
  const worked = perDay.filter((d) => d.sec > 0);
  const goalDays = goalSec ? perDay.filter((d) => d.sec >= goalSec).length : 0;
  const onTrack = sessions.filter((e) => e.rating === 'on-track').length;
  const work = groupWork(entries).slice(0, 8);
  const completed = data.tasks
    .filter((t) => t.done && t.doneAt && dayKey(t.doneAt) >= first && dayKey(t.doneAt) <= last)
    .sort((a, b) => a.doneAt - b.doneAt);
  const carrying = [...openTodayTasks(), ...leftoverTasks()];
  const best = worked.length ? worked.reduce((a, b) => (b.sec > a.sec ? b : a)) : null;

  let headline = sessions.length
    ? `This week you focused for <strong>${fmtMins(totalSec)}</strong> across ${plural(worked.length, 'day')}.`
    : 'No focus sessions logged this week yet.';
  if (goalSec && worked.length) headline += ` You met your daily goal on ${goalDays} of them.`;

  const max = Math.max(goalSec, ...perDay.map((d) => d.sec), 1);
  let html = `<p class="rv-headline">${headline}</p>`;
  html += `<div class="rv-week">${perDay.map((d) => `
    <div class="rv-day${goalSec && d.sec >= goalSec ? ' met' : ''}">
      <span class="rv-day-name">${new Date(d.k + 'T12:00').toLocaleDateString([], { weekday: 'short' })}</span>
      <span class="rv-day-track"><span style="width:${((d.sec / max) * 100).toFixed(1)}%"></span>${goalSec ? `<i style="left:${((goalSec / max) * 100).toFixed(1)}%"></i>` : ''}</span>
      <span class="rv-time">${d.sec ? fmtMins(d.sec) : '–'}</span>
    </div>`).join('')}</div>`;
  const detail = [];
  if (sessions.length) detail.push(`${Math.round((onTrack / sessions.length) * 100)}% of sessions went to plan`);
  if (best) detail.push(`best day was ${shortDate(best.k)}`);
  if (detail.length) html += `<p class="rv-detail">${esc(detail.join(', '))}.</p>`;

  const projRows = projectTotals(entries);
  html += projectBlock(projRows);
  const goalRows = projectGoalRows(refKey);
  if (goalRows.length) {
    html += `<h3>Project goals</h3>` + listHtml(goalRows.map((r) =>
      `<li><span>${projectChip(r.p.id)}${r.sec >= r.goalSec ? 'Goal met' : `${fmtMins(r.goalSec - r.sec)} short`}</span><span class="rv-time">${fmtMins(r.sec)} of ${fmtMins(r.goalSec)}</span></li>`));
  }
  if (work.length) {
    html += `<h3>Main work</h3>` + listHtml(work.map((g) =>
      `<li><span>${esc(g.note)} ${projectChip(g.projectId)}</span><span class="rv-time">${g.sec ? fmtMins(Math.max(60, g.sec)) : ''}</span></li>`));
  }
  if (completed.length) {
    html += `<h3>Completed</h3>` + listHtml(completed.map((t) => `<li><span>${esc(t.text)}</span></li>`), 'done');
  }
  if (carrying.length) {
    html += `<h3>Carrying over</h3>` + listHtml(carrying.map((t) => `<li><span>${esc(t.text)}</span></li>`), 'open');
  }

  const lines = [`Week of ${shortDate(first)}`];
  lines.push(sessions.length
    ? `Focused ${fmtMins(totalSec)} across ${plural(worked.length, 'day')}${goalSec ? `, daily goal met on ${plural(goalDays, 'day')}` : ''}`
    : 'No focus sessions');
  if (goalRows.length) lines.push('', 'Project goals:', ...goalRows.map((r) => `- ${r.p.name}: ${fmtMins(r.sec)} of ${fmtMins(r.goalSec)}${r.sec >= r.goalSec ? ' (met)' : ''}`));
  if ((data.projects || []).length && projRows.length) lines.push('', 'By project:', ...projRows.map((r) => `- ${r.name}: ${fmtMins(Math.max(60, r.sec))}`));
  if (work.length) lines.push('', 'Main work:', ...work.map((g) => `- ${g.note}${g.sec ? ` (${fmtMins(Math.max(60, g.sec))})` : ''}`));
  if (completed.length) lines.push('', 'Completed:', ...completed.map((t) => `- ${t.text}`));
  if (carrying.length) lines.push('', 'Next up:', ...carrying.map((t) => `- ${t.text}`));

  return { title: 'Your week', html, text: lines.join('\n'), openCount: 0 };
}

async function saveReviewNote() {
  const el = $('reviewNote');
  if (!el) return;
  const text = el.value.trim();
  const forDay = shiftKey(dayKey(Date.now()), 1);
  const current = data.meta.tomorrowNote;
  if (!text && !(current && current.forDay === forDay)) return;
  data.meta.tomorrowNote = text ? { forDay, text } : null;
  await persist('meta');
}

async function renderReview() {
  const today = dayKey(Date.now());
  const r = reviewMode === 'week' ? buildWeek(today) : buildDay(today);
  reviewText = r.text;
  $('reviewTitle').textContent = r.title;
  $('reviewBody').innerHTML = r.html;
  $('reviewMove').hidden = !r.openCount;
  $('reviewCopied').textContent = '';
  document.querySelectorAll('[data-review]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.review === reviewMode)));
}

function openReview(mode = 'day') {
  reviewMode = mode;
  renderReview();
  const dlg = $('review');
  if (!dlg.open) dlg.showModal();
}

async function closeReview() {
  await saveReviewNote();
  if ($('review').open) $('review').close();
}

function reviewTick(now) {
  if (!settings.reviewEnabled) return;
  const today = dayKey(now);
  if (data.meta.lastReviewDay === today) return;
  const [h, m] = String(settings.reviewTime || '17:30').split(':').map(Number);
  const due = new Date(now);
  due.setHours(h || 0, m || 0, 0, 0);
  if (now < due.getTime()) return;
  if (S.state !== 'idle' || anyDialogOpen() || meetingHold()) return;
  if (!data.entries.some((e) => dayKey(e.start) === today)) return;

  data.meta.lastReviewDay = today;
  persist('meta');
  const weekly = settings.weeklyReview && new Date(now).getDay() === Number(settings.weeklyReviewDay);
  api.notify(weekly ? 'Your week in review' : 'Your day in review', 'Take a minute to wrap up before you stop.');
  api.focusWindow();
  openReview(weekly ? 'week' : 'day');
}

function bindReview() {
  document.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', async () => {
    await saveReviewNote();
    reviewMode = b.dataset.review;
    renderReview();
  }));
  $('reviewCopy').addEventListener('click', async () => {
    await api.copyText(reviewText);
    $('reviewCopied').textContent = 'Copied. Paste it into an email or chat.';
  });
  $('reviewMove').addEventListener('click', async () => {
    await saveReviewNote();
    const tomorrow = shiftKey(dayKey(Date.now()), 1);
    openTodayTasks().forEach((t) => { t.day = tomorrow; t.order = nextOrder(tomorrow); });
    await persist('tasks');
    renderPlan();
    await renderReview();
    $('reviewCopied').textContent = 'Moved to tomorrow\'s plan.';
  });
  $('reviewClose').addEventListener('click', closeReview);
  $('review').addEventListener('cancel', (e) => { e.preventDefault(); closeReview(); });
  $('reviewBtn').addEventListener('click', () => openReview('day'));
}
