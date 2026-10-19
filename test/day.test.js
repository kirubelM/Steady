// The Day view: hours shown, overlapping blocks side by side, and which tasks still need a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}
const id = (name) => `data.tasks.find((t) => t.text === '${name}').id`;

test('the calendar shows working hours, stretched to whole hours around anything outside them', () => {
  const { get, call } = setup({});
  call(`settings.workStart = '09:30'; settings.workEnd = '17:00'`);
  assert.deepEqual(get('dayRange([])'), [540, 1020]);
  assert.deepEqual(get('dayRange([{ startMin: 450, endMin: 480 }, { startMin: 1100, endMin: 1130 }])'), [420, 1140]);
});

test('overlapping things sit side by side; separate ones get the full width', () => {
  const { get } = setup({});
  const out = get(`layoutColumns([
    { n: 'a', startMin: 540, endMin: 630 },
    { n: 'b', startMin: 570, endMin: 600 },
    { n: 'c', startMin: 600, endMin: 630 },
    { n: 'd', startMin: 720, endMin: 780 }
  ]).map((x) => [x.n, x.col, x.cols])`);
  assert.deepEqual(out, [['a', 0, 2], ['b', 1, 2], ['c', 1, 2], ['d', 0, 1]]);
});

test('the side list holds the open tasks without a time, in list order', async () => {
  const { get, call } = setup({});
  for (const n of ['A', 'B', 'C']) await call(`await addTask('${n}')`);
  await call(`await setBlock(${id('B')}, todayKey(), 600, 30); await toggleStar(${id('C')})`);
  assert.deepEqual(get('unscheduledTasks(todayKey()).map((t) => t.text)'), ['C', 'A']);
});

test('"Next free time" skips gaps too short for the task', async () => {
  const { get, call } = setup({});
  await call(`settings.workStart = '09:00'; settings.workEnd = '17:00'; await addTask('Short'); await addTask('Long')`);
  const day = get('shiftKey(todayKey(), 1)');
  await call(`await setBlock(${id('Short')}, '${day}', 570, 450)`); // 9:30 to 17:00, leaving 9:00 to 9:30
  assert.equal(get(`suggestStart('${day}', 15)`), 540);
  await call(`await setBlock(${id('Short')}, '${day}', 570, 60)`); // 9:30 to 10:30
  assert.equal(get(`suggestStart('${day}', 60)`), 630);
});

test('the Plan page names what is on now or next today', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Write'); await addTask('Read');
              await setBlock(${id('Write')}, todayKey(), 600, 60); await setBlock(${id('Read')}, todayKey(), 720, 30)`);
  assert.equal(get(`upNext(todayKey(), atDay(todayKey(), 610)).title`), 'Write');
  assert.equal(get(`upNext(todayKey(), atDay(todayKey(), 700)).title`), 'Read');
  assert.equal(get(`upNext(todayKey(), atDay(todayKey(), 800))`), null);
});
