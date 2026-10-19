const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseNotes } = require('../scripts/release-notes');

test('release notes select only the exact version, excluding unreleased and older changes', () => {
  const text = "## Unreleased\n- Future feature\n## What's new in 1.7.0\n\n- Shipped feature\n\n## What's new in 1.6.1\n- Older feature";
  assert.equal(releaseNotes(text, '1.7.0'), '- Shipped feature\n');
  assert.throws(() => releaseNotes(text, '1.7.1'), /non-empty/);
  assert.throws(() => releaseNotes("## What's new in 1.7.0\n\n", '1.7.0'), /non-empty/);
});

test('notes since a version include every newer release up to this one, newest first', () => {
  const { releaseNotesSince } = require('../scripts/release-notes');
  const text = "## What's new in 1.10.0\n- Ten\n## What's new in 1.9.0\n- Nine\n## What's new in 1.8.0\n- Eight\n## What's new in 1.11.0\n- Not out yet";
  assert.deepEqual(releaseNotesSince(text, '1.8.0', '1.10.0').map((r) => r.version), ['1.10.0', '1.9.0']);
  assert.deepEqual(releaseNotesSince(text, '1.10.0', '1.10.0'), []);
  assert.equal(releaseNotesSince(text, null, '1.10.0').length, 3);
});
