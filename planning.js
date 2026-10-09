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

// Reminds you when a block starts. Runs from the timer tick.
const blockNotified = new Set();
function blockTick(now) {
  const today = dayKey(now);
  for (const b of taskBlocksOn(today)) {
    const key = `${b.task.id}|${b.start}`;
    if (blockNotified.has(key) || now < b.start || now > b.start + 60000) continue;
    blockNotified.add(key);
    api.notify(`Time for "${b.task.text}"`, `Blocked until ${fmtTime(b.end)}.`);
    if (S.state === 'idle' || S.state === 'breakPending') {
      showNudge(`It's ${fmtTime(b.start)}: time for "${b.task.text}".`, 'info', false, { label: 'Start focus', fn: () => startTask(b.task.id) });
    } else if (S.taskId !== b.task.id) {
      showNudge(`"${b.task.text}" was blocked to start now. Finish this session first.`, 'info', true);
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

  // Dropping a task (or an existing block) onto the timeline blocks time for it.
  const box = $('scheduleSection');
  const minuteAt = (e) => {
    const tl = box.querySelector('.timeline');
    const r = tl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const a = minutesOf(settings.workStart);
    const b = minutesOf(settings.workEnd);
    return Math.round((a + frac * (b - a)) / 15) * 15;
  };
  const isTaskDrag = (e) => [...(e.dataTransfer?.types || [])].includes('application/x-steady-task');
  box.addEventListener('dragstart', (e) => {
    const seg = e.target.closest?.('[data-block-task]');
    if (!seg) return;
    e.dataTransfer.setData('application/x-steady-task', seg.dataset.blockTask);
    e.dataTransfer.effectAllowed = 'move';
  });
  box.addEventListener('dragover', (e) => {
    if (!isTaskDrag(e) || !e.target.closest?.('.timeline')) return;
    e.preventDefault();
    const tl = box.querySelector('.timeline');
    const m = minuteAt(e);
    const a = minutesOf(settings.workStart);
    const b = minutesOf(settings.workEnd);
    let ghost = tl.querySelector('.tl-ghost');
    if (!ghost) { ghost = document.createElement('span'); ghost.className = 'tl-ghost'; tl.appendChild(ghost); }
    ghost.style.left = `${((m - a) / (b - a)) * 100}%`;
    ghost.dataset.time = fmtTime(atDay(planDay, m));
  });
  box.addEventListener('dragleave', (e) => {
    if (e.target.closest?.('.timeline') && !e.relatedTarget?.closest?.('.timeline')) box.querySelector('.tl-ghost')?.remove();
  });
  box.addEventListener('drop', (e) => {
    if (!isTaskDrag(e) || !e.target.closest?.('.timeline')) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-steady-task');
    const t = findTask(id);
    if (t) setBlock(id, planDay, minuteAt(e), t.block ? t.block.mins : defaultBlockMins(t));
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.unblock) unblockTask(b.dataset.unblock);
    else if (b.dataset.blockStart) startTask(b.dataset.blockStart);
  });

  $('welcomeNext1').addEventListener('click', () => showWelcomeStep(2));
  $('welcomeNext2').addEventListener('click', () => showWelcomeStep(3));
  $('welcomeBack2').addEventListener('click', () => showWelcomeStep(1));
  $('welcomeBack3').addEventListener('click', () => showWelcomeStep(2));
  $('welcomeStart').addEventListener('click', () => finishWelcome(true));
  $('welcomeExplore').addEventListener('click', () => finishWelcome(false));
  $('welcome').addEventListener('cancel', (e) => { e.preventDefault(); if ($('welcome').open) finishWelcome(false); });
}
