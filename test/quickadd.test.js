// 1.15: quick add reads a day, a time, a repeat, a #project and ! for a star out of a new task's text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  const call = async (code) => { await app.run(`(async () => { ${code} })()`); };
  return { app, get, call };
}
const TODAY = '2026-10-20'; // a Tuesday
const parse = (get, text, base = TODAY) => get(`(() => { const q = parseQuickAdd(${JSON.stringify(text)}, '${base}', '${TODAY}');
  return [q.text, q.dayTyped ? q.day : null, q.startMin, q.mins, q.freq, q.projectId, q.starred]; })()`);

test('quick add reads days written out', () => {
  const { get } = setup({});
  assert.deepEqual(parse(get, 'Call Sam tomorrow'), ['Call Sam', '2026-10-21', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Send invoice fri'), ['Send invoice', '2026-10-23', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Send invoice on Tuesday'), ['Send invoice', TODAY, null, 0, null, null, false]); // today counts
  assert.deepEqual(parse(get, 'Send invoice next tue'), ['Send invoice', '2026-10-27', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Plan offsite next week'), ['Plan offsite', '2026-10-26', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Renew passport in 3 days'), ['Renew passport', '2026-10-23', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Taxes oct 31'), ['Taxes', '2026-10-31', null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Dentist 3rd March'), ['Dentist', '2027-03-03', null, 0, null, null, false]); // past this year: next year
});

test('quick add reads a day and a time together', () => {
  const { get } = setup({});
  assert.deepEqual(parse(get, 'Write report fri 2pm 1h'), ['Write report', '2026-10-23', 840, 60, null, null, false]);
  assert.deepEqual(parse(get, 'Standup tomorrow 9:15am 15m'), ['Standup', '2026-10-21', 555, 15, null, null, false]);
  assert.deepEqual(parse(get, 'Write report 2pm 1h'), ['Write report', null, 840, 60, null, null, false]);
});

test('words that only look like days stay part of the task', () => {
  const { get } = setup({});
  assert.deepEqual(parse(get, 'Prep Monday standup notes'), ['Prep Monday standup notes', null, null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Fix the sun'), ['Fix the sun', null, null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Prep market 5 slides'), ['Prep market 5 slides', null, null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Call 3 vendors'), ['Call 3 vendors', null, null, 0, null, null, false]);
  assert.deepEqual(parse(get, 'Friday'), ['Friday', null, null, 0, null, null, false]); // a one-word task keeps its word
});

test('quick add reads repeats, a project and a star', () => {
  const { get } = setup({ projects: [{ id: 'p1', name: 'Client Work', color: '#000' }, { id: 'p2', name: 'Home', color: '#111' }] });
  assert.deepEqual(parse(get, 'Standup every weekday 9am #client !'), ['Standup', null, 540, 0, 'weekdays', 'p1', true]);
  assert.deepEqual(parse(get, 'Timesheet every friday'), ['Timesheet', '2026-10-23', null, 0, 'weekly', null, false]);
  assert.deepEqual(parse(get, 'Water plants daily #home'), ['Water plants', null, null, 0, 'daily', 'p2', false]);
  assert.deepEqual(parse(get, 'Rent monthly'), ['Rent', null, null, 0, 'monthly', null, false]);
  assert.deepEqual(parse(get, 'Fix bug #3'), ['Fix bug #3', null, null, 0, null, null, false]); // not a project
  assert.deepEqual(parse(get, 'Wow!'), ['Wow!', null, null, 0, null, null, false]); // ! inside a word is just punctuation
});

test('a time typed on a past day stays part of the text', () => {
  const { get } = setup({});
  assert.deepEqual(parse(get, 'Wrote report 2pm', '2026-10-19'), ['Wrote report 2pm', null, null, 0, null, null, false]);
});

test('adding from quick add sets the day, time, project, star and repeat, and later copies keep the time', async () => {
  const { get, call } = setup({ projects: [{ id: 'p1', name: 'Client', color: '#000' }] });
  await call(`await addQuickTask('Standup tomorrow 9am 15m #client ! every day')`);
  const t = get('data.tasks[0]');
  assert.equal(t.text, 'Standup');
  assert.equal(t.day, get('shiftKey(todayKey(), 1)'));
  assert.deepEqual([t.projectId, t.starred, t.block.startMin, t.block.mins], ['p1', true, 540, 15]);
  assert.equal(get('data.recurring[0].freq'), 'daily');
  await call(`materializeDay(shiftKey(todayKey(), 2))`);
  const copy = get(`data.tasks.find((x) => x.day === shiftKey(todayKey(), 2))`);
  assert.deepEqual([copy.text, copy.block.startMin, copy.block.mins], ['Standup', 540, 15]);
});
