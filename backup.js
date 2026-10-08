// Daily backups of the data file, kept for a set number of days.
const fs = require('fs');
const path = require('path');

let dir = null;
let source = null;

function init(backupDir, dataFile) {
  dir = backupDir;
  source = dataFile;
  fs.mkdirSync(dir, { recursive: true });
}

const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function list() {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^steady-data-.*\.json$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, size: st.size, time: st.mtimeMs };
    })
    .sort((a, b) => b.time - a.time);
}

// Copies the data file; kind is 'daily' (one per day) or a label like 'before-restore'.
function create(kind = 'daily') {
  if (!source || !fs.existsSync(source)) return null;
  const now = new Date();
  const name = kind === 'daily'
    ? `steady-data-${stamp(now)}.json`
    : `steady-data-${stamp(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-${kind}.json`;
  const target = path.join(dir, name);
  fs.copyFileSync(source, target);
  return name;
}

function ensureToday() {
  const name = `steady-data-${stamp()}.json`;
  if (!fs.existsSync(path.join(dir, name))) return create('daily');
  return null;
}

function prune(keepDays = 30) {
  const cutoff = Date.now() - keepDays * 86400000;
  list().forEach((b) => {
    if (b.time < cutoff) {
      try { fs.unlinkSync(path.join(dir, b.name)); } catch { /* ignore */ }
    }
  });
}

function read(name) {
  if (!/^steady-data-[\w.-]+\.json$/.test(name)) throw new Error('Not a Steady backup file.');
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

// Newest backup that parses cleanly, for recovering from a damaged data file.
function newestValid() {
  for (const b of list()) {
    try { return { name: b.name, data: read(b.name) }; } catch { /* try the next one */ }
  }
  return null;
}

module.exports = { init, list, create, ensureToday, prune, read, newestValid, dir: () => dir };
