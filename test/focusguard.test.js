// 1.15: do not disturb during focus. Everything is off by default.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  app.run(`document.querySelector = () => document.createElement('div')`); // the check-in dialog after a session
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}

test('do not disturb, app blocking and strict mode are all off by default', () => {
  const { get } = setup({});
  assert.deepEqual(get('[settings.focusDnd, settings.focusBlockApps, settings.strictFocus]'), [false, false, false]);
});

test('notifications are silenced for a session only when the setting is on, and always restored at the end', async () => {
  const { app, call } = setup({});
  const calls = [];
  app.sandbox.window.steady.setDnd = async (on) => { calls.push(on); return { ok: true }; };
  await call(`await startFocus({ text: 'Write' }); finishFocus(true)`);
  assert.deepEqual(calls, [false]); // off: never turned on, but the end still makes sure it's off
  calls.length = 0;
  await call(`S.state = 'idle'; settings.focusDnd = true; await startFocus({ text: 'Write' }); finishFocus(true)`);
  assert.deepEqual(calls, [true, false]);
});

test('listed apps match by process or friendly name, with or without .exe', () => {
  const { get, call } = setup({});
  call(`settings.blockedApps = ['discord.exe', 'VS Code', '  ']`);
  assert.equal(get(`blockedAppHit('Discord')`), true);
  assert.equal(get(`blockedAppHit('code')`), true); // shown as VS Code
  assert.equal(get(`blockedAppHit('chrome')`), false);
  assert.equal(get(`blockedAppHit('')`), false);
});

test('a listed app is minimized during focus only when app blocking is on', async () => {
  const { app, call } = setup({});
  const minimized = [];
  app.sandbox.window.steady.minimizeApp = (n) => minimized.push(n);
  await call(`settings.blockedApps = ['Discord']; await startFocus({ text: 'Write' }); onActivity({ app: 'Discord', title: 'chat', idle: 0 })`);
  assert.deepEqual(minimized, []);
  await call(`settings.focusBlockApps = true; onActivity({ app: 'Discord', title: 'chat', idle: 0 })`);
  assert.deepEqual(minimized, ['Discord']);
});

test('strict mode keeps a session from ending early after its first minute', async () => {
  const { get, call } = setup({});
  await call(`settings.strictFocus = true; await startFocus({ text: 'Write' }); finishFocus(true)`);
  assert.equal(get('S.state'), 'checkin'); // first minute: a mistaken start can still end
  await call(`S.state = 'idle'; await startFocus({ text: 'Write' }); S.start -= 120000; finishFocus(true)`);
  assert.equal(get('S.state'), 'focus');
  await call(`finishFocus(true, { force: true })`);
  assert.equal(get('S.state'), 'checkin');
});

/* ---------- The all-day app timeline ---------- */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTimeline } = require('../apptimeline');

test('the timeline joins samples of the same app and window, keeps titles once, and survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steady-tl-'));
  const tl = createTimeline(dir);
  const t0 = new Date('2026-10-20T10:00:00').getTime();
  for (let s = 0; s <= 10; s += 2) tl.add(t0 + s * 1000, 'code', 'main.js - Steady');
  for (let s = 12; s <= 20; s += 2) tl.add(t0 + s * 1000, 'chrome', 'Cats - YouTube');
  tl.add(t0 + 22000, 'code', 'main.js - Steady');
  tl.add(t0 + 24000, 'idle', ''); // never recorded
  assert.deepEqual(tl.getDay('2026-10-20').map((x) => [x[2], x[3], (x[1] - x[0]) / 1000]),
    [['code', 'main.js - Steady', 12], ['chrome', 'Cats - YouTube', 10], ['code', 'main.js - Steady', 2]]);
  tl.flush();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '2026-10-20.json'), 'utf8'));
  assert.deepEqual(onDisk.titles, ['main.js - Steady', 'Cats - YouTube']);
  assert.equal(createTimeline(dir).getDay('2026-10-20').length, 3);
});

test('old days are deleted after the chosen number of days, and never when it is set to keep forever', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steady-tl-'));
  for (const k of ['2025-01-01', '2026-10-01', '2026-10-19']) fs.writeFileSync(path.join(dir, `${k}.json`), '{"titles":[],"log":[]}');
  const tl = createTimeline(dir);
  const now = new Date('2026-10-20T12:00:00').getTime();
  assert.equal(tl.prune(0, now), 0);
  assert.equal(fs.readdirSync(dir).length, 3);
  assert.equal(tl.prune(30, now), 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-10-01.json', '2026-10-19.json']);
});

test("1.15's timeline in the data file moves into day files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steady-tl-'));
  const tl = createTimeline(dir);
  tl.importOld({ '2026-10-19': [[1, 5, 'VS Code', 0], [6, 9, 'Chrome', 1]] });
  assert.deepEqual(tl.getDay('2026-10-19'), [[1, 5, 'VS Code', ''], [6, 9, 'Chrome', '']]);
});

test('the Day summary shows time per app with its main windows, marks distractions, and counts switches', () => {
  const { get, call } = setup({});
  const t0 = new Date('2026-10-20T10:00:00').getTime();
  call(`settings.distractionKeywords = ['YouTube'];
    appDays.set('2026-10-20', { at: Date.now(), log: [
      [${t0}, ${t0 + 60000}, 'code', 'main.js'],
      [${t0 + 60000}, ${t0 + 90000}, 'chrome', 'Cats - YouTube'],
      [${t0 + 90000}, ${t0 + 100000}, 'code', 'day.js'],
      [${t0 + 400000}, ${t0 + 402000}, 'slack', 'general'],
      [${t0 + 402000}, ${t0 + 404000}, 'lockapp', '']
    ] })`);
  const d = get(`appDay('2026-10-20')`);
  assert.deepEqual(d.apps.map((x) => [x.name, x.sec, x.titles.map((t) => t.title)]),
    [['VS Code', 70, ['main.js', 'day.js']], ['Chrome', 30, ['Cats - YouTube']], ['Slack', 2, ['general']]]);
  assert.equal(d.distractSec, 30);
  assert.equal(d.switches, 2); // Slack came after a long gap: a pause, not a switch
});

test('keeping the timeline defaults to 30 days, and can be set to forever', () => {
  const { get } = setup({});
  assert.equal(get('settings.appLogKeepDays'), 30);
  assert.equal(get('NUM_FIELDS.appLogKeepDays[0]'), 0);
});
