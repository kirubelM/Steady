// 1.6: due dates and priority, time blocks, Plan my day, the next-task prompt, session goals and the welcome.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}
const texts = (get) => get('viewTasks(tasksFor(todayKey())).map((t) => t.text)');
const id = (name) => `data.tasks.find((t) => t.text === '${name}').id`;

/* ---------- Due dates and priority ---------- */

test('due dates read naturally relative to today', () => {
  const { get } = setup({});
  const status = (offset) => get(`dueStatus({ due: shiftKey(todayKey(), ${offset}) })`);
  assert.equal(status(-1).label, 'Overdue by a day');
  assert.equal(status(-3).label, 'Overdue by 3 days');
  assert.equal(status(0).label, 'Due today');
  assert.equal(status(1).label, 'Due tomorrow');
  assert.equal(status(3).kind, 'soon');
  assert.equal(status(20).kind, 'later');
  assert.equal(get(`dueStatus({ due: shiftKey(todayKey(), -1), done: true })`), null);
  assert.equal(get('dueStatus({})'), null);
});

test('in My order, starred and overdue tasks float to the top, keeping your order otherwise', async () => {
  const { get, call } = setup({});
  for (const n of ['A', 'B', 'C', 'D']) await call(`await addTask('${n}')`);
  await call(`await toggleStar(${id('C')})`);
  await call(`data.tasks.find((t) => t.text === 'D').due = shiftKey(todayKey(), -2)`);
  assert.deepEqual(texts(get), ['C', 'D', 'A', 'B']);
  await call(`await toggleStar(${id('C')})`);
  assert.deepEqual(texts(get), ['D', 'A', 'B', 'C']);
});

test('the Priority sort puts starred first, then the soonest due date', async () => {
  const { get, call } = setup({});
  for (const n of ['No date', 'Next week', 'Tomorrow', 'Starred']) await call(`await addTask('${n}')`);
  await call(`data.tasks.find((t) => t.text === 'Next week').due = shiftKey(todayKey(), 7);
              data.tasks.find((t) => t.text === 'Tomorrow').due = shiftKey(todayKey(), 1);
              data.tasks.find((t) => t.text === 'Starred').starred = true;
              taskView.sort = 'priority';`);
  assert.deepEqual(texts(get), ['Starred', 'Tomorrow', 'Next week', 'No date']);
});

/* ---------- Time blocks ---------- */

test('blocking time snaps to 15 minutes, moves the task to that day and sizes itself', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Write', 2)`); // two 30-minute sessions with a 5-minute break between
  const day = get('shiftKey(todayKey(), 2)');
  await call(`await setBlock(${id('Write')}, '${day}', 9 * 60 + 7, 0)`);
  assert.deepEqual(get(`data.tasks[0].block`), { day, startMin: 540, mins: 65 });
  assert.equal(get('data.tasks[0].day'), day);
});

test('blocks stay inside the day and within sensible lengths', async () => {
  const { get, call } = setup({});
  await call(`await addTask('Late')`);
  await call(`await setBlock(${id('Late')}, todayKey(), 23 * 60 + 50, 60)`);
  assert.deepEqual(get('data.tasks[0].block.startMin + data.tasks[0].block.mins <= 1440'), true);
  await call(`await setBlock(${id('Late')}, todayKey(), 600, 5)`);
  assert.equal(get('data.tasks[0].block.mins'), 15);
  await call(`await unblockTask(${id('Late')})`);
  assert.equal(get('data.tasks[0].block'), null);
});

test('blocked time is no longer counted as free, and finished tasks free it again', async () => {
  const { get, call } = setup({ settings: { workStart: '09:00', workEnd: '17:00' } });
  const day = get('shiftKey(todayKey(), 3)');
  await call(`await addTask('Deep work', 0, '${day}')`);
  await call(`await setBlock(${id('Deep work')}, '${day}', 600, 120)`);
  const free = () => get(`freeBlocks('${day}').map(([a, b]) => [(a - atDay('${day}', 0)) / 60000, (b - atDay('${day}', 0)) / 60000])`);
  assert.deepEqual(free(), [[540, 600], [720, 1020]]);
  await call(`data.tasks[0].done = true`);
  assert.deepEqual(free(), [[540, 1020]]);
});

test('a block starting now sends one reminder offering to start the task', async () => {
  const { get, call, app } = setup({});
  await call(`await addTask('Report')`);
  await call(`window.__now = new Date(); window.__min = __now.getHours() * 60 + __now.getMinutes();
              data.tasks[0].block = { day: todayKey(), startMin: __min, mins: 30 }`);
  await call('blockTick(atDay(todayKey(), __min) + 5000); blockTick(atDay(todayKey(), __min) + 9000)');
  const reminders = app.nudges().filter((n) => /time for "Report"/.test(n.text));
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].action, 'Start focus');
});

/* ---------- Plan my day ---------- */

test('Plan my day gathers leftovers, tasks due soon planned for later, and parked thoughts', async () => {
  const { get, call } = setup({ parking: [{ id: 'p1', text: 'Call Sam', done: false }, { id: 'p2', text: 'Old', done: true }] });
  await call(`await addTask('Leftover', 0, shiftKey(todayKey(), -1))`);
  await call(`await addTask('Due tomorrow', 0, shiftKey(todayKey(), 5)); data.tasks.find((t) => t.text === 'Due tomorrow').due = shiftKey(todayKey(), 1)`);
  await call(`await addTask('Someday', 0, shiftKey(todayKey(), 5))`);
  const c = get('planCandidates().map((x) => [x.kind, x.text, x.urgent])');
  assert.deepEqual(c, [['task', 'Leftover', false], ['task', 'Due tomorrow', true], ['parking', 'Call Sam', false]]);
});

test('suggestions fit the free time, but urgent items are always included', () => {
  const { get } = setup({});
  const cands = JSON.stringify([
    { kind: 'task', id: 'a', mins: 60, urgent: false },
    { kind: 'parking', id: 'b', mins: 30, urgent: false },
    { kind: 'task', id: 'c', mins: 90, urgent: true },
    { kind: 'task', id: 'd', mins: 60, urgent: false }
  ]);
  const pick = (budget) => get(`[...suggestPlan(${cands}, ${budget}).picked]`);
  assert.deepEqual(pick(160), ['task:c', 'task:a']); // urgent first, then the first leftover that fits
  assert.deepEqual(pick(0), ['task:c']);
  assert.deepEqual(pick(500), ['task:c', 'task:a', 'task:d', 'parking:b']);
});

/* ---------- After a break ---------- */

test('after a break, the task you were on is offered again, otherwise the top of the list', async () => {
  const { get, call } = setup({});
  await call(`await addTask('First'); await addTask('Second')`);
  assert.equal(get('nextTaskAfterBreak().text'), 'First');
  await call(`data.entries.push({ type: 'session', taskId: ${id('Second')}, start: Date.now() })`);
  assert.equal(get('nextTaskAfterBreak().text'), 'Second');
  await call(`await setTaskDone(${id('Second')}, true)`);
  assert.equal(get('nextTaskAfterBreak().text'), 'First');
});

test('the break prompt only offers; turning it off falls back to a plain message', async () => {
  const { call, app } = setup({});
  await call(`await addTask('Write')`);
  await call(`promptNextTask(false)`);
  let n = app.nudges().at(-1);
  assert.match(n.text, /Break over\. Ready to start "Write"\?/);
  assert.equal(n.action, 'Start focus');
  assert.equal(app.run('S.state'), 'idle'); // nothing started on its own
  await call(`settings.nextPrompt = false; promptNextTask(true)`);
  n = app.nudges().at(-1);
  assert.equal(n.text, 'Break skipped. What is next?');
  assert.equal(n.action, undefined);
});

/* ---------- Session goals ---------- */

test('session goal stats count reached and partly reached goals', () => {
  const { get } = setup({});
  const entries = JSON.stringify([
    { type: 'session', goal: 'Draft intro', goalHit: 'yes' },
    { type: 'session', goal: 'Outline', goalHit: 'partly' },
    { type: 'session', goal: 'Send', goalHit: 'no' },
    { type: 'session' },
    { type: 'manual', goal: 'ignored', goalHit: 'yes' }
  ]);
  assert.deepEqual(get(`goalStats(${entries})`), { set: 3, hit: 1, partly: 1 });
});

/* ---------- Welcome ---------- */

test('the welcome shows on a fresh install only', () => {
  assert.equal(setup({}).get('shouldWelcome()'), true);
  const existing = setup({ entries: [{ type: 'session', start: 1 }] });
  assert.equal(existing.get('shouldWelcome()'), false);
  assert.equal(existing.get('data.meta.welcomed'), true); // and never again
  assert.equal(setup({ meta: { welcomed: true } }).get('shouldWelcome()'), false);
});

test('finishing the welcome twice still adds the project and task once', async () => {
  const { get, call } = setup({});
  await call(`$('welcomeProject').value = 'Client A'; $('welcomeTask').value = 'Draft the proposal'`);
  await call(`await Promise.all([finishWelcome(false), finishWelcome(false)]); await finishWelcome(true)`);
  assert.deepEqual(get('data.tasks.map((t) => t.text)'), ['Draft the proposal']);
  assert.deepEqual(get('data.projects.map((p) => p.name)'), ['Client A']);
  assert.equal(get('data.meta.welcomed'), true);
});
