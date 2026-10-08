// Small rolling log file for diagnosing problems. Never records window titles or log content.
const fs = require('fs');
const path = require('path');

let file = null;
const MAX_BYTES = 512 * 1024;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'steady.log');
}

function write(level, msg, detail) {
  if (!file) return;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, file + '.old');
    }
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}${detail ? ' | ' + String(detail).replace(/\s+/g, ' ').slice(0, 2000) : ''}\n`;
    fs.appendFileSync(file, line);
  } catch { /* logging must never crash the app */ }
}

function tail(lines = 60) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.trim().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

module.exports = {
  init,
  info: (m, d) => write('info', m, d),
  warn: (m, d) => write('warn', m, d),
  error: (m, d) => write('error', m, d),
  tail,
  dir: () => (file ? path.dirname(file) : '')
};
