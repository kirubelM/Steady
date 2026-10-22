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

test('"Show what\'s done" lists sessions, check-ins and logged work as spans, and finished things as points', async () => {
  const { get, call } = setup({});
  const at = (h, m) => `atDay(todayKey(), ${h * 60 + m})`;
  await call(`await addTask('Email vendor'); await setTaskDone(${id('Email vendor')}, true);
    data.tasks[0].doneAt = ${at(11, 5)};
    data.entries.push(
      { id: 's1', type: 'session', start: ${at(9, 0)}, end: ${at(9, 30)}, task: 'Report', focusSec: 1800 },
      { id: 'c1', type: 'checkin', start: ${at(10, 0)}, end: ${at(10, 30)}, note: 'Emails' },
      { id: 'm0', type: 'manual', start: ${at(12, 0)}, end: ${at(12, 0)}, note: 'Quick fix' },
      { id: 'b1', type: 'break', start: ${at(9, 30)}, end: ${at(9, 35)} },
      { id: 'y1', type: 'session', start: atDay(shiftKey(todayKey(), -1), 600), end: atDay(shiftKey(todayKey(), -1), 630) });`);
  const done = get(`doneOnDay(todayKey()).map((d) => [d.entry.id, d.point, Math.round(d.startMin), Math.round(d.endMin), doneTitle(d.entry)])`);
  assert.deepEqual(done.sort(), [
    ['c1', false, 600, 630, 'Emails'],
    ['m0', true, 720, 740, 'Quick fix'],
    ['s1', false, 540, 570, 'Report'],
    [`task:${get(id('Email vendor'))}`, true, 665, 685, 'Email vendor']
  ].sort());
});

test('"Move done items" moves a session, a finished task and a finished subtask, keeping lengths and never past now', async () => {
  const { get, call } = setup({});
  const day = get('shiftKey(todayKey(), -1)');
  const at = (m) => `atDay('${day}', ${m})`;
  await call(`await addTask('Report'); const t = data.tasks[0];
    t.subtasks = [{ id: 'x', text: 'Outline', done: true, doneAt: ${at(600)} }];
    await setTaskDone(t.id, true); t.doneAt = ${at(660)};
    data.entries.push({ id: 's1', type: 'session', start: ${at(540)}, end: ${at(570)}, focusSec: 1800 });`);
  await call(`await moveDoneItem('s1', ${at(615)})`);
  assert.deepEqual(get(`[data.entries[0].start - ${at(0)}, data.entries[0].end - ${at(0)}].map((ms) => ms / 60000)`), [615, 645]);
  await call(`await moveDoneItem('task:' + data.tasks[0].id, ${at(700)}); await moveDoneItem('subtask:' + data.tasks[0].id + ':x', ${at(500)})`);
  assert.equal(get(`(data.tasks[0].doneAt - ${at(0)}) / 60000`), 700);
  assert.equal(get(`(data.tasks[0].subtasks[0].doneAt - ${at(0)}) / 60000`), 500);
  await call(`data.entries.push({ id: 's2', type: 'session', start: Date.now() - 3600000, end: Date.now() - 1800000 });
    await moveDoneItem('s2', Date.now())`);
  assert.ok(get(`data.entries[1].end <= Date.now()`));
});

test('Ctrl+Shift dropping a task on another makes it a subtask, moving its sessions and subtasks along; Undo restores it', async () => {
  const { app, get, call } = setup({});
  await call(`await addTask('Launch'); await addTask('Write post');
    const child = ${id('Write post')};
    data.tasks.find((t) => t.id === child).subtasks = [{ id: 'd', text: 'Draft', done: false }];
    data.entries.push({ id: 's1', type: 'session', taskId: child, start: 1, end: 2, focusSec: 1 });
    await nestTask(child, ${id('Launch')});`);
  assert.deepEqual(get('data.tasks.map((t) => t.text)'), ['Launch']);
  assert.deepEqual(get('data.tasks[0].subtasks.map((s) => s.text)'), ['Write post', 'Draft']);
  assert.equal(get('data.entries[0].taskId'), get('data.tasks[0].id'));
  assert.equal(get('data.entries[0].subId'), get('data.tasks[0].subtasks[0].id'));
  assert.equal(get('nestKeys({ ctrlKey: true, shiftKey: true })'), true);
  assert.equal(get('nestKeys({ ctrlKey: true, shiftKey: false })'), false);
  const undo = app.nudges().at(-1);
  assert.equal(undo.action, 'Undo');
  await undo.fn();
  assert.deepEqual(get('data.tasks.map((t) => t.text).sort()'), ['Launch', 'Write post']);
  assert.equal(get(`data.tasks.find((t) => t.text === 'Launch').subtasks.length`), 0);
  assert.equal(get('data.entries[0].taskId'), get(id('Write post')));
});

test('a drag counts as "make it a subtask" when Ctrl+Shift were held as it began, even if the drag events lack the keys', () => {
  const { get, app } = setup({});
  assert.equal(get(`nestKeys({ type: 'dragover', ctrlKey: false, shiftKey: false })`), false);
  app.run(`heldKeys.atDragStart = true`);
  assert.equal(get(`nestKeys({ type: 'dragover', ctrlKey: false, shiftKey: false })`), true);
  assert.equal(get(`nestKeys({ type: 'drop' })`), true);
  app.run(`heldKeys.atDragStart = false`);
  assert.equal(get(`nestKeys({ type: 'drop', dataTransfer: { dropEffect: 'link' } })`), true);
  assert.equal(get(`nestKeys({ type: 'drop', dataTransfer: { dropEffect: 'move' } })`), false);
});

test('app insights add up each app across days, with stretches and longest run', () => {
  const app = loadApp();
  const out = app.run(`(() => {
    const m = atDay('2026-10-12', 0);
    const min = (n) => m + n * 60000;
    appDays.set('2026-10-12', { log: [[min(540), min(560), 'chrome.exe', 'Docs'], [min(560), min(570), 'chrome.exe', 'Docs'], [min(600), min(605), 'chrome.exe', 'Mail'], [min(570), min(575), 'code.exe', 'x']], at: Date.now() });
    appDays.set('2026-10-13', { log: [[atDay('2026-10-13', 0) + 60000, atDay('2026-10-13', 0) + 6 * 60000, 'chrome.exe', 'Docs']], at: Date.now() });
    const u = appUsage(['2026-10-12', '2026-10-13']);
    return JSON.stringify(u.rows.map((r) => [r.name, Math.round(r.sec / 60), r.stretches, Math.round(r.longest / 60)]));
  })()`);
  const rows = JSON.parse(out);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 40); // 30 + 5 on the 12th, 5 on the 13th
  assert.equal(rows[0][2], 3);  // 9:00-9:30 run, 10:00 run, 13th run
  assert.equal(rows[0][3], 30);
});
