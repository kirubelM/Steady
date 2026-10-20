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

test('the app timeline joins samples of the same app, marks distractions and counts switches', async () => {
  const { get, call } = setup({});
  const t0 = new Date('2026-10-20T10:00:00').getTime();
  // drive recordApp directly with fixed times
  await call(`data.appLog = {};
    const t0 = ${t0};
    for (let s = 0; s <= 60; s += 2) recordApp(t0 + s * 1000, 'VS Code', false);
    for (let s = 62; s <= 90; s += 2) recordApp(t0 + s * 1000, 'Chrome', true);
    for (let s = 92; s <= 100; s += 2) recordApp(t0 + s * 1000, 'VS Code', false);
    recordApp(t0 + 400000, 'Slack', false);`);
  const d = get(`appDay('2026-10-20')`);
  assert.deepEqual(d.log.map((x) => x[2]), ['VS Code', 'Chrome', 'VS Code', 'Slack']);
  assert.deepEqual(d.apps.map((x) => [x.name, Math.round(x.sec)]), [['VS Code', 72], ['Chrome', 30], ['Slack', 2]]);
  assert.equal(Math.round(d.distractSec), 30);
  assert.equal(d.switches, 2); // Slack came after a long gap: a pause, not a switch
});

test('the timeline keeps only app names, respects the setting, and drops days older than 30', async () => {
  const { get, call } = setup({ appLog: { '2020-01-01': [[1, 2, 'Old', 0]] } });
  await call(`settings.distractionKeywords = ['YouTube']; onActivity({ app: 'chrome', title: 'Cats - YouTube', idle: 0 })`);
  const day = get('todayKey()');
  assert.deepEqual(get(`data.appLog['${day}'].map((x) => [x[2], x[3]])`), [['Chrome', 1]]);
  assert.equal(JSON.stringify(get('data.appLog')).includes('Cats'), false);
  assert.equal(get(`data.appLog['2020-01-01']`), null); // trimmed on save
  await call(`settings.appTimeline = false; data.appLog = {}; onActivity({ app: 'chrome', title: 'x', idle: 0 })`);
  assert.deepEqual(get('data.appLog'), {});
});
