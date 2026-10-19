const test = require('node:test');
const assert = require('node:assert/strict');
const {loadApp} = require('./helpers/app');

test('feature notes render readable cards and escape markup', () => {
 const app = loadApp();
 const notes = '- **Motion.** Choose full motion.\n- <script>bad</script>';
 const html = app.run('featureNotesHtml(' + JSON.stringify(notes) + ')');
 assert.match(html, /<h3>Motion.<\/h3>/);
 assert.match(html, /&lt;script&gt;/);
 assert.doesNotMatch(html, /<script>/);
});

test('new versions show once and do not interrupt another dialog', () => {
 const app = loadApp();
 app.run('anyDialogOpen = () => false');
 assert.equal(app.run("shouldShowWhatsNew('1.9.0')"), true);
 app.run("data.meta.whatsNewSeen = '1.9.0'");
 assert.equal(app.run("shouldShowWhatsNew('1.9.0')"), false);
 app.run("data.meta.whatsNewSeen = '1.8.0'; anyDialogOpen = () => true;");
 assert.equal(app.run("shouldShowWhatsNew('1.9.0')"), false);
});

test('several new versions each get a heading; one version shows just its cards', () => {
  const app = loadApp();
  const one = app.run(`releasesHtml([{ version: '1.10.0', notes: '- **A.** a' }])`);
  assert.doesNotMatch(one, /Version 1/);
  const two = app.run(`releasesHtml([{ version: '1.10.0', notes: '- **A.** a' }, { version: '1.9.0', notes: '- **B.** b' }])`);
  assert.match(two, /Version 1\.10\.0[\s\S]*Version 1\.9\.0/);
});

test('updating from before this screen existed shows everything since 1.8.0', async () => {
  const app = loadApp();
  app.run(`api.appVersion = async () => '1.10.0'; anyDialogOpen = () => false;
           globalThis.__asked = []; api.releaseNotes = async (since) => { __asked.push(since); return { version: '1.10.0', releases: [] }; };`);
  await app.run('maybeShowWhatsNew()');
  app.run(`data.meta.whatsNewSeen = '1.9.0'`);
  await app.run('maybeShowWhatsNew()');
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(__asked)')), ['1.8.0', '1.9.0']);
});
