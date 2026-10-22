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


test('parking completion is dated when finished, survives clearing, and adds no time', async () => {
 const app = loadApp({parking: [{id:'p', text:'Call supplier', done:false, at:now}]});
 await app.run("setParkingDone('p', true)");
 assert.equal(app.run('data.entries.length'), 1);
 assert.equal(app.run('data.entries[0].start === data.parking[0].doneAt'), true);
 assert.equal(app.run('workSec(data.entries[0])'), 0);
 assert.match(app.run('entryHtml(data.entries[0])'), /Parking item completed/);
 await app.run("setParkingDone('p', true)");
 assert.equal(app.run('data.entries.length'), 1);
 app.run('data.parking = []');
 assert.equal(app.run('workEntries().length'), 1);
});

test('undoing parking completion removes only its marker and preserves check-ins', async () => {
 const app = loadApp({entries, parking:[{id:'p',text:'Emails',done:false,at:now}]});
 await app.run("setParkingDone('p', true)");
 await app.run("setParkingDone('p', false)");
 assert.equal(app.run('data.entries.length'), entries.length);
 assert.equal(app.run("data.entries.some(e => e.id === 'c')"), true);
 assert.equal(app.run('data.parking[0].doneAt'), null);
});

test('completed subtasks appear on the completion day without adding session time', async () => {
 const app = loadApp({tasks:[{id:'t',text:'Report',day:'2026-10-16',done:false,subtasks:[{id:'sub',text:'Proofread',done:false}]}], entries});
 await app.run("setSubtaskDone('t', 'sub', true)");
 assert.equal(app.run('workEntries().length'), entries.length + 1);
 assert.equal(app.run('workSec(workEntries().find(e => e.subtaskCompletion))'), 0);
 assert.match(app.run('entryHtml(workEntries().find(e => e.subtaskCompletion))'), /Subtask completed/);
 await app.run("setSubtaskDone('t', 'sub', false)");
 assert.equal(app.run('workEntries().length'), entries.length);
});


test('parking completed groups use completion day, retain cleared records and separate unknown dates', () => {
 const app = loadApp({parking:[{id:'p',text:'Original',done:true,doneAt:now},{id:'old',text:'Old item',done:true,at:now}], entries:[{id:'e',type:'manual',parkingCompletion:'p',note:'Updated',start:now,end:now},{id:'cleared',type:'manual',parkingCompletion:'gone',note:'Cleared item',start:now-86400000,end:now-86400000}]});
 assert.equal(app.run('completedParkingGroups().length'), 3);
 assert.equal(app.run('completedParkingGroups()[0].items.length'), 1);
 assert.equal(app.run('completedParkingGroups()[0].items[0].text'), 'Updated');
 assert.equal(app.run('completedParkingGroups()[2].day'), 'unknown');
});

test('reopening a cleared parking completion restores the open item and removes its worklog marker', async () => {
 const app = loadApp({entries:[{id:'e',type:'manual',parkingCompletion:'p',note:'Follow up',start:now,end:now}]});
 await app.run("reopenParking('p')");
 assert.equal(app.run('data.parking[0].text'), 'Follow up');
 assert.equal(app.run('data.parking[0].done'), false);
 assert.equal(app.run('data.entries.length'), 0);
});

test('#project in quick capture text matches an existing project or creates one', async () => {
 const app = loadApp({projects:[{id:'a', name:'Acme Corp', color:'#111', archived:false}]});
 let r = await app.run("takeProjectTag('Call Sam #acmecorp')");
 assert.equal(r.text, 'Call Sam'); assert.equal(r.projectId, 'a');
 r = await app.run("takeProjectTag('#Acme call Sam about Friday')");
 assert.equal(r.text, 'call Sam about Friday'); assert.equal(r.projectId, 'a');
 r = await app.run("takeProjectTag('Plan trip #Holiday-2027')");
 assert.equal(r.text, 'Plan trip'); assert.equal(app.run("projectName(data.projects[1].id)"), 'Holiday 2027');
 r = await app.run("takeProjectTag('No tag here', 'a')");
 assert.equal(r.text, 'No tag here'); assert.equal(r.projectId, 'a');
 r = await app.run("takeProjectTag('item#notatag')");
 assert.equal(r.projectId, null);
});

test('parking items can be filtered and sorted by project', () => {
 const app = loadApp({projects:[{id:'a', name:'Alpha', color:'#111'},{id:'b', name:'Beta', color:'#222'}],
  parking:[{id:'1', text:'one', at:1, projectId:'b'},{id:'2', text:'two', at:2},{id:'3', text:'three', at:3, projectId:'a'}]});
 app.run("parkSort = 'project'");
 assert.equal(app.run("sortParking(data.parking).map(p => p.id).join()"), '3,1,2');
 app.run("parkSort = 'oldest'");
 assert.equal(app.run("sortParking(data.parking).map(p => p.id).join()"), '1,2,3');
 app.run("parkFilter = 'none'");
 assert.equal(app.run("data.parking.filter(p => parkShows(p.projectId)).length"), 1);
 app.run("parkFilter = 'a'");
 assert.equal(app.run("data.parking.filter(p => parkShows(p.projectId)).map(p => p.id).join()"), '3');
});

test('editing a parked item changes its project and completion time, and the log follows', async () => {
 const app = loadApp({parking:[{id:'p', text:'Call supplier', done:false, at:now}], projects:[{id:'a', name:'Alpha', color:'#111'}]});
 const earlier = now - 3 * 3600000;
 app.run(`openParkDialog('p'); $('parkEditProject').value = 'a'; $('parkEditDone').checked = true;
   $('parkEditDate').value = dayKey(${earlier}); $('parkEditTime').value = toTimeInput(${earlier});`);
 await app.run('saveParkDialog()');
 assert.equal(app.run('data.parking[0].done'), true);
 assert.equal(app.run('data.parking[0].projectId'), 'a');
 assert.equal(app.run('dayKey(data.entries[0].start) === dayKey(data.parking[0].doneAt)'), true);
 assert.equal(app.run('toTimeInput(data.entries[0].start) === toTimeInput(' + earlier + ')'), true);
 assert.equal(app.run('data.entries[0].projectId'), 'a');
 assert.equal(app.run('data.entries.length'), 1);
 app.run('$("parkEditDone").checked = false; openParkDialog("p"); $("parkEditDone").checked = false');
 await app.run('saveParkDialog()');
 assert.equal(app.run('data.entries.length'), 0);
 assert.equal(app.run('data.parking[0].doneAt'), null);
});

test('a task can be finished at a chosen time and moved to the parking lot', async () => {
 const app = loadApp({tasks:[{id:'t', text:'Send report', day:'2026-10-16', done:false, order:0, projectId:null}], projects:[{id:'a', name:'Alpha', color:'#111'}]});
 const earlier = now - 5 * 3600000;
 app.run(`editingTaskId = 't'; editingSubs = []; $('taskEditText').value = 'Send report'; $('taskEditDay').value = '2026-10-16'; $('taskEditDone').checked = true; showTaskDoneWhen(null);
   $('taskEditDoneDate').value = dayKey(${earlier}); $('taskEditDoneTime').value = toTimeInput(${earlier});`);
 await app.run('saveTaskDialog()');
 assert.equal(app.run('data.tasks[0].done'), true);
 assert.equal(app.run('toTimeInput(data.tasks[0].doneAt) === toTimeInput(' + earlier + ')'), true);
 app.run(`$('taskEditDoneDate').value = '2999-01-01'`);
 await app.run('saveTaskDialog()');
 assert.match(app.run("$('taskEditError').textContent"), /future/);
 await app.run("setTaskDone('t', false); taskToParking('t')");
 assert.equal(app.run('data.tasks.length'), 0);
 assert.equal(app.run('data.parking[0].text'), 'Send report');
});

test('work log shows each app as its own chip', () => {
 const html = loadApp().run("entryHtml({id:'s', type:'session', note:'Draft', start:Date.now(), end:Date.now(), focusSec:600, apps:[{name:'Word', sec:300},{name:'Chrome', sec:900}]})");
 assert.match(html, /app-chip">Chrome <small>15 min/);
 assert.match(html, /app-chip">Word/);
});

test('leftover tasks say how long ago they were planned', () => {
  const app = loadApp();
  assert.equal(app.run("ageLabel(shiftKey(todayKey(), -1))"), 'yesterday');
  assert.equal(app.run("ageLabel(shiftKey(todayKey(), -3))"), '3 days ago');
});
