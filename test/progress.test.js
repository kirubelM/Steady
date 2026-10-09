// Streaks, milestones, the review's best stretch and free time in the schedule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}

// A focus session on a day `daysAgo` before today, at 10:00 local time.
const sessionOn = (daysAgo, focusMin = 30) =>
  `data.entries.push({ type: 'session', start: atDay(shiftKey(todayKey(), -${daysAgo}), 600), end: atDay(shiftKey(todayKey(), -${daysAgo}), 600 + ${focusMin}), focusSec: ${focusMin * 60} });`;

test('streak counts consecutive days, and today only once you have focused', async () => {
  const { get, call } = setup({});
  await call(sessionOn(1) + sessionOn(2) + sessionOn(3) + sessionOn(5) + sessionOn(6));
  assert.deepEqual(get('computeStreaks()'), { current: 3, longest: 3, activeToday: false });
  await call(sessionOn(0));
  assert.deepEqual(get('computeStreaks()'), { current: 4, longest: 4, activeToday: true });
});

test('a missed day breaks the streak', async () => {
  const { get, call } = setup({});
  await call(sessionOn(2) + sessionOn(3));
  assert.equal(get('computeStreaks().current'), 0);
  assert.equal(get('computeStreaks().longest'), 2);
});

test('best stretch joins sessions with short breaks between them', async () => {
  const { get } = setup({});
  const m = 60000;
  const base = Date.parse('2026-10-12T09:00:00Z');
  const s = (start, len) => `{ start: ${base + start * m}, end: ${base + (start + len) * m}, focusSec: ${len * 60} }`;
  // 0–25, 30–55 (5 min gap), 60–85 (5 min gap), then 200–225 after a long gap.
  const best = get(`bestStretch([${s(0, 25)}, ${s(30, 25)}, ${s(60, 25)}, ${s(200, 25)}])`);
  assert.deepEqual(best, { start: base, end: base + 85 * m, sec: 75 * 60, n: 3 });
  // Sessions far apart: no stretch worth calling out.
  assert.equal(get(`bestStretch([${s(0, 25)}, ${s(100, 25)}])`), null);
});

test('milestones you already passed are recorded quietly the first time', async () => {
  const { get, call } = setup({});
  for (let d = 0; d < 8; d++) await call(sessionOn(d, 90)); // 8-day streak, 12 hours
  await call('await checkMilestones()');
  assert.deepEqual(get('data.meta.milestones'), { streak7: 'earlier', hours10: 'earlier' });
  assert.deepEqual(get('milestonesOn(todayKey())'), []);
});

test('a new milestone is dated today and shows in the review', async () => {
  const { get, call } = setup({});
  await call('await checkMilestones()'); // first run with nothing earned yet
  for (let d = 0; d < 7; d++) await call(sessionOn(d));
  await call('await checkMilestones()');
  assert.equal(get('data.meta.milestones.streak7 === todayKey()'), true);
  assert.deepEqual(get('milestonesOn(todayKey()).map((m) => m.id)'), ['streak7']);
});

test('next milestones say how far there is to go', async () => {
  const { get, call } = setup({});
  await call(sessionOn(0, 120) + sessionOn(1, 120)); // 2-day streak, 4 hours
  await call('await checkMilestones()');
  assert.deepEqual(get('nextMilestones().map((m) => [m.id, m.left])'), [['streak7', 5], ['hours10', 6]]);
});

test('free time on a future day leaves out busy meetings and gaps under 15 minutes', async () => {
  const { get, call } = setup({ settings: { workStart: '09:00', workEnd: '17:00' } });
  const day = get('shiftKey(todayKey(), 3)');
  await call(`Cal.events = [
    { title: 'A', start: atDay('${day}', 600), end: atDay('${day}', 660), busy: true, allDay: false },
    { title: 'B', start: atDay('${day}', 670), end: atDay('${day}', 720), busy: true, allDay: false },
    { title: 'FYI', start: atDay('${day}', 780), end: atDay('${day}', 840), busy: false, allDay: false },
    { title: 'Holiday', start: atDay('${day}', 0), end: atDay('${day}', 1440), busy: true, allDay: true }
  ]`);
  // 9:00–10:00 free, 10:00–11:00 A, 11:00–11:10 too short, 11:10–12:00 B, 12:00–17:00 free.
  const blocks = get(`freeBlocks('${day}').map(([a, b]) => [(a - atDay('${day}', 0)) / 60000, (b - atDay('${day}', 0)) / 60000])`);
  assert.deepEqual(blocks, [[540, 600], [720, 1020]]);
});
