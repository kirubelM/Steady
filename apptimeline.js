// The all-day app timeline: which app (and window) was in front, in its own file per day,
// so a long history never weighs down the main data file. Written by the main process.
const fs = require('fs');
const path = require('path');

const SAMPLE_MS = 2000; // the window watcher reports every 2 seconds
const SKIP = new Set(['', 'idle', 'lockapp']);
const MAX_TITLE = 200;

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A day on disk: { titles: [...], log: [[start ms, end ms, app, title index]] }. Titles are stored once each.
function emptyDay() { return { titles: [], log: [] }; }

function createTimeline(dir) {
  let day = null; // the day being written: { key, data, dirty }

  const file = (key) => path.join(dir, `${key}.json`);
  const read = (key) => {
    try {
      const d = JSON.parse(fs.readFileSync(file(key), 'utf8'));
      return d && Array.isArray(d.log) && Array.isArray(d.titles) ? d : emptyDay();
    } catch { return emptyDay(); }
  };

  function flush() {
    if (!day || !day.dirty) return;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file(day.key)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(day.data));
    fs.renameSync(tmp, file(day.key));
    day.dirty = false;
  }

  // One sample from the watcher. The same app and window as last time stretches the last entry.
  function add(now, app, title) {
    const name = String(app || '');
    if (SKIP.has(name.toLowerCase())) return;
    const key = dayKey(now);
    if (!day || day.key !== key) {
      flush();
      day = { key, data: read(key), dirty: false };
    }
    const d = day.data;
    const t = String(title || '').slice(0, MAX_TITLE);
    let ti = d.titles.indexOf(t);
    if (ti < 0) { d.titles.push(t); ti = d.titles.length - 1; }
    const last = d.log[d.log.length - 1];
    if (last && last[2] === name && last[3] === ti && now - last[1] <= SAMPLE_MS * 3) last[1] = now;
    else d.log.push([now - SAMPLE_MS, now, name, ti]);
    day.dirty = true;
  }

  // A day as [[start, end, app, title]], including what hasn't been written yet.
  function getDay(key) {
    const d = day && day.key === key ? day.data : read(key);
    return d.log.map(([a, b, app, ti]) => [a, b, app, d.titles[ti] || '']);
  }

  // Deletes days older than `keepDays` (0 keeps everything).
  function prune(keepDays, now = Date.now()) {
    if (!keepDays) return 0;
    const cutoff = dayKey(now - keepDays * 86400000);
    let removed = 0;
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return 0; }
    for (const n of names) {
      const m = n.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (m && m[1] < cutoff) { try { fs.unlinkSync(path.join(dir, n)); removed++; } catch { /* in use */ } }
    }
    return removed;
  }

  // Moves the timeline Steady 1.15 kept inside the data file (app names only) into day files.
  function importOld(appLog) {
    for (const [key, log] of Object.entries(appLog || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(log) || fs.existsSync(file(key))) continue;
      const d = emptyDay();
      d.titles.push('');
      d.log = log.filter((x) => Array.isArray(x) && x.length >= 3).map(([a, b, app]) => [a, b, String(app), 0]);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file(key), JSON.stringify(d));
    }
  }

  return { add, flush, getDay, prune, importOld };
}

module.exports = { createTimeline, dayKey };
