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
