// Loading saved data: defaults, migrations from older versions, and damaged files.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, normalize } = require('../datamodel');

test('an empty file gets every default', () => {
  const d = normalize({});
  assert.deepEqual(d.settings, DEFAULTS.settings);
  assert.deepEqual(d.tasks, []);
  assert.deepEqual(d.meta, {});
});

test('damaged files (null, arrays, strings) load as empty instead of crashing', () => {
  for (const bad of [null, undefined, [], 'oops', 42, { settings: 'nope' }, { settings: [] }]) {
    const d = normalize(bad);
    assert.equal(d.settings.dailyGoalMin, DEFAULTS.settings.dailyGoalMin);
    assert.ok(Array.isArray(d.entries));
  }
});

test('lists that are not arrays are replaced, other data is kept', () => {
  const d = normalize({ tasks: { not: 'a list' }, entries: 'x', notes: 'x', meta: null, projects: [{ id: 'p1' }] });
  assert.deepEqual(d.tasks, []);
  assert.deepEqual(d.entries, []);
  assert.deepEqual(d.notes, {});
  assert.deepEqual(d.meta, {});
  assert.deepEqual(d.projects, [{ id: 'p1' }]);
});

test("user settings win over defaults, and new settings are filled in", () => {
  const d = normalize({ settings: { dailyGoalMin: 90, presets: DEFAULTS.settings.presets, calendars: [] } });
  assert.equal(d.settings.dailyGoalMin, 90);
  assert.equal(d.settings.accent, 'pine');
  assert.equal(d.settings.chimes, false);
});

test('normalize does not change the shared defaults', () => {
  const d = normalize({});
  d.settings.presets[0].focusMin = 999;
  d.settings.calendars.push({ id: 'x' });
  assert.equal(DEFAULTS.settings.presets[0].focusMin, 25);
  assert.equal(DEFAULTS.settings.calendars.length, 0);
});

test('pre-1.2 single focus length becomes the Standard preset', () => {
  const d = normalize({ settings: { focusMin: 45, shortBreakMin: 8 } });
  const std = d.settings.presets.find((p) => p.id === 'standard');
  assert.equal(std.focusMin, 45);
  assert.equal(std.breakMin, 8);
  assert.equal(d.settings.presets.length, 4);
});

test('pre-1.3.1 calendar link becomes the first calendar in the list', () => {
  const d = normalize({ settings: { calendarSource: 'link', calendarUrl: 'https://example.com/a.ics' } });
  assert.deepEqual(d.settings.calendars, [{ id: 'link1', kind: 'link', name: 'Calendar', url: 'https://example.com/a.ics' }]);
  assert.ok(!('calendarSource' in d.settings));
  assert.ok(!('calendarUrl' in d.settings));
});

test('pre-1.3.1 Outlook source becomes an Outlook calendar', () => {
  const d = normalize({ settings: { calendarSource: 'outlook' } });
  assert.deepEqual(d.settings.calendars, [{ id: 'outlook', kind: 'outlook', name: 'Outlook' }]);
});

test('pre-1.3.1 "off" or a link without a URL means no calendars', () => {
  assert.deepEqual(normalize({ settings: { calendarSource: 'off' } }).settings.calendars, []);
  assert.deepEqual(normalize({ settings: { calendarSource: 'link', calendarUrl: '' } }).settings.calendars, []);
});

test('broken calendar entries are dropped', () => {
  const d = normalize({ settings: { calendars: [null, { kind: 'link' }, { id: 'a', kind: 'link' }, { id: 'b', kind: 'outlook' }, { id: 'c', kind: 'link', url: 'https://x' }] } });
  assert.deepEqual(d.settings.calendars.map((c) => c.id), ['b', 'c']);
});
