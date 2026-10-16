// The work log: each kind of entry is labelled and can be filtered.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

const now = Date.parse('2026-10-12T15:00:00Z');
const entries = [
  { id: 's', type: 'session', start: now - 4e6, end: now - 2.2e6, note: 'Write intro', focusSec: 1800, goal: 'Intro drafted', goalHit: 'partly' },
  { id: 'c', type: 'checkin', start: now - 2e6, end: now - 1e6, note: 'Emails' },
  { id: 'm', type: 'manual', start: now - 9e5, end: now - 6e5, note: 'Called the vendor' },
  { id: 'b', type: 'break', kind: 'short', start: now - 5e5, end: now - 2e5, skipped: true }
];

test('each kind of entry gets its own label and class', () => {
  const app = loadApp({ entries });
  const html = (id) => app.run(`entryHtml(data.entries.find((e) => e.id === '${id}'))`);
  assert.match(html('s'), /class="entry t-session"/);
  assert.match(html('s'), />Focus session</);
  assert.match(html('s'), /Intro drafted <span>partly reached/);
  assert.match(html('c'), /class="entry t-checkin"/);
  assert.match(html('c'), />Check-in</);
  assert.match(html('m'), />Added by you</);
  assert.match(html('b'), /class="entry t-break skipped"/);
  assert.match(html('b'), />Skipped break</);
});

test('the filter shows only types present, with counts', () => {
  const app = loadApp({ entries });
  app.run('renderLogFilter(data.entries)');
  const chips = app.run(`document.getElementById('logFilter').innerHTML`);
  for (const [label, n] of [['All', 4], ['Sessions', 1], ['Check-ins', 1], ['Added', 1], ['Breaks', 1]]) {
    assert.match(chips, new RegExp(`${label}<span class="lf-count">${n}</span>`));
  }
  app.run(`renderLogFilter(data.entries.filter((e) => e.type === 'session'))`);
  const fewer = app.run(`document.getElementById('logFilter').innerHTML`);
  assert.doesNotMatch(fewer, /Breaks/);
});


test('completed to-dos appear in the work log without adding time, and reopening removes them', async () => {
 const app = loadApp({tasks: [{id:'t', text:'Send report', day:'2026-10-16', done:true, doneAt:now, order:0}], entries});
 assert.equal(app.run('workEntries().length'), 5);
 assert.equal(app.run('workSec(workEntries().find(e => e.taskCompletion))'), 0);
 assert.match(app.run('entryHtml(workEntries().find(e => e.taskCompletion))'), /Task completed/);
 app.run("openTaskDialog = (id) => { globalThis.openedTask = id; }; openEntryDialog('task:t')");
 assert.equal(app.run("openedTask"), "t");
 await app.run("setTaskDone('t', false)");
 assert.equal(app.run('workEntries().length'), 4);
});

test('missed check-ins save the entered duration and task link', async () => {
 const app = loadApp();
 app.run("S.checkinKind = 'checkin'; $('checkinNote').value = 'Report'; $('checkinMinutes').value = '45'; $('checkinTask').value = 't'; $('checkinDoneRow').hidden = true;");
 await app.run('saveCheckin(true)');
 assert.equal(app.run('workSec(data.entries[0])'), 2700);
 assert.equal(app.run('data.entries[0].taskId'), 't');
});
