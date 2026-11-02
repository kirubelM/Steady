// Quick capture: opening on a chosen type, typing the type, wrong-type hints and moving a capture afterwards.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');
const K = require('../capturekind');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}

test('quick capture opens on To do unless Settings says otherwise, and the options are checked', () => {
  const { get } = setup({});
  assert.deepEqual(get('[settings.captureOpensOn, settings.captureHints]'), ['todo', true]);
  assert.equal(get(`TEXT_FIELDS.captureOpensOn('last')`), 'last');
  assert.equal(get(`TEXT_FIELDS.captureOpensOn('whenever')`), null);
  assert.ok(get(`BOOL_FIELDS.includes('captureHints')`));
});

test('a typed prefix sets the type, but only with a colon or a slash and a space', () => {
  assert.deepEqual(K.parsePrefix('done: sent the report'), { kind: 'done', text: 'sent the report' });
  assert.deepEqual(K.parsePrefix('Done:sent'), { kind: 'done', text: 'sent' });
  assert.deepEqual(K.parsePrefix('t: call Sam'), { kind: 'todo', text: 'call Sam' });
  assert.deepEqual(K.parsePrefix('to do: buy milk'), { kind: 'todo', text: 'buy milk' });
  assert.deepEqual(K.parsePrefix('/park look into SSO'), { kind: 'park', text: 'look into SSO' });
  assert.deepEqual(K.parsePrefix('P: idea'), { kind: 'park', text: 'idea' });
  // Not types: ordinary words, paths, links, notes, and a half-typed slash command.
  for (const text of ['Done reviewing the PR', 'D:\\reports\\q3.xlsx', 'http://x.com', 'note: x', '/done', '/donut', '/doneness x', 'park the car']) {
    assert.equal(K.parsePrefix(text), null, text);
  }
});

test('text that sounds like another type is flagged, and only while saving to To do or Done', () => {
  assert.equal(K.suggestKind('done', 'Call Sam tomorrow 2pm'), 'todo');
  assert.equal(K.suggestKind('done', 'Call the vendor about the invoice'), 'todo');
  assert.equal(K.suggestKind('done', 'Need to book flights'), 'todo');
  assert.equal(K.suggestKind('todo', 'Called the vendor'), 'done');
  assert.equal(K.suggestKind('todo', 'Sent the invoice'), 'done');
  assert.equal(K.suggestKind('todo', 'Wrote the spec 1h'), 'done');
  // It fits, or it can't tell: no hint.
  assert.equal(K.suggestKind('done', 'Sent the report to Dana 20m'), null);
  assert.equal(K.suggestKind('todo', 'Call Sam fri 2pm #client !'), null);
  assert.equal(K.suggestKind('todo', 'Meeting with Sam'), null);
  assert.equal(K.suggestKind('todo', 'Called'), null); // one word isn't enough
  assert.equal(K.suggestKind('todo', 'Called Sam, need to follow up'), null); // mixed signals
  assert.equal(K.suggestKind('todo', 'Embed the video'), null); // ends in -ed but isn't past tense
  assert.equal(K.suggestKind('park', 'Called Sam'), null); // the Parking lot takes anything
});

test('every capture is remembered, newest first, and only the latest few are kept', async () => {
  const { get, call } = setup({});
  await call(`for (let i = 0; i < 20; i++) await recordCapture('park', 'thought ' + i, { type: 'parking', id: 'p' + i });`);
  assert.equal(get('data.meta.captures.length'), 15);
  assert.deepEqual(get('[data.meta.captures[0].text, data.meta.captures[14].text]'), ['thought 19', 'thought 5']);
});

test('a to-do that landed in Done moves to To do with its project, day and time, and the Done entry is removed', async () => {
  const { get, call } = setup({ projects: [{ id: 'p1', name: 'Client', color: '#000' }] });
  await call(`const e = await addDoneItem('Call Sam tomorrow 2pm', 0, 'p1', todayKey());
    globalThis.__rec = await recordCapture('done', 'Call Sam tomorrow 2pm', { type: 'entry', id: e.id });
    globalThis.__moved = await moveCapture(__rec.id, 'todo', { tell: false });`);
  assert.equal(get('data.entries.length'), 0);
  const t = get('data.tasks[0]');
  assert.deepEqual([t.text, t.projectId, t.day, t.block && t.block.startMin], ['Call Sam', 'p1', get('shiftKey(todayKey(), 1)'), 840]);
  assert.deepEqual(get('[data.meta.captures[0].kind, data.meta.captures[0].ref.type, data.meta.captures[0].ref.id === data.tasks[0].id]'), ['todo', 'task', true]);
});

test('a capture can go between any two lists without losing its text or project', async () => {
  const { get, call } = setup({ projects: [{ id: 'p1', name: 'Client', color: '#000' }] });
  await call(`const item = await addParking('Look into SSO', 'p1');
    globalThis.__rec = await recordCapture('park', 'Look into SSO', { type: 'parking', id: item.id });`);
  const shape = () => get(`[data.tasks.map((t) => t.text), data.entries.map((e) => e.note), data.parking.map((p) => p.text), __rec.kind]`);
  await call(`await moveCapture(__rec.id, 'done', { tell: false })`);
  assert.deepEqual(shape(), [[], ['Look into SSO'], [], 'done']);
  assert.equal(get('data.entries[0].projectId'), 'p1');
  await call(`await moveCapture(__rec.id, 'todo', { tell: false })`);
  assert.deepEqual(shape(), [['Look into SSO'], [], [], 'todo']);
  await call(`await moveCapture(__rec.id, 'park', { tell: false })`);
  assert.deepEqual(shape(), [[], [], ['Look into SSO'], 'park']);
  assert.equal(get('data.parking[0].projectId'), 'p1');
  assert.equal(get('data.meta.captures.length'), 1); // it's the same capture, wherever it is
});

test('moving a to-do that repeats also stops the repeat, and a capture that was finished or deleted stays put', async () => {
  const { get, call } = setup({});
  await call(`const added = await addQuickTask('Stand-up every weekday 9am');
    globalThis.__rec = await recordCapture('todo', 'Stand-up every weekday 9am', { type: 'task', id: added.task.id });`);
  assert.equal(get('data.recurring.length'), 1);
  await call(`await moveCapture(__rec.id, 'done', { tell: false })`);
  assert.deepEqual(get('[data.recurring.length, data.tasks.length, data.entries.length]'), [0, 0, 1]);

  await call(`const item = await addParking('Idea');
    globalThis.__rec2 = await recordCapture('park', 'Idea', { type: 'parking', id: item.id });
    data.parking[0].done = true;`);
  assert.equal(get(`captureMovable(__rec2, captureItem(__rec2))`), false);
  await call(`globalThis.__r = await moveCapture(__rec2.id, 'todo', { tell: false })`);
  assert.equal(get('__r'), null);
  assert.equal(get('data.tasks.length'), 0);
  await call(`data.parking = []`);
  await call(`globalThis.__r = await moveCapture(__rec2.id, 'todo', { tell: false })`);
  assert.equal(get('__r'), null); // deleted since
});

test('the message after a capture offers the one-click fix for the likeliest slip', async () => {
  const { get } = setup({});
  assert.deepEqual(get(`[captureFixAction({ kind: 'done' }).label, captureFixAction({ kind: 'park' }).label, captureFixAction({ kind: 'todo' }).label]`),
    ['Move to To do', 'Move to To do', 'Not a to-do?']);
});
