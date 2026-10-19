// 1.13: color themes, style options and the Refresh calendar button.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

function setup(raw) {
  const app = loadApp(raw);
  const get = (code) => JSON.parse(app.run(`JSON.stringify(${code})`) ?? 'null');
  return { app, get };
}

test('new installs keep the original look', () => {
  const { get } = setup({});
  assert.deepEqual(get('[settings.palette, settings.corners, settings.density, settings.font, settings.ringStyle]'),
    ['steady', 'rounded', 'comfortable', 'segoe', 'classic']);
});

test('appearance choices land on the page as attributes the styles key off', () => {
  const { app, get } = setup({ settings: { palette: 'nord', corners: 'sharp', density: 'compact', font: 'serif', ringStyle: 'clock', accent: 'ocean' } });
  app.run('applyAppearance()');
  const ds = get('document.documentElement.dataset');
  assert.deepEqual({ palette: ds.palette, corners: ds.corners, density: ds.density, font: ds.font, ring: ds.ring, accent: ds.accent },
    { palette: 'nord', corners: 'sharp', density: 'compact', font: 'serif', ring: 'clock', accent: 'ocean' });
});

test('only known themes and options are accepted from the settings form', () => {
  const { get } = setup({});
  assert.equal(get(`TEXT_FIELDS.palette('contrast')`), 'contrast');
  assert.equal(get(`TEXT_FIELDS.palette('neon')`), null);
  assert.equal(get(`TEXT_FIELDS.ringStyle('segmented')`), 'segmented');
  assert.equal(get(`TEXT_FIELDS.font('comic')`), null);
  assert.equal(get('PALETTES.length'), 7);
});

test('the refresh button says what is going on', () => {
  const { app, get } = setup({ settings: { calendars: [] } });
  assert.equal(get('calRefreshState().label'), 'Connect a calendar');
  app.run(`settings.calendars = [{ id: 'x', kind: 'link', name: 'Work', url: 'https://x' }]`);
  app.run('Cal.loading = true');
  assert.equal(get('calRefreshState().cls'), 'loading');
  app.run(`Cal.loading = false; Cal.error = 'Calendar link not found.'`);
  assert.deepEqual(get('[calRefreshState().label, calRefreshState().tip]'), ['Try again', 'Calendar link not found.']);
  app.run('Cal.error = null; Cal.loadedAt = Date.now() - 5 * 60000; Cal.flashAt = 0');
  assert.deepEqual(get('[calRefreshState().label, calRefreshState().sub]'), ['Refresh', 'Updated 5 min ago']);
  app.run('Cal.flashAt = Date.now()');
  assert.equal(get('calRefreshState().label'), 'Up to date');
});
