// Blocked tasks (waiting on another task, or on someone or something else) and changing several tasks at once.
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
const add = async (call, ...names) => { for (const n of names) await call(`await addTask('${n}')`); };

/* ---------- Blocked by ---------- */

test('a task is blocked while a task it waits on is open, or while it waits on something else; finishing the blocker frees it', async () => {
  const { get, call } = setup({});
  await add(call, 'Get PO', 'Order parts', 'Call Sam');
  await call(`await blockTasks([${id('Order parts')}], ${id('Get PO')}); await setWaiting([${id('Call Sam')}], "Dana's pricing")`);
  assert.deepEqual(get(`data.tasks.map((t) => [t.text, isBlocked(t)])`), [['Get PO', false], ['Order parts', true], ['Call Sam', true]]);
  assert.equal(get(`waitingOn(data.tasks[2])`), "Dana's pricing");
  assert.deepEqual(get(`dependentsOf(${id('Get PO')}).map((t) => t.text)`), ['Order parts']);
  await call(`await setTaskDone(${id('Get PO')}, true)`);
  assert.equal(get(`isBlocked(data.tasks[1])`), false); // its blocker is done
  assert.equal(get(`isBlocked(data.tasks[2])`), true); // waiting on a person stays until cleared
  await call(`await setTaskDone(${id('Get PO')}, false)`);
  assert.equal(get(`isBlocked(data.tasks[1])`), true); // un-finishing it blocks again
});

test('a task cannot wait on itself or on something that waits on it', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`await blockTasks([${id('B')}], ${id('A')}); await blockTasks([${id('C')}], ${id('B')}); await blockTasks([${id('A')}], ${id('C')}); await blockTasks([${id('A')}], ${id('A')})`);
  assert.deepEqual(get(`data.tasks.map((t) => t.blockedBy ? t.blockedBy.length : 0)`), [0, 1, 1]);
  assert.equal(get(`wouldCycle(${id('A')}, ${id('C')})`), true);
  assert.equal(get(`wouldCycle(${id('C')}, ${id('A')})`), false);
  assert.match(app.nudges().at(-1).text, /can't wait on itself/);
});

test('adding a block can be undone, and blocking several tasks at once skips the blocker itself', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`await blockTasks([${id('A')}, ${id('B')}, ${id('C')}], ${id('A')})`);
  assert.deepEqual(get(`data.tasks.map((t) => (t.blockedBy || []).length)`), [0, 1, 1]);
  assert.match(app.nudges().at(-1).text, /2 tasks are now blocked by "A"\. 1 task can't wait on itself/);
  await app.run('__nudges.at(-1).fn()');
  assert.deepEqual(get(`data.tasks.map((t) => t.blockedBy || null)`), [null, null, null]);
});

test('finishing a blocker says what it freed, offering to start the one task that is free', async () => {
  const { app, call } = setup({});
  await add(call, 'Get PO', 'Order parts', 'Pack', 'Ship');
  await call(`await blockTasks([${id('Order parts')}, ${id('Pack')}], ${id('Get PO')}); await blockTasks([${id('Ship')}], ${id('Pack')})`);
  await call(`await setTaskDone(${id('Get PO')}, true)`);
  assert.match(app.nudges().at(-1).text, /2 tasks are no longer blocked: "Order parts", "Pack"/);
  await call(`await setTaskDone(${id('Pack')}, true)`);
  const n = app.nudges().at(-1);
  assert.equal(n.text, '"Ship" is no longer blocked.');
  assert.equal(n.action, 'Focus on it');
});

test('deleting a task frees what waited on it, and Undo restores both', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B');
  await call(`await blockTasks([${id('B')}], ${id('A')}); await deleteTaskUndoable(${id('A')})`);
  assert.equal(get(`data.tasks.length`), 1);
  assert.equal(get(`data.tasks[0].blockedBy || null`), null);
  await app.run('__nudges.at(-1).fn()');
  assert.deepEqual(get(`data.tasks.map((t) => t.text).sort()`), ['A', 'B']);
  assert.equal(get(`data.tasks.find((t) => t.text === 'B').blockedBy.length`), 1);
});

test('the editor keeps blocks as a working copy until Save, and drops ones that would loop', async () => {
  const { get, call } = setup({});
  await add(call, 'A', 'B');
  await call(`await blockTasks([${id('A')}], ${id('B')})`);
  await call(`const b = data.tasks.find((t) => t.text === 'B'); editingBlocks = { ids: [${id('A')}], waiting: ' Legal review ' };
    saveEditBlocks(b);`); // B waiting on A, which already waits on B: a loop
  assert.equal(get(`data.tasks[1].blockedBy || null`), null);
  assert.equal(get(`data.tasks[1].waitingOn`), 'Legal review');
  await call(`const a = data.tasks[0]; editingBlocks = { ids: [], waiting: '' }; saveEditBlocks(a)`);
  assert.deepEqual(get(`[data.tasks[0].blockedBy || null, data.tasks[0].waitingOn || null]`), [null, null]);
});

test('"Up next" and the after-break suggestion skip blocked tasks', async () => {
  const { get, call } = setup({});
  await add(call, 'Blocked one', 'Free one');
  await call(`await setWaiting([${id('Blocked one')}], 'a reply')`);
  assert.equal(get('nextTaskAfterBreak().text'), 'Free one');
  await call(`await clearBlocks([${id('Blocked one')}])`);
  assert.equal(get('nextTaskAfterBreak().text'), 'Blocked one');
});

test('Schedule my day puts a blocked task after what it waits on, and leaves unplaceable ones without a time', async () => {
  const { get, call } = setup({});
  const day = get('shiftKey(todayKey(), 1)');
  await call(`settings.workStart = '09:00'; settings.workEnd = '12:00'; eventsOn = () => [];
    settings.presets = [{ id: 'p', name: 'P', focusMin: 30, breakMin: 5 }]; settings.presetId = 'p';
    for (const n of ['C', 'A', 'B', 'D', 'E']) await addTask(n, 0, '${day}');
    await blockTasks([${id('C')}], ${id('A')});   // C waits on A, which is placed first
    await setWaiting([${id('D')}], 'a reply');    // D waits on a person
    await blockTasks([${id('E')}], ${id('D')});   // E waits on D, which never gets a time
    globalThis.__r = await scheduleDay('${day}')`);
  const at = get(`Object.fromEntries(data.tasks.map((t) => [t.text, t.block ? t.block.startMin : null]))`);
  assert.deepEqual(at, { A: 540, B: 570, C: 600, D: null, E: null }); // C ran after A, not first
  assert.deepEqual(get('__r.waiting.map((t) => t.text).sort()'), ['D', 'E']);
});

/* ---------- Changing several tasks at once ---------- */

test('a range runs between two tasks whichever way you click, and a stray id picks only itself', () => {
  const { get } = setup({});
  assert.deepEqual(get(`rangeIds(['a', 'b', 'c', 'd', 'e'], 'b', 'd')`), ['b', 'c', 'd']);
  assert.deepEqual(get(`rangeIds(['a', 'b', 'c', 'd', 'e'], 'd', 'b')`), ['b', 'c', 'd']);
  assert.deepEqual(get(`rangeIds(['a', 'b'], 'zz', 'b')`), ['b']);
  assert.deepEqual(get(`rangeIds(['a', 'b'], 'a', 'zz')`), []);
});

test('changing several tasks saves once and one Undo puts every one of them back', async () => {
  const { get, call, app } = setup({ projects: [{ id: 'p1', name: 'Client', color: '#000' }] });
  await add(call, 'A', 'B', 'C');
  await call(`data.tasks[0].est = 2; data.tasks[1].starred = true`);
  const saves = app.saved.length;
  await call(`await bulkSetProject(data.tasks.map((t) => t.id), 'p1')`);
  assert.equal(app.saved.length, saves + 1);
  assert.deepEqual(get(`data.tasks.map((t) => t.projectId)`), ['p1', 'p1', 'p1']);
  assert.match(app.nudges().at(-1).text, /3 tasks set to Client\./);
  await app.run('__nudges.at(-1).fn()');
  assert.deepEqual(get(`data.tasks.map((t) => [t.projectId, t.est, !!t.starred])`), [[null, 2, false], [null, 0, true], [null, 0, false]]);
});

test('bulk estimate, due date and star change only what needs changing', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B');
  await call(`data.tasks[0].starred = true; await bulkSetEst(data.tasks.map((t) => t.id), 3); await bulkSetDue(data.tasks.map((t) => t.id), '2030-01-05')`);
  assert.deepEqual(get(`data.tasks.map((t) => [t.est, t.due])`), [[3, '2030-01-05'], [3, '2030-01-05']]);
  await call(`await bulkToggleStar(data.tasks.map((t) => t.id))`); // one is starred, so everything gets starred
  assert.deepEqual(get(`data.tasks.map((t) => t.starred)`), [true, true]);
  assert.match(app.nudges().at(-1).text, /Starred 1 task\./);
  await call(`await bulkToggleStar(data.tasks.map((t) => t.id))`); // all starred: unstar
  assert.deepEqual(get(`data.tasks.map((t) => !!t.starred)`), [false, false]);
  await call(`await bulkSetDue(data.tasks.map((t) => t.id), null)`);
  assert.deepEqual(get(`data.tasks.map((t) => t.due)`), [null, null]);
});

test('moving several tasks to another day drops a time left behind and puts them at the end', async () => {
  const { get, call } = setup({});
  await add(call, 'A', 'B', 'C');
  const tomorrow = get('shiftKey(todayKey(), 1)');
  await call(`await addTask('Existing', 0, '${tomorrow}'); await setBlock(${id('A')}, todayKey(), 600, 30);
    await bulkMoveDay([${id('A')}, ${id('B')}], '${tomorrow}')`);
  assert.deepEqual(get(`tasksFor('${tomorrow}').map((t) => t.text)`), ['Existing', 'A', 'B']);
  assert.equal(get(`data.tasks.find((t) => t.text === 'A').block`), null);
  assert.deepEqual(get(`tasksFor(todayKey()).map((t) => t.text)`), ['C']);
});

test('marking several tasks done reports what that freed, and Undo reopens them', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`await blockTasks([${id('C')}], ${id('A')}); await bulkDone([${id('A')}, ${id('B')}])`);
  assert.deepEqual(get(`data.tasks.map((t) => t.done)`), [true, true, false]);
  assert.match(app.nudges().at(-1).text, /Marked 2 tasks done\. "C" is no longer blocked\./);
  await app.run('__nudges.at(-1).fn()');
  assert.deepEqual(get(`data.tasks.map((t) => [t.done, t.doneAt])`), [[false, null], [false, null], [false, null]]);
});

test('deleting several tasks takes them out of other tasks\' blocks, and Undo brings it all back', async () => {
  const { get, call, app } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`await blockTasks([${id('C')}], ${id('A')}); await bulkDelete([${id('A')}, ${id('B')}])`);
  assert.deepEqual(get(`data.tasks.map((t) => [t.text, t.blockedBy || null])`), [['C', null]]);
  await app.run('__nudges.at(-1).fn()');
  assert.deepEqual(get(`data.tasks.map((t) => t.text).sort()`), ['A', 'B', 'C']);
  assert.equal(get(`data.tasks.find((t) => t.text === 'C').blockedBy.length`), 1);
});

test('what is picked is dropped when a task leaves the list', async () => {
  const { get, call } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`sel.on = true; data.tasks.forEach((t) => sel.ids.add(t.id)); sel.ids.add('gone'); await setTaskDone(${id('B')}, true); renderBulk();`);
  assert.deepEqual(get(`[...sel.ids].length`), 2); // A and C: B is finished, and "gone" never existed
});

/* ---------- Asking before finishing something that's still blocked ---------- */

// Replaces the question with a fixed answer and records what was asked.
const answering = (app, answer) => app.run(`globalThis.__asked = []; askBlockedDone = async (entries, opts) => { __asked.push([entries, opts]); return ${JSON.stringify(answer)}; };`);

test('finishing a free task never asks', async () => {
  const { app, get, call } = setup({});
  await add(call, 'A', 'B');
  answering(app, 'cancel');
  await call(`await requestDone(${id('A')})`);
  assert.equal(get('data.tasks[0].done'), true);
  assert.deepEqual(get('__asked'), []);
});

test('finishing a blocked task asks first, saying what holds it up, and "Not yet" leaves it open', async () => {
  const { app, get, call } = setup({});
  await add(call, 'Get pricing', 'Order parts');
  await call(`await blockTasks([${id('Order parts')}], ${id('Get pricing')}); await setWaiting([${id('Order parts')}], 'the PO')`);
  answering(app, 'cancel');
  await call(`await requestDone(${id('Order parts')})`);
  assert.equal(get(`data.tasks[1].done`), false);
  assert.deepEqual(get('__asked[0][0]'), [{ text: 'Order parts', reason: 'blocked by "Get pricing" and waiting on the PO' }]);
  assert.equal(get('__asked[0][1].canSkip'), false); // one task: nothing to skip
  answering(app, 'anyway');
  await call(`await requestDone(${id('Order parts')})`);
  assert.equal(get(`data.tasks[1].done`), true);
  assert.deepEqual(get(`data.tasks[1].blockedBy.length`), 1); // the block stays on record if it's reopened
});

test('a blocker that is already done, or a block that was lifted, does not stop a task being finished', async () => {
  const { app, get, call } = setup({});
  await add(call, 'A', 'B', 'C');
  await call(`await blockTasks([${id('B')}, ${id('C')}], ${id('A')}); await setTaskDone(${id('A')}, true); await clearBlocks([${id('C')}])`);
  answering(app, 'cancel');
  await call(`await requestDone(${id('B')}); await requestDone(${id('C')})`);
  assert.deepEqual(get(`data.tasks.map((t) => t.done)`), [true, true, true]);
  assert.deepEqual(get('__asked'), []);
});

test('finishing several at once asks about the blocked ones, and can finish just the free ones', async () => {
  const { app, get, call } = setup({});
  await add(call, 'A', 'B', 'C', 'D');
  await call(`await blockTasks([${id('C')}, ${id('D')}], ${id('A')})`);
  const all = `[${['A', 'B', 'C', 'D'].map(id).join(', ')}]`;
  answering(app, 'cancel');
  await call(`globalThis.__go = await confirmDone(${all})`);
  assert.deepEqual(get('__go'), []);
  assert.equal(get('__asked[0][1].canSkip'), true);
  assert.deepEqual(get('__asked[0][0].map((e) => e.text)'), ['C', 'D']);
  answering(app, 'skip');
  await call(`globalThis.__go = await confirmDone(${all})`);
  assert.deepEqual(get(`__go.length`), 2);
  assert.deepEqual(get(`__go.map((i) => data.tasks.find((t) => t.id === i).text)`), ['A', 'B']);
  answering(app, 'anyway');
  await call(`globalThis.__go = await confirmDone(${all})`);
  assert.equal(get('__go.length'), 4);
  // Only blocked tasks selected: nothing to skip to.
  await call(`globalThis.__go = await confirmDone([${id('C')}, ${id('D')}])`);
  assert.equal(get('__asked.at(-1)[1].canSkip'), false);
});

test('the editor asks using what it shows now, so lifting the block there lets the task be finished', async () => {
  const { get, call } = setup({});
  await add(call, 'A', 'B');
  await call(`await blockTasks([${id('B')}], ${id('A')}); editingBlocks = { ids: [${id('A')}], waiting: '' }`);
  assert.equal(get('editorBlockReason()'), 'blocked by "A"');
  await call(`editingBlocks = { ids: [], waiting: ' Legal ' }`);
  assert.equal(get('editorBlockReason()'), 'waiting on Legal');
  await call(`editingBlocks = { ids: [], waiting: '' }`);
  assert.equal(get('editorBlockReason()'), '');
});
