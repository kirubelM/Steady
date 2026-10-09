// Reading calendar links (.ics) and combining several calendars.
const test = require('node:test');
const assert = require('node:assert/strict');
const { eventsFromIcs, mergeResults } = require('../calendar');

const ics = (...events) => ['BEGIN:VCALENDAR', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const utc = (s) => Date.parse(s);
const day = (y, m, d) => [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];

test('a single UTC event', () => {
  const text = ics(['UID:1', 'SUMMARY:Standup', 'DTSTART:20261012T140000Z', 'DTEND:20261012T143000Z']);
  const [ev] = eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z'));
  assert.equal(ev.title, 'Standup');
  assert.equal(ev.start, utc('2026-10-12T14:00:00Z'));
  assert.equal(ev.end, utc('2026-10-12T14:30:00Z'));
  assert.equal(ev.busy, true);
  assert.equal(ev.allDay, false);
});

test('events outside the range are left out', () => {
  const text = ics(['UID:1', 'SUMMARY:Later', 'DTSTART:20261020T140000Z', 'DTEND:20261020T150000Z']);
  assert.equal(eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z')).length, 0);
});

test('all-day events and folded long lines', () => {
  const text = ics(['UID:2', 'SUMMARY:Company', '  holiday', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013']);
  const [ev] = eventsFromIcs(text, ...day(2026, 10, 12));
  assert.equal(ev.allDay, true);
  assert.equal(ev.title, 'Company holiday');
});

test('escaped commas and semicolons in titles', () => {
  const text = ics(['UID:3', 'SUMMARY:Lunch\\, then review\\; bring notes', 'DTSTART:20261012T120000Z', 'DTEND:20261012T130000Z']);
  assert.equal(eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z'))[0].title, 'Lunch, then review; bring notes');
});

test('cancelled events are dropped and "show as free" events are not busy', () => {
  const text = ics(
    ['UID:4', 'SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20261012T090000Z', 'DTEND:20261012T100000Z'],
    ['UID:5', 'SUMMARY:FYI', 'TRANSP:TRANSPARENT', 'DTSTART:20261012T110000Z', 'DTEND:20261012T120000Z']
  );
  const evs = eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z'));
  assert.deepEqual(evs.map((e) => [e.title, e.busy]), [['FYI', false]]);
});

test('weekly repeats, with a skipped date (EXDATE) and a moved one (RECURRENCE-ID)', () => {
  const text = ics(
    ['UID:w', 'SUMMARY:Weekly', 'DTSTART:20261005T150000Z', 'DTEND:20261005T153000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5', 'EXDATE:20261012T150000Z'],
    ['UID:w', 'SUMMARY:Weekly (moved)', 'RECURRENCE-ID:20261019T150000Z', 'DTSTART:20261020T160000Z', 'DTEND:20261020T163000Z']
  );
  const evs = eventsFromIcs(text, utc('2026-10-01T00:00:00Z'), utc('2026-11-30T00:00:00Z'));
  assert.deepEqual(evs.map((e) => new Date(e.start).toISOString().slice(0, 16)), [
    '2026-10-05T15:00', // first
    // Oct 12 skipped by EXDATE
    '2026-10-20T16:00', // Oct 19 moved to Oct 20
    '2026-10-26T15:00',
    '2026-11-02T15:00'
  ]);
  assert.equal(evs[1].title, 'Weekly (moved)');
});

test('repeats stop at UNTIL', () => {
  const text = ics(['UID:d', 'SUMMARY:Daily', 'DTSTART:20261012T080000Z', 'DTEND:20261012T081500Z', 'RRULE:FREQ=DAILY;UNTIL=20261014T235959Z']);
  assert.equal(eventsFromIcs(text, utc('2026-10-01T00:00:00Z'), utc('2026-10-31T00:00:00Z')).length, 3);
});

test('monthly "second Tuesday" repeats', () => {
  const text = ics(['UID:m', 'SUMMARY:Board', 'DTSTART:20261013T170000Z', 'DTEND:20261013T180000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3']);
  const evs = eventsFromIcs(text, utc('2026-10-01T00:00:00Z'), utc('2027-01-31T00:00:00Z'));
  assert.deepEqual(evs.map((e) => new Date(e.start).toISOString().slice(0, 10)), ['2026-10-13', '2026-11-10', '2026-12-08']);
});

test('times in a named time zone (TZID)', () => {
  const text = ics(['UID:tz', 'SUMMARY:NY call', 'DTSTART;TZID=America/New_York:20261012T090000', 'DTEND;TZID=America/New_York:20261012T100000']);
  const [ev] = eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z'));
  assert.equal(ev.start, utc('2026-10-12T13:00:00Z')); // 9 AM EDT
});

test('Windows time zone names from Outlook', () => {
  const text = ics(['UID:wtz', 'SUMMARY:Outlook call', 'DTSTART;TZID=Pacific Standard Time:20261012T090000', 'DTEND;TZID=Pacific Standard Time:20261012T093000']);
  const [ev] = eventsFromIcs(text, utc('2026-10-12T00:00:00Z'), utc('2026-10-13T00:00:00Z'));
  assert.equal(ev.start, utc('2026-10-12T16:00:00Z')); // 9 AM PDT
});

/* ---------- Combining calendars ---------- */

const cals = [{ name: 'Work' }, { name: 'Personal' }];
const ev = (title, start, busy = true) => ({ title, start, end: start + 3600000, allDay: false, busy });

test('meetings from several calendars are merged, sorted and labelled', () => {
  const r = mergeResults(cals, [{ ok: true, events: [ev('B', 2000)] }, { ok: true, events: [ev('A', 1000)] }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.events.map((e) => [e.title, e.cal]), [['A', 'Personal'], ['B', 'Work']]);
});

test('a meeting in two calendars is listed once, busy if either says busy', () => {
  const r = mergeResults(cals, [{ ok: true, events: [ev('Sync', 1000, false)] }, { ok: true, events: [ev('Sync', 1000, true)] }]);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].busy, true);
});

test('one failing calendar is reported but the others still show', () => {
  const r = mergeResults(cals, [{ ok: false, error: 'Offline' }, { ok: true, events: [ev('A', 1000)] }]);
  assert.equal(r.ok, true);
  assert.equal(r.events.length, 1);
  assert.deepEqual(r.failed, [{ name: 'Work', error: 'Offline' }]);
});

test('if every calendar fails, the error names the calendar', () => {
  assert.deepEqual(mergeResults(cals, [{ ok: false, error: 'Offline' }, { ok: false, error: 'Bad link' }]), { ok: false, error: 'Work: Offline' });
  assert.deepEqual(mergeResults([{ name: 'Only' }], [{ ok: false, error: 'Offline' }]), { ok: false, error: 'Offline' });
});
