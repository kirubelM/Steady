/* ---------- Weekly project goals ---------- */

function weekRange(refKey = dayKey(Date.now())) {
  const d = new Date(refKey + 'T12:00');
  const monday = shiftKey(refKey, -((d.getDay() + 6) % 7));
  return { first: monday, last: shiftKey(monday, 6) };
}

function projectSecInRange(projectId, first, last) {
  return data.entries
    .filter((e) => WORK_TYPES.includes(e.type) && e.projectId === projectId)
    .filter((e) => { const k = dayKey(e.start); return k >= first && k <= last; })
    .reduce((a, e) => a + workSec(e), 0)
    // include the session in progress
    + ((S.state === 'focus' || S.state === 'paused') && S.projectId === projectId
      ? Math.max(0, (S.total - (S.state === 'focus' ? S.endsAt - Date.now() : S.remaining)) / 1000) : 0);
}

function projectGoalRows(refKey) {
  const { first, last } = weekRange(refKey);
  return activeProjects()
    .filter((p) => p.weeklyGoalMin > 0)
    .map((p) => {
      const sec = projectSecInRange(p.id, first, last);
      return { p, sec, goalSec: p.weeklyGoalMin * 60, pct: Math.min(100, (sec / (p.weeklyGoalMin * 60)) * 100) };
    });
}

function renderProjectGoals() {
  const rows = projectGoalRows();
  const box = $('goalsSection');
  box.hidden = !rows.length || planDay < weekRange().first || planDay > weekRange().last;
  if (box.hidden) return;
  const today = new Date();
  const daysLeft = 7 - ((today.getDay() + 6) % 7) - 1; // after today, through Sunday
  box.innerHTML = `
    <div class="sched-head"><h3>This week's project goals</h3>
      <span class="muted-note">${daysLeft ? `${plural(daysLeft, 'day')} left this week` : 'Last day of the week'}</span></div>
    <div class="goal-rows">${rows.map((r) => {
      const left = Math.max(0, r.goalSec - r.sec);
      const status = r.sec >= r.goalSec ? 'Goal met' : `${fmtMins(left)} to go`;
      return `<div class="goal-row${r.sec >= r.goalSec ? ' met' : ''}" data-tip="${esc(`${r.p.name}\n${fmtMins(r.sec)} of ${fmtMins(r.goalSec)} this week`)}">
        <span class="rv-proj-name"><i class="dot" style="background:${r.p.color}"></i>${esc(r.p.name)}</span>
        <span class="rv-day-track"><span style="width:${r.pct.toFixed(1)}%;background:${r.p.color}"></span></span>
        <span class="goal-status">${fmtMins(r.sec)} of ${fmtMins(r.goalSec)}<small>${esc(status)}</small></span>
      </div>`;
    }).join('')}</div>`;
}

async function checkProjectGoals() {
  const { first } = weekRange();
  data.meta.projectGoalHit = data.meta.projectGoalHit || {};
  for (const r of projectGoalRows()) {
    if (r.sec >= r.goalSec && data.meta.projectGoalHit[r.p.id] !== first) {
      data.meta.projectGoalHit[r.p.id] = first;
      await persist('meta');
      api.notify('Project goal reached', `${r.p.name}: ${fmtMins(r.sec)} this week.`);
    }
  }
}

/* ---------- Estimate accuracy ---------- */

// Finished tasks that had an estimate and at least one focus session.
function estimateHistory() {
  return data.tasks
    .filter((t) => t.done && t.est > 0)
    .map((t) => ({ t, actual: taskStats(t.id).count }))
    .filter((x) => x.actual > 0)
    .sort((a, b) => (b.t.doneAt || 0) - (a.t.doneAt || 0));
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Typical actual/estimate ratio, overall and for a project when there's enough history.
function estimateRatio(projectId) {
  const hist = estimateHistory().slice(0, 40);
  const forProject = projectId ? hist.filter((x) => x.t.projectId === projectId) : [];
  const pick = forProject.length >= 3 ? forProject : hist;
  if (pick.length < 3) return null;
  return { ratio: median(pick.map((x) => x.actual / x.t.est)), count: pick.length, project: forProject.length >= 3 };
}

// How many sessions the open tasks will really take, based on past estimates.
function realisticSessions(openTasks) {
  let any = false;
  let total = 0;
  for (const t of openTasks) {
    if (!t.est) continue;
    const r = estimateRatio(t.projectId);
    const done = taskStats(t.id).count;
    const expected = r ? Math.ceil(t.est * Math.max(1, r.ratio)) : t.est;
    if (r) any = true;
    total += Math.max(0, expected - done);
  }
  return any ? { sessions: total } : null;
}

function estimateHint(projectId) {
  const r = estimateRatio(projectId);
  if (!r) return '';
  if (r.ratio >= 1.15) return `Tasks${r.project ? ' in this project' : ''} usually take you ${r.ratio.toFixed(1)}× your estimate.`;
  if (r.ratio <= 0.85) return `You usually finish${r.project ? ' this project\'s tasks' : ''} faster than you estimate (${r.ratio.toFixed(1)}×).`;
  return 'Your estimates are usually about right.';
}

function estimatesInsightHtml() {
  const hist = estimateHistory();
  if (hist.length < 3) {
    return `<section class="insight">
      <h3>How good are your estimates?</h3>
      <p class="insight-note">Add a session estimate to tasks in your plan. After you finish ${3 - hist.length} more estimated task${hist.length === 2 ? '' : 's'}, you'll see how your estimates compare with reality.</p>
    </section>`;
  }
  const overall = estimateRatio(null);
  const byProject = activeProjects()
    .map((p) => ({ p, r: estimateRatio(p.id) }))
    .filter((x) => x.r && x.r.project);
  const recent = hist.slice(0, 8);
  const maxN = Math.max(...recent.map((x) => Math.max(x.actual, x.t.est)));
  let headline;
  if (overall.ratio >= 1.15) headline = `Tasks usually take you <strong>${overall.ratio.toFixed(1)}×</strong> your estimate. Your plan's "realistic" numbers already account for this.`;
  else if (overall.ratio <= 0.85) headline = `You usually finish in <strong>${overall.ratio.toFixed(1)}×</strong> your estimate, so you can plan a little more.`;
  else headline = 'Your estimates are <strong>usually about right</strong>.';
  return `<section class="insight">
    <h3>How good are your estimates?</h3>
    <p class="insight-note">${headline} Based on ${plural(hist.length, 'finished task')}.</p>
    ${byProject.length ? `<p class="legend">${byProject.map((x) => `<span><i class="dot" style="background:${x.p.color}"></i>${esc(x.p.name)}: ${x.r.ratio.toFixed(1)}×</span>`).join('')}</p>` : ''}
    <ul class="est-list">${recent.map((x) => `<li data-tip="${esc(`${x.t.text}\nEstimated ${plural(x.t.est, 'session')}, took ${x.actual}`)}">
      <span class="est-name">${esc(x.t.text)}</span>
      <span class="est-bars">
        <span class="est-bar est" style="width:${(x.t.est / maxN) * 100}%"></span>
        <span class="est-bar act${x.actual > x.t.est ? ' over' : ''}" style="width:${(x.actual / maxN) * 100}%"></span>
      </span>
      <span class="est-num">${x.t.est} → ${x.actual}</span>
    </li>`).join('')}</ul>
    <p class="legend"><span><i class="dot est-key"></i>Estimated</span><span><i class="dot act-key"></i>Actual, within estimate</span><span><i class="dot over-key"></i>Actual, took longer</span></p>
  </section>`;
}
