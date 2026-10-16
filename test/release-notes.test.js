const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseNotes } = require('../scripts/release-notes');

test('release notes select only the exact version, excluding unreleased and older changes', () => {
  const text = "## Unreleased\n- Future feature\n## What's new in 1.7.0\n\n- Shipped feature\n\n## What's new in 1.6.1\n- Older feature";
  assert.equal(releaseNotes(text, '1.7.0'), '- Shipped feature\n');
  assert.throws(() => releaseNotes(text, '1.7.1'), /non-empty/);
  assert.throws(() => releaseNotes("## What's new in 1.7.0\n\n", '1.7.0'), /non-empty/);
});
