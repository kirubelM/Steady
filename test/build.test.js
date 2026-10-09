// Guards the installer: every file the app loads must be listed in package.json "build.files",
// or the installed app would break after an update even though `npm start` works.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const shipped = new Set(pkg.build.files);

// Follows require('./x') from main.js, and the pages and scripts it loads.
function neededFiles() {
  const need = new Set();
  const visitJs = (file) => {
    if (need.has(file)) return;
    need.add(file);
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/require\('\.\/([\w.-]+?)(?:\.js)?'\)/g)) visitJs(`${m[1]}.js`);
    for (const m of src.matchAll(/loadFile\('([\w.-]+\.html)'/g)) visitHtml(m[1]);
    for (const m of src.matchAll(/path\.join\(__dirname, '([\w.-]+\.js)'\)/g)) visitJs(m[1]);
  };
  const visitHtml = (file) => {
    if (need.has(file)) return;
    need.add(file);
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/<script src="([\w.-]+\.js)"/g)) visitJs(m[1]);
    for (const m of src.matchAll(/<link rel="stylesheet" href="([\w.-]+\.css)"/g)) need.add(m[1]);
  };
  visitJs(pkg.main);
  return need;
}

test('every file the app loads is included in the installer', () => {
  const missing = [...neededFiles()].filter((f) => !shipped.has(f));
  assert.deepEqual(missing, [], `Add these to "build.files" in package.json: ${missing.join(', ')}`);
});

test('every file listed for the installer exists', () => {
  const absent = pkg.build.files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(absent, []);
});

test('the window pages are all reachable from main.js', () => {
  const need = neededFiles();
  for (const page of ['index.html', 'break.html', 'mini.html', 'capture.html']) assert.ok(need.has(page), page);
});
