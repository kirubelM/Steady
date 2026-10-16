const fs = require('node:fs');

function releaseNotes(readme, version) {
  const sections = readme.replace(/\r\n/g, '\n').split(/^## /m);
  const section = sections.find(s => s.split('\n')[0] === `What's new in ${version}`);
  if (!section || !section.slice(section.indexOf('\n') + 1).trim()) {
    throw new Error(`Add a non-empty "## What's new in ${version}" section to README.md before releasing.`);
  }
  return section.slice(section.indexOf('\n') + 1).trim() + '\n';
}

if (require.main === module) {
  const version = require('../package.json').version;
  fs.writeFileSync('release-notes.md', releaseNotes(fs.readFileSync('README.md', 'utf8'), version));
}
module.exports = { releaseNotes };
