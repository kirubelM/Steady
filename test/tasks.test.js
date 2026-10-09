// The To do list: adding, ordering, filtering and sorting, subtasks and repeating tasks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

// Values cross from the sandbox as JSON so they compare like plain objects.
function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}
const texts = (get) => get('viewTasks(tasksFor(todayKey())).map((t) => t.text)');

async function withTasks(names, extra = {}) {
  const t = setup(extra);
  for (const n of names) await t.call(`await addTask(${JSON.stringify(n)})`);
  return t;
}

test('adding tasks keeps them in the order added and saves them', async () => {
  const { get, app } = await withTasks(['A', 'B', 'C']);
  assert.deepEqual(texts(get), ['A', 'B', 'C']);
  assert.ok(app.saved.some((p) => p.tasks && p.tasks.length === 3));
});

test('dragging a task before or after another', async () => {
  const { get, call } = await withTasks(['A', 'B', 'C', 'D']);
  const id = (n) => `data.tasks.find((t) => t.text === '${n}').id`;
  await call(`await placeTask(${id('D')}, ${id('A')}, false)`);
  assert.deepEqual(texts(get), ['D', 'A', 'B', 'C']);
  await call(`await placeTask(${id('D')}, ${id('C')}, true)`);
  assert.deepEqual(texts(get), ['A', 'B', 'C', 'D']);
  await call(`await placeTask(${id('A')}, ${id('A')}, true)`); // onto itself: nothing changes
  assert.deepEqual(texts(get), ['A', 'B', 'C', 'D']);
});

test('Alt+Up / Alt+Down move one step and stop at the ends', async () => {
  const { get, call } = await withTasks(['A', 'B', 'C']);
  const id = (n) => `data.tasks.find((t) => t.text === '${n}').id`;
  await call(`await moveTask(${id('C')}, -1)`);
  assert.deepEqual(texts(get), ['A', 'C', 'B']);
  await call(`await moveTask(${id('A')}, -1)`);
  assert.deepEqual(texts(get), ['A', 'C', 'B']);
  await call(`await moveTask(${id('B')}, 1)`);
  assert.deepEqual(texts(get), ['A', 'C', 'B']);
});

test('finished tasks always come after open ones', async () => {
  const { get, call } = await withTasks(['A', 'B', 'C']);
  await call(`await setTaskDone(data.tasks.find((t) => t.text === 'A').id, true)`);
  assert.deepEqual(texts(get), ['B', 'C', 'A']);
});

test('filtering by project, no project, and hiding finished tasks', async () => {
  const { get, call } = setup({ projects: [{ id: 'p1', name: 'Client', color: '#123456' }] });
  await call(`await addTask('With project', 0, todayKey(), 'p1')`);
  await call(`await addTask('Loose')`);
  await call(`await addTask('Done one', 0, todayKey(), 'p1')`);
  await call(`await setTaskDone(data.tasks.find((t) => t.text === 'Done one').id, true)`);
  await call(`taskView.project = 'p1'`);
  assert.deepEqual(texts(get), ['With project', 'Done one']);
  await call(`taskView.project = 'none'`);
  assert.deepEqual(texts(get), ['Loose']);
  await call(`taskView.project = 'all'; taskView.hideDone = true`);
  assert.deepEqual(texts(get), ['With project', 'Loose']);
});

test('sorting by name, sessions left, progress and newest', async () => {
  const { get, call } = setup({});
  await call(`await addTask('banana', 1)`);
  await call(`await addTask('Apple', 4)`);
  await call(`await addTask('cherry', 2)`);
  await call(`data.tasks.forEach((t, i) => { t.createdAt = 1000 + i; })`);
  // Two of cherry's four subtasks are done: 50% progress. Apple has no progress yet.
  await call(`data.tasks.find((t) => t.text === 'cherry').subtasks = [{ id: 'a', text: 'a', done: true }, { id: 'b', text: 'b', done: false }]`);
  await call(`taskView.sort = 'name'`);
  assert.deepEqual(texts(get), ['Apple', 'banana', 'cherry']);
  await call(`taskView.sort = 'left'`);
  assert.deepEqual(texts(get), ['Apple', 'cherry', 'banana']);
  await call(`taskView.sort = 'progress'`);
  assert.deepEqual(texts(get).slice(-1), ['cherry']);
  await call(`taskView.sort = 'newest'`);
  assert.deepEqual(texts(get), ['cherry', 'Apple', 'banana']);
});

test('task progress comes from subtasks first, then sessions against the estimate', async () => {
  const { get, call } = await withTasks(['T']);
  await call(`window.__t = data.tasks[0]`);
  assert.equal(get('taskProgress(__t)'), null);
  await call(`__t.est = 2; data.entries.push({ type: 'session', taskId: __t.id, start: Date.now(), focusSec: 1500 })`);
  assert.equal(get('taskProgress(__t)'), 0.5);
  await call(`data.entries.push({ type: 'session', taskId: __t.id, start: Date.now(), focusSec: 1500 }, { type: 'session', taskId: __t.id, start: Date.now(), focusSec: 1500 })`);
  assert.equal(get('taskProgress(__t)'), 1); // capped
  await call(`__t.subtasks = [{ id: 'a', text: 'a', done: true }, { id: 'b', text: 'b', done: false }, { id: 'c', text: 'c', done: false }, { id: 'd', text: 'd', done: false }]`);
  assert.equal(get('taskProgress(__t)'), 0.25);
});

test('finishing a leftover task moves it to today', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Old', 0, shiftKey(todayKey(), -2))`);
  await call(`await setTaskDone(data.tasks[0].id, true)`);
  assert.equal(get('data.tasks[0].day === todayKey()'), true);
});

test('subtasks: ticking the last one offers to finish the task', async () => {
  const { get, call, app } = await withTasks(['Report']);
  await call(`window.__id = data.tasks[0].id; await addSubtask(__id, 'Draft'); await addSubtask(__id, 'Send')`);
  assert.deepEqual(get('data.tasks[0].subtasks.map((s) => s.text)'), ['Draft', 'Send']);
  await call(`await setSubtaskDone(__id, data.tasks[0].subtasks[0].id, true)`);
  assert.equal(app.nudges().length, 0);
  await call(`await setSubtaskDone(__id, data.tasks[0].subtasks[1].id, true)`);
  const nudge = app.nudges().at(-1);
  assert.match(nudge.text, /All subtasks of "Report" are done/);
  assert.equal(nudge.action, 'Mark task done');
  await nudge.fn();
  assert.equal(get('data.tasks[0].done'), true);
});

test('subtasks: blank ones are ignored', async () => {
  const { get, call } = await withTasks(['T']);
  await call(`await addSubtask(data.tasks[0].id, '   ')`);
  assert.equal(get('(data.tasks[0].subtasks || []).length'), 0);
});

test('repeating tasks bring their subtasks back unticked, once per day', async () => {
  const { get, call } = await withTasks(['Standup notes']);
  await call(`window.__t = data.tasks[0]; __t.subtasks = [{ id: 's1', text: 'Yesterday', done: true }, { id: 's2', text: 'Today', done: false }]`);
  await call(`await setRepeat(__t, 'daily')`);
  assert.deepEqual(get('recurById(__t.recurId).subtasks'), ['Yesterday', 'Today']);
  const tomorrow = get('shiftKey(todayKey(), 1)');
  await call(`materializeDay('${tomorrow}'); materializeDay('${tomorrow}')`);
  const copies = get(`data.tasks.filter((t) => t.recurId === __t.recurId && t.day === '${tomorrow}')`);
  assert.equal(copies.length, 1);
  assert.deepEqual(copies[0].subtasks.map((s) => [s.text, s.done]), [['Yesterday', false], ['Today', false]]);
  assert.equal(get('__t.subtasks[0].done'), true); // today's ticks are untouched
});

test('weekday repeats skip the weekend', async () => {
  const { get, call } = await withTasks(['Inbox']);
  await call(`await setRepeat(data.tasks[0], 'weekdays')`);
  // Find the next Saturday and Monday.
  const keys = get(`(() => { let k = shiftKey(todayKey(), 1); const out = {}; for (let i = 0; i < 8; i++) { const wd = new Date(k + 'T12:00').getDay(); if (wd === 6 && !out.sat) out.sat = k; if (wd === 1 && !out.mon) out.mon = k; k = shiftKey(k, 1); } return out; })()`);
  await call(`materializeDay('${keys.sat}'); materializeDay('${keys.mon}')`);
  assert.equal(get(`data.tasks.filter((t) => t.day === '${keys.sat}').length`), 0);
  assert.equal(get(`data.tasks.filter((t) => t.day === '${keys.mon}').length`), 1);
});
