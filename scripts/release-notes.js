const fs = require('node:fs');

function releaseNotes(readme, version) {
  const sections = readme.replace(/\r\n/g, '\n').split(/^## /m);
  const section = sections.find(s => s.split('\n')[0] === `What's new in ${version}`);
  if (!section || !section.slice(section.indexOf('\n') + 1).trim()) {
    throw new Error(`Add a non-empty "## What's new in ${version}" section to README.md before releasing.`);
  }
  return section.slice(section.indexOf('\n') + 1).trim() + '\n';
}

// Orders "1.10.0" after "1.9.0".
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Notes for every version after `since` up to and including `version`, newest first.
function releaseNotesSince(readme, since, version) {
  return readme.replace(/\r\n/g, '\n').split(/^## /m)
    .map((s) => ({ match: s.split('\n')[0].match(/^What's new in (\d+(?:\.\d+)*)$/), body: s.slice(s.indexOf('\n') + 1).trim() }))
    .filter((s) => s.match && s.body)
    .map((s) => ({ version: s.match[1], notes: s.body + '\n' }))
    .filter((r) => compareVersions(r.version, version) <= 0 && (!since || compareVersions(r.version, since) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
}

if (require.main === module) {
  const version = require('../package.json').version;
  fs.writeFileSync('release-notes.md', releaseNotes(fs.readFileSync('README.md', 'utf8'), version));
}
module.exports = { releaseNotes, releaseNotesSince, compareVersions };
