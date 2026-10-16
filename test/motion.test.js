const test = require('node:test');
const assert = require('node:assert/strict');
const {loadApp} = require('./helpers/app');

test('full motion overrides Windows, reduced motion overrides Windows, and system follows it', () => {
 const app = loadApp();
 assert.equal(app.run("applyMotion('system'); reducedMotion()"), true);
 assert.equal(app.run("applyMotion('full'); reducedMotion()"), false);
 assert.equal(app.run("applyMotion('reduced'); reducedMotion()"), true);
 app.run('windowsMotion.matches = false');
 assert.equal(app.run("applyMotion('system'); reducedMotion()"), false);
 assert.equal(app.run("applyMotion('reduced'); reducedMotion()"), true);
 assert.equal(app.run("applyMotion('invalid'); motionPreference"), 'system');
});

test('CSS motion queries can be switched repeatedly without losing their original preference', () => {
 const app = loadApp();
 app.run(`globalThis.reduceRule = {media: {mediaText: '(prefers-reduced-motion: reduce)'}};
 globalThis.fullRule = {media: {mediaText: '(prefers-reduced-motion: no-preference)'}};
 document.styleSheets = [{cssRules: [reduceRule, fullRule]}];`);
 app.run("applyMotion('full')");
 assert.equal(app.run('reduceRule.media.mediaText'), 'not all');
 assert.equal(app.run('fullRule.media.mediaText'), '(min-width: 0px)');
 app.run("applyMotion('reduced')");
 assert.equal(app.run('reduceRule.media.mediaText'), '(min-width: 0px)');
 assert.equal(app.run('fullRule.media.mediaText'), 'not all');
 app.run("applyMotion('full')");
 assert.equal(app.run('fullRule.media.mediaText'), '(min-width: 0px)');
});
