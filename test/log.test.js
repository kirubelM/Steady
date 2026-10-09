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
