// 1.12: planned vs. done, missed blocks, typing a time, the week view and block reminders.
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

/* ---------- Typing a time ---------- */

test('a time typed with a task is pulled out of its text', () => {
  const { get } = setup({});
  const parse = (t) => get(`parseTaskTime(${JSON.stringify(t)})`);
  assert.deepEqual(parse('Write report 2pm 1h'), { text: 'Write report', startMin: 840, mins: 60 });
  assert.deepEqual(parse('Standup 9:15am for 15 min'), { text: 'Standup', startMin: 555, mins: 15 });
  assert.deepEqual(parse('Design review 2-3:30pm'), { text: 'Design review', startMin: 840, mins: 90 });
  assert.deepEqual(parse('Lunch with Sam at noon'), { text: 'Lunch with Sam', startMin: 720, mins: 0 });
  assert.deepEqual(parse('Read at 3'), { text: 'Read', startMin: 900, mins: 0 }); // a bare 3 means the afternoon
  assert.deepEqual(parse('Budget 14:00 2 hours'), { text: 'Budget', startMin: 840, mins: 120 });
  assert.deepEqual(parse('Fix bug 1h30m 3pm'), { text: 'Fix bug', startMin: 900, mins: 90 });
});

test('numbers that are not times stay part of the task', () => {
  const { get } = setup({});
  assert.equal(get(`parseTaskTime('Call 3 vendors')`), null);
  assert.equal(get(`parseTaskTime('Chapter 2-3 notes')`), null);
  assert.equal(get(`parseTaskTime('Write 1h')`), null); // a length alone isn't a time
  assert.equal(get(`parseTaskTime('2pm')`), null); // nothing left to call the task
  assert.deepEqual(get(`parseTaskTime('Review 3 PRs 4pm')`), { text: 'Review 3 PRs', startMin: 960, mins: 0 });
});

/* ---------- Missed blocks ---------- */

test('a block that ended unfinished is missed, and can move to the next free time or tomorrow', async () => {
  const { get, call } = setup({ settings: { workStart: '00:00', workEnd: '23:59' } });
  await call(`await addTask('Report'); await addTask('Done one');
    const now = new Date(); window.__min = now.getHours() * 60 + now.getMinutes();
    data.tasks[0].block = { day: todayKey(), startMin: Math.max(0, __min - 120), mins: 30 };
    data.tasks[1].block = { day: todayKey(), startMin: Math.max(0, __min - 120), mins: 30 }; data.tasks[1].done = true;`);
  assert.deepEqual(get('missedBlocks().map((b) => b.task.text)'), __minOk(get) ? ['Report'] : []);
  await call(`await rescheduleBlock(${id('Report')}, 'tomorrow')`);
  assert.equal(get('data.tasks[0].block.day'), get('shiftKey(todayKey(), 1)'));
  assert.equal(get('data.tasks[0].day'), get('shiftKey(todayKey(), 1)'));
  assert.deepEqual(get('missedBlocks()'), []);
});
function __minOk(get) { return get('__min') >= 120; } // the block must have ended earlier today

test('"next free time" picks the first gap long enough, or tomorrow when today is full', async () => {
  const { get, call } = setup({ settings: { workStart: '00:00', workEnd: '00:30' } });
  await call(`await addTask('Report'); data.tasks[0].block = { day: todayKey(), startMin: 0, mins: 60 };
    await rescheduleBlock(${id('Report')}, 'next')`);
  // The workday is already over (it ended at 00:30), so it goes to tomorrow's first free slot.
  assert.equal(get('data.tasks[0].block.day'), get('shiftKey(todayKey(), 1)'));
  assert.equal(get('data.tasks[0].block.startMin'), 0);
});

/* ---------- Reminders and starting on time ---------- */

test('a heads-up comes 5 minutes before a block, once', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Report'); api.notify = (t) => (globalThis.__notes = [...(globalThis.__notes || []), t]);
    data.tasks[0].block = { day: todayKey(), startMin: 600, mins: 30 };
    blockTick(atDay(todayKey(), 595) + 1000); blockTick(atDay(todayKey(), 595) + 20000);`);
  assert.deepEqual(get('globalThis.__notes'), ['"Report" starts at ' + get('fmtTime(atDay(todayKey(), 600))')]);
  await call(`settings.blockHeadsUp = false; blockNotified.clear(); globalThis.__notes = [];
    blockTick(atDay(todayKey(), 595) + 1000)`);
  assert.deepEqual(get('globalThis.__notes'), []);
});

test('with auto-start on, a block starts its focus session when nothing else is running', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Report'); globalThis.__started = [];
    startTask = (tid) => __started.push(tid); settings.blockAutoStart = true;
    data.tasks[0].block = { day: todayKey(), startMin: 600, mins: 30 };
    blockTick(atDay(todayKey(), 600) + 1000)`);
  assert.deepEqual(get('__started'), [get(id('Report'))]);
  await call(`blockNotified.clear(); __started.length = 0; S.state = 'focus';
    blockTick(atDay(todayKey(), 600) + 1000)`);
  assert.deepEqual(get('__started'), []); // never interrupts a session
});

/* ---------- Plan vs. done ---------- */

test('plan vs. done counts scheduled tasks, finished ones and focus spent on each', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Write'); await addTask('Read'); await addTask('Unscheduled');
    data.tasks[0].block = { day: todayKey(), startMin: 540, mins: 60 };
    data.tasks[1].block = { day: todayKey(), startMin: 660, mins: 30 };
    data.tasks[0].done = true; data.tasks[0].doneAt = atDay(todayKey(), 600);
    data.entries.push({ id: 'e1', type: 'session', taskId: data.tasks[0].id, start: atDay(todayKey(), 545), end: atDay(todayKey(), 575), focusSec: 1500 },
                      { id: 'e2', type: 'manual', start: atDay(todayKey(), 700), end: atDay(todayKey(), 720), note: 'Email' });`);
  const pvd = get(`(() => { const r = planVsDone(todayKey()); return { names: r.scheduled.map((s) => [s.task.text, s.done, s.sec]), planned: r.plannedSec, worked: r.workedSec, done: r.doneCount }; })()`);
  assert.deepEqual(pvd, { names: [['Write', true, 1500], ['Read', false, 0]], planned: 5400, worked: 2700, done: 1 });
});

/* ---------- Week view ---------- */

test('the week runs Monday to Sunday around any day', () => {
  const { get } = setup({});
  assert.deepEqual(get(`weekOf('2026-10-21')`), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(get(`weekOf('2026-10-25')[0]`), '2026-10-19');
  assert.equal(get(`weekOf('2026-10-26')[0]`), '2026-10-26');
});
