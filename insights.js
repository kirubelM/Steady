/* ---------- Insights dashboard (interactive) ---------- */

let insightRange = 7;
let insightOffset = 0;        // 0 = period ending today, 1 = the one before, ...
let insightProject = 'all';   // 'all' | 'none' | project id
let focusMetric = 'focus';    // focus | logged | sessions | ontrack
let selectedDay = null;

const METRICS = [
  { id: 'focus', label: 'Focus time' },
  { id: 'logged', label: 'All logged time' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'ontrack', label: 'On track' }
];

function rangeDays(n, offset = 0) {
  const end = shiftKey(dayKey(Date.now()), -offset * n);
  return Array.from({ length: n }, (_, i) => shiftKey(end, i - (n - 1)));
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
const longDay = (k) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const shortDay = (k) => new Date(k + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

function matchesProject(e) {
  if (insightProject === 'all') return true;
  if (insightProject === 'none') return !e.projectId;
  return e.projectId === insightProject;
}

/* Bar chart with hover tooltips and optional click targets (data-day). */
function barChart({ labels, values, steps, fmtAxis, tips, barClass, height = 170, labelEvery = 1,
  ariaLabel, refLine = 0, refLabel = '', days = null, selected = -1, stacks = null, compare = null }) {
  const W = 640, H = height, padL = 40, padR = 6, padT = 12, padB = 24;
  const plotH = H - padT - padB;
  const max = niceMax(Math.max(0, refLine, ...values, ...(compare || [])), steps);
  const n = values.length;
  const cw = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(36, cw * 0.62));
  let svg = `<svg class="chart${days ? ' clickable' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;

  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line>`;
    svg += `<text class="axis" x="${padL - 6}" y="${y + 4}" text-anchor="end">${fmtAxis((max * i) / 4)}</text>`;
  }
  values.forEach((v, i) => {
    const h = max ? (v / max) * plotH : 0;
    const x = padL + i * cw + (cw - bw) / 2;
    const y = padT + plotH - h;
    const cls = `bar ${barClass(i)}${i === selected ? ' selected' : ''}`;
    if (v > 0 && stacks && stacks[i] && stacks[i].length) {
      // One segment per project, bottom up, in the project's color.
      let top = padT + plotH;
      stacks[i].forEach((seg, j) => {
        const sh = max ? (seg.v / max) * plotH : 0;
        top -= sh;
        const last = j === stacks[i].length - 1;
        svg += `<rect class="${cls} seg" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, sh).toFixed(1)}" rx="${last ? 2 : 0}" style="fill:${seg.color}"></rect>`;
      });
    } else if (v > 0) {
      svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2"></rect>`;
    }
    if (i % labelEvery === 0 || i === n - 1) {
      svg += `<text class="axis${i === selected ? ' sel' : ''}" x="${(padL + i * cw + cw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
    }
    // Full-height hit area so small bars are easy to hover and click.
    svg += `<rect class="hit" x="${(padL + i * cw).toFixed(1)}" y="${padT}" width="${cw.toFixed(1)}" height="${plotH}" data-tip="${esc(tips[i])}"${days ? ` data-day="${days[i]}"` : ''}></rect>`;
  });
  if (compare && compare.some((v) => v > 0)) {
    const pts = compare.map((v, i) => `${(padL + i * cw + cw / 2).toFixed(1)},${(padT + plotH - (max ? (v / max) * plotH : 0)).toFixed(1)}`);
    svg += `<polyline class="compare" points="${pts.join(' ')}"></polyline>`;
    if (n <= 31) svg += pts.map((p) => { const [cx, cy] = p.split(','); return `<circle class="compare-dot" cx="${cx}" cy="${cy}" r="2.2"></circle>`; }).join('');
  }
  if (refLine > 0) {
    const y = padT + plotH * (1 - refLine / max);
    svg += `<line class="ref" x1="${padL}" x2="${W - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    const ly = y - 5 < padT + 8 ? y + 13 : y - 5;
    if (refLabel) svg += `<text class="ref-label" x="${W - padR}" y="${ly.toFixed(1)}" text-anchor="end">${esc(refLabel)}</text>`;
  }
  return svg + '</svg>';
}

function chartLegend(stacks, compare) {
  const items = [];
  if (stacks) {
    const seen = new Map();
    stacks.flat().forEach((s) => seen.set(s.color, true));
    (data.projects || []).filter((p) => seen.has(p.color)).forEach((p) => items.push(`<span><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</span>`));
    if (seen.has('var(--muted)')) items.push('<span><i class="dot none"></i>No project</span>');
  }
  if (compare && compare.some((v) => v > 0)) items.push(`<span><i class="dash"></i>The ${insightRange} days before</span>`);
  return items.length ? `<p class="legend">${items.join('')}</p>` : '';
}

function milestonesHtml() {
  if (typeof MILESTONES === 'undefined') return '';
  const got = data.meta.milestones || {};
  const earned = MILESTONES.filter((m) => got[m.id]);
  const next = nextMilestones();
  if (!earned.length && !next.length) return '';
  return `<h4 class="ms-head">Milestones</h4>
    ${earned.length ? milestoneBadges(earned) : ''}
    ${next.length ? `<div class="badges">${next.map((m) => `<span class="badge later">Next: ${esc(m.title)}, ${m.kind === 'streak' ? plural(m.left, 'day') : plural(m.left, 'hour')} to go</span>`).join('')}</div>` : ''}`;
}

function splitBar(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return '';
  return `<div class="split">${parts
    .filter((p) => p.value > 0)
    .map((p) => `<span class="seg ${p.cls}" style="flex:${p.value}" data-tip="${esc(`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`)}"></span>`)
    .join('')}</div>
    <p class="legend">${parts.map((p) =>
      `<span><i class="dot ${p.cls}"></i>${esc(p.label)} ${p.value} (${Math.round((p.value / total) * 100)}%)</span>`).join('')}</p>`;
}

function computeStreaks() {
  const days = new Set(data.entries.filter((e) => e.type === 'session').map((e) => dayKey(e.start)));
  let current = 0;
  let cursor = dayKey(Date.now());
  if (!days.has(cursor)) cursor = shiftKey(cursor, -1); // today isn't over yet
  while (days.has(cursor)) { current++; cursor = shiftKey(cursor, -1); }
  let longest = 0;
  let run = 0;
  let prev = null;
  [...days].sort().forEach((k) => {
    run = prev && shiftKey(prev, 1) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  });
  return { current, longest, activeToday: days.has(dayKey(Date.now())) };
}

/* ---------- Pieces ---------- */

function dayStats(entries, key) {
  const dayEntries = entries.filter((e) => dayKey(e.start) === key);
  const sessions = dayEntries.filter((e) => e.type === 'session');
  return {
    focusSec: sessions.reduce((a, e) => a + (e.focusSec || 0), 0),
    loggedSec: dayEntries.filter((e) => WORK_TYPES.includes(e.type)).reduce((a, e) => a + workSec(e), 0),
    sessions: sessions.length,
    onTrack: sessions.filter((e) => e.rating === 'on-track').length
  };
}

function heatmap(endKey, workEntries) {
  const weeks = 18;
  const today = dayKey(Date.now());
  const end = new Date(endKey + 'T12:00');
  const lastMonday = shiftKey(endKey, -((end.getDay() + 6) % 7));
  const firstMonday = shiftKey(lastMonday, -7 * (weeks - 1));
  const goalSec = (settings.dailyGoalMin || 0) * 60;

  const perDay = {};
  workEntries.filter((e) => e.type === 'session').forEach((e) => {
    const k = dayKey(e.start);
    perDay[k] = (perDay[k] || 0) + (e.focusSec || 0);
  });
  const maxSec = Math.max(1, ...Object.values(perDay));
  const scale = goalSec || maxSec;
  const level = (sec) => {
    if (!sec) return 0;
    const r = sec / scale;
    if (r >= 1) return 4;
    if (r >= 0.5) return 3;
    if (r >= 0.25) return 2;
    return 1;
  };

  const cell = 14, gap = 3, left = 30, top = 18;
  const W = left + weeks * (cell + gap) + 18;
  const H = top + 7 * (cell + gap);
  let svg = `<svg class="heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Focus calendar">`;
  ['Mon', 'Wed', 'Fri'].forEach((d, i) => {
    svg += `<text class="axis" x="${left - 6}" y="${top + (i * 2) * (cell + gap) + cell - 3}" text-anchor="end">${d}</text>`;
  });
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const monday = shiftKey(firstMonday, w * 7);
    const m = new Date(monday + 'T12:00').getMonth();
    if (m !== lastMonth) {
      svg += `<text class="axis" x="${left + w * (cell + gap)}" y="${top - 6}">${new Date(monday + 'T12:00').toLocaleDateString([], { month: 'short' })}</text>`;
      lastMonth = m;
    }
    for (let d = 0; d < 7; d++) {
      const k = shiftKey(monday, d);
      if (k > today) continue;
      const sec = perDay[k] || 0;
      const tip = `${longDay(k)}: ${sec ? fmtMins(sec) + ' focused' : 'no focus sessions'}${goalSec && sec >= goalSec ? ', goal met' : ''}`;
      svg += `<rect class="hc l${level(sec)}${k === selectedDay ? ' selected' : ''}" x="${left + w * (cell + gap)}" y="${top + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" data-day="${k}" data-tip="${esc(tip)}"></rect>`;
    }
  }
  svg += '</svg>';
  const legend = `<p class="legend heat-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hc-key l${l}"></i>`).join('')}<span>More</span>${goalSec ? '<span class="muted-note">The strongest color means you met your goal.</span>' : ''}</p>`;
  return svg + legend;
}

function drilldown(key, workEntries) {
  const items = workEntries.filter((e) => dayKey(e.start) === key).sort((a, b) => a.start - b.start);
  const total = items.reduce((a, e) => a + workSec(e), 0);
  const list = items.length
    ? `<ul class="drill-list">${items.map((e) => `<li>
        <span class="when">${fmtTime(e.start)}</span>
        <span class="drill-main"><span class="note">${esc(e.note || 'Untitled')}</span>
          <span class="meta">${e.rating ? `<span class="chip ${esc(e.rating)}">${RATING_LABELS[e.rating]}</span>` : ''}${projectChip(e.projectId)}${e.type === 'session' ? 'Focus session' : e.type === 'checkin' ? 'Check-in' : 'Added by you'}</span></span>
        <span class="drill-time">${workSec(e) ? fmtMins(Math.max(60, workSec(e))) : ''}</span>
      </li>`).join('')}</ul>`
    : `<p class="insight-note">Nothing logged on this day${insightProject !== 'all' ? ' for this project' : ''}.</p>`;
  return `<section class="insight drill" id="drill">
    <div class="drill-head">
      <h3>${esc(longDay(key))}</h3>
      <span class="h-total">${total ? fmtMins(total) + ' logged' : ''}</span>
      <button class="link" type="button" data-open-log="${key}">Open in work log</button>
      <button class="link" type="button" data-open-plan="${key}">Open day page</button>
      <button class="icon-btn small" type="button" data-drill-close aria-label="Close day details">×</button>
    </div>
    ${list}
  </section>`;
}

/* ---------- Main render ---------- */

function renderInsightControls(days) {
  const sel = $('insProject');
  const opts = [`<option value="all">All projects</option>`, `<option value="none">No project</option>`]
    .concat(activeProjects().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`));
  sel.innerHTML = opts.join('');
  if (insightProject !== 'all' && insightProject !== 'none' && !projectById(insightProject)) insightProject = 'all';
  sel.value = insightProject;
  sel.hidden = !(data.projects || []).length;
  $('insPeriod').textContent = insightOffset === 0
    ? `Last ${insightRange} days`
    : `${shortDay(days[0])} – ${shortDay(days[days.length - 1])}`;
  $('insNext').disabled = insightOffset === 0;
}

function renderInsights() {
  playEnter($('insightBody'));
  const days = rangeDays(insightRange, insightOffset);
  const first = days[0];
  const last = days[days.length - 1];
  renderInsightControls(days);

  const allWork = data.entries.filter((e) => WORK_TYPES.includes(e.type));
  const workFiltered = allWork.filter(matchesProject);
  const inRange = (e) => { const k = dayKey(e.start); return k >= first && k <= last; };
  const work = workFiltered.filter(inRange);
  const sessions = work.filter((e) => e.type === 'session');
  const breaks = data.entries.filter((e) => e.type === 'break' && inRange(e));
  const filterLabel = insightProject === 'all' ? '' : insightProject === 'none' ? ' (no project)' : ` on ${projectName(insightProject)}`;

  // Summary with comparison to the previous period
  const prevDays = rangeDays(insightRange, insightOffset + 1);
  const prevFocus = workFiltered
    .filter((e) => e.type === 'session' && dayKey(e.start) >= prevDays[0] && dayKey(e.start) <= prevDays[prevDays.length - 1])
    .reduce((a, e) => a + (e.focusSec || 0), 0);
  const totalSec = sessions.reduce((a, e) => a + (e.focusSec || 0), 0);
  const loggedSec = work.reduce((a, e) => a + workSec(e), 0);
  const activeDays = new Set(sessions.map((e) => dayKey(e.start))).size;
  const onTrack = sessions.filter((e) => e.rating === 'on-track').length;

  if (!work.length) {
    $('insightSummary').textContent = '';
    $('insightBody').innerHTML = emptyState('chart', `Nothing logged${filterLabel} in this period`, insightOffset ? 'Try a more recent period.' : 'Finish a few sessions and your patterns will show up here.', 'div') +
      (selectedDay ? drilldown(selectedDay, workFiltered) : '');
    return;
  }

  let summary = sessions.length
    ? `${fmtMins(totalSec)} focused${filterLabel} across ${plural(sessions.length, 'session')} on ${plural(activeDays, 'day')}`
    : `No focus sessions${filterLabel}`;
  if (loggedSec > totalSec + 59) summary += `, plus ${fmtMins(loggedSec - totalSec)} logged outside sessions`;
  summary += '.';
  if (sessions.length) summary += ` ${Math.round((onTrack / sessions.length) * 100)}% went to plan.`;
  if (prevFocus > 0 && totalSec > 0) {
    const change = Math.round(((totalSec - prevFocus) / prevFocus) * 100);
    if (Math.abs(change) >= 5) summary += ` That's ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% from the ${insightRange} days before.`;
    else summary += ` About the same as the ${insightRange} days before.`;
  }
  $('insightSummary').textContent = summary;

  /* Per-day chart with metric switch */
  const stats = days.map((k) => dayStats(work, k));
  const today = dayKey(Date.now());
  const metric = METRICS.find((m) => m.id === focusMetric) || METRICS[0];
  const metricVal = (s) => ({
    focus: s.focusSec / 60,
    logged: s.loggedSec / 60,
    sessions: s.sessions,
    ontrack: s.sessions ? Math.round((s.onTrack / s.sessions) * 100) : 0
  }[metric.id]);
  const values = stats.map(metricVal);
  const dayLabels = days.map((k) => {
    const d = new Date(k + 'T12:00');
    if (insightRange === 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.getDate() === 1 || k === first ? shortDay(k) : String(d.getDate());
  });
  const tips = days.map((k, i) => {
    const s = stats[i];
    const parts = [longDay(k)];
    parts.push(s.sessions ? `${fmtMins(s.focusSec)} focused in ${plural(s.sessions, 'session')}` : 'No focus sessions');
    if (s.loggedSec > s.focusSec + 59) parts.push(`${fmtMins(s.loggedSec)} logged in total`);
    if (s.sessions) parts.push(`${Math.round((s.onTrack / s.sessions) * 100)}% on track`);
    if (settings.dailyGoalMin && metric.id === 'focus') parts.push(s.focusSec >= settings.dailyGoalMin * 60 ? 'Goal met' : `${fmtMins(Math.max(0, settings.dailyGoalMin * 60 - s.focusSec))} short of goal`);
    return parts.join('\n') + '\nClick for details';
  });
  const isTime = metric.id === 'focus' || metric.id === 'logged';
  const projOrder = (data.projects || []).map((p) => p.id);
  const stacks = isTime && insightProject === 'all' && projOrder.length
    ? days.map((k) => {
      const by = new Map();
      work.filter((e) => dayKey(e.start) === k && (metric.id === 'logged' || e.type === 'session')).forEach((e) => {
        const id = e.projectId && projectById(e.projectId) ? e.projectId : 'none';
        by.set(id, (by.get(id) || 0) + (metric.id === 'focus' ? e.focusSec || 0 : workSec(e)) / 60);
      });
      return [...by.entries()]
        .sort((a, b) => (a[0] === 'none') - (b[0] === 'none') || projOrder.indexOf(a[0]) - projOrder.indexOf(b[0]))
        .map(([id, v]) => ({ v, color: projectById(id)?.color || 'var(--muted)' }));
    })
    : null;
  const compare = insightRange <= 30
    ? prevDays.map((k) => metricVal(dayStats(workFiltered, k)))
    : null;
  const chart = barChart({
    stacks,
    compare,
    labels: dayLabels,
    values,
    steps: isTime ? [5, 10, 15, 30, 60, 90, 120, 180, 240, 360] : metric.id === 'ontrack' ? [25] : [1, 2, 3, 5, 10, 20],
    fmtAxis: isTime ? fmtAxisMins : metric.id === 'ontrack' ? (v) => `${Math.round(v)}%` : (v) => String(Math.round(v)),
    tips,
    barClass: (i) => (days[i] === today ? 'today' : ''),
    labelEvery: insightRange === 7 ? 1 : insightRange === 30 ? 5 : 14,
    ariaLabel: `${metric.label} per day`,
    refLine: metric.id === 'focus' ? settings.dailyGoalMin || 0 : 0,
    refLabel: metric.id === 'focus' && settings.dailyGoalMin ? `Goal ${fmtMins(settings.dailyGoalMin * 60)}` : '',
    days,
    selected: days.indexOf(selectedDay)
  });
  const metricSwitch = `<div class="range small" role="group" aria-label="Chart shows">${METRICS.map((m) =>
    `<button type="button" data-metric="${m.id}" aria-pressed="${m.id === metric.id}">${m.label}</button>`).join('')}</div>`;

  /* Time by project (ignores the project filter so you can compare, but highlights it) */
  const projTotals = new Map();
  allWork.filter(inRange).forEach((e) => {
    const k = e.projectId && projectById(e.projectId) ? e.projectId : 'none';
    projTotals.set(k, (projTotals.get(k) || 0) + workSec(e));
  });
  const projRows = [...projTotals.entries()].filter(([, sec]) => sec > 0).sort((a, b) => b[1] - a[1]);
  const projMax = projRows.length ? projRows[0][1] : 1;
  const projTotal = projRows.reduce((a, [, sec]) => a + sec, 0);
  const projectsHtml = (data.projects || []).length
    ? `<section class="insight">
        <h3>Time by project</h3>
        <p class="insight-note">Click a project to filter everything on this page by it.</p>
        <ul class="hbars projects">${projRows.map(([id, sec]) => {
          const p = projectById(id);
          const name = p ? p.name : 'No project';
          const active = insightProject === id;
          return `<li class="${active ? 'active' : ''}${insightProject !== 'all' && !active ? ' dim' : ''}">
            <button type="button" data-project="${id}" class="hb-btn" data-tip="${esc(`${name}: ${fmtMins(sec)}, ${Math.round((sec / projTotal) * 100)}% of logged time`)}">
              <span class="hb-name">${p ? `<i class="dot" style="background:${p.color}"></i>` : '<i class="dot none"></i>'}${esc(name)}</span>
              <span class="hb-track"><span style="width:${Math.max(3, (sec / projMax) * 100).toFixed(1)}%;${p ? `background:${p.color}` : ''}"></span></span>
              <span class="hb-val">${fmtMins(Math.max(60, sec))}</span>
            </button></li>`;
        }).join('') || '<li class="empty">Nothing logged in this period.</li>'}</ul>
      </section>`
    : '';

  /* Best hours */
  const hourMins = new Array(24).fill(0);
  const hourCount = new Array(24).fill(0);
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
    hourCount[h]++;
    startCounts[h]++;
    if (e.rating === 'on-track') startOnTrack[h]++;
  });
  let hoursHtml = '';
  if (sessions.length) {
    let used = hourMins.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
    if (!used.length) used = [9];
    const hFrom = Math.max(0, Math.min(8, used[0]) - 1);
    const hTo = Math.min(23, Math.max(18, used[used.length - 1]) + 1);
    let bestH = hFrom;
    let bestSum = -1;
    for (let h = hFrom; h < hTo; h++) {
      const s = hourMins[h] + hourMins[h + 1];
      if (s > bestSum) { bestSum = s; bestH = h; }
    }
    const hours = [];
    for (let h = hFrom; h <= hTo; h++) hours.push(h);
    let note = `Most of your focus happens between ${fmtHour(bestH)} and ${fmtHour(bestH + 2)}.`;
    let bestStart = -1;
    let bestRate = 0;
    startCounts.forEach((c, h) => {
      if (c >= 2 && startOnTrack[h] / c > bestRate) { bestRate = startOnTrack[h] / c; bestStart = h; }
    });
    if (bestStart >= 0) note += ` Sessions you start around ${fmtHour(bestStart)} go to plan most often (${Math.round(bestRate * 100)}%).`;
    hoursHtml = `<section class="insight">
      <h3>Your best hours</h3>
      <p class="insight-note">${note}</p>
      ${barChart({
        labels: hours.map(shortHour),
        values: hours.map((h) => hourMins[h]),
        steps: [5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 600, 900, 1200],
        fmtAxis: fmtAxisMins,
        tips: hours.map((h) => `${fmtHour(h)} to ${fmtHour(h + 1)}\n${fmtMins(hourMins[h] * 60)} focused` +
          (startCounts[h] ? `\n${plural(startCounts[h], 'session')} started, ${Math.round((startOnTrack[h] / startCounts[h]) * 100)}% on track` : '')),
        barClass: (i) => (hours[i] === bestH || hours[i] === bestH + 1 ? 'hi' : 'soft'),
        labelEvery: hours.length > 14 ? 2 : 1,
        ariaLabel: 'Focus time by hour of day'
      })}
    </section>`;
  }

  /* When you focus: a weekday-by-hour grid */
  let whenHtml = '';
  if (sessions.length >= 3) {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    sessions.forEach((e) => {
      let t = e.start;
      let left = e.focusSec || 0;
      while (left > 0) {
        const d = new Date(t);
        const chunk = Math.min(left, 3600 - (d.getMinutes() * 60 + d.getSeconds()));
        grid[(d.getDay() + 6) % 7][d.getHours()] += chunk / 60;
        t += chunk * 1000;
        left -= chunk;
      }
    });
    let used = [];
    grid.forEach((row) => row.forEach((v, h) => { if (v > 0) used.push(h); }));
    const gFrom = Math.min(8, ...used);
    const gTo = Math.max(18, ...used);
    const gMax = Math.max(...grid.flat(), 1);
    const level = (v) => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / gMax) * 3.999)));
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cols = gTo - gFrom + 1;
    whenHtml = `<section class="insight">
      <h3>When you focus</h3>
      <p class="insight-note">Darker squares are the hours you focus most, by day of the week${filterLabel}.</p>
      <div class="when-grid" style="--cols:${cols}">
        <span></span>${Array.from({ length: cols }, (_, i) => `<span class="when-h">${(gFrom + i) % 3 === 0 ? shortHour(gFrom + i) : ''}</span>`).join('')}
        ${grid.map((row, d) => `<span class="when-d">${names[d]}</span>${row.slice(gFrom, gTo + 1).map((v, i) =>
          `<span class="when-c heat-${level(v)}" data-tip="${esc(`${names[d]} ${fmtHour(gFrom + i)}\n${v ? fmtMins(v * 60) + ' focused' : 'No focus'}`)}"></span>`).join('')}`).join('')}
      </div>
    </section>`;
  }

  /* Apps, distractions and ratings */
  const appTotals = {};
  work.forEach((e) => (e.apps || []).forEach((a) => { appTotals[a.name] = (appTotals[a.name] || 0) + a.sec; }));
  const apps = Object.entries(appTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const appMax = apps.length ? apps[0][1] : 1;
  const appTotal = apps.reduce((a, [, s]) => a + s, 0) || 1;
  const appsHtml = apps.length
    ? `<ul class="hbars">${apps.map(([name, sec]) => `<li data-tip="${esc(`${name}: ${fmtMins(Math.max(60, sec))}, ${Math.round((sec / appTotal) * 100)}% of tracked app time`)}">
        <span class="hb-name">${esc(name)}</span>
        <span class="hb-track"><span style="width:${Math.max(3, (sec / appMax) * 100).toFixed(1)}%"></span></span>
        <span class="hb-val">${fmtMins(Math.max(60, sec))}</span></li>`).join('')}</ul>`
    : '<p class="insight-note">App tracking works on Windows. Nothing recorded yet.</p>';

  const driftVals = days.map((k) => sessions.filter((e) => dayKey(e.start) === k).reduce((a, e) => a + (e.distractions?.length || 0), 0));
  const driftBy = {};
  sessions.forEach((e) => (e.distractions || []).forEach((d) => { driftBy[d.match] = (driftBy[d.match] || 0) + 1; }));
  const totalDrifts = driftVals.reduce((a, b) => a + b, 0);
  let driftHtml;
  if (!totalDrifts) {
    driftHtml = '<p class="insight-note">No drifts in this period. Nicely done.</p>';
  } else {
    const half = Math.floor(days.length / 2);
    const earlier = driftVals.slice(0, half).reduce((a, b) => a + b, 0);
    const later = driftVals.slice(half).reduce((a, b) => a + b, 0);
    const trend = later < earlier ? `Down from ${earlier} to ${later} across the period.`
      : later > earlier ? `Up from ${earlier} to ${later} across the period.` : 'Steady across the period.';
    const top = Object.entries(driftBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `${esc(k)} (${c})`).join(', ');
    driftHtml = `<p class="insight-note">${plural(totalDrifts, 'drift')}. ${trend} Most often: ${top}.</p>` +
      barChart({
        labels: dayLabels,
        values: driftVals,
        steps: [1, 2, 3, 5, 10, 20, 50],
        fmtAxis: (v) => String(Math.round(v)),
        tips: days.map((k, i) => `${longDay(k)}\n${plural(driftVals[i], 'drift')}\nClick for details`),
        barClass: () => 'drift',
        height: 120,
        labelEvery: insightRange === 7 ? 1 : insightRange === 30 ? 10 : 30,
        ariaLabel: 'Drifts per day',
        days
      });
  }
  const ratingSplit = sessions.length ? splitBar([
    { label: 'On track', value: onTrack, cls: 'ok' },
    { label: 'Partly', value: sessions.filter((e) => e.rating === 'partly').length, cls: 'mid' },
    { label: 'Sidetracked', value: sessions.filter((e) => e.rating === 'sidetracked').length, cls: 'bad' }
  ]) : '';

  /* Breaks and streaks (not project-specific) */
  const taken = breaks.filter((b) => !b.skipped).length;
  const skipped = breaks.length - taken;
  const restSec = breaks.filter((b) => !b.skipped).reduce((a, b) => a + (b.end - b.start) / 1000, 0);
  const st = computeStreaks();
  const goalDays = settings.dailyGoalMin ? days.filter((k) => goalMetOn(k)).length : 0;
  const workedDays = days.filter((k) => data.entries.some((e) => e.type === 'session' && dayKey(e.start) === k)).length;

  $('insightBody').innerHTML = `
    <section class="insight">
      <div class="insight-head">
        <h3>${metric.label} per day</h3>
        ${metricSwitch}
      </div>
      <p class="insight-note">Hover a day to see the numbers. Click it to see what you did.</p>
      ${chart}
      ${chartLegend(stacks, compare)}
    </section>
    ${selectedDay ? drilldown(selectedDay, workFiltered) : ''}
    <section class="insight">
      <h3>Focus calendar</h3>
      <p class="insight-note">The last 18 weeks${filterLabel}. Click any day for details.</p>
      <div class="heat-wrap">${heatmap(last, workFiltered)}</div>
    </section>
    ${projectsHtml}
    ${estimatesInsightHtml()}
    ${hoursHtml}
    ${whenHtml}
    <section class="insight two-col">
      <div>
        <h3>Top apps</h3>
        ${appsHtml}
      </div>
      <div>
        <h3>Distractions</h3>
        ${driftHtml}
        ${ratingSplit ? `<h4>How sessions went</h4>${ratingSplit}` : ''}
      </div>
    </section>
    <section class="insight">
      <h3>Breaks and streaks</h3>
      <div class="stats">
        <p><strong>${plural(st.current, 'day')}</strong> current streak</p>
        <p><strong>${plural(st.longest, 'day')}</strong> longest streak</p>
        <p><strong>${fmtMins(restSec)}</strong> spent resting</p>
        ${settings.dailyGoalMin ? `<p><strong>${goalDays} of ${workedDays}</strong> working days met your goal</p>` : ''}
      </div>
      ${milestonesHtml()}
      ${breaks.length ? splitBar([
        { label: 'Taken', value: taken, cls: 'rest' },
        { label: 'Skipped', value: skipped, cls: 'skip' }
      ]) : '<p class="insight-note">No breaks recorded in this period yet.</p>'}
    </section>`;
}

/* ---------- Tooltip and clicks ---------- */

function showTip(target, x, y) {
  const tip = $('tip');
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function bindInsights() {
  const body = $('insightBody');
  // Tooltips work for anything with data-tip, anywhere in the window.
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t, e.clientX, e.clientY);
    else if (!$('tip').hidden) $('tip').hidden = true;
  });
  document.addEventListener('mouseleave', () => { $('tip').hidden = true; });
  document.addEventListener('scroll', () => { $('tip').hidden = true; }, true);

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-day],[data-project],[data-metric],[data-drill-close],[data-open-log],[data-open-plan]');
    if (!t) return;
    $('tip').hidden = true;
    if (t.dataset.day) {
      selectedDay = selectedDay === t.dataset.day ? null : t.dataset.day;
      renderInsights();
      if (selectedDay) $('drill')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (t.dataset.project) {
      insightProject = insightProject === t.dataset.project ? 'all' : t.dataset.project;
      renderInsights();
    } else if (t.dataset.metric) {
      focusMetric = t.dataset.metric;
      renderInsights();
    } else if (t.hasAttribute('data-drill-close')) {
      selectedDay = null;
      renderInsights();
    } else if (t.dataset.openLog) {
      viewDay = t.dataset.openLog;
      showTab('log');
      setLogView('day');
    } else if (t.dataset.openPlan) {
      planDay = t.dataset.openPlan;
      showTab('plan');
    }
  });

  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    insightRange = Number(b.dataset.range);
    insightOffset = 0;
    document.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderInsights();
  }));
  $('insPrev').addEventListener('click', () => { insightOffset++; renderInsights(); });
  $('insNext').addEventListener('click', () => { insightOffset = Math.max(0, insightOffset - 1); renderInsights(); });
  $('insProject').addEventListener('change', (e) => { insightProject = e.target.value; renderInsights(); });
}
